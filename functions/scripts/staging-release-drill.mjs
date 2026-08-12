const PROJECT_ID = process.env.THREADMAP_STAGING_PROJECT_ID || 'threadmap-staging-9e0b6';
const API_KEY = process.env.THREADMAP_STAGING_FIREBASE_API_KEY;
const GCLOUD_ACCESS_TOKEN = process.env.GCLOUD_ACCESS_TOKEN;
const EXPECTED_PROJECT_ID = 'threadmap-staging-9e0b6';
const FUNCTION_ORIGIN = `https://europe-west1-${PROJECT_ID}.cloudfunctions.net`;
const FIRESTORE_ORIGIN = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const IDENTITY_ADMIN_ORIGIN = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

if (PROJECT_ID !== EXPECTED_PROJECT_ID) {
  throw new Error(`Refusing destructive drills outside ${EXPECTED_PROJECT_ID}.`);
}
if (!API_KEY) throw new Error('THREADMAP_STAGING_FIREBASE_API_KEY is required.');
if (!GCLOUD_ACCESS_TOKEN) throw new Error('GCLOUD_ACCESS_TOKEN is required.');

const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const createdUsers = new Set();
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])) } };
  }
  throw new Error(`Unsupported Firestore drill value: ${typeof value}`);
}

function documentUrl(path) {
  return `${FIRESTORE_ORIGIN}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function firestoreRequest(url, init = {}, allowMissing = false) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${GCLOUD_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore operator request failed with HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

async function setDocument(path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
  return firestoreRequest(documentUrl(path), { method: 'PATCH', body: JSON.stringify({ fields }) });
}

async function getDocument(path) {
  return firestoreRequest(documentUrl(path), { method: 'GET' }, true);
}

async function deleteDocument(path) {
  return firestoreRequest(documentUrl(path), { method: 'DELETE' }, true);
}

async function deleteDocumentResource(name) {
  return firestoreRequest(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE' }, true);
}

async function queryDocuments(collectionId, fieldPath, value) {
  const response = await firestoreRequest(`${FIRESTORE_ORIGIN}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: firestoreValue(value),
          },
        },
        limit: 100,
      },
    }),
  });
  return (response || []).flatMap((entry) => entry.document ? [entry.document] : []);
}

