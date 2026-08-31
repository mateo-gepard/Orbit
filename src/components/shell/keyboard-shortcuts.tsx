'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrbitStore } from '@/lib/store';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Global keyboard shortcuts.
 *
 * `⌘K` was the only one in the app: no new-item binding, no help overlay, no
 * go-to-page chords, so keyboard users tabbed through everything. Thin for a
 * desktop tool that positions itself as a productivity OS.
 *
 * Go-to chords follow the `g` then letter convention, which keeps single
 * letters free and stays out of the way of typing.
 */

const CHORD_TIMEOUT_MS = 1200;

export interface ShortcutSpec {
  keys: string[];
  action: TranslationKey;
}

/** What the Settings → Shortcuts list documents. Kept beside the handler. */
export const GLOBAL_SHORTCUTS: ShortcutSpec[] = [
  { keys: ['MOD', 'K'], action: 'settings.commandBar' },
  { keys: ['N'], action: 'shortcuts.newItem' },
  { keys: ['?'], action: 'shortcuts.help' },
  { keys: ['Esc'], action: 'settings.closePanel' },
  { keys: ['Enter'], action: 'settings.submitConfirm' },
  { keys: ['↑', '↓'], action: 'settings.navigateList' },
  { keys: ['G', 'D'], action: 'shortcuts.goDashboard' },
  { keys: ['G', 'T'], action: 'shortcuts.goTasks' },
  { keys: ['G', 'P'], action: 'shortcuts.goProjects' },
  { keys: ['G', 'H'], action: 'shortcuts.goHabits' },
  { keys: ['G', 'G'], action: 'shortcuts.goGoals' },
  { keys: ['G', 'N'], action: 'shortcuts.goNotes' },
  { keys: ['G', 'C'], action: 'shortcuts.goCalendar' },
  { keys: ['G', 'A'], action: 'shortcuts.goArchive' },
  { keys: ['G', 'S'], action: 'shortcuts.goSettings' },
];

const GO_TO_ROUTES: Record<string, string> = {
  d: '/',
  t: '/tasks',
  p: '/projects',
  h: '/habits',
  g: '/goals',
  n: '/notes',
  c: '/calendar',
  a: '/archive',
  s: '/settings',
};

/** Typing in a field must never trigger a navigation chord. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const { t } = useTranslation();
  const commandBarOpen = useOrbitStore((state) => state.commandBarOpen);
  const setCommandBarOpen = useOrbitStore((state) => state.setCommandBarOpen);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let chordArmed = false;
    let chordTimer: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
      chordArmed = false;
      if (chordTimer) clearTimeout(chordTimer);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // This listener has to live in the always-mounted shortcut layer. The
      // command bar itself is mounted only while open, so keeping ⌘/Ctrl+K
      // inside that component made the shortcut incapable of opening it.
      if ((event.metaKey || event.ctrlKey)
          && !event.altKey
          && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandBarOpen(!commandBarOpen);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (chordArmed) {
        const route = GO_TO_ROUTES[key];
        disarm();
        if (route) {
          event.preventDefault();
          router.push(route);
        }
        return;
      }

      if (key === 'g') {
        chordArmed = true;
        chordTimer = setTimeout(disarm, CHORD_TIMEOUT_MS);
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        setCommandBarOpen(true);
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, [commandBarOpen, router, setCommandBarOpen]);

  const modifier = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '')
    ? '⌘'
    : 'Ctrl';

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t('shortcuts.title')}</DialogTitle>
          <DialogDescription className="text-[12px]">{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <dl className="max-h-[60vh] space-y-1 overflow-y-auto">
          {GLOBAL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-4 py-1">
              <dt className="text-[13px] text-foreground/80">{t(shortcut.action)}</dt>
              <dd className="flex shrink-0 gap-1">
                {shortcut.keys.map((key, index) => (
                  <kbd
                    key={index}
                    className="min-w-[24px] rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground/70"
                  >
                    {key === 'MOD' ? modifier : key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
