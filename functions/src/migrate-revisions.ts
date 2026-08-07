import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const execute = process.argv.includes('--execute');
const useGcloudAuth = process.argv.includes('--gcloud-auth');
const projectArg = process.argv.find((argument) => argument.startsWith('--project='));
const projectId = projectArg?.slice('--project='.length) || process.env.GOOGLE_CLOUD_PROJECT;

if (!projectId) {
  throw new Error(
    'Pass --project=<firebase-project-id> explicitly. '
      + 'This prevents a maintenance run from silently targeting the wrong environment.'
  );
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

  temporaryAdcDirectory = mkdtempSync(join(tmpdir(), 'threadmap-revision-adc-'));
  const credentialPath = join(temporaryAdcDirectory, 'application-default.json');
  writeFileSync(
    credentialPath,
    JSON.stringify({ ...credential, quota_project_id: projectId }),
    { encoding: 'utf8', mode: 0o600 }
  );
  JSON.parse(readFileSync(credentialPath, 'utf8'));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
}

if (useGcloudAuth) configureGcloudApplicationDefault();

if (getApps().length === 0) {
  initializeApp({ projectId, credential: applicationDefault() });
}

const db = getFirestore();
const itemTypes = new Set(['task', 'project', 'habit', 'event', 'goal', 'note']);
const itemStatuses = new Set(['active', 'waiting', 'done', 'archived']);
const toolIds = new Set([
  'abitur',
  'toolbox',
  'wishlist',
  'settings',
  'briefing-journal',
  'dispatch-plans',
  'flightLogs',
]);

interface Candidate {
  collection: 'items' | 'toolData' | 'userSettings';
  id: string;
  reason: 'missing' | 'invalid';
  updateTime: FirebaseFirestore.Timestamp;
}

interface InvalidDocument {
  collection: 'items' | 'toolData' | 'userSettings';
  id: string;
  problem: string;
}

function validPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function validateItem(data: FirebaseFirestore.DocumentData): string | null {
  if (typeof data.userId !== 'string' || data.userId.length === 0) return 'missing userId';
  if (typeof data.title !== 'string' || data.title.length > 500) return 'invalid title';
  if (typeof data.type !== 'string' || !itemTypes.has(data.type)) return 'invalid type';
  if (typeof data.status !== 'string' || !itemStatuses.has(data.status)) return 'invalid status';
  if (!Number.isInteger(data.createdAt) || !Number.isInteger(data.updatedAt)) return 'invalid timestamps';
  if (data.content !== undefined && (typeof data.content !== 'string' || data.content.length > 200_000)) {
    return 'invalid content';
  }
  if (data.linkedIds !== undefined && (!Array.isArray(data.linkedIds) || data.linkedIds.length > 500)) {
    return 'invalid linkedIds';
  }
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.length > 100)) return 'invalid tags';
  if (data.files !== undefined && (!Array.isArray(data.files) || data.files.length > 50)) return 'invalid files';
  return null;
}

function validateToolData(id: string, data: FirebaseFirestore.DocumentData): string | null {
  if (typeof data.userId !== 'string' || data.userId.length === 0) return 'missing userId';
  if (typeof data.toolId !== 'string' || !toolIds.has(data.toolId)) return 'invalid toolId';
  if (id !== `${data.userId}_${data.toolId}`) return 'document ID does not match owner and tool';
  if (!Number.isInteger(data.updatedAt) || data.updatedAt <= 0) return 'invalid updatedAt';
  return null;
}

function validateUserSettings(data: FirebaseFirestore.DocumentData): string | null {
  if (!Array.isArray(data.customTags) || data.customTags.length > 100
      || data.customTags.some((tag: unknown) => typeof tag !== 'string')) return 'invalid customTags';
  if (!Array.isArray(data.removedDefaultTags) || data.removedDefaultTags.length > 100
      || data.removedDefaultTags.some((tag: unknown) => typeof tag !== 'string')) return 'invalid removedDefaultTags';
  if (!Number.isInteger(data.updatedAt) || data.updatedAt < 0) return 'invalid updatedAt';
  const allowedKeys = new Set(['customTags', 'removedDefaultTags', 'updatedAt', 'revision']);
  if (Object.keys(data).some((key) => !allowedKeys.has(key))) return 'unsupported fields';
  return null;
}

async function inventoryCollection(
  collection: 'items' | 'toolData' | 'userSettings',
  candidates: Candidate[],
  invalidDocuments: InvalidDocument[]
): Promise<number> {
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const document of snapshot.docs) {
      scanned += 1;
      const data = document.data();
      if (validPositiveInteger(data.revision)) continue;
      const problem = collection === 'items'
        ? validateItem(data)
        : collection === 'toolData'
          ? validateToolData(document.id, data)
          : validateUserSettings(data);
      if (problem) {
        invalidDocuments.push({ collection, id: document.id, problem });
        continue;
      }
      candidates.push({
        collection,
        id: document.id,
        reason: data.revision === undefined ? 'missing' : 'invalid',
        updateTime: document.updateTime,
      });
    }
    if (snapshot.size < 400) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return scanned;
}

async function applyCandidates(candidates: Candidate[]): Promise<number> {
  let updated = 0;
  for (let index = 0; index < candidates.length; index += 400) {
    const page = candidates.slice(index, index + 400);
    const batch = db.batch();
    for (const candidate of page) {
      const reference = db.collection(candidate.collection).doc(candidate.id);
      batch.update(reference, { revision: 1 }, { lastUpdateTime: candidate.updateTime });
    }
    await batch.commit();
    updated += page.length;
  }
  return updated;
}

async function main(): Promise<void> {
  const candidates: Candidate[] = [];
  const invalidDocuments: InvalidDocument[] = [];
  const scanned = {
    items: await inventoryCollection('items', candidates, invalidDocuments),
    toolData: await inventoryCollection('toolData', candidates, invalidDocuments),
    userSettings: await inventoryCollection('userSettings', candidates, invalidDocuments),
  };
  const report = {
    projectId,
    mode: execute ? 'execute' : 'dry-run',
    scanned,
    candidates: {
      total: candidates.length,
      items: candidates.filter((candidate) => candidate.collection === 'items').length,
      toolData: candidates.filter((candidate) => candidate.collection === 'toolData').length,
      userSettings: candidates.filter((candidate) => candidate.collection === 'userSettings').length,
      missing: candidates.filter((candidate) => candidate.reason === 'missing').length,
      invalid: candidates.filter((candidate) => candidate.reason === 'invalid').length,
    },
    updated: execute ? await applyCandidates(candidates) : 0,
    skippedMalformed: invalidDocuments.length,
    malformedDocuments: invalidDocuments,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!execute) console.log('Dry run only. Re-run with --execute after reviewing this report.');
  if (invalidDocuments.length > 0) process.exitCode = 2;
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (temporaryAdcDirectory) rmSync(temporaryAdcDirectory, { recursive: true, force: true });
  });
