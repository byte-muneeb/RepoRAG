const FILE_PATTERN = /[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|json|md)/g;

export function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').trim().toLowerCase();
}

export function extractFileMentions(text: string): string[] {
  const matches = text.match(FILE_PATTERN) ?? [];
  const unique = new Set<string>();

  for (const raw of matches) {
    unique.add(normalizePath(raw));
  }

  return [...unique];
}

// FNV-1a based hash for stable path -> shard mapping.
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

export function filePathToShardId(path: string, shardCount = 1500): string {
  const normalized = normalizePath(path);
  const idx = hashString(normalized) % shardCount;
  return `shard-${idx}`;
}
