import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal/legal-page';
import { legalConfig } from '@/lib/legal-config';

export const metadata: Metadata = {
  title: 'Terms of Service | Threadmap',
  description: 'Terms governing use of the Threadmap service.',
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Service agreement" title="Terms of service">
      <p>
        These terms govern your use of Threadmap. By creating an account or using the hosted service, you agree to these terms and acknowledge the <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the service.
      </p>

      <section>
        <h2>1. The service</h2>
        <p>
          {legalConfig.operatorName} provides software for organizing personal tasks, notes, projects, habits, goals, events, files, and related integrations. Features may evolve, and beta or preview functionality may change or be withdrawn.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p>
          You must provide accurate account information, protect your sign-in credentials, and promptly tell us if you suspect unauthorized access. You are responsible for activity performed through your account unless caused by our failure to apply reasonable security controls.
        </p>
      </section>

      <section>
        <h2>3. Your content</h2>
        <p>
          You retain ownership of content you enter or upload. You grant us only the limited rights needed to host, process, back up, synchronize, and display that content to you and to connected services you authorize. You confirm that you have the right to upload and process the content you provide.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <ul>
          <li>Do not break the law, infringe rights, distribute malware, or store content you are not entitled to use.</li>
          <li>Do not probe, bypass, overload, scrape, or disrupt the service or another user’s account.</li>
          <li>Do not use automation or integrations to exceed documented limits or evade security controls.</li>
          <li>Do not resell access or impersonate another person without permission.</li>
        </ul>
      </section>

      <section>
        <h2>5. Third-party services</h2>
        <p>
          Optional services such as Google Workspace, Google Calendar synchronization, and MCP-compatible clients are governed by their providers. You control whether to connect them and what scopes to approve. We are not responsible for a third party’s independent service, content, or availability.
        </p>
      </section>

      <section>
        <h2>6. Availability and backups</h2>
        <p>
          We aim to provide a reliable service but do not promise uninterrupted or error-free operation. Keep exports or independent copies of information you cannot afford to lose. Planned maintenance, security events, provider outages, and force-majeure events may affect availability.
        </p>
      </section>

      <section>
        <h2>7. Suspension and termination</h2>
        <p>
          You may stop using Threadmap and delete your account at any time. We may restrict or suspend access when reasonably necessary to prevent harm, investigate abuse, comply with law, or address a serious breach of these terms. Where practical, we will provide notice and an opportunity to export data.
        </p>
      </section>

      <section>
        <h2>8. Disclaimers and liability</h2>
        <p>
          To the extent permitted by law, Threadmap is provided without implied warranties beyond those that cannot legally be excluded. We are not liable for indirect, incidental, or consequential loss. Nothing in these terms excludes liability that applicable law does not allow us to limit, including liability for fraud or intentional misconduct.
        </p>
      </section>

      <section>
        <h2>9. Changes and contact</h2>
        <p>
          We may update these terms as the service changes. Material changes will be communicated before they take effect where required. Questions may be sent to <a href={`mailto:${legalConfig.contactEmail}`}>{legalConfig.contactEmail}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
