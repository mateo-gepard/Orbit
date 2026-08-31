import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('irreversible account-action copy', () => {
  it('does not promise that account deletion erases every retained record immediately', () => {
    expect(t('settings.deleteAccountDesc', 'en')).not.toMatch(/all data|everything/i);
    expect(t('settings.deleteConfirmDesc', 'en')).toMatch(/security records.*backups/i);
    expect(t('settings.deleteAccountDesc', 'de')).not.toMatch(/alle daten|alles löschen/i);
    expect(t('settings.deleteConfirmDesc', 'de')).toMatch(/sicherheitsdatensätze.*backups/i);
  });

  it('describes the durable ZIP export instead of obsolete temporary links', () => {
    expect(t('settings.exportAllDataDesc', 'en')).toMatch(/ZIP archive.*uploaded files/i);
    expect(t('settings.exportAllDataDesc', 'de')).toMatch(/ZIP-Archiv.*hochgeladenen Dateien/i);
  });

  it('describes transport encryption without implying end-to-end encryption', () => {
    expect(t('login.dataEncrypted', 'en')).toContain('over encrypted connections');
    expect(t('login.dataEncrypted', 'en')).not.toMatch(/your data is encrypted/i);
    expect(t('login.dataEncrypted', 'de')).toContain('über verschlüsselte Verbindungen');
  });

  it('keeps public signup failures from confirming whether an email is registered', () => {
    expect(t('error.emailInUse', 'en')).not.toMatch(/registered|already|account exists/i);
    expect(t('error.emailInUse', 'de')).not.toMatch(/registriert|bereits|konto existiert/i);
  });
});
