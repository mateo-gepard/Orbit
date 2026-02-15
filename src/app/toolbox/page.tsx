'use client';

import { Wrench, Plus, Check, Plane, Route, FileBarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToolboxStore, TOOLS, type ToolId } from '@/lib/toolbox-store';

const ICON_MAP: Record<string, typeof Plane> = {
  Plane,
  Route,
  FileBarChart,
};

export default function ToolboxPage() {
  const { enabledTools, enableTool, disableTool } = useToolboxStore();

  const handleToggle = (id: ToolId) => {
    if (enabledTools.includes(id)) {
      disableTool(id);
    } else {
      enableTool(id);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Toolbox</h1>
        </div>
        <p className="text-[13px] text-muted-foreground/60">
          Add tools to your workspace. Each tool works like a native tab with full access to your data.
        </p>
      </div>

      {/* Tool Cards */}
      <div className="grid gap-4">
        {TOOLS.map((tool) => {
          const Icon = ICON_MAP[tool.icon] || Plane;
          const isEnabled = enabledTools.includes(tool.id);

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
                      {tool.name}
                    </h2>
                    {isEnabled && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground/60 mt-0.5 font-medium">
                    {tool.tagline}
                  </p>
                  <p className="text-[12px] text-muted-foreground/40 mt-1.5 leading-relaxed">
                    {tool.description}
                  </p>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => handleToggle(tool.id)}
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium transition-all',
                    'active:scale-95',
                    isEnabled
                      ? 'bg-foreground/[0.05] text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
                      : 'bg-foreground text-background hover:opacity-90'
                  )}
                >
                  {isEnabled ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Added</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Tool</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground/30 text-center pt-4">
        Enabled tools appear in your sidebar. They have full access to your tasks, projects, habits, and notes.
      </p>
    </div>
  );
}
