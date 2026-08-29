import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** server/ package root (this file lives in server/src/). */
export const serverRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const dataDir = process.env.MORPH_DATA_DIR
  ? path.resolve(process.env.MORPH_DATA_DIR)
  : path.join(serverRoot, 'data');

export const assetsDir = path.join(dataDir, 'assets');
export const thumbsDir = path.join(dataDir, 'thumbnails');
export const tmpDir = path.join(dataDir, 'tmp');
export const clientDist = path.resolve(serverRoot, '..', 'client', 'dist');

export function ensureDataDirs(): void {
  for (const dir of [dataDir, assetsDir, thumbsDir, tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function boardAssetsDir(boardId: string): string {
  return path.join(assetsDir, boardId);
}

export function thumbnailPath(boardId: string): string {
  return path.join(thumbsDir, `${boardId}.png`);
}
