'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ITEM_TYPE_CONFIG } from './link-graph-config';
import type { OrbitItem } from '@/lib/types';

interface OrbitNodeData {
  item: OrbitItem;
  isCurrent: boolean;
  depth?: number;
  [key: string]: unknown;
}

function OrbitNodeComponent({ data }: { data: OrbitNodeData }) {
  const { item, isCurrent, depth = 0 } = data;
  const config = ITEM_TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const isDone = item.status === 'done';
  const isDeep = depth >= 2;

  return (
    <div
      className={cn(
        'px-3 py-2.5 rounded-xl border-2 min-w-[160px] max-w-[220px] shadow-sm transition-all',
        'hover:shadow-md cursor-pointer',
        isCurrent
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-lg'
          : cn(config.bgColor, config.borderColor),
        isDone && !isCurrent && 'opacity-60',
        isDeep && !isCurrent && 'opacity-70 scale-[0.95]'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground/40 !border-background !w-2.5 !h-2.5 !-top-1.5"
      />

      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex items-center justify-center h-8 w-8 rounded-lg shrink-0',
            isCurrent ? 'bg-primary/20' : 'bg-background/60'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              isCurrent ? 'text-primary' : config.color
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-[12px] font-semibold truncate leading-tight',
              isDone && 'line-through'
            )}
          >
            {item.emoji && <span className="mr-1">{item.emoji}</span>}
            {item.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge
              variant="secondary"
              className={cn('text-[9px] px-1.5 py-0 h-3.5 capitalize font-medium', config.color)}
            >
              {item.type}
            </Badge>
            {isDone && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-3.5 text-green-600 border-green-200"
              >
                Done
              </Badge>
            )}
          </div>
        </div>
        {isCurrent && (
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground/40 !border-background !w-2.5 !h-2.5 !-bottom-1.5"
      />
    </div>
  );
}

export const OrbitNode = memo(OrbitNodeComponent);
