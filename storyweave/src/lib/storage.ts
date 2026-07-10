import { put, del, head } from '@vercel/blob';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from './config';

/**
 * Storage wrapper. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set,
 * otherwise falls back to local disk under .blob-local/ for dev — served
 * back out by the /_blob/[...path] route so previews work locally.
 *
 * Returns a public-shaped { url, pathname } so callers don't branch.
 */

export type StoredBlob = { url: string; pathname: string };

const LOCAL_ROOT = path.join(process.cwd(), '.blob-local');

async function localPut(pathname: string, body: Buffer | Uint8Array): Promise<StoredBlob> {
  const abs = path.join(LOCAL_ROOT, pathname);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
  return { url: `/_blob/${pathname}`, pathname };
}

export async function putBlob(
  pathname: string,
  body: Buffer | Uint8Array | Blob | ArrayBuffer,
): Promise<StoredBlob> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    const buf =
      body instanceof Buffer
        ? body
        : body instanceof Uint8Array
          ? Buffer.from(body)
          : body instanceof ArrayBuffer
            ? Buffer.from(body)
            : Buffer.from(await (body as Blob).arrayBuffer());
    return localPut(pathname, buf);
  }
  const result = await put(pathname, body as Blob | Buffer, {
    access: 'public',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: result.url, pathname: result.pathname };
}

export async function delBlob(pathname: string): Promise<void> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    await fs.rm(path.join(LOCAL_ROOT, pathname), { force: true });
    return;
  }
  await del(pathname, { token });
}

export async function blobExists(pathname: string): Promise<boolean> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    try {
      await fs.access(path.join(LOCAL_ROOT, pathname));
      return true;
    } catch {
      return false;
    }
  }
  try {
    await head(pathname, { token });
    return true;
  } catch {
    return false;
  }
}

export async function readLocalBlob(pathname: string): Promise<Buffer> {
  return fs.readFile(path.join(LOCAL_ROOT, pathname));
}

/**
 * Resolve a stored url to something fetch()able inside a server function.
 * Blob URLs are absolute already; local-fallback urls are /_blob/ paths that
 * must be read straight from disk.
 */
export async function fetchStored(url: string): Promise<Buffer> {
  if (url.startsWith('/_blob/')) {
    return readLocalBlob(url.slice('/_blob/'.length));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
