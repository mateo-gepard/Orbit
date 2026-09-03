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
  constructor(
    private readonly value: MemoryDocument | undefined,
    readonly ref?: MemoryDocumentReference,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): MemoryDocument | undefined {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }

  get id(): string {
    return this.ref?.id ?? '';
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

  async set(value: MemoryDocument, options?: { merge?: boolean }): Promise<void> {
    this.store.set(this.collectionName, this.id, value, options?.merge === true);
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

  where(field: string, operator: string, value: unknown): MemoryQuery {
    return new MemoryQuery(this.store, this.collectionName)
      .where(field, operator, value);
  }

  orderBy(field: unknown, direction: 'asc' | 'desc' = 'asc'): MemoryQuery {
    return new MemoryQuery(this.store, this.collectionName)
      .orderBy(field, direction);
  }

  async get(): Promise<{ docs: MemorySnapshot[] }> {
    return { docs: this.store.query(this.collectionName) };
  }
}

export class MemoryQuery {
  private readonly filters: Array<{ field: string; operator: string; value: unknown }>;
  private readonly orderings: Array<{ field: string; direction: 'asc' | 'desc' }>;
  private maximum?: number;

  constructor(
    private readonly store: MemoryFirestore,
    private readonly collectionName: string,
    filters: Array<{ field: string; operator: string; value: unknown }> = [],
    maximum?: number,
    orderings: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
  ) {
    this.filters = filters;
    this.maximum = maximum;
    this.orderings = orderings;
  }

  where(field: string, operator: string, value: unknown): MemoryQuery {
    if (operator !== '==' && operator !== 'in' && operator !== 'array-contains') {
      throw new Error(`Unsupported memory query operator: ${operator}`);
    }
    return new MemoryQuery(
      this.store,
      this.collectionName,
      [...this.filters, { field, operator, value }],
      this.maximum,
      this.orderings,
    );
  }

  orderBy(field: unknown, direction: 'asc' | 'desc' = 'asc'): MemoryQuery {
    return new MemoryQuery(
      this.store,
      this.collectionName,
      this.filters,
      this.maximum,
      [...this.orderings, { field: typeof field === 'string' ? field : '__name__', direction }],
    );
  }

  limit(maximum: number): MemoryQuery {
    return new MemoryQuery(
      this.store,
      this.collectionName,
      this.filters,
      maximum,
      this.orderings,
    );
  }

  async get(): Promise<{ docs: MemorySnapshot[] }> {
    const matches = this.store.query(this.collectionName)
      .filter((snapshot) => this.filters.every((filter) => {
        const candidate = snapshot.data()?.[filter.field];
        if (filter.operator === 'array-contains') {
          return Array.isArray(candidate) && candidate.includes(filter.value);
        }
        if (filter.operator === 'in') {
          return Array.isArray(filter.value) && filter.value.includes(candidate);
        }
        return candidate === filter.value;
      }))
      .sort((left, right) => {
        for (const ordering of this.orderings) {
          const leftValue = ordering.field === '__name__' ? left.id : left.data()?.[ordering.field];
          const rightValue = ordering.field === '__name__' ? right.id : right.data()?.[ordering.field];
          const comparison = leftValue === rightValue ? 0 : leftValue === undefined ? -1
            : rightValue === undefined ? 1
              : typeof leftValue === 'number' && typeof rightValue === 'number'
                ? leftValue - rightValue
                : String(leftValue).localeCompare(String(rightValue));
          if (comparison !== 0) return ordering.direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
    return {
      docs: this.maximum === undefined ? matches : matches.slice(0, this.maximum),
    };
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

  set(
    reference: MemoryDocumentReference,
    value: MemoryDocument,
    options?: { merge?: boolean },
  ): this {
    this.store.set(reference.collectionName, reference.id, value, options?.merge === true);
    return this;
  }

  update(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.store.update(reference.collectionName, reference.id, value);
    return this;
  }

  delete(reference: MemoryDocumentReference): this {
    this.store.delete(reference.collectionName, reference.id);
    return this;
  }
}

export class MemoryWriteBatch {
  private readonly operations: Array<() => void> = [];

  constructor(private readonly store: MemoryFirestore) {}

  update(reference: MemoryDocumentReference, value: MemoryDocument): this {
    this.operations.push(() => this.store.update(reference.collectionName, reference.id, value));
    return this;
  }

  delete(reference: MemoryDocumentReference): this {
    this.operations.push(() => this.store.delete(reference.collectionName, reference.id));
    return this;
  }

  async commit(): Promise<void> {
    for (const operation of this.operations) operation();
  }
}

export class MemoryFirestore {
  private readonly data = new Map<string, Map<string, MemoryDocument>>();

  doc(path: string): MemoryDocumentReference {
    const segments = path.split('/');
    if (segments.length !== 2 || segments.some((segment) => !segment)) {
      throw new Error(`Unsupported memory document path: ${path}`);
    }
    return new MemoryDocumentReference(this, segments[0], segments[1]);
  }

  collection(name: string): MemoryCollectionReference {
    return new MemoryCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: MemoryTransaction) => Promise<T>): Promise<T> {
    return callback(new MemoryTransaction(this));
  }

  batch(): MemoryWriteBatch {
    return new MemoryWriteBatch(this);
  }

  get(collection: string, id: string): MemorySnapshot {
    return new MemorySnapshot(
      this.data.get(collection)?.get(id),
      new MemoryDocumentReference(this, collection, id),
    );
  }

  query(collection: string): MemorySnapshot[] {
    return [...(this.data.get(collection)?.entries() ?? [])]
      .map(([id, value]) => new MemorySnapshot(
        value,
        new MemoryDocumentReference(this, collection, id),
      ));
  }

  create(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection) || new Map<string, MemoryDocument>();
    if (documents.has(id)) throw new Error('Document already exists.');
    documents.set(id, structuredClone(value));
    this.data.set(collection, documents);
  }

  set(collection: string, id: string, value: MemoryDocument, merge = false): void {
    const documents = this.data.get(collection) || new Map<string, MemoryDocument>();
    const current = documents.get(id);
    documents.set(id, merge && current
      ? { ...current, ...structuredClone(value) }
      : structuredClone(value));
    this.data.set(collection, documents);
  }

  update(collection: string, id: string, value: MemoryDocument): void {
    const documents = this.data.get(collection);
    const current = documents?.get(id);
    if (!documents || !current) throw new Error('Document does not exist.');
    documents.set(id, { ...current, ...structuredClone(value) });
  }

  delete(collection: string, id: string): void {
    this.data.get(collection)?.delete(id);
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
