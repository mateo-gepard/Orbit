import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal/legal-page';
import { legalConfig } from '@/lib/legal-config';

export const metadata: Metadata = {
  title: 'Security | Threadmap',
  description: 'Threadmap security practices and vulnerability disclosure process.',
};

export default function SecurityPage() {
  return (
    <LegalPage eyebrow="Trust and disclosure" title="Security at Threadmap">
      <p>
        Protecting private workspace data is a core product requirement. Threadmap uses managed authentication, encrypted transport, account-scoped authorization rules, restricted server-only credentials, bounded file uploads, and abuse controls at application and hosting layers.
      </p>

      <section>
        <h2>Report a vulnerability</h2>
        <p>
          Email <a href={`mailto:${legalConfig.securityEmail}`}>{legalConfig.securityEmail}</a> with a concise description, affected URL or feature, reproduction steps, and potential impact. Please do not include real user data or secrets in the initial report.
        </p>
      </section>

      <section>
        <h2>Safe-harbor expectations</h2>
        <ul>
          <li>Test only accounts and data you own or have explicit permission to use.</li>
          <li>Do not use denial of service, social engineering, spam, destructive actions, persistence, or automated high-volume scanning.</li>
          <li>Stop and report immediately if you encounter another person’s data.</li>
          <li>Allow reasonable time for investigation and remediation before public disclosure.</li>
        </ul>
        <p>
          We will make a good-faith effort to acknowledge valid reports, investigate promptly, and keep reporters informed. This policy does not create a bug-bounty payment commitment.
        </p>
      </section>

      <section>
        <h2>Account safety</h2>
        <p>
          Use a unique password, protect access to your email account, review OAuth consent before approving integrations, and disconnect clients you no longer use. If you believe an account is compromised, reset its password, revoke connected clients, and contact us.
        </p>
      </section>
    </LegalPage>
  );
}
