import type {
  DocumentReference,
  Firestore,
} from 'firebase-admin/firestore';

export type AccountOwnedWriteResult = 'updated' | 'missing' | 'blocked' | 'mismatch';

/**
 * Merge a post-I/O result into an existing account-owned document without
 * allowing the write to resurrect data after account deletion has started.
 *
 * Reading both the durable account tombstone and target in the transaction is
 * intentional: a concurrent tombstone creation or target deletion makes
 * Firestore retry the transaction, at which point the merge is suppressed.
 */
export async function mergeAccountOwnedDocumentIfActive(
  firestore: Firestore,
  userId: string,
  target: DocumentReference,
  patch: Record<string, unknown>,
): Promise<AccountOwnedWriteResult> {
  const deletionRef = firestore.doc(`accountDeletionJobs/${userId}`);
  return firestore.runTransaction(async (transaction) => {
    const [deletion, current] = await Promise.all([
      transaction.get(deletionRef),
      transaction.get(target),
    ]);
    if (deletion.exists) {
      // Deleting an already-present derivative is safe and helps the account
      // sweep converge. Crucially, a missing target is never recreated.
      if (current.exists) transaction.delete(target);
      return 'blocked';
    }
    if (!current.exists) return 'missing';
    if (current.data()?.userId !== userId) return 'mismatch';
    transaction.update(target, patch);
    return 'updated';
  });
}
