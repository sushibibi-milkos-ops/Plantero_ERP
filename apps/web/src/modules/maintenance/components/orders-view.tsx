'use client';

import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrdersTable } from './orders-table';
import { OrdersBoard } from './orders-board';
import type { MaintenanceOrderRow } from '../queries';

export function OrdersView({ orders }: { orders: MaintenanceOrderRow[] }) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  return (
    <div className="space-y-3">
      <div className="hidden justify-end md:flex">
        <div className="flex items-center gap-1 rounded-md border border-border/70 p-0.5">
          <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('kanban')} aria-label="Kanban görünümü"><LayoutGrid className="size-3.5" /></Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setView('list')} aria-label="Liste görünümü"><List className="size-3.5" /></Button>
        </div>
      </div>
      {/* 390px'te kanban sütunları kullanılamaz — mobilde her zaman liste zorlanır (sales kanban-board.tsx ile aynı desen). */}
      <div className="md:hidden">
        <OrdersTable orders={orders} />
      </div>
      <div className="hidden md:block">{view === 'kanban' ? <OrdersBoard orders={orders} /> : <OrdersTable orders={orders} />}</div>
    </div>
  );
}
