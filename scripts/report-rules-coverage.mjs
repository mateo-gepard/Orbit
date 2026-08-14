/**
 * Say out loud when the Firestore/Storage rules suite did not run.
 *
 * `npm test` reports those 19 tests as "skipped", which in a summary line
 * reads exactly like "passed" — so a local run looks as though the security
 * rules were verified when they never executed. CI runs them in a dedicated
 * `rules` job, so they *are* covered there; this is about not misleading
 * anyone locally.
 */

const emulatorsPresent = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST
);

if (!emulatorsPresent) {
  const lines = [
    '',
    '  ⚠  Firestore & Storage rules tests did NOT run — no emulators detected.',
    '     Those 19 "skipped" tests are the security rules. Skipped is not passed.',
    '',
    '     Run them with:  npm run test:rules',
    '',
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
}
