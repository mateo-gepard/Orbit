import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const execute = process.argv.includes('--execute');
const useGcloudAuth = process.argv.includes('--gcloud-auth');
const limitArg = process.argv.find((argument) => argument.startsWith('--limit='));
const maxCandidates = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : Number.POSITIVE_INFINITY;
const projectArg = process.argv.find((argument) => argument.startsWith('--project='));
const bucketArg = process.argv.find((argument) => argument.startsWith('--bucket='));
const quarantineArg = process.argv.find((argument) => argument.startsWith('--quarantine-prefix='));
const projectId = projectArg?.slice('--project='.length) || process.env.GOOGLE_CLOUD_PROJECT;
const bucketName = bucketArg?.slice('--bucket='.length) || process.env.FIREBASE_STORAGE_BUCKET;
const quarantinePrefix = quarantineArg?.slice('--quarantine-prefix='.length).replace(/^\/+|\/+$/g, '');

if (!projectId || !bucketName) {
  throw new Error(
    'Pass --project=<firebase-project-id> and --bucket=<storage-bucket> explicitly. '
      + 'This prevents a maintenance run from silently targeting the wrong environment.'
  );
}

if (quarantinePrefix && (
  quarantinePrefix.startsWith('projects/')
  || quarantinePrefix.startsWith('users/')
  || quarantinePrefix.includes('..')
)) {
  throw new Error('The quarantine prefix must be an admin-only path outside projects/ and users/.');
}

let temporaryAdcDirectory: string | null = null;

