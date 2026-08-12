'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  FolderKanban,
  Repeat,
  CalendarDays,
  Target,
  FileText,
  Search,
  CornerDownLeft,
  Hash,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { parseCommand } from '@/lib/command-parser';
import { resolveMention } from '@/lib/mention-resolution';
import { searchItems } from '@/lib/item-search';
import { createItem, linkItems } from '@/lib/firestore';
import { hasCalendarPermission } from '@/lib/google-calendar';
import { flushPendingGoogleCalendarEvents } from '@/lib/google-calendar-sync';
import { LIFE_AREA_TAGS, type ItemType, type NoteSubtype, type OrbitItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { getAllowedParentTypes } from '@/lib/links';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useSettingsStore } from '@/lib/settings-store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const TYPE_ICONS: Record<ItemType, typeof CheckSquare> = {
  task: CheckSquare,
  project: FolderKanban,
  habit: Repeat,
  event: CalendarDays,
  goal: Target,
  note: FileText,
};

const COMMAND_SECTION_LABEL =
  'px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground/50';
const COMMAND_ROW =
  'mx-1.5 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] outline-none transition-colors lg:py-2 lg:text-[13px] focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-wait disabled:opacity-50';
const COMMAND_ROW_ACTIVE = 'bg-foreground/[0.055] shadow-[var(--shadow-hairline)]';
const COMMAND_ROW_IDLE = 'hover:bg-foreground/[0.035] active:bg-foreground/[0.055]';

/** The command bar shows a slice; the rest are reachable from a page. */
const MAX_COMMAND_RESULTS = 6;

/**
 * The capture language, spelled out where capture happens. It was previously
 * undocumented everywhere — Settings → Shortcuts lists only ⌘K/Esc/Enter/↑↓ —
 * which left the app's headline feature as its least discoverable surface.
 */
export const CAPTURE_SYNTAX = [
  { labelKey: 'commandBar.syntaxTypes', hintKey: 'commandBar.syntaxTypesHint' },
  { labelKey: 'commandBar.syntaxTag', hintKey: 'commandBar.syntaxTagHint' },
  { labelKey: 'commandBar.syntaxPriority', hintKey: 'commandBar.syntaxPriorityHint' },
  { labelKey: 'commandBar.syntaxLink', hintKey: 'commandBar.syntaxLinkHint' },
  { labelKey: 'commandBar.syntaxDate', hintKey: 'commandBar.syntaxDateHint' },
] as const satisfies readonly { labelKey: TranslationKey; hintKey: TranslationKey }[];

