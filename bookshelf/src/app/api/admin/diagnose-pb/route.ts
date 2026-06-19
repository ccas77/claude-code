import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError, ForbiddenError } from '@/lib/ownership';
import { getOwnerEmail, UnauthorizedError } from '@/lib/owner';
import { isPrimaryOwner } from '@/lib/owner-role';
import { getPostBridgeKeyForEmail } from '@/lib/posting/postbridge';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * One-shot Post Bridge probe. Hits /v1/post-results raw (first page only),
 * shows whatever shape the API actually returns, and tries each of the
 * stored post_bridge_post_ids against it - reporting which ones matched.
 * Primary owner only.
 */
export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!(await isPrimaryOwner())) {
      throw new ForbiddenError('Primary owner only.');
    }
    const email = await getOwnerEmail(ownerId);
    const apiKey = getPostBridgeKeyForEmail(email);

    const cards = await db
      .select({
        id: schema.cards.id,
        postTime: schema.cards.postTime,
        platform: schema.cards.platform,
        accountHandle: schema.cards.accountHandle,
        postBridgePostId: schema.cards.postBridgePostId,
      })
      .from(schema.cards)
      .where(
        and(
          eq(schema.cards.ownerId, ownerId),
          eq(schema.cards.status, 'posted'),
          ne(schema.cards.platform, 'preview'),
        ),
      );

    const pbBase = process.env.POSTBRIDGE_BASE_URL ?? 'https://api.post-bridge.com';

    const probePages: Array<{
      url: string;
      status: number;
      rowCount: number;
      firstRowShape: Record<string, unknown> | null;
      sampleRow: Record<string, unknown> | null;
    }> = [];

    const paths = [
      '/v1/post-results?limit=10',
      '/v1/post-results?limit=10&offset=10',
      '/v1/posts?limit=10',
    ];
    for (const p of paths) {
      const res = await fetch(`${pbBase}${p}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      const data =
        (body as { data?: unknown[] })?.data &&
        Array.isArray((body as { data: unknown[] }).data)
          ? (body as { data: Record<string, unknown>[] }).data
          : [];
      probePages.push({
        url: p,
        status: res.status,
        rowCount: data.length,
        firstRowShape: data[0]
          ? Object.fromEntries(
              Object.entries(data[0]).map(([k, v]) => [
                k,
                Array.isArray(v) ? `[Array len=${v.length}]` : typeof v,
              ]),
            )
          : null,
        sampleRow: data[0] ?? null,
      });
    }

    // Try matching each card's postBridgePostId against every row from the
    // first page of /v1/post-results. Report which field on the result row
    // (if any) carries that id.
    const firstPage = probePages.find((p) =>
      p.url.startsWith('/v1/post-results?limit=10&offset=0'),
    ) ?? probePages[0];
    const rawFirstRowsRes = await fetch(`${pbBase}/v1/post-results?limit=50`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const rawFirstRowsBody = (await rawFirstRowsRes.json()) as {
      data?: Record<string, unknown>[];
    };
    const rows = rawFirstRowsBody.data ?? [];

    const cardMatches = cards
      .filter((c) => c.postBridgePostId)
      .map((c) => {
        const matches: Array<{ field: string; row: Record<string, unknown> }> = [];
        for (const row of rows) {
          for (const [k, v] of Object.entries(row)) {
            if (typeof v === 'string' && v === c.postBridgePostId) {
              matches.push({ field: k, row });
            }
          }
        }
        return {
          cardId: c.id,
          platform: c.platform,
          accountHandle: c.accountHandle,
          postBridgePostId: c.postBridgePostId,
          matchedIn: matches.length,
          matchField: matches[0]?.field ?? null,
          matchedRow: matches[0]?.row ?? null,
        };
      });

    return NextResponse.json({
      pbBase,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.slice(0, 8),
      cardsTotal: cards.length,
      cardsWithPostId: cards.filter((c) => c.postBridgePostId).length,
      probePages,
      rowsScannedForCardMatch: rows.length,
      cardMatches,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
