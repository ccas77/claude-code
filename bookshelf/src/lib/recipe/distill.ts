import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
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

  if (env().DRY_RUN) {
    await db
      .update(schema.genres)
      .set({
        styleRecipe:
          genre.styleRecipe ??
          `[dry-run] recipe not yet distilled for ${genre.name}. Add a vision provider key and turn DRY_RUN off to populate.`,
        recipeStatus: 'done',
        updatedAt: new Date(),
      })
      .where(eq(schema.genres.id, genreId));

    await db.insert(schema.eventLog).values({
      ownerId: genre.ownerId,
      stage: 'recipe.dry_run',
      level: 'info',
      message: `[dry-run] recipe distillation skipped for ${genre.name}`,
      payload: { jobId, genreId, refCount: refs.length },
    });
    return;
  }

  await db
    .update(schema.genres)
    .set({ recipeStatus: 'processing', updatedAt: new Date() })
    .where(eq(schema.genres.id, genreId));

  try {
    const recipe = await visionAnalyze(
      RECIPE_PROMPT,
      refs.map((r) => r.blobUrl),
    );

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
      .set({ recipeStatus: 'failed', updatedAt: new Date() })
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
