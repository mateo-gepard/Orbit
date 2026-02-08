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

	return (
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

			{/* Floating create card - positioned like command bar */}
			{isCreating && (
				<div
					className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto p-4 lg:p-0 z-50 lg:z-auto"
					style={{
						paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
					}}
				>
					<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-lg lg:shadow-sm max-w-6xl mx-auto">
						<input
							ref={titleInputRef}
							value={newNoteTitle}
							onChange={(e) => setNewNoteTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Escape') {
									setIsCreating(false);
									setNewNoteTitle('');
									setNewNoteContent('');
								} else if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									contentInputRef.current?.focus();
								}
							}}
							placeholder="Title"
							className="bg-transparent text-[13px] font-semibold outline-none placeholder:text-muted-foreground/40"
							style={{ WebkitUserSelect: 'text' }}
						/>
						<textarea
							ref={contentInputRef}
							value={newNoteContent}
							onChange={(e) => setNewNoteContent(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Escape') {
									setIsCreating(false);
									setNewNoteTitle('');
									setNewNoteContent('');
								} else if (e.key === 'Enter' && e.metaKey) {
									e.preventDefault();
									handleCreateNote();
								}
							}}
							placeholder="Take a note... (use - or • for bullets, 1. 2. 3. for numbered lists)"
							className="bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40 resize-none min-h-[80px] max-h-[40vh] overflow-y-auto leading-relaxed"
							style={{ WebkitUserSelect: 'text' }}
							rows={4}
						/>
						<div className="flex items-center justify-between pt-1">
							<p className="text-[10px] text-muted-foreground/40">
								<kbd className="font-mono">⌘↵</kbd> to save · <kbd className="font-mono">Esc</kbd> to cancel
							</p>
							<div className="flex gap-2">
								<button
									onClick={() => {
										setIsCreating(false);
										setNewNoteTitle('');
										setNewNoteContent('');
									}}
									className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={handleCreateNote}
									className="rounded-lg px-3 py-1.5 text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
								>
									Create
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

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
	);
}
