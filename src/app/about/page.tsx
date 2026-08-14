import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Threadmap | A connected personal productivity workspace',
  description: 'Learn how Threadmap organizes tasks, projects, habits, notes, and optional Google Calendar sync.',
};

export default function AboutThreadmapPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Threadmap information">
        <Link className={styles.brand} href="/">
          <Image src="/icons/icon-192.png" width={38} height={38} alt="" />
          <span>Threadmap</span>
        </Link>
        <Link className={styles.openApp} href="/">Open Threadmap</Link>
      </nav>

      <section className={styles.hero}>
        <h1>Turn scattered commitments into a clear, connected map.</h1>
        <p className={styles.lede}>
          Threadmap brings tasks, projects, goals, habits, notes, and calendar events together without turning your day into another dashboard to manage.
        </p>
        <Link className={styles.primaryAction} href="/">Continue to Threadmap</Link>
      </section>

      <section className={styles.grid} aria-label="Threadmap features">
        <article>
          <h2>Capture simply</h2>
          <p>Add an idea quickly, then give it structure only when structure helps.</p>
        </article>
        <article>
          <h2>See relationships</h2>
          <p>Connect everyday actions to projects and goals, with notes and files kept in context.</p>
        </article>
        <article>
          <h2>Stay in control</h2>
          <p>Export or delete your account data from Settings and disconnect optional integrations whenever you choose.</p>
        </article>
      </section>

      <section className={styles.calendarDisclosure}>
        <div>
          <h2>Your calendar stays your choice.</h2>
        </div>
        <div>
          <p>
            If you enable Calendar sync, Threadmap asks to view and manage events only on Google calendars you own. Threadmap uses that access to import your events and keep Threadmap calendar events synchronized at your request.
          </p>
          <p>
            Calendar access is not used for advertising, is not sold, and can be revoked from Threadmap or your Google Account at any time.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Threadmap is available at threadmap.app.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
        </div>
      </footer>
    </main>
  );
}
