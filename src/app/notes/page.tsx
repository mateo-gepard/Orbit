'use client';

import { useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
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

	const notes = useMemo(() => {
		const all = items.filter((i) => i.type === 'note' && i.status !== 'archived');
		if (filter === 'all') return all;
		return all.filter((i) => i.noteSubtype === filter || i.tags?.includes(filter));
	}, [items, filter]);

	const handleNewNote = async () => {
		if (!user) return;
		const id = await createItem({
			type: 'note',
			status: 'active',
			title: 'New Note',
			noteSubtype: filter === 'all' ? 'general' : filter,
			tags: filter !== 'all' ? [filter] : [],
			userId: user.uid,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		setSelectedItemId(id);
	};

	return (
		<div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-4xl mx-auto">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">Notes</h1>
					<p className="text-[13px] text-muted-foreground/60 mt-0.5">
						{notes.length} {notes.length === 1 ? 'note' : 'notes'}
					</p>
				</div>
				<button
					onClick={handleNewNote}
					className="flex items-center gap-1.5 rounded-xl lg:rounded-lg bg-foreground px-3.5 py-2 lg:py-1.5 text-[13px] lg:text-[12px] font-medium text-background transition-opacity hover:opacity-90 active:scale-95 transition-transform"
				>
					<Plus className="h-3.5 w-3.5" />
					New
				</button>
			</div>

			{/* Filter tabs — scrollable on mobile */}
			<div className="flex gap-0.5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0" style={{ scrollbarWidth: 'none' }}>
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
			<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
