import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { visionAnalyze } from './vision';
import { RECIPE_PROMPT } from './prompt';

/**
 * Distill a style recipe for one genre from its reference images.
 *
 * Runs once per genre. The result is stored, hand-editable, and reused by
 * every render. If references change later, the genre is re-marked pending
 * and re-distilled (Stage 2 wires that re-trigger).
 *
 * DRY_RUN skips the vision call and writes a placeholder so downstream
 * stages can still exercise the recipe field.
 */

type RunArgs = { genreId: string; jobId: string };

export async function runRecipeDistillation({ genreId, jobId }: RunArgs): Promise<void> {
  const genre = await db.query.genres.findFirst({
    where: eq(schema.genres.id, genreId),
  });
  if (!genre) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      stage: 'recipe',
      level: 'warn',
      message: `genre ${genreId} not found, skipping`,
      payload: { jobId },
    });
    return;
  }

  const refs = await db
    .select()
    .from(schema.genreReferenceImages)
    .where(eq(schema.genreReferenceImages.genreId, genreId));

  if (refs.length === 0) {
    await db
      .update(schema.genres)
      .set({ recipeStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.genres.id, genreId));
    await db.insert(schema.eventLog).values({
      ownerId: genre.ownerId,
      stage: 'recipe.skip',
      level: 'info',
      message: `genre ${genre.name} has no reference images, nothing to distill`,
      payload: { jobId, genreId },
    });
    return;
  }

  // Distillation always runs - Gemini through the Vercel AI Gateway
  // authenticates via OIDC, so no provider key is needed at runtime. Cost is
  // tiny per genre. If the call fails, the error lands on the genre.
  await db
    .update(schema.genres)
    .set({ recipeStatus: 'processing', updatedAt: new Date() })
    .where(eq(schema.genres.id, genreId));

  try {
    const raw = await visionAnalyze(
      RECIPE_PROMPT,
      refs.map((r) => r.blobUrl),
    );
    // Belt-and-braces: the prompt forbids em/en dashes but models slip them
    // in occasionally. Replace with a regular hyphen.
    const recipe = raw.replace(/[\u2013\u2014]/g, '-');

    await db
      .update(schema.genres)
      .set({ styleRecipe: recipe, recipeStatus: 'done', updatedAt: new Date() })
      .where(eq(schema.genres.id, genreId));

    await db.insert(schema.eventLog).values({
      ownerId: genre.ownerId,
      stage: 'recipe.success',
      level: 'info',
      message: `recipe distilled for ${genre.name} from ${refs.length} references`,
      payload: { jobId, genreId, refCount: refs.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await db
      .update(schema.genres)
      .set({
        recipeStatus: 'failed',
        styleRecipe: `[Recipe distillation failed]\n\n${message}\n\nFix the underlying issue then click "Re-distill from images".`,
        updatedAt: new Date(),
      })
      .where(eq(schema.genres.id, genreId));

    await db.insert(schema.eventLog).values({
      ownerId: genre.ownerId,
      stage: 'recipe.error',
      level: 'error',
      message,
      payload: { jobId, genreId },
    });

    throw err;
  }
}
