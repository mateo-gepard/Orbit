/**
 * Minimal in-memory stand-in for the Firestore Admin surface the MCP OAuth
 * service and DAL touch: `collection().doc()` with `create`/`get`, and
 * `runTransaction` with `get`/`create`/`update`.
 *
 * Transactions are executed directly rather than being retried on contention,
 * which is what makes the OAuth flow deterministic in tests. Anything relying on
 * real contention behavior belongs in the emulator-backed rules suite instead.
 *
 * Used only by tests; it is excluded from the deployed bundle by the
 * `lib/**` ignore globs in `firebase.json`.
 */

export type MemoryDocument = Record<string, unknown>;

export class MemorySnapshot {
  constructor(private readonly value: MemoryDocument | undefined) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): MemoryDocument | undefined {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }
}

export class MemoryDocumentReference {
  constructor(
    private readonly store: MemoryFirestore,
    readonly collectionName: string,
    readonly id: string,
  ) {}

  async create(value: MemoryDocument): Promise<void> {
    this.store.create(this.collectionName, this.id, value);
  }

  async set(value: MemoryDocument): Promise<void> {
    this.store.set(this.collectionName, this.id, value);
  }

  async get(): Promise<MemorySnapshot> {
    return this.store.get(this.collectionName, this.id);
  }
}

export class MemoryCollectionReference {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly collectionName: string,
  ) {}

  doc(id: string): MemoryDocumentReference {
    return new MemoryDocumentReference(this.store, this.collectionName, id);
  }
}

export class MemoryTransaction {
  constructor(private readonly store: MemoryFirestore) {}

  async get(reference: MemoryDocumentReference): Promise<MemorySnapshot> {
    return this.store.get(reference.collectionName, reference.id);
  }

  create(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.create(reference.collectionName, reference.id, value);
    return this;
  }

  set(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.set(reference.collectionName, reference.id, value);
    return this;
  }

  update(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.update(reference.collectionName, reference.id, value);
    return this;
  }
}

export class MemoryFirestore {
  private readonly data = new Map<string, Map<string, MemoryDocument>>();

  collection(name: string): MemoryCollectionReference {
    return new MemoryCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: MemoryTransaction) => Promise<T>): Promise<T> {
    return callback(new MemoryTransaction(this));
  }

  get(collection: string, id: string): MemorySnapshot {
    return new MemorySnapshot(this.data.get(collection)?.get(id));
  }

  create(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection) || new Map<string, MemoryDocument>();
    if (documents.has(id)) throw new Error('Document already exists.');
    documents.set(id, structuredClone(value));
    this.data.set(collection, documents);
  }

  set(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection) || new Map<string, MemoryDocument>();
    documents.set(id, structuredClone(value));
    this.data.set(collection, documents);
  }

  update(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection);
    const current = documents?.get(id);
    if (!documents || !current) throw new Error('Document does not exist.');
    documents.set(id, { ...current, ...structuredClone(value) });
  }

  dump(): Record<string, Record<string, MemoryDocument>> {
    return Object.fromEntries(
      [...this.data.entries()].map(([collection, documents]) => [
        collection,
        Object.fromEntries(documents.entries()),
      ]),
    );
  }
}