async function identityAdminRequest(path, data, method = 'POST') {
  const response = await fetch(`${IDENTITY_ADMIN_ORIGIN}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GCLOUD_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      'x-goog-user-project': PROJECT_ID,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const reason = failure.error?.status || failure.error?.message || 'unknown-error';
    throw new Error(`Identity operator request failed with HTTP ${response.status}: ${reason}.`);
  }
  return response.status === 204 ? null : response.json();
}

async function identityClientRequest(path, data) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://identitytoolkit.googleapis.com/${path}${separator}key=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'http://localhost/' },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Identity client request failed: ${body.error?.message || response.status}.`);
  return body;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Identity Platform returned an invalid TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(sharedSecretKey, periodSec, digits, hashingAlgorithm) {
  const counter = BigInt(Math.floor(Date.now() / 1000 / periodSec));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const algorithm = hashingAlgorithm.toLowerCase().replace(/[^a-z0-9]/g, '');
  const digest = createHmac(algorithm, decodeBase32(sharedSecretKey)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

async function refreshIdToken(refreshToken) {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'http://localhost/' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const body = await response.json();
  if (!response.ok || !body.id_token) throw new Error('Could not refresh the staging drill ID token.');
  return body.id_token;
}

async function enrollTotp(idToken) {
  const started = await identityClientRequest('v2/accounts/mfaEnrollment:start', {
    idToken,
    totpEnrollmentInfo: {},
  });
  const session = started.totpSessionInfo;
  if (!session?.sharedSecretKey || !session.sessionInfo) {
    throw new Error('Identity Platform did not return a TOTP enrollment session.');
  }
  const verificationCode = currentTotp(
    session.sharedSecretKey,
    Number(session.periodSec || 30),
    Number(session.verificationCodeLength || 6),
    String(session.hashingAlgorithm || 'SHA1'),
  );
  const finalized = await identityClientRequest('v2/accounts/mfaEnrollment:finalize', {
    idToken,
    displayName: 'Release drill authenticator',
    totpVerificationInfo: {
      sessionInfo: session.sessionInfo,
      verificationCode,
    },
  });
  if (!finalized.idToken) throw new Error('Identity Platform did not finalize TOTP enrollment.');
  return finalized.idToken;
}

async function lookupUser(uid) {
  const response = await identityAdminRequest('accounts:lookup', { localId: [uid] });
  return response.users?.find((user) => user.localId === uid) || null;
}

async function cleanupPriorDrillUsers() {
  const response = await identityAdminRequest('accounts:batchGet?maxResults=1000', undefined, 'GET');
  const users = (response.users || []).filter((user) =>
    typeof user.email === 'string'
    && user.email.startsWith('release-drill-')
    && user.email.endsWith('@example.com')
  );
  for (const user of users) {
    await cleanupUser(user.localId);
  }
}

async function createUser(label) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'http://localhost/' },
    body: JSON.stringify({
      email: `release-drill-${label}-${suffix}@example.com`,
      password: `Drill-${crypto.randomUUID()}-9a!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.idToken || !body.refreshToken || !body.localId) throw new Error('Could not create a staging drill user.');
  createdUsers.add(body.localId);
  await identityAdminRequest('accounts:update', {
    localId: body.localId,
    emailVerified: true,
  });
  return { uid: body.localId, idToken: await refreshIdToken(body.refreshToken) };
}

async function callFunction(name, data, idToken) {
  const response = await fetch(`${FUNCTION_ORIGIN}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    const code = body.error?.status || body.error?.message || `HTTP ${response.status}`;
    throw new Error(`${name} rejected the drill request: ${code}`);
  }
  return body.result ?? body.data;
}

async function userIsDeleted(uid) {
  return (await lookupUser(uid)) === null;
}

async function verifyOwnedDocumentsDeleted(uid) {
  const collections = ['items', 'toolData', 'analytics', 'flightLogs', 'fcmTokens', 'mfaRecoveryCodes', 'mfaRecoveryAudits'];
  for (const collection of collections) {
    const documents = await queryDocuments(collection, collection.startsWith('mfaRecovery') ? 'uid' : 'userId', uid);
    assert(documents.length === 0, `${collection} still contains data for the deleted drill user.`);
  }
  const direct = await Promise.all([
    getDocument(`users/${uid}`),
    getDocument(`userSettings/${uid}`),
    getDocument(`mfaRecoverySets/${uid}`),
  ]);
  assert(direct.every((document) => document === null), 'A direct account document survived deletion.');
}

async function cleanupUser(uid) {
  const collections = ['items', 'toolData', 'analytics', 'flightLogs', 'fcmTokens', 'mfaRecoveryCodes', 'mfaRecoveryAudits'];
  for (const collection of collections) {
    const field = collection.startsWith('mfaRecovery') ? 'uid' : 'userId';
    const documents = await queryDocuments(collection, field, uid);
    await Promise.all(documents.map((document) => deleteDocumentResource(document.name)));
  }
  await Promise.all([
    deleteDocument(`users/${uid}`),
    deleteDocument(`userSettings/${uid}`),
    deleteDocument(`mfaRecoverySets/${uid}`),
    deleteDocument(`accountDeletionJobs/${uid}`),
  ]);
  if (await lookupUser(uid)) await identityAdminRequest('accounts:delete', { localId: uid });
  createdUsers.delete(uid);
}

try {
  await cleanupPriorDrillUsers();
  const owner = await createUser('owner');
  const foreign = await createUser('foreign');
  const ownerMarker = `owner-${suffix}`;
  const foreignMarker = `foreign-${suffix}`;
  await Promise.all([
    setDocument(`items/${owner.uid}_release_drill`, {
      userId: owner.uid,
      title: ownerMarker,
      type: 'note',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    setDocument(`toolData/${owner.uid}_release_drill`, {
      userId: owner.uid,
      toolId: 'release-drill',
      marker: ownerMarker,
      updatedAt: Date.now(),
      revision: 1,
    }),
    setDocument(`userSettings/${owner.uid}`, {
      customTags: ['release-drill'],
      removedDefaultTags: [],
      updatedAt: Date.now(),
      revision: 1,
    }),
    setDocument(`items/${foreign.uid}_release_drill`, {
      userId: foreign.uid,
      title: foreignMarker,
      type: 'note',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  ]);

  const exported = await callFunction('exportThreadmapAccount', { userId: owner.uid }, owner.idToken);
  const serializedExport = JSON.stringify(exported);
  assert(exported.user?.uid === owner.uid, 'Export returned the wrong account.');
  assert(serializedExport.includes(ownerMarker), 'Export omitted owner data.');
  assert(!serializedExport.includes(foreignMarker), 'Export crossed the tenant boundary.');
  results.push({ drill: 'tenant-isolated-export', status: 'passed', ownerItems: exported.items.length });

  const deletion = await callFunction('deleteThreadmapAccount', { userId: owner.uid }, owner.idToken);
  assert(deletion.success === true, 'Deletion did not acknowledge the request.');
  for (let attempt = 0; attempt < 12 && !(await userIsDeleted(owner.uid)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert(await userIsDeleted(owner.uid), 'Auth user survived the deletion drill.');
  await verifyOwnedDocumentsDeleted(owner.uid);
  createdUsers.delete(owner.uid);
  results.push({ drill: 'account-deletion', status: 'passed', durableJobPending: Boolean(deletion.pending) });

  const restored = await createUser('restored');
  const exportedOwnerItem = exported.items.find((item) => item.title === ownerMarker);
  assert(exportedOwnerItem, 'Recovery snapshot did not contain the seeded item.');
  const restoredItem = { ...exportedOwnerItem };
  delete restoredItem.id;
  await setDocument(`items/${restored.uid}_release_drill`, {
    ...restoredItem,
    userId: restored.uid,
    title: ownerMarker,
    restoredFrom: owner.uid,
    updatedAt: Date.now(),
  });
  if (exported.settings) {
    const restoredSettings = { ...exported.settings };
    delete restoredSettings.id;
    await setDocument(`userSettings/${restored.uid}`, { ...restoredSettings, updatedAt: Date.now() });
  }
  const restoredExport = await callFunction('exportThreadmapAccount', { userId: restored.uid }, restored.idToken);
  assert(JSON.stringify(restoredExport).includes(ownerMarker), 'Restored data could not be exported from the recovery account.');
  results.push({ drill: 'operator-recovery', status: 'passed', restoredItems: restoredExport.items.length });
  await callFunction('deleteThreadmapAccount', { userId: restored.uid }, restored.idToken);
  createdUsers.delete(restored.uid);

  const recoveryUser = await createUser('mfa');
  recoveryUser.idToken = await enrollTotp(recoveryUser.idToken);
  const generated = await callFunction('generateMfaRecoveryCodes', {}, recoveryUser.idToken);
  assert(Array.isArray(generated.codes) && generated.codes.length === 10, 'Recovery generation did not return ten codes.');
  const storedCodes = await queryDocuments('mfaRecoveryCodes', 'uid', recoveryUser.uid);
  assert(storedCodes.length === 10, 'Recovery digest count is incorrect.');
  const plaintext = generated.codes.map((code) => code.replace(/-/g, ''));
  assert(storedCodes.every((document) => !plaintext.some((code) => JSON.stringify(document.fields || {}).includes(code))), 'A plaintext recovery code was stored.');
  await callFunction('recoverMfaWithCode', { code: generated.codes[0] });
  const recoveredUser = await lookupUser(recoveryUser.uid);
  assert(recoveredUser && !recoveredUser.mfaInfo?.length, 'Recovery did not remove the stranded factor.');
  assert((await queryDocuments('mfaRecoveryCodes', 'uid', recoveryUser.uid)).length === 0, 'Recovery codes remained usable after recovery.');
  let reuseRejected = false;
  try {
    await callFunction('recoverMfaWithCode', { code: generated.codes[0] });
  } catch {
    reuseRejected = true;
  }
  assert(reuseRejected, 'A consumed recovery code was accepted twice.');
  results.push({ drill: 'mfa-recovery', status: 'passed', plaintextStored: false, reuseRejected: true });

  await cleanupUser(recoveryUser.uid);
  await cleanupUser(foreign.uid);
  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    environment: 'staging',
    completedAt: new Date().toISOString(),
    status: 'passed',
    results,
  }, null, 2));
} finally {
  for (const uid of [...createdUsers]) await cleanupUser(uid).catch(() => undefined);
}
import { createHmac } from 'node:crypto';
