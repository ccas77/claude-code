import { getOwnerId, UnauthorizedError } from './owner';

/**
 * All CRUD goes through getOwnerId() to scope queries to the signed-in user.
 */

export { getOwnerId };

export class NotFoundError extends Error {
  constructor(msg = 'Not found') {
    super(msg);
  }
}
export class ForbiddenError extends Error {
  constructor(msg = 'Not yours') {
    super(msg);
  }
}

export async function assertOwns<T extends { ownerId: string | null }>(
  row: T | undefined | null,
): Promise<void> {
  if (!row) throw new NotFoundError();
  const ownerId = await getOwnerId();
  if (row.ownerId !== ownerId) throw new ForbiddenError();
}

export function mapError(err: unknown): { status: number; body: object } {
  if (err instanceof UnauthorizedError) return { status: 401, body: { error: err.message } };
  if (err instanceof NotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof ForbiddenError) return { status: 403, body: { error: err.message } };
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { status: 500, body: { error: message } };
}
