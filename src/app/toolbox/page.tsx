'use client';

import { Wrench, Plus, Plane, Route, FileBarChart, GraduationCap, Gem, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToolboxStore, TOOLS, type ToolId } from '@/lib/toolbox-store';
import Link from 'next/link';
import { useSettingsStore } from '@/lib/settings-store';

const ICON_MAP: Record<string, typeof Plane> = {
  Plane,
  Route,
  FileBarChart,
  GraduationCap,
  Gem,
};

const COPY = {
  en: {
    title: 'Toolbox',
    description: 'Add tools to your workspace. Each tool works like a native tab with full access to your data.',
    active: 'Active', open: 'Open', add: 'Add tool', remove: 'Remove',
    enabledHint: 'Enabled tools appear in your sidebar and can use the Threadmap data relevant to their workflow.',
    addAria: 'Add {name}', removeAria: 'Remove {name}',
  },
  de: {
    title: 'Werkzeugkasten',
    description: 'Füge Werkzeuge zu deinem Workspace hinzu. Jedes Werkzeug funktioniert wie ein nativer Tab und kann auf deine Daten zugreifen.',
    active: 'Aktiv', open: 'Öffnen', add: 'Werkzeug hinzufügen', remove: 'Entfernen',
    enabledHint: 'Aktivierte Werkzeuge erscheinen in deiner Seitenleiste und können die für ihren Ablauf relevanten Threadmap-Daten nutzen.',
    addAria: '{name} hinzufügen', removeAria: '{name} entfernen',
  },
} as const;

const TOOL_COPY: Record<ToolId, { en: { name: string; tagline: string; description: string }; de: { name: string; tagline: string; description: string } }> = {
  flight: {
    en: { name: 'Cleared for Takeoff', tagline: 'Fly a deep-work session. Log it like a pro.', description: 'Turn focus sessions into flights with routes, boarding passes, and a logbook. Track deep work with precision — from boarding to debrief.' },
    de: { name: 'Startfreigabe', tagline: 'Starte eine Tiefenarbeits-Session. Dokumentiere sie professionell.', description: 'Mach aus Fokus-Sessions Flüge mit Routen, Bordkarten und Logbuch. Verfolge deine Tiefenarbeit präzise — vom Boarding bis zum Debrief.' },
  },
  dispatch: {
    en: { name: 'Dispatch', tagline: 'Turn tasks into a realistic route.', description: 'Build your day from tasks and calendar events. Generate a route, schedule focus flights, and re-route when plans change.' },
    de: { name: 'Einsatzplanung', tagline: 'Mach aus Aufgaben eine realistische Route.', description: 'Baue deinen Tag aus Aufgaben und Kalenderterminen. Erstelle eine Route, plane Fokusflüge und plane bei Änderungen neu.' },
  },
  briefing: {
    en: { name: 'Briefing', tagline: 'Day Brief or Week Brief. Clarity in minutes.', description: 'Start the day with priorities. End it with reflection. Weekly overviews keep the bigger picture sharp.' },
    de: { name: 'Briefing', tagline: 'Tages- oder Wochenbriefing. Klarheit in Minuten.', description: 'Starte den Tag mit Prioritäten. Beende ihn mit Reflexion. Wochenübersichten halten das große Ganze im Blick.' },
  },
  abitur: {
    en: { name: 'Abitur Tracker', tagline: 'Your path to Abitur, calculated in real time.', description: 'Full Bavarian G9 Abitur calculator. Track semester grades, exam scores, Block I/II points, deficit warnings, and your projected final grade — all in one place.' },
    de: { name: 'Abitur-Tracker', tagline: 'Dein Weg zum Abitur — in Echtzeit berechnet.', description: 'Vollständiger Rechner für das bayerische G9-Abitur. Behalte Halbjahresnoten, Prüfungen, Punkte in Block I/II, Defizitwarnungen und deine prognostizierte Endnote im Blick.' },
  },
  wishlist: {
    en: { name: 'The Vault', tagline: 'Curate your wants. Auction your priorities.', description: 'A private collection vault for wishes. Add pieces, run head-to-head auctions to rank them with Elo ratings, track acquisitions, and discover what you truly want most.' },
    de: { name: 'Das Archiv', tagline: 'Kuratiere deine Wünsche. Priorisiere sie im Duell.', description: 'Ein privates Archiv für Wünsche. Füge Stücke hinzu, priorisiere sie in direkten Duellen mit Elo-Wertungen, behalte Anschaffungen im Blick und entdecke, was du wirklich am meisten möchtest.' },
  },
};

export default function ToolboxPage() {
  const language = useSettingsStore((state) => state.settings.language);
  const copy = COPY[language];
  const enabledTools = useToolboxStore((state) => state.enabledTools);
  const enableTool = useToolboxStore((state) => state.enableTool);
  const disableTool = useToolboxStore((state) => state.disableTool);

  const handleToggle = (id: ToolId) => {
    if (enabledTools.includes(id)) {
      disableTool(id);
    } else {
      enableTool(id);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto" data-slot="page-content">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        </div>
        <p className="text-[13px] text-muted-foreground/60">
          {copy.description}
        </p>
      </div>

      {/* Tool Cards */}
      <div className="grid gap-4">
        {TOOLS.map((tool) => {
          const Icon = ICON_MAP[tool.icon] || Plane;
          const isEnabled = enabledTools.includes(tool.id);
          const toolCopy = TOOL_COPY[tool.id][language];

          return (
            <div
              key={tool.id}
              className={cn(
                'group relative rounded-2xl border p-5 transition-all duration-200',
                isEnabled
                  ? 'border-border/60 bg-card shadow-sm'
                  : 'border-border/30 bg-foreground/[0.01] hover:border-border/50 hover:bg-foreground/[0.02]'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={cn(
                    'flex items-center justify-center h-12 w-12 rounded-xl shrink-0 transition-colors',
                    isEnabled ? tool.bgColor : 'bg-foreground/[0.04]'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5.5 w-5.5 transition-colors',
                      isEnabled ? tool.color : 'text-muted-foreground/30'
                    )}
                    strokeWidth={1.5}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      className={cn(
                        'text-[15px] font-semibold',
                        isEnabled ? 'text-foreground' : 'text-foreground/70'
                      )}
                    >
                      {toolCopy.name}
                    </h2>
                    {isEnabled && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {copy.active}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground/60 mt-0.5 font-medium">
                      {toolCopy.tagline}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1.5 leading-relaxed">
                    {toolCopy.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {isEnabled && (
                    <Link href={tool.href} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {copy.open} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggle(tool.id)}
                    aria-pressed={isEnabled}
                    aria-label={(isEnabled ? copy.removeAria : copy.addAria).replace('{name}', toolCopy.name)}
                    className={cn(
                      'flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isEnabled
                        ? 'bg-foreground/[0.05] text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
                        : 'bg-foreground text-background hover:opacity-90'
                    )}
                  >
                    {isEnabled ? <><X className="h-3.5 w-3.5" /><span>{copy.remove}</span></> : <><Plus className="h-3.5 w-3.5" /><span>{copy.add}</span></>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground/30 text-center pt-4">
        {copy.enabledHint}
      </p>
    </div>
  );
}
