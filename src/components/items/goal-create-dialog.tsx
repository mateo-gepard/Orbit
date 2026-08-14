'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Flag, Gauge, Mountain, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type GoalTimeframe = 'quarterly' | 'yearly' | 'longterm';

interface GoalCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error?: string | null;
  onCreate: (title: string, timeframe: GoalTimeframe, metric?: string) => boolean | void | Promise<boolean | void>;
}

const TIMEFRAMES: Array<{
  value: GoalTimeframe;
  title: string;
  description: string;
  icon: typeof Gauge;
}> = [
  { value: 'quarterly', title: 'This quarter', description: 'A focused outcome for the next 12 weeks.', icon: Gauge },
  { value: 'yearly', title: 'This year', description: 'A meaningful result that needs sustained work.', icon: Flag },
  { value: 'longterm', title: 'Long term', description: 'A direction without a fixed annual deadline.', icon: Mountain },
];

export function GoalCreateDialog({ error, open, onOpenChange, onCreate }: GoalCreateDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('');
  const [timeframe, setTimeframe] = useState<GoalTimeframe>('quarterly');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTitle('');
      setMetric('');
      setTimeframe('quarterly');
      setIsCreating(false);
    }
  }, [open]);

  async function handleCreate() {
    const cleanTitle = title.trim();
    if (!cleanTitle || isCreating) return;

    setIsCreating(true);
    try {
      const created = await onCreate(cleanTitle, timeframe, metric.trim() || undefined);
      if (created !== false) onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[540px]">
        <div className="border-b border-border/60 bg-muted/25 px-6 py-5">
          <div className="mb-4 flex items-center gap-2" role="group" aria-label={`Step ${step} of 2`}>
            {[1, 2].map((value) => (
              <span key={value} className={cn('h-1 flex-1 rounded-full', value <= step ? 'bg-foreground' : 'bg-border')} />
            ))}
          </div>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl tracking-[-0.02em]">
              <Target className="size-5" aria-hidden="true" />
              {step === 1 ? 'What do you want to achieve?' : 'Give the goal a shape'}
            </DialogTitle>
            <DialogDescription className="leading-5">
              {step === 1
                ? 'Start with the outcome, not the list of tasks needed to reach it.'
                : 'Choose a horizon and add a simple measure of success.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6">
          {error ? (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/[0.05] px-3 py-2.5 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {step === 1 ? (
            <div className="space-y-2">
              <label htmlFor="goal-title" className="text-sm font-medium">Goal</label>
              <Input
                id="goal-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && title.trim()) {
                    event.preventDefault();
                    setStep(2);
                  }
                }}
                placeholder="e.g. Launch the first customer-ready version"
                className="h-12 text-base"
              />
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Time horizon</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TIMEFRAMES.map((option) => {
                    const Icon = option.icon;
                    const selected = timeframe === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTimeframe(option.value)}
                        className={cn(
                          'relative rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected
                            ? 'border-foreground bg-foreground/[0.055]'
                            : 'border-border/70 bg-background hover:border-foreground/30 hover:bg-muted/35',
                        )}
                        aria-pressed={selected}
                      >
                        <Icon className="mb-3 size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="block text-sm font-semibold">{option.title}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                        {selected ? (
                          <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                            <Check className="size-3" aria-hidden="true" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-2">
                <label htmlFor="goal-metric" className="text-sm font-medium">
                  How will you know it is done? <span className="font-normal text-muted-foreground">Optional</span>
                </label>
                <Input
                  id="goal-metric"
                  value={metric}
                  onChange={(event) => setMetric(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleCreate();
                    }
                  }}
                  placeholder="e.g. 10 active customers or €5k monthly revenue"
                  className="h-12"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4 sm:justify-between">
          {step === 2 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
              Back
            </Button>
          ) : <span />}
          {step === 1 ? (
            <Button type="button" disabled={!title.trim()} onClick={() => setStep(2)}>
              Continue
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" disabled={isCreating} onClick={() => void handleCreate()}>
              {isCreating ? 'Creating...' : 'Create goal'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