function configureGcloudApplicationDefault(): void {
  const configDirectory = execFileSync(
    'gcloud',
    ['info', '--format=value(config.paths.global_config_dir)'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 }
  ).trim();
  const account = execFileSync(
    'gcloud',
    ['config', 'get-value', 'account'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 }
  ).trim();
  if (!configDirectory || !account) {
    throw new Error('No active gcloud account is available for this maintenance run.');
  }

  const escapedAccount = account.replace(/'/g, "''");
  const credentialJson = execFileSync(
    'sqlite3',
    [join(configDirectory, 'credentials.db'), `select value from credentials where account_id='${escapedAccount}';`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 }
  ).trim();
  const credential = JSON.parse(credentialJson) as Record<string, unknown>;
  if (credential.type !== 'authorized_user'
      || typeof credential.client_id !== 'string'
      || typeof credential.client_secret !== 'string'
      || typeof credential.refresh_token !== 'string') {
    throw new Error('The active gcloud credential is not a reusable authorized-user credential.');
  }

  temporaryAdcDirectory = mkdtempSync(join(tmpdir(), 'orbit-gcloud-adc-'));
  const credentialPath = join(temporaryAdcDirectory, 'application-default.json');
  writeFileSync(
    credentialPath,
    JSON.stringify({ ...credential, quota_project_id: projectId }),
    { encoding: 'utf8', mode: 0o600 }
  );
  // Confirm the credential is readable before giving its path to Google Auth.
  JSON.parse(readFileSync(credentialPath, 'utf8'));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
}

if (useGcloudAuth) configureGcloudApplicationDefault();

if (getApps().length === 0) {
  initializeApp({
    projectId,
    storageBucket: bucketName,
    credential: applicationDefault(),
  });
}

const db = getFirestore();
const bucket = getStorage().bucket(bucketName);

interface LegacyFile {
  id?: string;
  name?: string;
  storagePath?: string;
  legacyStoragePath?: string;
  url?: string;
  [key: string]: unknown;
}

interface Candidate {
  itemId: string;
  userId: string;
  fileId: string;
  legacyPath: string;
  currentPath: string;
  targetPath: string;
}

function targetPath(userId: string, itemId: string, file: LegacyFile, legacyPath: string): string {
  const stableId = createHash('sha256')
    .update(`${typeof file.id === 'string' ? file.id : ''}\0${legacyPath}`)
    .digest('hex')
    .slice(0, 32);
  const originalName = legacyPath.split('/').pop() || file.name || 'attachment';
  const safeName = String(originalName).replace(/[^a-zA-Z0-9.-]/g, '_').slice(-160) || 'attachment';
  return `users/${userId}/projects/${itemId}/${stableId}_${safeName}`;
}

function hasMatchingIntegrity(
  source: { size?: string | number; md5Hash?: string; crc32c?: string },
  target: { size?: string | number; md5Hash?: string; crc32c?: string }
): boolean {
  if (String(source.size || '') !== String(target.size || '')) return false;
  if (source.md5Hash && target.md5Hash) return source.md5Hash === target.md5Hash;
  if (source.crc32c && target.crc32c) return source.crc32c === target.crc32c;
  return false;
}

function candidateFor(itemId: string, userId: string, value: unknown): Candidate | null {
  if (!value || typeof value !== 'object') return null;
  const file = value as LegacyFile;
  const currentPath = typeof file.storagePath === 'string' ? file.storagePath : '';
  const explicitLegacy = typeof file.legacyStoragePath === 'string' ? file.legacyStoragePath : '';
  const legacyPath = currentPath.startsWith(`projects/${itemId}/`)
    ? currentPath
    : explicitLegacy.startsWith(`projects/${itemId}/`)
      ? explicitLegacy
      : '';
  if (!legacyPath) return null;
  return {
    itemId,
    userId,
    fileId: typeof file.id === 'string' ? file.id : '',
    legacyPath,
    currentPath,
    targetPath: currentPath.startsWith(`users/${userId}/projects/${itemId}/`)
      ? currentPath
      : targetPath(userId, itemId, file, legacyPath),
  };
}

function matchesCandidate(file: LegacyFile, candidate: Candidate): boolean {
  const pathMatches = file.storagePath === candidate.currentPath
    || file.storagePath === candidate.legacyPath
    || file.storagePath === candidate.targetPath;
  return pathMatches
    && (file.legacyStoragePath === candidate.legacyPath || file.storagePath === candidate.legacyPath);
}

async function finalizeMetadata(candidate: Candidate): Promise<void> {
  const itemRef = db.doc(`items/${candidate.itemId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists) return;
    if (snapshot.data()?.userId !== candidate.userId) {
      throw new Error('Item owner changed during migration finalization.');
    }
    const files = snapshot.data()?.files;
    if (!Array.isArray(files)) return;
    const matchingIndexes = files
      .map((value: LegacyFile, index: number) => (
        matchesCandidate(value, { ...candidate, currentPath: candidate.targetPath }) ? index : -1
      ))
      .filter((index: number) => index >= 0);
    if (matchingIndexes.length > 1) {
      throw new Error('Multiple attachment rows reference one legacy object; metadata was preserved for manual resolution.');
    }
    if (matchingIndexes.length === 0) return;
    const matchingIndex = matchingIndexes[0];
    const completed = files.map((value: LegacyFile, index: number) => {
      if (index !== matchingIndex) return value;
      const next = { ...value };
      delete next.legacyStoragePath;
      delete next.url;
      return next;
    });
    transaction.update(itemRef, {
      files: completed,
      updatedAt: Date.now(),
      revision: Number(snapshot.data()?.revision || 0) + 1,
    });
  });
}

async function migrate(candidate: Candidate): Promise<'migrated' | 'already-current' | 'missing'> {
  const source = bucket.file(candidate.legacyPath);
  const target = bucket.file(candidate.targetPath);
  const [[sourceExists], [targetExists]] = await Promise.all([source.exists(), target.exists()]);
  if (!sourceExists && !targetExists) return 'missing';
  if (!sourceExists) {
    if (!targetExists || candidate.currentPath !== candidate.targetPath) return 'missing';
    if (execute) await finalizeMetadata(candidate);
    return 'already-current';
  }

  const [sourceMetadata] = await source.getMetadata();
  if (targetExists) {
    const [targetMetadata] = await target.getMetadata();
    if (!hasMatchingIntegrity(sourceMetadata, targetMetadata)) {
      throw new Error('Existing target does not match source size/checksum; source was preserved.');
    }
  }
  if (!execute) return targetExists && candidate.currentPath === candidate.targetPath
    ? 'already-current'
    : 'migrated';

  if (!targetExists) {
    await source.copy(target, { preconditionOpts: { ifGenerationMatch: 0 } });
    const [copiedMetadata] = await target.getMetadata();
    if (!hasMatchingIntegrity(sourceMetadata, copiedMetadata)) {
      await target.delete({ ignoreNotFound: true });
      throw new Error('Copied target failed size/checksum verification; source was preserved.');
    }
  }

  const itemRef = db.doc(`items/${candidate.itemId}`);
  const metadataResult = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists || snapshot.data()?.userId !== candidate.userId) {
      throw new Error('Item owner changed during migration.');
    }
    const files = snapshot.data()?.files;
    if (!Array.isArray(files)) throw new Error('Attachment metadata disappeared during migration.');
    const matchingIndexes = files
      .map((value: LegacyFile, index: number) => matchesCandidate(value, candidate) ? index : -1)
      .filter((index: number) => index >= 0);
    if (matchingIndexes.length > 1) {
      throw new Error('Multiple attachment rows reference one legacy object; source and metadata were preserved.');
    }
    const matchingIndex = matchingIndexes[0];
    const migrated = files.map((value: LegacyFile, index: number) => {
      if (index !== matchingIndex) return value;
      const next = {
        ...value,
        storagePath: candidate.targetPath,
        legacyStoragePath: candidate.legacyPath,
      };
      delete next.url;
      return next;
    });
    if (matchingIndex === undefined) {
      const alreadyCurrent = files.some((value: LegacyFile) =>
        (!candidate.fileId || value.id === candidate.fileId)
          && value.storagePath === candidate.targetPath
      );
      return alreadyCurrent ? 'already-current' : 'missing';
    }
    transaction.update(itemRef, {
      files: migrated,
      updatedAt: Date.now(),
      revision: Number(snapshot.data()?.revision || 0) + 1,
    });
    return 'migrated';
  });

  if (metadataResult === 'missing') {
    throw new Error('Attachment metadata changed to an unexpected path during migration.');
  }

  if (!sourceMetadata.generation) {
    throw new Error('Source object has no generation precondition; source was preserved.');
  }
  try {
    await source.delete({
      ignoreNotFound: true,
      // GCS generations can exceed JavaScript's safe integer range. Preserve the
      // exact string value or an otherwise-correct precondition can fail.
      ifGenerationMatch: sourceMetadata.generation,
    });
  } catch (error) {
    const [stillExists] = await source.exists();
    if (stillExists) throw error;
  }
  await finalizeMetadata(candidate);
  return metadataResult;
}

async function archiveOrphan(
  source: ReturnType<typeof bucket.file>
): Promise<'archived' | 'already-archived'> {
  if (!quarantinePrefix) {
    throw new Error('Pass --quarantine-prefix=<admin-only-prefix> to preserve orphaned legacy objects.');
  }
  const target = bucket.file(`${quarantinePrefix}/${source.name}`);
  const [[sourceExists], [targetExists]] = await Promise.all([source.exists(), target.exists()]);
  if (!sourceExists) return 'already-archived';

  const [sourceMetadata] = await source.getMetadata();
  if (targetExists) {
    const [targetMetadata] = await target.getMetadata();
    if (!hasMatchingIntegrity(sourceMetadata, targetMetadata)) {
      throw new Error('Existing quarantine object does not match source size/checksum; source was preserved.');
    }
  } else {
    await source.copy(target, { preconditionOpts: { ifGenerationMatch: 0 } });
    const [copiedMetadata] = await target.getMetadata();
    if (!hasMatchingIntegrity(sourceMetadata, copiedMetadata)) {
      await target.delete({ ignoreNotFound: true });
      throw new Error('Quarantine copy failed size/checksum verification; source was preserved.');
    }
  }

  if (!sourceMetadata.generation) {
    throw new Error('Orphaned source has no generation precondition; source was preserved.');
  }
  await source.delete({
    ignoreNotFound: true,
    ifGenerationMatch: sourceMetadata.generation,
  });
  return targetExists ? 'already-archived' : 'archived';
}

async function main(): Promise<void> {
  const candidateReferences = new Map<string, Candidate[]>();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  // Always inventory the complete collection. `--limit` limits attachment
  // migrations only; truncating discovery would misclassify later referenced
  // objects as orphans and could quarantine live files.
  while (true) {
    let query = db.collection('items').orderBy(FieldPath.documentId()).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const item of snapshot.docs) {
      const userId = item.data().userId;
      const files = item.data().files;
      if (typeof userId !== 'string' || !Array.isArray(files)) continue;
      for (const file of files) {
        const candidate = candidateFor(item.id, userId, file);
        if (!candidate) continue;
        const references = candidateReferences.get(candidate.legacyPath) || [];
        references.push(candidate);
        candidateReferences.set(candidate.legacyPath, references);
      }
    }
    if (snapshot.size < 200) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  // A Storage object is one attachment identity. More than one metadata row
  // pointing at it cannot be collapsed safely: each row may carry distinct
  // names, IDs, and user intent. Report the ambiguity and require a human to
  // choose whether to duplicate the object or remove a stale reference.
  const ambiguousSources = [...candidateReferences.entries()]
    .filter(([, references]) => references.length > 1)
    .map(([legacyPath, references]) => ({
      legacyPath,
      references: references.map(({ itemId, userId, fileId }) => ({ itemId, userId, fileId })),
    }));
  const candidates = [...candidateReferences.values()]
    .filter((references) => references.length === 1)
    .map(([candidate]) => candidate);
  const referencedLegacyPaths = new Set(candidateReferences.keys());
  const selectedCandidates = candidates.slice(0, maxCandidates);
  const [legacyObjects] = await bucket.getFiles({ prefix: 'projects/' });
  const orphanedLegacyObjects = legacyObjects.filter((file) => (
    !file.name.endsWith('/') && !referencedLegacyPaths.has(file.name)
  ));
  if (execute && orphanedLegacyObjects.length > 0 && !quarantinePrefix) {
    throw new Error(
      `Found ${orphanedLegacyObjects.length} unreferenced legacy object(s). `
        + 'Pass --quarantine-prefix=<admin-only-prefix> so they are preserved before removal.'
    );
  }

  const report = {
    mode: execute ? 'execute' : 'dry-run',
    discoveredReferences: [...candidateReferences.values()].reduce(
      (count, references) => count + references.length,
      0,
    ),
    discoveredCandidates: candidates.length,
    selectedCandidates: selectedCandidates.length,
    ambiguousSources,
    legacyObjects: legacyObjects.filter((file) => !file.name.endsWith('/')).length,
    orphanedLegacyObjects: orphanedLegacyObjects.length,
    migrated: 0,
    alreadyCurrent: 0,
    missing: 0,
    archivedOrphans: 0,
    alreadyArchivedOrphans: 0,
    failed: 0,
    failures: [] as Array<{ itemId?: string; path: string; error: string }>,
  };
  for (const ambiguity of ambiguousSources) {
    report.failed += 1;
    report.failures.push({
      path: ambiguity.legacyPath,
      error: `${ambiguity.references.length} metadata rows reference this object; manual resolution is required.`,
    });
  }
  if (execute && ambiguousSources.length > 0) {
    console.log(JSON.stringify(report, null, 2));
    console.error('No migration changes were made because ambiguous attachment references were found.');
    process.exitCode = 1;
    return;
  }
  for (const candidate of selectedCandidates) {
    try {
      const result = await migrate(candidate);
      if (result === 'migrated') report.migrated += 1;
      if (result === 'already-current') report.alreadyCurrent += 1;
      if (result === 'missing') report.missing += 1;
    } catch (error) {
      report.failed += 1;
      report.failures.push({
        itemId: candidate.itemId,
        path: candidate.legacyPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (execute) {
    for (const orphan of orphanedLegacyObjects) {
      try {
        const result = await archiveOrphan(orphan);
        if (result === 'archived') report.archivedOrphans += 1;
        if (result === 'already-archived') report.alreadyArchivedOrphans += 1;
      } catch (error) {
        report.failed += 1;
        report.failures.push({
          path: orphan.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (!execute) console.log('Dry run only. Re-run with --execute after reviewing this report.');
  if (report.failed > 0) process.exitCode = 1;
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (temporaryAdcDirectory) {
      rmSync(temporaryAdcDirectory, { recursive: true, force: true });
    }
  });
