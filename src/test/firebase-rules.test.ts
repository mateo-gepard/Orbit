import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Keep every emulator and SDK client in the same isolated demo namespace.
// Cross-product Storage -> Firestore rule lookups otherwise target a different
// project when the CLI inherits the production alias from .firebaserc.
const PROJECT_ID = 'demo-threadmap-rules-test';
const OWNER_ID = 'owner-user';
const OTHER_ID = 'other-user';
const hasEmulators = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST
);
const rulesDescribe = hasEmulators ? describe : describe.skip;

let environment: RulesTestEnvironment;

function validItem(userId = OWNER_ID) {
  return {
    userId,
    title: 'Owned task',
    type: 'task',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    linkedIds: [],
    tags: [],
    files: [],
  };
}

function toolDocument(
  toolId: string,
  payload: Record<string, unknown>,
  revision = 1,
  updatedAt = 1,
) {
  // Mirrors saveToolData: caller payload first, then authoritative metadata.
  return { ...payload, userId: OWNER_ID, toolId, updatedAt, revision };
}

const TOOL_SAVE_SHAPES: Array<[string, Record<string, unknown>]> = [
  ['abitur', { profile: { onboardingComplete: false } }],
  ['toolbox', { enabledTools: ['flight', 'wishlist'] }],
  ['wishlist', { items: [], duels: [] }],
  ['settings', { settings: { theme: 'system' } }],
  ['briefing-journal', { version: 2, dailyRecords: [], weeklyRecords: [] }],
  ['dispatch-plans', { version: 2, plans: [] }],
  // Legacy whole-document flight logs remain writable only in their bounded,
  // metadata-bearing shape while migration support is present.
  ['flightLogs', { logs: [] }],
];

