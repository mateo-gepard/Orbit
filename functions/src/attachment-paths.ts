export function isSafeAttachmentPath(uid: string, itemId: string, path: unknown): path is string {
  return typeof path === 'string'
    && path.startsWith(`users/${uid}/projects/${itemId}/`);
}

export function safeAttachmentPaths(uid: string, itemId: string, files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  const paths = new Set<string>();
  for (const file of files) {
    if (!file || typeof file !== 'object') continue;
    const path = (file as Record<string, unknown>).storagePath;
    if (isSafeAttachmentPath(uid, itemId, path)) paths.add(path);
  }
  return [...paths];
}
