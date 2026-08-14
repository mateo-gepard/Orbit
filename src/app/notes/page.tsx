'use client';

import { useMemo, useRef, useState } from 'react';
import { FileText, Plus, Search, X } from 'lucide-react';
import { useThreadmapStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { cn, getLocale } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { searchItems } from '@/lib/item-search';
import { format, isValid } from 'date-fns';
import type { NoteSubtype } from '@/lib/types';
import { NoteEditor } from '@/components/notes/note-editor';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { toast } from 'sonner';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const FILTERS: { labelKey: TranslationKey; value: NoteSubtype | 'all' }[] = [
	{ labelKey: 'notes.all', value: 'all' },
	{ labelKey: 'notes.ideas', value: 'idea' },
	{ labelKey: 'notes.principles', value: 'principle' },
	{ labelKey: 'notes.plans', value: 'plan' },
	{ labelKey: 'notes.journal', value: 'journal' },
];

/** The subtype picker in the create dialog — "general" is a real choice. */
const SUBTYPE_OPTIONS: { labelKey: TranslationKey; value: NoteSubtype }[] = [
	{ labelKey: 'notes.general', value: 'general' },
	{ labelKey: 'notes.ideas', value: 'idea' },
	{ labelKey: 'notes.principles', value: 'principle' },
	{ labelKey: 'notes.plans', value: 'plan' },
	{ labelKey: 'notes.journal', value: 'journal' },
];

export default function NotesPage() {
	const items = useThreadmapStore((state) => state.items);
	const { user } = useAuth();
		const { t, tp, lang } = useTranslation();
	const [filter, setFilter] = useState<NoteSubtype | 'all'>('all');
	const [newNoteSubtype, setNewNoteSubtype] = useState<NoteSubtype>('general');
	const [searchQuery, setSearchQuery] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [newNoteTitle, setNewNoteTitle] = useState('');
	const [newNoteContent, setNewNoteContent] = useState('');
	const [createError, setCreateError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
	const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);
	const contentInputRef = useRef<HTMLTextAreaElement>(null);
	const createInFlightRef = useRef(false);

	const notes = useMemo(() => {
		const all = items.filter((i) => i.type === 'note' && i.status !== 'archived');
		const categorized = filter === 'all'
			? all
			: all.filter((i) => i.noteSubtype === filter || i.tags?.includes(filter));
		// The shared definition — tags match here too now, as they do everywhere.
		return searchItems(categorized, searchQuery, lang);
		}, [items, filter, lang, searchQuery]);

	const editingNote = editingNoteId
		? items.find((item) => item.id === editingNoteId && item.type === 'note')
		: undefined;

	const clearNewNote = () => {
		setIsCreating(false);
		setNewNoteTitle('');
		setNewNoteContent('');
		setCreateError(null);
	};

	const requestDismissNewNote = () => {
		if (isSubmitting) return;
		if (newNoteTitle.trim() || newNoteContent.trim()) {
			setDiscardDialogOpen(true);
			return;
		}
		clearNewNote();
	};

	const discardNewNote = (): boolean => {
		clearNewNote();
		return true;
	};

	const handleCreateNote = async () => {
		if (createInFlightRef.current) return;
		if (!newNoteTitle.trim() && !newNoteContent.trim()) {
			clearNewNote();
			return;
		}
		if (!user) {
				setCreateError(t('notes.signInRequired'));
			return;
		}

		createInFlightRef.current = true;
		setIsSubmitting(true);
		setCreateError(null);
		try {
			await createItem({
				type: 'note',
				status: 'active',
					title: newNoteTitle.trim() || t('notes.untitled'),
				content: newNoteContent.trim(),
				noteSubtype: newNoteSubtype,
				tags: newNoteSubtype === 'general' ? [] : [newNoteSubtype],
				userId: user.uid,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			clearNewNote();
		} catch {
				setCreateError(t('notes.createError'));
				toast.error(t('notes.createToastError'));
		} finally {
			createInFlightRef.current = false;
			setIsSubmitting(false);
		}
	};

	const handleStartCreating = () => {
		setCreateError(null);
		// The open filter is a sensible starting point, but it is now a default
		// the user can see and change, not a silent decision.
		setNewNoteSubtype(filter === 'all' ? 'general' : filter);
		setIsCreating(true);
	};

	// Smart list auto-increment for numbered lists
	const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter') {
			if (e.metaKey || e.ctrlKey) {
				e.preventDefault();
				void handleCreateNote();
				return;
			}

			// Smart list continuation
			const textarea = e.currentTarget;
			const cursorPos = textarea.selectionStart;
			const textBeforeCursor = newNoteContent.substring(0, cursorPos);
			const lines = textBeforeCursor.split('\n');
			const currentLine = lines[lines.length - 1];

			// Check for numbered list (e.g., "1. ", "2. ", etc.)
			const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
			if (numberedMatch) {
				e.preventDefault();
				const indent = numberedMatch[1];
				const currentNumber = parseInt(numberedMatch[2]);
				const nextNumber = currentNumber + 1;
				const insertion = `\n${indent}${nextNumber}. `;
				
				const textAfterCursor = newNoteContent.substring(cursorPos);
				const newText = textBeforeCursor + insertion + textAfterCursor;
				setNewNoteContent(newText);
				
				// Set cursor position after the inserted text
				setTimeout(() => {
					textarea.selectionStart = textarea.selectionEnd = cursorPos + insertion.length;
				}, 0);
				return;
			}

			// Check for bullet points (-, •, *)
			const bulletMatch = currentLine.match(/^(\s*)([-•*])\s/);
			if (bulletMatch) {
				e.preventDefault();
				const indent = bulletMatch[1];
				const bullet = bulletMatch[2];
				const insertion = `\n${indent}${bullet} `;
				
				const textAfterCursor = newNoteContent.substring(cursorPos);
				const newText = textBeforeCursor + insertion + textAfterCursor;
				setNewNoteContent(newText);
				
				// Set cursor position after the inserted text
				setTimeout(() => {
					textarea.selectionStart = textarea.selectionEnd = cursorPos + insertion.length;
				}, 0);
				return;
			}
		}
	};

	return (
		<>
			<Dialog open={isCreating} onOpenChange={(open) => !open && requestDismissNewNote()}>
				<DialogContent
					showCloseButton={false}
					className="fixed left-1/2 top-[max(env(safe-area-inset-top,0px),8px)] w-[calc(100%-1.5rem)] max-w-[520px] translate-x-[-50%] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/60 bg-popover p-0 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] lg:top-[18vh] lg:rounded-xl lg:shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]"
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						titleInputRef.current?.focus();
					}}
				>
					<DialogHeader className="sr-only">
							<DialogTitle>{t('notes.createTitle')}</DialogTitle>
							<DialogDescription>
								{t('notes.createDescription')}
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-center gap-3 px-4 py-3">
						<FileText className="h-5 w-5 shrink-0 text-muted-foreground/50 lg:h-4 lg:w-4" />
						<input
								aria-label={t('notes.titleLabel')}
							ref={titleInputRef}
							value={newNoteTitle}
							onChange={(event) => {
								setNewNoteTitle(event.target.value);
								setCreateError(null);
							}}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									contentInputRef.current?.focus();
								}
							}}
								placeholder={t('notes.titlePlaceholder')}
							disabled={isSubmitting}
							className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/40 disabled:cursor-wait lg:text-sm"
							autoComplete="off"
							autoCorrect="off"
							enterKeyHint="next"
						/>
						<button
							type="button"
							onClick={requestDismissNewNote}
							disabled={isSubmitting}
							className="min-h-11 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/60 hover:text-muted-foreground disabled:cursor-wait disabled:opacity-50"
						>
								{t('common.cancel')}
						</button>
					</div>

					<div className="h-px bg-border" />

					<div className="px-4 py-3">
						<textarea
								aria-label={t('notes.contentLabel')}
							ref={contentInputRef}
							value={newNoteContent}
							onChange={(event) => {
								setNewNoteContent(event.target.value);
								setCreateError(null);
							}}
							onKeyDown={handleContentKeyDown}
								placeholder={t('notes.contentPlaceholder')}
							disabled={isSubmitting}
							className="max-h-[40vh] min-h-[120px] w-full resize-none overflow-y-auto bg-transparent text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 disabled:cursor-wait lg:text-[13px]"
							rows={6}
							enterKeyHint="done"
						/>
					</div>

					{createError && (
						<div role="alert" className="border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
							{createError}
						</div>
					)}

					<div className="h-px bg-border" />

					<div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-4 py-2.5">
						<div className="flex items-center gap-1" role="group" aria-label={t('notes.subtypeLabel')}>
							{SUBTYPE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setNewNoteSubtype(option.value)}
									aria-pressed={newNoteSubtype === option.value}
									disabled={isSubmitting}
									className={cn(
										'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
										newNoteSubtype === option.value
											? 'bg-foreground text-background'
											: 'text-muted-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground'
									)}
								>
									{t(option.labelKey)}
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={() => void handleCreateNote()}
							disabled={isSubmitting}
							className="orbit-pressable min-h-10 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:cursor-wait disabled:opacity-60 lg:text-[11px]"
						>
								{isSubmitting ? t('notes.creating') : t('common.create')}
						</button>
					</div>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={discardDialogOpen}
				onOpenChange={setDiscardDialogOpen}
					title={t('notes.discardTitle')}
					description={t('notes.discardDescription')}
					confirmLabel={t('notes.discardAction')}
				onConfirm={discardNewNote}
			/>

		<div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-6xl mx-auto pb-safe" data-slot="page-content">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">{t('nav.notes')}</h1>
					<p className="text-[13px] text-muted-foreground/60 mt-0.5">
							{tp('notes.count.one', 'notes.count.other', notes.length)}
					</p>
				</div>
			</div>

			{/* Filter tabs — scrollable on mobile */}
			<SegmentedControl
				variant="pill"
				label={t('notes.filterLabel')}
				value={filter}
				onChange={setFilter}
				options={FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
				className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
			/>

			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/45" />
					<label htmlFor="note-search" className="sr-only">{t('notes.searchLabel')}</label>
				<input
					id="note-search"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
						placeholder={t('notes.searchPlaceholder')}
					className="w-full rounded-xl border border-border/60 bg-card py-2.5 pl-9 pr-10 text-[14px] outline-none placeholder:text-muted-foreground/35 focus-visible:ring-2 focus-visible:ring-ring/25"
				/>
					{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label={t('notes.clearSearch')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground"><X className="h-4 w-4" /></button>}
			</div>

			{/* Notes grid */}
			<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pb-4">
				{/* Quick add button */}
				<button
					type="button"
					onClick={handleStartCreating}
					className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/50 p-4 text-left transition-all hover:bg-card hover:border-border"
				>
					<Plus className="h-4 w-4 text-muted-foreground/40" />
						<span className="text-[12px] text-muted-foreground/60">{t('notes.takeANote')}</span>
				</button>
				{notes.map((note) => (
					<button
						key={note.id}
						onClick={() => setEditingNoteId(note.id)}
						className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:bg-foreground/[0.02] hover:border-border group"
					>
						<div className="flex items-start justify-between gap-2">
							<h3 className="text-[13px] font-semibold line-clamp-2 group-hover:text-foreground transition-colors">
								{note.title}
							</h3>
							{note.noteSubtype && note.noteSubtype !== 'general' && (
								<span className="text-[10px] text-muted-foreground/40 capitalize shrink-0">
									{t(`noteSubtype.${note.noteSubtype}`)}
								</span>
							)}
						</div>
						{note.content && (
							<p className="text-[11px] text-muted-foreground/50 line-clamp-3 leading-relaxed whitespace-pre-wrap">
								{note.content}
							</p>
						)}
						<div className="flex items-center justify-between mt-auto pt-1">
							<span className="text-[10px] text-muted-foreground/30 tabular-nums">
									{isValid(new Date(note.updatedAt))
										? format(new Date(note.updatedAt), 'dd MMM yy', { locale: getLocale(lang) })
										: t('common.dateUnavailable')}
							</span>
							{note.tags && note.tags.length > 0 && (
								<span className="text-[10px] text-muted-foreground/30">
									{note.tags[0]}
								</span>
							)}
						</div>
					</button>
				))}
			</div>

			{notes.length === 0 && (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04]">
						<FileText className="h-5 w-5 text-muted-foreground/30" />
					</div>
						<h2 className="text-[15px] font-medium">{searchQuery ? t('notes.noMatch') : t('notes.noNotes')}</h2>
					<p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
						{t('notes.noNotesDesc')}
					</p>
				</div>
			)}
		</div>

		{/* Note Editor */}
		{editingNote && (
			<NoteEditor key={editingNote.id} note={editingNote} onClose={() => setEditingNoteId(null)} />
		)}
		</>
	);
}