beforeAll(async () => {
  if (!hasEmulators) return;
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
    storage: {
      rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  if (!hasEmulators) return;
  await environment.clearFirestore();
  await environment.clearStorage();
});

afterAll(async () => {
  await environment?.cleanup();
});

rulesDescribe('Firestore ownership and server-only workflows', () => {
  it('allows valid owner item access but denies cross-account access and direct deletion', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const otherDb = environment.authenticatedContext(OTHER_ID).firestore();
    const itemRef = doc(ownerDb, 'items', 'item-1');

    await assertSucceeds(setDoc(itemRef, validItem()));
    await assertSucceeds(getDoc(itemRef));
    await assertFails(getDoc(doc(otherDb, 'items', 'item-1')));
    await assertFails(deleteDoc(itemRef));
  });

  it('revalidates item updates and prevents ownership changes', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const itemRef = doc(ownerDb, 'items', 'item-1');
    await setDoc(itemRef, validItem());

    await assertSucceeds(updateDoc(itemRef, { title: 'Updated', updatedAt: 2, revision: 2 }));
    await assertFails(updateDoc(itemRef, { title: 'Stale', updatedAt: 3, revision: 2 }));
    await assertFails(updateDoc(itemRef, { userId: OTHER_ID, updatedAt: 3, revision: 3 }));
    await assertFails(updateDoc(itemRef, { status: 'invalid', updatedAt: 3, revision: 3 }));
    await assertFails(updateDoc(itemRef, { createdAt: 99, updatedAt: 3, revision: 3 }));
  });

  it('allows attachment additions but reserves removals for the cleanup function', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const itemRef = doc(ownerDb, 'items', 'item-1');
    const originalFile = {
      id: 'file-1',
      name: 'original.txt',
      type: 'text/plain',
      size: 4,
      storagePath: `users/${OWNER_ID}/projects/item-1/file-1.txt`,
      uploadedAt: 1,
    };
    await setDoc(itemRef, { ...validItem(), files: [originalFile] });

    await assertSucceeds(updateDoc(itemRef, {
      files: [originalFile, { ...originalFile, id: 'file-2', name: 'second.txt' }],
      updatedAt: 2,
      revision: 2,
    }));
    await assertFails(updateDoc(itemRef, { files: [], updatedAt: 3, revision: 3 }));
    await assertFails(updateDoc(itemRef, {
      files: [{ ...originalFile, storagePath: 'projects/item-1/replaced.txt' }],
      updatedAt: 3,
      revision: 3,
    }));
  });

  for (const [toolId, payload] of TOOL_SAVE_SHAPES) {
    it(`accepts the actual saveToolData shape for ${toolId}`, async () => {
      const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
      const toolRef = doc(ownerDb, 'toolData', `${OWNER_ID}_${toolId}`);

      await assertSucceeds(setDoc(toolRef, toolDocument(toolId, payload)));
      await assertSucceeds(setDoc(
        toolRef,
        toolDocument(toolId, payload, 2, 2),
        { merge: true },
      ));
    });
  }

  it('binds tool data to its UID, tool ID, timestamp, allowlisted shape, and monotonic revision', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const validRef = doc(ownerDb, 'toolData', `${OWNER_ID}_settings`);

    await assertSucceeds(setDoc(validRef, toolDocument('settings', { settings: {} })));
    await assertSucceeds(updateDoc(validRef, {
      revision: 2,
      updatedAt: 2,
      settings: { theme: 'dark' },
    }));
    await assertFails(updateDoc(validRef, { revision: 4 }));
    await assertFails(updateDoc(validRef, { revision: 2, toolId: 'toolbox', updatedAt: 2 }));
    await assertFails(updateDoc(validRef, { revision: 2, updatedAt: 'now' }));
    await assertFails(updateDoc(validRef, { revision: 2, updatedAt: 2, unexpected: true }));
    await assertFails(setDoc(doc(ownerDb, 'toolData', `${OWNER_ID}suffix`), {
      ...toolDocument('settings', { settings: {} }),
    }));
    await assertFails(setDoc(doc(ownerDb, 'toolData', `${OWNER_ID}_unknown-tool`), {
      ...toolDocument('unknown-tool', {}),
    }));
  });

  it('lets only the exact owner clear a verified legacy flight document without userId', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'toolData', `${OWNER_ID}_flightLogs`), { logs: [] });
      await setDoc(doc(context.firestore(), 'toolData', `${OWNER_ID}_settings`), { settings: {} });
    });
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const otherDb = environment.authenticatedContext(OTHER_ID).firestore();

    await assertFails(deleteDoc(doc(otherDb, 'toolData', `${OWNER_ID}_flightLogs`)));
    await assertFails(deleteDoc(doc(ownerDb, 'toolData', `${OWNER_ID}_settings`)));
    await assertSucceeds(deleteDoc(doc(ownerDb, 'toolData', `${OWNER_ID}_flightLogs`)));
  });

  it('keeps push devices owner-readable but reserves every mutation for Cloud Functions', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const otherDb = environment.authenticatedContext(OTHER_ID).firestore();
    const deviceRef = doc(ownerDb, 'fcmTokens', `${OWNER_ID}_fingerprint`);
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'fcmTokens', `${OWNER_ID}_fingerprint`), {
        userId: OWNER_ID,
        fingerprint: 'fingerprint',
        type: 'fcm',
        token: 'delivery-token-with-enough-length',
        createdAt: 1,
        updatedAt: 1,
        leaseUntil: 0,
        retryCount: 0,
      });
    });

    await assertSucceeds(getDoc(deviceRef));
    await assertFails(getDoc(doc(otherDb, 'fcmTokens', `${OWNER_ID}_fingerprint`)));
    await assertFails(setDoc(doc(ownerDb, 'fcmTokens', `${OWNER_ID}_new-device`), {
      userId: OWNER_ID,
      fingerprint: 'new-device',
      type: 'fcm',
      token: 'another-delivery-token-with-enough-length',
      createdAt: 1,
      updatedAt: 1,
      leaseUntil: 0,
      retryCount: 0,
    }));
    await assertFails(updateDoc(deviceRef, { morningEnabled: true, updatedAt: 2 }));
    await assertFails(deleteDoc(deviceRef));
    await assertFails(getDoc(doc(ownerDb, 'pushDeviceRegistries', OWNER_ID)));
  });

  it('allows owner flight logs and denies removed/internal collections', async () => {
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'flightLogs', `${OWNER_ID}_flight-1`), {
      id: 'flight-1',
      userId: OWNER_ID,
      startedAt: 1,
    }));
    await assertFails(setDoc(doc(ownerDb, 'flightLogs', `${OTHER_ID}_flight-1`), {
      id: 'flight-1',
      userId: OWNER_ID,
      startedAt: 1,
    }));
    await assertFails(setDoc(doc(ownerDb, 'users', OWNER_ID), { displayName: 'Owner' }));
    await assertFails(setDoc(doc(ownerDb, 'deletionJobs', 'job-1'), { userId: OWNER_ID }));
  });

  it('keeps historical analytics server-only and blocks new client telemetry', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'analytics', 'historical-event'), {
        userId: OWNER_ID,
        action: 'item_created',
        timestamp: 1,
        date: '2026-08-06',
      });
    });
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    const historicalRef = doc(ownerDb, 'analytics', 'historical-event');

    await assertFails(getDoc(historicalRef));
    await assertFails(deleteDoc(historicalRef));
    await assertFails(setDoc(doc(ownerDb, 'analytics', 'new-event'), {
      userId: OWNER_ID,
      action: 'item_created',
      timestamp: 2,
      date: '2026-08-06',
    }));
  });

  it('allows owner-constrained device and flight queries but rejects unscoped lists', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'flightLogs', `${OWNER_ID}_flight-1`), {
        id: 'flight-1', userId: OWNER_ID, startedAt: 1,
      });
      await setDoc(doc(context.firestore(), 'fcmTokens', `${OWNER_ID}_device-1`), {
        userId: OWNER_ID, fingerprint: 'device-1', type: 'fcm',
        token: 'delivery-token-with-enough-length', createdAt: 1, updatedAt: 1,
        leaseUntil: 0, retryCount: 0,
      });
    });
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();

    await assertSucceeds(getDocs(query(
      collection(ownerDb, 'flightLogs'),
      where('userId', '==', OWNER_ID)
    )));
    await assertSucceeds(getDocs(query(
      collection(ownerDb, 'fcmTokens'),
      where('userId', '==', OWNER_ID)
    )));
    await assertFails(getDocs(collection(ownerDb, 'flightLogs')));
    await assertFails(getDocs(query(
      collection(ownerDb, 'fcmTokens'),
      where('userId', '==', OTHER_ID)
    )));
  });

  it('blocks an account as soon as the server deletion tombstone exists', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'items', 'item-1'), validItem());
      await setDoc(doc(context.firestore(), 'accountDeletionJobs', OWNER_ID), {
        userId: OWNER_ID,
        nextAttemptAt: 0,
      });
    });
    const ownerDb = environment.authenticatedContext(OWNER_ID).firestore();
    await assertFails(getDoc(doc(ownerDb, 'items', 'item-1')));
    await assertFails(setDoc(doc(ownerDb, 'items', 'item-2'), validItem()));
  });
});

