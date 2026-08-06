interface VersionedSnapshot<T> {
  version: number;
  value: T;
}

/**
 * Serializes writes and tracks the latest local revision. A flush keeps
 * running until the newest revision has persisted, including edits made while
 * an earlier write was in flight.
 */
export class VersionedSaveQueue<T> {
  private latest: VersionedSnapshot<T>;
  private persistedVersion = 0;
  private tail: Promise<void> = Promise.resolve();
  private readonly pending = new Map<number, Promise<void>>();

  constructor(
    initialValue: T,
    private readonly persist: (value: T, version: number) => Promise<void>
  ) {
    this.latest = { version: 0, value: initialValue };
  }

  update(value: T): VersionedSnapshot<T> {
    this.latest = { version: this.latest.version + 1, value };
    return this.latest;
  }

  getLatest(): VersionedSnapshot<T> {
    return this.latest;
  }

  isDirty(): boolean {
    return this.persistedVersion < this.latest.version;
  }

  /** Adopt an external value only when no local revision is waiting to save. */
  adopt(value: T): boolean {
    if (this.isDirty()) return false;
    const version = this.latest.version + 1;
    this.latest = { version, value };
    this.persistedVersion = version;
    return true;
  }

  /** Explicitly discard an unresolved local revision in favor of external state. */
  resolveWithExternal(value: T): void {
    const version = this.latest.version + 1;
    this.latest = { version, value };
    this.persistedVersion = version;
  }

  saveLatest(): Promise<void> {
    return this.save(this.latest);
  }

  async flushLatest(): Promise<void> {
    while (this.persistedVersion < this.latest.version) {
      const target = this.latest;
      await this.save(target);
    }
  }

  private save(snapshot: VersionedSnapshot<T>): Promise<void> {
    if (snapshot.version <= this.persistedVersion) return Promise.resolve();

    const pendingSave = this.pending.get(snapshot.version);
    if (pendingSave) return pendingSave;

    const save = this.tail.then(async () => {
      if (snapshot.version <= this.persistedVersion) return;
      await this.persist(snapshot.value, snapshot.version);
      this.persistedVersion = snapshot.version;
    });

    this.tail = save.catch(() => undefined);
    this.pending.set(snapshot.version, save);
    save.then(
      () => this.pending.delete(snapshot.version),
      () => this.pending.delete(snapshot.version)
    );
    return save;
  }
}