export function CommandBar() {
  const { user } = useAuth();
  const commandBarOpen = useOrbitStore((state) => state.commandBarOpen);
  const setCommandBarOpen = useOrbitStore((state) => state.setCommandBarOpen);
  const items = useOrbitStore((state) => state.items);
  const customTags = useOrbitStore((state) => state.customTags);
  const removedDefaultTags = useOrbitStore((state) => state.removedDefaultTags);
  const addCustomTag = useOrbitStore((state) => state.addCustomTag);
  const activeTag = useOrbitStore((state) => state.activeTag);
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const googleCalendarSyncEnabled = settings.calendar.googleCalendarSync;
  const language = settings.language;
  const [input, setInput] = useState('');
  // No hidden default selection: Enter follows the visible create action until
  // arrow-key navigation explicitly selects a suggestion or search result.
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [resolvedLink, setResolvedLink] = useState<OrbitItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitInFlightRef = useRef(false);

  const allTags = useMemo(() => {
    const removed = new Set(removedDefaultTags);
    return [
      ...(LIFE_AREA_TAGS as readonly string[]).filter((tag) => !removed.has(tag)),
      ...customTags,
    ];
  }, [customTags, removedDefaultTags]);

  // Autocomplete state
  // Tags (#)
  const lastHashIndex = input.lastIndexOf('#');
  const isTypingTag = lastHashIndex !== -1 &&
    (lastHashIndex === 0 || /\s/.test(input[lastHashIndex - 1])) &&
    (lastHashIndex === input.length - 1 || /^[\p{L}\p{M}\p{N}_-]*$/u.test(input.slice(lastHashIndex + 1)));
  const tagQuery = isTypingTag ? input.slice(lastHashIndex + 1).toLowerCase() : '';
  const suggestedTags = isTypingTag && (tagQuery || lastHashIndex === input.length - 1)
    ? allTags.filter(tag => tag.toLowerCase().startsWith(tagQuery)).slice(0, 5)
    : [];

  // Priorities (!)
  const lastExclamationIndex = input.lastIndexOf('!');
  const isTypingPriority = lastExclamationIndex !== -1 &&
    (lastExclamationIndex === 0 || /\s/.test(input[lastExclamationIndex - 1])) &&
    (lastExclamationIndex === input.length - 1 || /^[a-zA-Z]*$/.test(input.slice(lastExclamationIndex + 1)));
  const priorityQuery = isTypingPriority ? input.slice(lastExclamationIndex + 1).toLowerCase() : '';
  const priorities = ['high', 'medium', 'low'];
  const suggestedPriorities = isTypingPriority && (priorityQuery || lastExclamationIndex === input.length - 1)
    ? priorities.filter(p => p.toLowerCase().startsWith(priorityQuery))
    : [];

  // Linking (@) — check that everything after last @ is a valid query (no special command chars like # or !)
  const lastAtIndex = input.lastIndexOf('@');
  const afterAt = lastAtIndex !== -1 ? input.slice(lastAtIndex + 1) : '';
  const isTypingLink = lastAtIndex !== -1 &&
    (lastAtIndex === 0 || /\s/.test(input[lastAtIndex - 1])) &&
    (lastAtIndex === input.length - 1 || !/[#!]/.test(afterAt));
  const linkQuery = isTypingLink ? afterAt.toLowerCase().trim() : '';
  
  // Exclude only archived items to keep autocomplete clean
  const linkableItems = useMemo(() => items.filter(i => i.status !== 'archived'), [items]);

  // Titles the parser may consume whole after an `@`. Without them a mention
  // stops at the first space, which is what keeps it from eating the due date.
  const knownTitles = useMemo(
    () => linkableItems.map((item) => item.title).filter(Boolean),
    [linkableItems]
  );

  // Don't show suggestions if we already resolved a link (user selected from autocomplete)
  const suggestedLinks = isTypingLink && !resolvedLink && (linkQuery || lastAtIndex === input.length - 1)
    ? linkableItems.filter(item => 
        item.title.toLowerCase().includes(linkQuery)
      ).slice(0, 10)
    : [];

  // Determine which autocomplete to show
  const showingAutocomplete = suggestedTags.length > 0 || suggestedPriorities.length > 0 || suggestedLinks.length > 0;

  // ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandBarOpen(!commandBarOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandBarOpen, setCommandBarOpen]);

  useEffect(() => {
    if (commandBarOpen) {
      setInput('');
      setSelectedIndex(-1);
      setResolvedLink(null);
    }
  }, [commandBarOpen]);

  const parsed = useMemo(() => parseCommand(input, { knownTitles }), [input, knownTitles]);

  // One search definition for the whole app, so note bodies are reachable from
  // the global command bar — the one place a user would look for them — and
  // archived items no longer appear here unlabelled.
  const searchQuery = input.replace(/^\/\w+\s*/, '');
  const searchMatches = searchQuery.trim()
    ? searchItems(items, searchQuery, language)
    : [];
  const filteredItems = searchMatches.slice(0, MAX_COMMAND_RESULTS);
  const hiddenResultCount = Math.max(0, searchMatches.length - filteredItems.length);

  const submitCommand = async () => {
    if (!input.trim() || !user) return;

    const parsed = parseCommand(input, { knownTitles });
    const normalizedActiveTag = activeTag?.toLowerCase();
    const effectiveTags = normalizedActiveTag && !parsed.tags.includes(normalizedActiveTag)
      ? [...parsed.tags, normalizedActiveTag]
      : parsed.tags;

    // If only tags were typed (no actual title), don't create an item
    if (!parsed.title.trim() && effectiveTags.length > 0) {
      // Just auto-create the tags and close
      try {
        effectiveTags.forEach(tag => {
          if (!allTags.includes(tag)) {
            addCustomTag(tag);
          }
        });
      } catch {
        toast.error(language === 'de'
          ? 'Der Tag konnte nicht gespeichert werden. Gib Browserspeicher frei und versuche es erneut.'
          : 'The tag could not be saved. Free browser storage and try again.');
        return;
      }
      setInput('');
      setCommandBarOpen(false);
      return;
    }

    // If there's no title at all, say so instead of dismissing silently.
    if (!parsed.title.trim()) {
      toast.info(t('commandBar.nothingToCreate'));
      inputRef.current?.focus();
      return;
    }

    // Auto-create custom tags that don't exist yet
    let tagPersistenceFailed = false;
    effectiveTags.forEach(tag => {
      if (!allTags.includes(tag)) {
        try {
          addCustomTag(tag);
        } catch {
          tagPersistenceFailed = true;
        }
      }
    });

    // Find a related item by @title. Projects/goals become hierarchy parents when
    // valid; all other targets become peer links after creation. Because a match
    // can move the new item in the hierarchy, only a certain one is allowed to —
    // a guess becomes a peer link instead.
    let relationshipTarget: OrbitItem | undefined;
    let targetIsCertain = false;

    if (resolvedLink) {
      // Picked from the autocomplete list: the user named this item themselves.
      relationshipTarget = resolvedLink;
      targetIsCertain = true;
    } else if (parsed.linkedItemTitles && parsed.linkedItemTitles.length > 0) {
      const firstLinkTitle = parsed.linkedItemTitles[0];
      const match = resolveMention(firstLinkTitle, items);
      if (match) {
        relationshipTarget = match.item;
        targetIsCertain = match.confidence === 'exact';
      } else {
        toast.info(t('commandBar.mentionUnresolved', { title: firstLinkTitle }));
      }
    }

    let noteSubtype: NoteSubtype | undefined;
    if (parsed.type === 'note') {
      if (effectiveTags.includes('idea')) noteSubtype = 'idea';
      else if (effectiveTags.includes('principle')) noteSubtype = 'principle';
      else if (effectiveTags.includes('plan')) noteSubtype = 'plan';
      else if (effectiveTags.includes('journal')) noteSubtype = 'journal';
    }

    const parentItemId =
      relationshipTarget
        && targetIsCertain
        && getAllowedParentTypes(parsed.type).includes(relationshipTarget.type)
        ? relationshipTarget.id
        : undefined;

    const newItem: Omit<OrbitItem, 'id'> = {
      type: parsed.type,
      status: 'active',
      title: parsed.title, // Early returns ensure this is never empty
      tags: effectiveTags,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Only include optional fields if they have values
      ...(parsed.priority && { priority: parsed.priority }),
      ...(parsed.dueDate && { dueDate: parsed.dueDate }),
      ...(parsed.startDate && { startDate: parsed.startDate }),
      ...(noteSubtype && { noteSubtype }),
      ...(parentItemId && { parentId: parentItemId }),
    };
    
    // Auto-add defaults for events
    if (parsed.type === 'event') {
      const startDate = parsed.startDate || format(new Date(), 'yyyy-MM-dd');
      const endMinutes = Math.min(23 * 60 + 59, 9 * 60 + settings.calendar.defaultEventDuration);
      const defaultEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      Object.assign(newItem, {
        startDate,
        endDate: startDate, // Default: same day
        startTime: '09:00', // Default start time
        endTime: defaultEndTime,
        ...(googleCalendarSyncEnabled && { calendarSynced: false }),
      });
    }

    let itemId: string;
    try {
      itemId = await createItem(newItem);
    } catch {
      toast.error(language === 'de' ? 'Eintrag konnte nicht erstellt werden' : 'Failed to create item');
      return;
    }

    if (tagPersistenceFailed) {
      toast.warning(language === 'de'
        ? 'Der Eintrag wurde erstellt, aber der neue Tag konnte nicht in deiner Tag-Liste gespeichert werden.'
        : 'Item created, but the new tag could not be saved to your tag list.');
    }

    if (relationshipTarget && !parentItemId) {
      try {
        await linkItems(itemId, relationshipTarget.id);
      } catch {
        toast.warning(language === 'de'
          ? 'Der Eintrag wurde erstellt, aber seine Verknüpfung konnte nicht gespeichert werden. Öffne den Eintrag, um es erneut zu versuchen.'
          : 'Item created, but its link could not be saved. Open the item to retry.');
      }
    }

    // Automatic Calendar sync never starts OAuth implicitly. Consent belongs
    // to Settings; command creation remains a single, non-duplicating action.
    if (parsed.type === 'event' && googleCalendarSyncEnabled) {
      if (!hasCalendarPermission()) {
        toast.warning(language === 'de'
          ? 'Der Termin wurde lokal erstellt. Verbinde Google Kalender in den Einstellungen erneut und wähle dann „Erneut versuchen“.'
          : 'Event created locally. Reconnect Google Calendar in Settings, then use Retry.');
      } else {
        const fullItem = useOrbitStore.getState().items.find((candidate) => candidate.id === itemId)
          || ({ ...newItem, id: itemId } as OrbitItem);
        const result = await flushPendingGoogleCalendarEvents(user.uid, [fullItem]);
        if (!result.success) {
          toast.warning(language === 'de'
            ? 'Der Termin wurde lokal gespeichert, aber die Google-Kalender-Synchronisierung wurde nicht abgeschlossen.'
            : 'Event saved locally, but Google Calendar sync did not finish.');
        }
      }
    }

    setInput('');
    setResolvedLink(null);
    setCommandBarOpen(false);
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      await submitCommand();
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSelectItem = (itemId: string) => {
    useOrbitStore.getState().setSelectedItemId(itemId);
    setCommandBarOpen(false);
  };

  const handleSelectTag = (tag: string) => {
    const beforeHash = input.slice(0, lastHashIndex);
    setInput(`${beforeHash}#${tag} `);
    setSelectedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelectPriority = (priority: string) => {
    const beforeExclamation = input.slice(0, lastExclamationIndex);
    setInput(`${beforeExclamation}!${priority} `);
    setSelectedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelectLink = (item: OrbitItem) => {
    const atIndex = input.lastIndexOf('@');
    if (atIndex === -1) return;
    const beforeAt = input.slice(0, atIndex);
    const newInput = `${beforeAt}@${item.title} `;
    setInput(newInput);
    setResolvedLink(item);
    setSelectedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const TypeIcon = TYPE_ICONS[parsed.type] || CheckSquare;
  const isCreateMode = Boolean(
    input.startsWith('/')
      || parsed.tags.length > 0
      || parsed.priority
      || parsed.linkedItemTitles?.length
      || (input.trim() && filteredItems.length === 0),
  );
  // The parser owns mention handling now, so the title it returns is the title
  // that gets stored — no second cleanup pass that could disagree with it.
  const previewTitle = parsed.title;
  const normalizedPreviewTag = activeTag?.toLowerCase();
  const previewTags = normalizedPreviewTag && !parsed.tags.includes(normalizedPreviewTag)
    ? [...parsed.tags, normalizedPreviewTag]
    : parsed.tags;
  const activeOptionId = selectedIndex >= 0
    ? suggestedTags.length > 0
      ? `command-tag-${Math.min(selectedIndex, suggestedTags.length - 1)}`
      : suggestedPriorities.length > 0
        ? `command-priority-${Math.min(selectedIndex, suggestedPriorities.length - 1)}`
        : suggestedLinks.length > 0
          ? `command-link-${Math.min(selectedIndex, suggestedLinks.length - 1)}`
          : filteredItems.length > 0 && !input.startsWith('/')
            ? `command-result-${Math.min(selectedIndex, filteredItems.length - 1)}`
            : undefined
    : undefined;
  const hasListboxOptions = showingAutocomplete || (filteredItems.length > 0 && !input.startsWith('/'));

  return (
    <Dialog
      open={commandBarOpen}
      onOpenChange={(open) => {
        if (!open && submitting) return;
        setCommandBarOpen(open);
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        aria-busy={submitting}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className={cn(
          'top-[max(env(safe-area-inset-top,0px),8px)] z-[100] max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 border-0 bg-transparent p-0 shadow-none',
          'lg:top-[18vh] lg:max-w-[520px]'
        )}
      >
        <DialogTitle className="sr-only">
          {language === 'de' ? 'Suchen oder erstellen' : 'Search or create'}
        </DialogTitle>
        <div className="surface-float overflow-hidden rounded-2xl">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 lg:py-3">
            <Search className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              disabled={submitting}
              value={input}
              onChange={(e) => { setInput(e.target.value); setSelectedIndex(-1); setResolvedLink(null); }}
              onKeyDown={(e) => {
                if (submitting) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (selectedIndex < 0 && isCreateMode) {
                    void handleSubmit();
                  } else if (selectedIndex < 0 && filteredItems.length > 0) {
                    setSelectedIndex(0);
                  } else if (suggestedTags.length > 0) {
                    handleSelectTag(suggestedTags[Math.min(selectedIndex, suggestedTags.length - 1)]);
                  } else if (suggestedPriorities.length > 0) {
                    handleSelectPriority(suggestedPriorities[Math.min(selectedIndex, suggestedPriorities.length - 1)]);
                  } else if (suggestedLinks.length > 0) {
                    // Always select the link first (fill in title), user presses Enter again to submit
                    handleSelectLink(suggestedLinks[Math.min(selectedIndex, suggestedLinks.length - 1)]);
                  } else if (filteredItems.length > 0 && !input.startsWith('/')) {
                    handleSelectItem(filteredItems[selectedIndex]?.id || filteredItems[0].id);
                  } else {
                    handleSubmit();
                  }
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIndex = suggestedTags.length > 0 
                    ? suggestedTags.length - 1 
                    : suggestedPriorities.length > 0
                    ? suggestedPriorities.length - 1
                    : suggestedLinks.length > 0
                    ? suggestedLinks.length - 1
                    : filteredItems.length - 1;
                  if (maxIndex >= 0) setSelectedIndex((i) => Math.min(i + 1, maxIndex));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const maxIndex = suggestedTags.length > 0
                    ? suggestedTags.length - 1
                    : suggestedPriorities.length > 0
                    ? suggestedPriorities.length - 1
                    : suggestedLinks.length > 0
                    ? suggestedLinks.length - 1
                    : filteredItems.length - 1;
                  if (maxIndex >= 0) setSelectedIndex((i) => i < 0 ? maxIndex : Math.max(i - 1, 0));
                }
              }}
              placeholder={activeTag
                ? (language === 'de' ? `In #${activeTag} erstellen…` : `Create in #${activeTag}…`)
                : t('commandBar.placeholder')}
              role="combobox"
              aria-label={language === 'de' ? 'Suchen oder erstellen' : 'Search or create'}
              aria-autocomplete="list"
              aria-expanded={hasListboxOptions}
              aria-controls="command-options"
              aria-activedescendant={activeOptionId}
              inputMode="text"
              className="min-w-0 flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            {submitting && (
              <span aria-live="polite" className="text-[11px] font-medium text-muted-foreground/70">
                {language === 'de' ? 'Wird gespeichert …' : 'Saving…'}
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCommandBarOpen(false)}
                disabled={submitting}
                aria-label={language === 'de' ? 'Befehlspalette schließen' : 'Close command bar'}
                className="mobile-touch-target rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-muted-foreground lg:hidden"
              >
                {language === 'de' ? 'Abbrechen' : 'Cancel'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border/40" />

          {/* Results */}
          <div 
            id="command-options"
            role={hasListboxOptions ? 'listbox' : undefined}
            aria-label={hasListboxOptions ? (language === 'de' ? 'Vorschläge' : 'Suggestions') : undefined}
            data-command-scroll
            className={cn(
              'overflow-y-auto overscroll-contain py-2 lg:max-h-[300px]',
              submitting && 'pointer-events-none opacity-60',
            )}
            style={{
              maxHeight: 'min(56dvh, calc(var(--app-height) - max(var(--safe-top), 8px) - 88px))',
            }}
          >
            {/* Tag suggestions */}
            {suggestedTags.length > 0 && (
              <div role="group" aria-label={t('commandBar.tags')}>
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {t('commandBar.tags')}
                </div>
                {suggestedTags.map((tag, idx) => (
                  <button
                    key={tag}
                    id={`command-tag-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onClick={() => handleSelectTag(tag)}
                    className={cn(
                      COMMAND_ROW,
                      idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
                    )}
                  >
                    <span className="text-muted-foreground/50">#</span>
                    <span className="flex-1">{tag}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Priority suggestions */}
            {suggestedPriorities.length > 0 && !suggestedTags.length && (
              <div role="group" aria-label={t('commandBar.priority')}>
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {t('commandBar.priority')}
                </div>
                {suggestedPriorities.map((priority, idx) => (
                  <button
                    key={priority}
                    id={`command-priority-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onClick={() => handleSelectPriority(priority)}
                    className={cn(
                      COMMAND_ROW,
                      idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
                    )}
                  >
                    <span className="text-muted-foreground/50">!</span>
                    <span className="flex-1">{t(`priority.${priority as 'high' | 'medium' | 'low'}`)}</span>
                    <span className={cn(
                      'h-2 w-2 rounded-full',
                      priority === 'high' ? 'bg-red-500' : priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            {/* Link suggestions */}
            {suggestedLinks.length > 0 && !suggestedTags.length && !suggestedPriorities.length && (
              <div role="group" aria-label={t('commandBar.linkTo')}>
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {t('commandBar.linkTo')}
                </div>
                {suggestedLinks.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  const isProject = item.type === 'project';
                  const isDone = item.status === 'done';
                  
                  return (
                    <button
                      key={item.id}
                      id={`command-link-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={idx === selectedIndex}
                      onClick={() => handleSelectLink(item)}
                      className={cn(
                        COMMAND_ROW,
                        idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
                      )}
                    >
                      <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className={cn(
                        'flex-1 truncate',
                        isDone && 'line-through opacity-60'
                      )}>
                        {item.title}
                      </span>
                      <span className={cn(
                        'text-[10px] uppercase tracking-wider',
                        isProject ? 'text-blue-500/60' : 'text-muted-foreground/40'
                      )}>
                        {t(`type.${item.type}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search results */}
            {filteredItems.length > 0 && !input.startsWith('/') && !showingAutocomplete && (
              <div role="group" aria-label={t('commandBar.results')}>
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {t('commandBar.results')}
                </div>
                {filteredItems.map((item, idx) => {
                  const Icon = TYPE_ICONS[item.type];
                  return (
                    <button
                      key={item.id}
                      id={`command-result-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={idx === selectedIndex}
                      onClick={() => handleSelectItem(item.id)}
                      className={cn(
                        COMMAND_ROW,
                        idx === selectedIndex ? COMMAND_ROW_ACTIVE : COMMAND_ROW_IDLE
                      )}
                    >
                      <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">
                        {t(`type.${item.type}`)}
                      </span>
                    </button>
                  );
                })}
                {hiddenResultCount > 0 && (
                  <p className="px-4 py-1.5 text-[10px] text-muted-foreground/40">
                    {t('commandBar.moreResults', { count: hiddenResultCount })}
                  </p>
                )}
              </div>
            )}

            {/* Create preview for items with titles */}
            {input.trim() && isCreateMode && !suggestedTags.length && (previewTitle || resolvedLink) && (
              <div
                role="group"
                aria-label={language === 'de'
                  ? `${t(`type.${parsed.type}`)} erstellen`
                  : `Create new ${t(`type.${parsed.type}`).toLowerCase()}`}
              >
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {language === 'de'
                    ? `${t(`type.${parsed.type}`)} erstellen`
                    : `Create new ${t(`type.${parsed.type}`).toLowerCase()}`}
                </div>
                <button
                  id="command-create-item"
                  type="button"
                  role="option"
                  aria-selected="true"
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className={cn(COMMAND_ROW, 'py-3.5 lg:py-2.5', COMMAND_ROW_IDLE)}
                >
                  <TypeIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="line-clamp-2 break-words text-[14px] font-medium leading-5 lg:text-[13px]">{previewTitle || parsed.title}</div>
                    {(previewTags.length > 0 || parsed.priority || parsed.dueDate || resolvedLink) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {resolvedLink && (
                          <span className="text-[10px] text-blue-500/60">@{resolvedLink.title}</span>
                        )}
                        {previewTags.map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground/50">#{tag}</span>
                        ))}
                        {parsed.priority && (
                          <span className="text-[10px] text-muted-foreground/50">!{parsed.priority}</span>
                        )}
                        {parsed.dueDate && (
                          <span className="text-[10px] text-muted-foreground/50">{parsed.dueDate}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/30" />
                </button>
              </div>
            )}

            {/* Tag creation preview (when only tags, no title) */}
            {input.trim() && isCreateMode && !suggestedTags.length && !parsed.title.trim() && parsed.tags.length > 0 && (
              <div
                role="group"
                aria-label={parsed.tags.length === 1 ? t('commandBar.createTag') : t('commandBar.createTags')}
              >
                <div className={COMMAND_SECTION_LABEL} aria-hidden="true">
                  {parsed.tags.length === 1 ? t('commandBar.createTag') : t('commandBar.createTags')}
                </div>
                <button
                  id="command-create-tags"
                  type="button"
                  role="option"
                  aria-selected="true"
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className={cn(COMMAND_ROW, 'py-3.5 lg:py-2.5', COMMAND_ROW_IDLE)}
                >
                  <Hash className="h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {parsed.tags.map((tag) => (
                        <span key={tag} className="text-[13px] font-medium">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/30" />
                </button>
              </div>
            )}

            {/* Empty state — hints */}
            {!input.trim() && (
              <div className="space-y-3 px-4 py-3.5">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground/50">
                  {t('commandBar.commands')}
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
                  {Object.entries(TYPE_ICONS).map(([type, Icon]) => (
                    <button
                      type="button"
                      key={type}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input from losing focus
                      }}
                      onClick={() => {
                        setInput(`/${type} `);
                        // Keep input focused
                        requestAnimationFrame(() => {
                          inputRef.current?.focus();
                        });
                      }}
                      className="orbit-pressable flex flex-col items-center gap-1.5 rounded-xl border border-transparent bg-foreground/[0.025] px-2.5 py-3 text-[12px] text-muted-foreground outline-none hover:border-border/50 hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 lg:flex-row lg:gap-2 lg:py-1.5"
                    >
                      <Icon className="h-5 w-5 lg:h-3.5 lg:w-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                      <span className="text-[11px] lg:text-[12px]">{t(`type.${type as ItemType}`)}</span>
                    </button>
                  ))}
                </div>

                <div className="text-[10px] font-semibold uppercase text-muted-foreground/50">
                  {t('commandBar.syntax')}
                </div>
                <dl className="space-y-1.5">
                  {CAPTURE_SYNTAX.map(({ labelKey, hintKey }) => (
                    <div key={labelKey} className="flex items-baseline gap-2.5">
                      <dt className="w-16 shrink-0 text-[11px] text-muted-foreground/60">
                        {t(labelKey)}
                      </dt>
                      <dd className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                        {t(hintKey)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[10px] text-muted-foreground/50">
                  {t('commandBar.syntaxDateNote')}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
