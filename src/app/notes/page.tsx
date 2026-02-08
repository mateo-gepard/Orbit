'use client';

import { useMemo, useState, useRef } from 'react';
import { FileText, Plus, Check } from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { createItem } from '@/lib/firestore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { NoteSubtype } from '@/lib/types';

const FILTERS: { label: string; value: NoteSubtype | 'all' }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Ideas', value: 'idea' },
	{ label: 'Principles', value: 'principle' },
	{ label: 'Plans', value: 'plan' },
	{ label: 'Journal', value: 'journal' },
];

export default function NotesPage() {
	const { items, setSelectedItemId } = useOrbitStore();
	const { user } = useAuth();
	const [filter, setFilter] = useState<NoteSubtype | 'all'>('all');
	const [isCreating, setIsCreating] = useState(false);
	const [newNoteTitle, setNewNoteTitle] = useState('');
	const [newNoteContent, setNewNoteContent] = useState('');
	const titleInputRef = useRef<HTMLInputElement>(null);
	const contentInputRef = useRef<HTMLTextAreaElement>(null);

	const notes = useMemo(() => {
		const all = items.filter((i) => i.type === 'note' && i.status !== 'archived');
		if (filter === 'all') return all;
		return all.filter((i) => i.noteSubtype === filter || i.tags?.includes(filter));
	}, [items, filter]);

	// Smart list formatting
	const formatContent = (text: string): string => {
		const lines = text.split('\n');
		let formatted = '';
		let inList = false;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			
			// Check if line starts with bullet point or number
			if (line.match(/^[-•*]\s/) || line.match(/^\d+\.\s/)) {
				if (!inList) {
					formatted += '<ul>\n';
					inList = true;
				}
				formatted += `<li>${line.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '')}</li>\n`;
			} else {
				if (inList) {
					formatted += '</ul>\n';
					inList = false;
				}
				if (line) {
					formatted += `<p>${line}</p>\n`;
				} else {
					formatted += '<br>\n';
				}
			}
		}
		
		if (inList) {
			formatted += '</ul>\n';
		}
		
		return formatted.trim();
	};

	const handleCreateNote = async () => {
		if (!user || (!newNoteTitle.trim() && !newNoteContent.trim())) {
			setIsCreating(false);
			setNewNoteTitle('');
			setNewNoteContent('');
			return;
		}

		const formattedContent = formatContent(newNoteContent.trim());

		await createItem({
			type: 'note',
			status: 'active',
			title: newNoteTitle.trim() || 'Untitled',
			content: formattedContent,
			noteSubtype: filter === 'all' ? 'general' : filter,
			tags: filter !== 'all' ? [filter] : [],
			userId: user.uid,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		setIsCreating(false);
		setNewNoteTitle('');
		setNewNoteContent('');
	};

	const handleStartCreating = () => {
		setIsCreating(true);
		setTimeout(() => titleInputRef.current?.focus(), 0);
	};

	// Smart list auto-increment for numbered lists
	const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			setIsCreating(false);
			setNewNoteTitle('');
			setNewNoteContent('');
		} else if (e.key === 'Enter') {
			if (e.metaKey) {
				e.preventDefault();
				handleCreateNote();
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
			{/* Floating create card - EXACTLY like command bar */}
			{isCreating && (
				<div
					className="fixed inset-0 z-50 flex items-start bg-background/80 backdrop-blur-sm"
					onClick={(e) => {
						if (e.target === e.currentTarget) {
							setIsCreating(false);
							setNewNoteTitle('');
							setNewNoteContent('');
						}
					}}
				>
					<div 
						className={cn(
							'relative w-full',
							// Mobile: top-aligned card with safe area
							'pt-[max(env(safe-area-inset-top,0px),8px)] px-3',
							// Desktop: centered
							'lg:absolute lg:top-[18vh] lg:left-1/2 lg:-translate-x-1/2 lg:pt-0 lg:px-0',
							'lg:max-w-[520px]',
							'animate-slide-down-spring lg:animate-scale-in'
						)}
					>
						<div className={cn(
							'overflow-hidden bg-popover',
							'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)] lg:shadow-[0_16px_70px_-12px_rgba(0,0,0,0.25)]',
							'rounded-2xl lg:rounded-xl',
							'border border-border/60'
						)}>
							{/* Title Input */}
							<div className="flex items-center gap-3 px-4 py-3 lg:py-3">
								<FileText className="h-5 w-5 lg:h-4 lg:w-4 shrink-0 text-muted-foreground/50" />
								<input
									ref={titleInputRef}
									value={newNoteTitle}
									onChange={(e) => setNewNoteTitle(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Escape') {
											setIsCreating(false);
											setNewNoteTitle('');
											setNewNoteContent('');
										} else if (e.key === 'Enter') {
											e.preventDefault();
											contentInputRef.current?.focus();
										}
									}}
									placeholder="Note title..."
									className="flex-1 bg-transparent text-base lg:text-sm outline-none placeholder:text-muted-foreground/40"
									autoFocus
									autoComplete="off"
									autoCorrect="off"
									enterKeyHint="next"
								/>
								<button
									onClick={() => {
										setIsCreating(false);
										setNewNoteTitle('');
										setNewNoteContent('');
									}}
									className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground/50 hover:text-muted-foreground lg:hidden"
								>
									Cancel
								</button>
								<kbd className="hidden lg:inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/60">
									esc
								</kbd>
							</div>

							{/* Divider */}
							<div className="h-px bg-border" />

							{/* Content Input */}
							<div className="px-4 py-3 lg:py-3">
								<textarea
									ref={contentInputRef}
									value={newNoteContent}
									onChange={(e) => setNewNoteContent(e.target.value)}
									onKeyDown={handleContentKeyDown}
									placeholder="Take a note... (use - or • for bullets, 1. 2. 3. for numbered lists)"
									className="w-full bg-transparent text-[14px] lg:text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 resize-none min-h-[120px] max-h-[40vh] overflow-y-auto leading-relaxed"
									rows={6}
									enterKeyHint="done"
								/>
							</div>

							{/* Divider */}
							<div className="h-px bg-border" />

							{/* Footer */}
							<div className="flex items-center justify-between px-4 py-2.5 lg:py-2 bg-muted/30">
								<p className="text-[10px] lg:text-[9px] text-muted-foreground/50 font-medium">
									<kbd className="font-mono">⌘↵</kbd> save · <kbd className="font-mono">esc</kbd> cancel
								</p>
								<button
									onClick={handleCreateNote}
									className="rounded-lg px-3 py-1.5 text-[12px] lg:text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors active:scale-95"
								>
									Create
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-6xl mx-auto pb-safe">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">Notes</h1>
					<p className="text-[13px] text-muted-foreground/60 mt-0.5">
						{notes.length} {notes.length === 1 ? 'note' : 'notes'}
					</p>
				</div>
			</div>

			{/* Filter tabs — scrollable on mobile */}
			<div className="flex gap-0.5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 no-scrollbar">
				{FILTERS.map((f) => (
					<button
						key={f.value}
						onClick={() => setFilter(f.value)}
						className={cn(
							'rounded-xl lg:rounded-md px-3 lg:px-2.5 py-1.5 lg:py-1 text-[13px] lg:text-[12px] font-medium transition-colors shrink-0 active:scale-95',
							filter === f.value
								? 'bg-foreground text-background'
								: 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.04]'
						)}
					>
						{f.label}
					</button>
				))}
			</div>

			{/* Notes grid */}
			<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pb-4">
				{/* Quick add button */}
				{!isCreating && (
					<button
						onClick={handleStartCreating}
						className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/50 p-4 text-left transition-all hover:bg-card hover:border-border"
					>
						<Plus className="h-4 w-4 text-muted-foreground/40" />
						<span className="text-[12px] text-muted-foreground/60">Take a note...</span>
					</button>
				)}
				{notes.map((note) => (
					<button
						key={note.id}
						onClick={() => setSelectedItemId(note.id)}
						className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:bg-foreground/[0.02] hover:border-border group"
					>
						<div className="flex items-start justify-between gap-2">
							<h3 className="text-[13px] font-semibold line-clamp-2 group-hover:text-foreground transition-colors">
								{note.title}
							</h3>
							{note.noteSubtype && note.noteSubtype !== 'general' && (
								<span className="text-[10px] text-muted-foreground/40 capitalize shrink-0">
									{note.noteSubtype}
								</span>
							)}
						</div>
						{note.content && (
							<p className="text-[11px] text-muted-foreground/50 line-clamp-3 leading-relaxed">
								{note.content.replace(/<[^>]*>/g, '')}
							</p>
						)}
						<div className="flex items-center justify-between mt-auto pt-1">
							<span className="text-[10px] text-muted-foreground/30 tabular-nums">
								{format(new Date(note.updatedAt), 'dd MMM yy')}
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
					<h3 className="text-[15px] font-medium">No notes yet</h3>
					<p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs">
						Capture ideas, principles, plans, and reflections.
					</p>
				</div>
			)}
		</div>
		</>
	);
}
