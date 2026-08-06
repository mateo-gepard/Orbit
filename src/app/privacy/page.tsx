'use client';

import Link from 'next/link';
import { useSettingsStore } from '@/lib/settings-store';

/**
 * Privacy policy.
 *
 * The content below describes what the application actually does with data,
 * derived from the code: Firebase Auth, Firestore, Storage, Cloud Messaging,
 * the optional Google Calendar integration, and the server-side link scraper.
 * Keep it in step with those code paths — if a data flow changes, this page
 * changes with it.
 *
 * OPERATOR ACTION REQUIRED before launch: replace every `[…]` placeholder with
 * the real controller identity, contact address, and hosting jurisdictions,
 * then have the result reviewed by someone qualified. This file is an accurate
 * technical description, not legal advice.
 */

const OPERATOR = '[Operator legal name]';
const CONTACT_EMAIL = '[privacy@yourdomain]';
const LAST_UPDATED = '2026-08-07';

interface Section {
  heading: string;
  body: string[];
  bullets?: string[];
}

const EN: { title: string; intro: string; sections: Section[] } = {
  title: 'Privacy Policy',
  intro:
    `This policy explains what Threadmap collects, why, and what control you have. Threadmap is operated by ${OPERATOR}. Questions: ${CONTACT_EMAIL}.`,
  sections: [
    {
      heading: 'Local mode collects nothing',
      body: [
        'Threadmap can run entirely in your browser. If you choose "Try without account", no account is created and your data is stored only in this browser\'s local storage. Nothing is transmitted to a server, and clearing your browser data deletes it permanently.',
      ],
    },
    {
      heading: 'What we store when you sign in',
      body: ['Signing in enables cross-device sync. We then process:'],
      bullets: [
        'Account identity — your email address, display name, profile photo URL, and account identifier, provided by Firebase Authentication when you sign in with Google, email and password, or an email link.',
        'Your content — the tasks, projects, notes, habits, goals, events, tags, links between them, and tool data you create. This is stored in Firestore under your account identifier.',
        'Files — anything you attach to a project, stored in Firebase Storage under a path scoped to your account.',
        'Settings — your preferences, including language, theme, and notification schedule.',
        'Device tokens — if you enable notifications, a push token per device so reminders can reach you.',
      ],
    },
    {
      heading: 'Google Calendar (optional)',
      body: [
        'If you connect Google Calendar, Threadmap reads your calendar events to show them alongside your items, and writes events you create in Threadmap back to your calendar. Access requires your explicit consent through Google and can be revoked at any time in your Google account or by turning the integration off in Settings. We do not use calendar content for anything else.',
      ],
    },
    {
      heading: 'Link previews',
      body: [
        'When you save a link in the Wishlist tool, our server fetches that page to extract a title, image, and price. The destination site will see a request from our server, not from your browser. Requests to private network addresses are blocked, and rate limits apply.',
      ],
    },
    {
      heading: 'Who processes your data',
      body: [
        'Threadmap runs on Vercel (application hosting) and Google Firebase (authentication, database, file storage, notifications, and server functions). These providers process data on our behalf as part of delivering the service. Data may be stored in [hosting regions — confirm your Firebase and Vercel regions].',
        'We do not sell your data, and we do not use it for advertising or profiling.',
      ],
    },
    {
      heading: 'Diagnostics',
      body: [
        'If crash reporting is enabled for this deployment, an application crash sends the error message, the technical stack trace, the page path, your browser version, and a timestamp. Crash reports deliberately exclude your content: no titles, note bodies, tags, file names, or anything you typed.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Your content is kept until you delete it or delete your account. Deleting your account removes your stored content, files, and device tokens. Deletion runs as a background job and may take a short time to finish across all systems; backups age out on their normal cycle.',
      ],
    },
    {
      heading: 'Your rights and controls',
      body: [
        'You can export a full copy of your data at any time from Settings, and delete your account and its data from the same screen. Depending on where you live, you may also have rights to access, correct, restrict, or object to processing, and to lodge a complaint with a supervisory authority.',
        `To exercise any of these, use the in-app controls or contact ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Children',
      body: ['Threadmap is not directed at children under [minimum age for your jurisdiction].'],
    },
    {
      heading: 'Changes',
      body: [
        'Material changes to this policy will be announced in the application before they take effect.',
      ],
    },
  ],
};

const DE: { title: string; intro: string; sections: Section[] } = {
  title: 'Datenschutzerklärung',
  intro:
    `Diese Erklärung beschreibt, welche Daten Threadmap erhebt, warum, und welche Kontrolle du darüber hast. Threadmap wird betrieben von ${OPERATOR}. Fragen: ${CONTACT_EMAIL}.`,
  sections: [
    {
      heading: 'Im lokalen Modus werden keine Daten erhoben',
      body: [
        'Threadmap läuft auf Wunsch vollständig in deinem Browser. Wenn du „Ohne Konto testen“ wählst, wird kein Konto angelegt und deine Daten liegen ausschließlich im lokalen Speicher dieses Browsers. Es werden keine Daten an einen Server übertragen; wenn du die Browserdaten löschst, sind sie endgültig gelöscht.',
      ],
    },
    {
      heading: 'Was bei angemeldeter Nutzung gespeichert wird',
      body: ['Mit der Anmeldung wird die geräteübergreifende Synchronisierung aktiviert. Dabei verarbeiten wir:'],
      bullets: [
        'Kontodaten — E-Mail-Adresse, Anzeigename, Profilbild-URL und Konto-Kennung, bereitgestellt durch Firebase Authentication bei der Anmeldung mit Google, E-Mail und Passwort oder E-Mail-Link.',
        'Deine Inhalte — Aufgaben, Projekte, Notizen, Gewohnheiten, Ziele, Termine, Tags, deren Verknüpfungen sowie Werkzeugdaten. Gespeichert in Firestore unter deiner Konto-Kennung.',
        'Dateien — alles, was du an ein Projekt anhängst, gespeichert in Firebase Storage unter einem auf dein Konto beschränkten Pfad.',
        'Einstellungen — deine Präferenzen, unter anderem Sprache, Design und Benachrichtigungszeiten.',
        'Gerätetoken — wenn du Benachrichtigungen aktivierst, je Gerät ein Push-Token, damit Erinnerungen dich erreichen.',
      ],
    },
    {
      heading: 'Google Kalender (optional)',
      body: [
        'Wenn du Google Kalender verbindest, liest Threadmap deine Termine, um sie neben deinen Elementen anzuzeigen, und schreibt in Threadmap erstellte Termine zurück in deinen Kalender. Der Zugriff erfordert deine ausdrückliche Einwilligung über Google und kann jederzeit in deinem Google-Konto oder durch Deaktivieren der Integration in den Einstellungen widerrufen werden. Kalenderinhalte werden zu keinem anderen Zweck verwendet.',
      ],
    },
    {
      heading: 'Linkvorschauen',
      body: [
        'Wenn du im Wishlist-Werkzeug einen Link speicherst, ruft unser Server diese Seite ab, um Titel, Bild und Preis zu ermitteln. Die Zielseite sieht dabei eine Anfrage unseres Servers, nicht deines Browsers. Anfragen an private Netzwerkadressen werden blockiert, und es gelten Ratenbegrenzungen.',
      ],
    },
    {
      heading: 'Wer deine Daten verarbeitet',
      body: [
        'Threadmap läuft auf Vercel (Anwendungshosting) und Google Firebase (Authentifizierung, Datenbank, Dateispeicher, Benachrichtigungen und Serverfunktionen). Diese Anbieter verarbeiten Daten in unserem Auftrag zur Bereitstellung des Dienstes. Eine Speicherung kann in [Hosting-Regionen — Firebase- und Vercel-Regionen bestätigen] erfolgen.',
        'Wir verkaufen deine Daten nicht und nutzen sie nicht für Werbung oder Profilbildung.',
      ],
    },
    {
      heading: 'Diagnosedaten',
      body: [
        'Sofern für diese Installation die Absturzberichterstattung aktiviert ist, werden bei einem Absturz die Fehlermeldung, der technische Stacktrace, der Seitenpfad, deine Browserversion und ein Zeitstempel übermittelt. Absturzberichte enthalten bewusst keine Inhalte: keine Titel, Notiztexte, Tags, Dateinamen oder sonstige Eingaben.',
      ],
    },
    {
      heading: 'Speicherdauer',
      body: [
        'Deine Inhalte bleiben gespeichert, bis du sie oder dein Konto löschst. Beim Löschen des Kontos werden gespeicherte Inhalte, Dateien und Gerätetoken entfernt. Die Löschung läuft als Hintergrundvorgang und kann bis zum Abschluss über alle Systeme kurz dauern; Sicherungen laufen im regulären Zyklus aus.',
      ],
    },
    {
      heading: 'Deine Rechte und Kontrollmöglichkeiten',
      body: [
        'Du kannst jederzeit in den Einstellungen eine vollständige Kopie deiner Daten exportieren und dort ebenso dein Konto samt Daten löschen. Je nach Wohnsitz stehen dir zusätzlich Rechte auf Auskunft, Berichtigung, Einschränkung und Widerspruch sowie das Recht auf Beschwerde bei einer Aufsichtsbehörde zu.',
        `Zur Ausübung nutze die Funktionen in der App oder wende dich an ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Kinder',
      body: ['Threadmap richtet sich nicht an Kinder unter [Mindestalter der jeweiligen Rechtsordnung].'],
    },
    {
      heading: 'Änderungen',
      body: [
        'Wesentliche Änderungen dieser Erklärung werden vor ihrem Inkrafttreten in der Anwendung angekündigt.',
      ],
    },
  ],
};

export default function PrivacyPage() {
  const language = useSettingsStore((state) => state.settings.language);
  const copy = language === 'de' ? DE : EN;

  return (
    <div className="mobile-page-gutter mx-auto max-w-2xl py-10 pb-24">
      <Link
        href="/settings"
        className="text-[12px] text-muted-foreground/70 hover:text-foreground"
      >
        ← {language === 'de' ? 'Einstellungen' : 'Settings'}
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground/50">
        {language === 'de' ? 'Zuletzt aktualisiert' : 'Last updated'} {LAST_UPDATED}
      </p>
      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">{copy.intro}</p>

      <div className="mt-8 space-y-8">
        {copy.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-[15px] font-medium text-foreground/90">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul className="mt-3 space-y-2">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="text-[13px] leading-relaxed text-muted-foreground before:mr-2 before:text-muted-foreground/40 before:content-['—']"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
