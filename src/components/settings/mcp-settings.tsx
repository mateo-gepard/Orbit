'use client';

import { useState, type ReactNode } from 'react';
import { Check, Clipboard, Cloud, KeyRound, LockKeyhole, PlugZap, ShieldCheck, UserRound, Waypoints, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';

const MCP_ENDPOINT = 'https://threadmap.app/mcp';

const CAPABILITIES = [
  'Find and read your Threadmap items',
  'Create tasks, notes, projects, habits, goals, and events',
  'Update, complete, archive, tag, and connect items',
  'Use natural-language dates and Threadmap relationships',
];

const CLIENTS = [
  { name: 'ChatGPT', step: 'In Settings -> Apps, add a custom MCP app and use the endpoint below.' },
  { name: 'Claude', step: 'In Settings -> Connectors, choose Add custom connector and use the endpoint below.' },
  {
    name: 'Claude Code',
    step: 'Run the command below in a terminal, then complete authorization in your browser.',
    command: `claude mcp add --transport http threadmap ${MCP_ENDPOINT}`,
  },
];

function InfoCard({ children, icon: Icon, title }: { children: ReactNode; icon: typeof PlugZap; title: string }) {
  return (
    <section className="rounded-[22px] border border-border/70 bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function McpSettings() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[26px] border border-border/70 bg-foreground text-background">
        <div className="grid gap-8 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
          <div>
            <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-background/10">
              <Waypoints className="size-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-background/55">Threadmap MCP</p>
            <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Let your AI work with your map, securely.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-background/65">
              Connect an MCP-compatible client to the Threadmap account currently signed in during authorization. Every connection remains isolated to that user&apos;s data.
            </p>
          </div>
          <div className="flex items-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/10 px-3 py-1.5 text-xs font-medium text-background/80">
              <Cloud className="size-3.5" aria-hidden="true" /> Hosted endpoint
            </span>
          </div>
        </div>
      </div>

      <InfoCard icon={PlugZap} title="Connection endpoint">
        <p className="mb-3 text-sm leading-6 text-muted-foreground">Use this same URL in every supported client. Do not add a user ID, API key, or query parameter.</p>
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/70 bg-muted/35 p-2 pl-4">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm">{MCP_ENDPOINT}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => void copy(MCP_ENDPOINT, 'endpoint')} aria-label="Copy MCP endpoint">
            {copied === 'endpoint' ? <Check className="size-4" /> : <Clipboard className="size-4" />}
            <span className="ml-2 hidden sm:inline">{copied === 'endpoint' ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </InfoCard>

      <InfoCard icon={Wrench} title="Set up a client">
        <ol className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Add endpoint', 'Create a custom MCP connection in your AI client.'],
            ['2', 'Authorize', 'A Threadmap page opens. Sign in as the intended user and approve access.'],
            ['3', 'Confirm account', 'Return to the client and ask it to list a few Threadmap items.'],
          ].map(([number, title, description]) => (
            <li key={number} className="rounded-2xl border border-border/60 bg-muted/25 p-4">
              <span className="mb-4 flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">{number}</span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>

        <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
          {CLIENTS.map((client) => (
            <div key={client.name} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><PlugZap className="size-3.5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{client.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{client.step}</p>
                  {client.command ? (
                    <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-foreground p-2 pl-3 text-background">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs">{client.command}</code>
                      <button type="button" onClick={() => void copy(client.command!, 'command')} className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/10 text-background/70 hover:bg-background/15 hover:text-background" aria-label="Copy Claude Code command">
                        {copied === 'command' ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </InfoCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoCard icon={KeyRound} title="What the connection can do">
          <ul className="space-y-3">
            {CAPABILITIES.map((capability) => (
              <li key={capability} className="flex gap-3 text-sm leading-5"><Check className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden="true" /><span>{capability}</span></li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard icon={ShieldCheck} title="Account and privacy">
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p className="flex gap-3"><UserRound className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />Authorization binds the client to the Threadmap user signed in on that browser, not to the person who configured the server.</p>
            <p className="flex gap-3"><LockKeyhole className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />The client never receives your password. It receives a scoped token and cannot cross into another tenant.</p>
            <p className="flex gap-3"><ShieldCheck className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />Disconnect the integration from the AI client to stop future access. Reconnect while signed into the correct account if you chose the wrong user.</p>
          </div>
        </InfoCard>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/25 p-5">
        <p className="text-sm font-semibold">Troubleshooting an invalid or expired request</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Return to the AI client and start the connection again. Authorization links are single-use and expire; reopening an old browser tab will not work.</p>
      </div>
    </div>
  );
}
