import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrbitItem, ProjectFile } from './types';

interface TestStoreState {
  items: OrbitItem[];
  _syncUserId: string | null;
  setItems: ReturnType<typeof vi.fn<(items: OrbitItem[]) => void>>;
}

type CallableHandler = (input: unknown) => Promise<unknown>;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, CallableHandler>(),
  store: null as TestStoreState | null,
}));

vi.mock('./firebase', () => ({
  app: { name: 'test' },
  cloudFunctions: { region: 'test' },
  db: { project: 'test' },
  isFirebaseStorageConfigured: true,
}));

vi.mock('./store', () => ({
  useOrbitStore: {
    getState: () => {
      if (!harness.store) throw new Error('Test store is unavailable.');
      return harness.store;
    },
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) => {
    const handler = harness.handlers.get(name);
    if (!handler) throw new Error(`Missing callable handler: ${name}`);
    return handler(input);
  },
}));

vi.mock('firebase/storage', () => ({
  getBlob: vi.fn(),
  getStorage: vi.fn(() => ({ bucket: 'test' })),
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: vi.fn(() => ({
    on: (
      _event: string,
      progress: (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
      _error: (error: Error) => void,
      complete: () => void,
    ) => {
      progress({ bytesTransferred: 5, totalBytes: 5 });
      queueMicrotask(complete);
    },
  })),
}));

import { removeAttachedProjectFile, uploadAndAttachProjectFile } from './storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const ownerFile: ProjectFile = {
  id: 'file-1',
  name: 'notes.txt',
  size: 5,
  type: 'text/plain',
  storagePath: 'users/user-a/projects/project-1/file-1/notes.txt',
  uploadedAt: 100,
  uploadedBy: 'user-a',
};

function project(
  revision: number,
  files: ProjectFile[] = [ownerFile],
  userId = 'user-a',
): OrbitItem {
  return {
    id: 'project-1',
    type: 'project',
    status: 'active',
    title: 'Project',
    createdAt: 1,
    updatedAt: revision * 10,
    revision,
    userId,
    files,
  };
}

function setStore(items: OrbitItem[], userId: string | null) {
  const setItems = vi.fn<(items: OrbitItem[]) => void>((nextItems) => {
    if (harness.store) harness.store.items = nextItems;
  });
  harness.store = { items, _syncUserId: userId, setItems };
  return setItems;
}

function setCallable(name: string, handler: CallableHandler) {
  harness.handlers.set(name, handler);
}

function uploadFile() {
  return new File(['hello'], 'notes.txt', { type: 'text/plain' });
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.handlers.clear();
  setStore([project(4)], 'user-a');
});

