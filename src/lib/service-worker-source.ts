export const SERVICE_WORKER_REVISION_PLACEHOLDER = '__THREADMAP_RELEASE_REVISION__';

export function normalizeServiceWorkerRevision(revision: string | undefined): string {
  return revision?.trim() || 'local-0.1.0';
}

/**
 * Embed the immutable build identity in the worker bytes served from the
 * stable /sw.js update URL. The browser's native byte comparison can then
 * discover a new deployment without pinning the registration to an old URL.
 */
export function renderServiceWorkerSource(template: string, revision: string | undefined): string {
  const placeholderCount = template.split(SERVICE_WORKER_REVISION_PLACEHOLDER).length - 1;
  if (placeholderCount !== 1) {
    throw new Error(`Service-worker template must contain exactly one revision placeholder; found ${placeholderCount}.`);
  }
  return template.replace(
    SERVICE_WORKER_REVISION_PLACEHOLDER,
    JSON.stringify(normalizeServiceWorkerRevision(revision)),
  );
}
