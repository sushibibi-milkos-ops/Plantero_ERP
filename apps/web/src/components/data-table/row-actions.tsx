'use client';

import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RowAction } from './types';

/** Satır sonu "…" menüsü. Tıklama satır tıklamasını tetiklemez. */
export function DataTableRowActions<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground data-[state=open]:bg-muted"
          aria-label="Satır eylemleri"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" onClick={(e) => e.stopPropagation()}>
        {actions.map((a, i) => {
          const item = a.href ? (
            <DropdownMenuItem key={i} asChild disabled={a.disabled} variant={a.destructive ? 'destructive' : 'default'}>
              <Link href={a.href}>
                {a.icon ? <a.icon className="size-4" /> : null}
                {a.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={i}
              disabled={a.disabled}
              variant={a.destructive ? 'destructive' : 'default'}
              onSelect={() => a.onSelect?.(row)}
            >
              {a.icon ? <a.icon className="size-4" /> : null}
              {a.label}
            </DropdownMenuItem>
          );
          return a.separatorBefore ? (
            <div key={`sep-${i}`}>
              <DropdownMenuSeparator />
              {item}
            </div>
          ) : (
            item
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