describe('attachment revision and account guards', () => {
  it('applies a deletion only when its server revision advances the active project', async () => {
    setCallable('deleteThreadmapAttachment', async () => ({
      data: { success: true, cleanupPending: false, updatedAt: 50, revision: 5 },
    }));

    await removeAttachedProjectFile('project-1', 'user-a', ownerFile);

    expect(harness.store?.setItems).toHaveBeenCalledOnce();
    expect(harness.store?.items[0]).toMatchObject({ revision: 5, updatedAt: 50, files: [] });
  });

  it('does not let a late deletion regress a newer snapshot that restored the file', async () => {
    const deletion = deferred<unknown>();
    const deleteHandler = vi.fn(() => deletion.promise);
    setCallable('deleteThreadmapAttachment', deleteHandler);
    const operation = removeAttachedProjectFile('project-1', 'user-a', ownerFile);

    await vi.waitFor(() => expect(deleteHandler).toHaveBeenCalledOnce());
    const setItems = setStore([project(8)], 'user-a');
    deletion.resolve({
      data: { success: true, cleanupPending: false, updatedAt: 50, revision: 5 },
    });
    await operation;

    expect(setItems).not.toHaveBeenCalled();
    expect(harness.store?.items[0]).toMatchObject({ revision: 8, files: [ownerFile] });
  });

  it('does not apply a deletion result after the account context changes', async () => {
    const deletion = deferred<unknown>();
    const deleteHandler = vi.fn(() => deletion.promise);
    setCallable('deleteThreadmapAttachment', deleteHandler);
    const operation = removeAttachedProjectFile('project-1', 'user-a', ownerFile);

    await vi.waitFor(() => expect(deleteHandler).toHaveBeenCalledOnce());
    const otherFile = { ...ownerFile, storagePath: 'users/user-b/projects/project-1/file-1/notes.txt' };
    const setItems = setStore([project(1, [otherFile], 'user-b')], 'user-b');
    deletion.resolve({
      data: { success: true, cleanupPending: false, updatedAt: 50, revision: 5 },
    });
    await operation;

    expect(setItems).not.toHaveBeenCalled();
    expect(harness.store?.items[0]).toMatchObject({ userId: 'user-b', revision: 1, files: [otherFile] });
  });

  it('applies an uploaded attachment only when its revision advances the active project', async () => {
    setStore([project(4, [])], 'user-a');
    setCallable('beginThreadmapUpload', async () => ({
      data: { file: ownerFile, expiresAt: 1_000 },
    }));
    setCallable('attachThreadmapUpload', async () => ({
      data: { success: true, file: ownerFile, updatedAt: 50, revision: 5 },
    }));

    await expect(uploadAndAttachProjectFile(uploadFile(), 'project-1', 'user-a'))
      .resolves.toEqual(ownerFile);

    expect(harness.store?.setItems).toHaveBeenCalledOnce();
    expect(harness.store?.items[0]).toMatchObject({ revision: 5, updatedAt: 50, files: [ownerFile] });
  });

  it('does not re-add an upload after a newer snapshot removed or superseded it', async () => {
    setStore([project(4, [])], 'user-a');
    const attachment = deferred<unknown>();
    setCallable('beginThreadmapUpload', async () => ({
      data: { file: ownerFile, expiresAt: 1_000 },
    }));
    const attachHandler = vi.fn(() => attachment.promise);
    setCallable('attachThreadmapUpload', attachHandler);
    const operation = uploadAndAttachProjectFile(uploadFile(), 'project-1', 'user-a');

    await vi.waitFor(() => expect(attachHandler).toHaveBeenCalledOnce());
    const replacement: ProjectFile = {
      ...ownerFile,
      id: 'file-2',
      name: 'replacement.txt',
      storagePath: 'users/user-a/projects/project-1/file-2/replacement.txt',
    };
    const setItems = setStore([project(8, [replacement])], 'user-a');
    attachment.resolve({
      data: { success: true, file: ownerFile, updatedAt: 50, revision: 5 },
    });
    await operation;

    expect(setItems).not.toHaveBeenCalled();
    expect(harness.store?.items[0]).toMatchObject({ revision: 8, files: [replacement] });
  });

  it('does not apply an upload result after the account context changes', async () => {
    setStore([project(4, [])], 'user-a');
    const attachment = deferred<unknown>();
    setCallable('beginThreadmapUpload', async () => ({
      data: { file: ownerFile, expiresAt: 1_000 },
    }));
    const attachHandler = vi.fn(() => attachment.promise);
    setCallable('attachThreadmapUpload', attachHandler);
    const operation = uploadAndAttachProjectFile(uploadFile(), 'project-1', 'user-a');

    await vi.waitFor(() => expect(attachHandler).toHaveBeenCalledOnce());
    const setItems = setStore([project(1, [], 'user-b')], 'user-b');
    attachment.resolve({
      data: { success: true, file: ownerFile, updatedAt: 50, revision: 5 },
    });
    await operation;

    expect(setItems).not.toHaveBeenCalled();
    expect(harness.store?.items[0]).toMatchObject({ userId: 'user-b', revision: 1, files: [] });
  });
});