rulesDescribe('Storage ownership and content limits', () => {
  it('allows safe owner uploads and rejects SVG and cross-account reads', async () => {
    const intentId = 'intent-1';
    const path = `users/${OWNER_ID}/projects/project-1/${intentId}/file.txt`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'items', 'project-1'), validItem());
      await setDoc(doc(context.firestore(), 'items', 'other-project'), validItem(OTHER_ID));
      await setDoc(doc(context.firestore(), 'attachmentUploadIntents', intentId), {
        userId: OWNER_ID,
        itemId: 'project-1',
        storagePath: path,
        size: 4,
        type: 'text/plain',
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      });
    });
    const ownerStorage = environment.authenticatedContext(OWNER_ID).storage();
    const otherStorage = environment.authenticatedContext(OTHER_ID).storage();

    await assertSucceeds(uploadBytes(ref(ownerStorage, path), new Blob(['safe']), {
      contentType: 'text/plain',
      customMetadata: { threadmapUploadId: intentId },
    }));
    await assertSucceeds(getBytes(ref(ownerStorage, path)));
    await assertFails(getBytes(ref(otherStorage, path)));
    await assertFails(uploadBytes(ref(ownerStorage, path), new Blob(['replacement']), {
      contentType: 'text/plain',
      customMetadata: { threadmapUploadId: intentId },
    }));
    await assertFails(deleteObject(ref(ownerStorage, path)));
    await assertFails(uploadBytes(
      ref(ownerStorage, `users/${OWNER_ID}/projects/project-1/active.svg`),
      new Blob(['<svg/>']),
      { contentType: 'image/svg+xml' }
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, `users/${OWNER_ID}/projects/project-1/no-intent/orphan.txt`),
      new Blob(['orphan']),
      { contentType: 'text/plain', customMetadata: { threadmapUploadId: 'no-intent' } }
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, `users/${OWNER_ID}/projects/missing-project/orphan.txt`),
      new Blob(['orphan']),
      { contentType: 'text/plain' }
    ));
    await assertFails(uploadBytes(
      ref(ownerStorage, `users/${OWNER_ID}/projects/other-project/not-owned.txt`),
      new Blob(['cross-owner']),
      { contentType: 'text/plain' }
    ));
  });

  it('denies all client access to retired legacy paths', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'items', 'legacy-project'), validItem());
      await uploadBytes(
        ref(context.storage(), 'projects/legacy-project/old.pdf'),
        new Blob(['legacy']),
        { contentType: 'application/pdf' }
      );
    });

    const ownerStorage = environment.authenticatedContext(OWNER_ID).storage();
    const otherStorage = environment.authenticatedContext(OTHER_ID).storage();
    const legacyPath = 'projects/legacy-project/old.pdf';
    await assertFails(getBytes(ref(ownerStorage, legacyPath)));
    await assertFails(getBytes(ref(otherStorage, legacyPath)));
    await assertFails(uploadBytes(
      ref(ownerStorage, 'projects/legacy-project/new.pdf'),
      new Blob(['new']),
      { contentType: 'application/pdf' }
    ));
    await assertFails(deleteObject(ref(ownerStorage, legacyPath)));
  });
});
