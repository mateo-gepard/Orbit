# Threadmap recovery runbook

**Reviewed and drilled:** 12 August 2026

## Current controls

- Production Firestore has delete protection and point-in-time recovery enabled.
- Production has daily backups retained for 7 days and weekly backups retained for 28 days.
- Production and staging Cloud Logging `_Default` buckets retain logs for 30 days.
- Staging is isolated in Firebase project `threadmap-staging-9e0b6` and Vercel preview/development environments point to it.
- The production Firebase alias is `default`; the staging alias is `staging` in `.firebaserc`.

## Restore decision order

1. Stop or disable the faulty writer.
2. Preserve logs and identify the affected collections, users, and time window.
3. For a recent accidental write/delete, select a Firestore point-in-time recovery timestamp immediately before the event.
4. For an older event, select the smallest suitable daily or weekly backup.
5. Restore to an isolated target when possible and compare counts, ownership fields, parent references, and attachment paths before copying verified records into production.
6. Run hierarchy repair only after source records are validated.
7. Verify tenant isolation, exports, deletion, file access, and background cleanup after recovery.

## Synthetic drill evidence

On 12 August 2026, the following staging-only drill passed:

1. A synthetic document was written to collection `restore_drill`.
2. That collection was exported to the staging Firebase Storage bucket.
3. The source document was deleted and confirmed absent.
4. The export was imported into the staging Firestore database.
5. The marker and boolean fields were verified after restore.
6. The restored synthetic document was deleted.
7. The encrypted export was retained under `recovery-drills/` as drill evidence.

No production user data was copied or used.

## Safety rules

- Never restore a full backup over production without first validating it in isolation.
- Never copy production personal data into staging for a routine drill.
- Never delete the source backup until recovery and the observation window are complete.
- Use an explicit `--project` and `--database` on every recovery command.
- Have a second person verify the target project and timestamp before a production restore.
- Record the operation ID, backup path, operator, start/end time, validation results, and cleanup status.
