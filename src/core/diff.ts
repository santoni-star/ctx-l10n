import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DiffItem, ResourceEntry } from './types.js';

export interface SnapshotState {
  version: 1;
  sourceHashes: Record<string, string>;
}

export function hashEntry(entry: ResourceEntry): string {
  const payload =
    entry.kind === 'string'
      ? `s:${entry.value}`
      : `p:${Object.entries(entry.forms)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('|')}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

export function entryId(file: string, key: string): string {
  return `${file}::${key}`;
}

export async function loadSnapshotState(repoRoot: string, statePath: string): Promise<SnapshotState> {
  const fullPath = path.resolve(repoRoot, statePath);
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotState;
    if (parsed && parsed.version === 1 && parsed.sourceHashes) {
      return parsed;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  return { version: 1, sourceHashes: {} };
}

export async function saveSnapshotState(
  repoRoot: string,
  statePath: string,
  sourceEntries: ResourceEntry[],
): Promise<void> {
  const hashes: Record<string, string> = {};
  for (const entry of sourceEntries) {
    hashes[entryId(entry.file, entry.key)] = hashEntry(entry);
  }
  const state: SnapshotState = { version: 1, sourceHashes: hashes };
  const fullPath = path.resolve(repoRoot, statePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function computeDiff(
  sourceEntries: ResourceEntry[],
  targetEntries: Map<string, ResourceEntry>,
  previousState: SnapshotState,
): DiffItem[] {
  const diff: DiffItem[] = [];
  for (const src of sourceEntries) {
    const id = entryId(src.file, src.key);
    const existing = targetEntries.get(id);
    if (!existing) {
      diff.push({ entry: src, reason: 'missing' });
      continue;
    }
    const prevHash = previousState.sourceHashes[id];
    if (prevHash && prevHash !== hashEntry(src)) {
      diff.push({ entry: src, reason: 'source_changed' });
    }
  }
  return diff;
}
