'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/i18n';

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  submitLabel?: string;
  submitting?: boolean;
  error?: string | null;
  /** Resolve to `true` when the item was created, so the dialog can close. */
  onCreate: (title: string) => Promise<boolean>;
}

/**
 * Name-first creation for item types that used to write a real record the
 * moment you pressed "New".
 *
 * Habits and Goals opened the detail panel on a live "New habit" / "New goal"
 * item, so backing out left debris in the list, the sidebar badge and the
 * cloud. Projects and Notes already asked first; this is that pattern, shared.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  submitLabel,
  submitting = false,
  error,
  onCreate,
}: QuickCreateDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleared on the way out rather than on the way in, so the next open always
  // starts empty without a render-time state write.
  const close = () => {
    setValue('');
    onOpenChange(false);
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    const created = await onCreate(trimmed);
    if (created) close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-w-[420px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[12px]">{description}</DialogDescription>
        </DialogHeader>

        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          disabled={submitting}
          aria-label={title}
        />

        {error && (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !value.trim()}
            aria-busy={submitting}
          >
            {submitLabel ?? t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
