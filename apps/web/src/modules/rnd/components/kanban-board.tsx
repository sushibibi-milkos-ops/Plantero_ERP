'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '@/components/empty-state';
import { BoardColumn } from './board-column';
import { BoardCard } from './board-card';
import { NewColumnInline } from './new-column-inline';
import { NewCardDialog } from './new-card-dialog';
import { CardDrawer } from './card-drawer';
import { moveCardAction, reorderColumnsAction } from '../actions';
import type { BoardCardRow, BoardColumnRow } from '../queries';

type ColumnCards = Record<string, string[]>;

function buildColumnCards(columns: BoardColumnRow[], cards: BoardCardRow[]): ColumnCards {
  const map: ColumnCards = {};
  for (const c of columns) map[c.id] = [];
  for (const card of [...cards].sort((a, b) => a.position - b.position)) {
    (map[card.columnId] ??= []).push(card.id);
  }
  return map;
}

export function KanbanBoard({
  projectId, columns, cards, userOptions, recipeVersionOptions,
}: {
  projectId: string;
  columns: BoardColumnRow[];
  cards: BoardCardRow[];
  userOptions: Array<{ id: string; fullName: string }>;
  recipeVersionOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [columnOrder, setColumnOrder] = useState(columns.map((c) => c.id));
  const [columnCards, setColumnCards] = useState<ColumnCards>(() => buildColumnCards(columns, cards));
  const columnsById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const dragOriginRef = useRef<ColumnCards | null>(null);

  useEffect(() => {
    setColumnOrder(columns.map((c) => c.id));
    setColumnCards(buildColumnCards(columns, cards));
  }, [columns, cards]);

  // Klavye: N → yeni kart (yalnızca form alanı odaklı değilken — dokümandaki "N yeni kart" kısayolu).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      setNewCardColumnId(null);
      setNewCardOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findColumnOfCard(cardId: string): string | undefined {
    return Object.entries(columnCards).find(([, ids]) => ids.includes(cardId))?.[0];
  }

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type as 'card' | 'column' | undefined;
    setActiveType(type ?? null);
    setActiveId(String(event.active.id));
    dragOriginRef.current = columnCards;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== 'card') return;
    const activeId2 = String(active.id);
    const overId = String(over.id);
    if (activeId2 === overId) return;

    const activeColumnId = findColumnOfCard(activeId2);
    const overIsColumn = over.data.current?.type === 'column';
    const overColumnId = overIsColumn ? overId : findColumnOfCard(overId);
    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) return;

    setColumnCards((prev) => {
      const from = prev[activeColumnId] ?? [];
      const to = prev[overColumnId] ?? [];
      const overIndex = overIsColumn ? to.length : to.indexOf(overId);
      const insertAt = overIndex === -1 ? to.length : overIndex;
      return {
        ...prev,
        [activeColumnId]: from.filter((id) => id !== activeId2),
        [overColumnId]: [...to.slice(0, insertAt), activeId2, ...to.slice(insertAt)],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);
    if (!over) {
      if (dragOriginRef.current) setColumnCards(dragOriginRef.current);
      return;
    }

    if (active.data.current?.type === 'column') {
      const oldIndex = columnOrder.indexOf(String(active.id));
      const newIndex = columnOrder.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const next = arrayMove(columnOrder, oldIndex, newIndex);
      setColumnOrder(next);
      reorderColumnsAction({ projectId, orderedColumnIds: next }).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          setColumnOrder(columns.map((c) => c.id));
        } else {
          router.refresh();
        }
      });
      return;
    }

    // Kart: aynı kolon içi sıralama — handleDragOver yalnızca farklı kolona geçişi işledi.
    const activeId2 = String(active.id);
    const overId = String(over.id);
    const columnId = findColumnOfCard(activeId2);
    if (!columnId) return;
    const overIsColumn = over.data.current?.type === 'column';
    const list = columnCards[columnId] ?? [];

    let finalList = list;
    if (!overIsColumn && activeId2 !== overId) {
      const oldIndex = list.indexOf(activeId2);
      const newIndex = list.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalList = arrayMove(list, oldIndex, newIndex);
        setColumnCards((prev) => ({ ...prev, [columnId]: finalList }));
      }
    }

    const toIndex = finalList.indexOf(activeId2);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;

    moveCardAction({ cardId: activeId2, projectId, toColumnId: columnId, toIndex }).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
        if (origin) setColumnCards(origin);
      } else {
        router.refresh();
      }
    });
  }

  const orderedColumns = columnOrder.map((id) => columnsById.get(id)).filter((c): c is BoardColumnRow => Boolean(c));
  const activeCard = activeType === 'card' && activeId ? cardsById.get(activeId) : null;
  const activeColumn = activeType === 'column' && activeId ? columnsById.get(activeId) : null;

  if (columns.length === 0) {
    return <EmptyState title="Kolon yok" description="Ar-Ge board seed'i çalıştırılmalı ya da bir kolon ekleyin." action={<NewColumnInline projectId={projectId} />} />;
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
          <div className="scrollbar-thin scroll-fade-x flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2">
            <AnimatePresence initial={false}>
              {orderedColumns.map((col) => (
                <motion.div key={col.id} layout="position" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}>
                  <BoardColumn
                    column={col}
                    projectId={projectId}
                    cards={(columnCards[col.id] ?? []).map((id) => cardsById.get(id)).filter((c): c is BoardCardRow => Boolean(c))}
                    onOpenCard={setOpenCardId}
                    onAddCard={(columnId) => { setNewCardColumnId(columnId); setNewCardOpen(true); }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            <NewColumnInline projectId={projectId} />
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
          {activeCard ? (
            <motion.div initial={{ scale: 1 }} animate={{ scale: 1.04 }} transition={{ type: 'spring', stiffness: 380, damping: 24 }} className="w-64">
              <BoardCard card={activeCard} onOpen={() => {}} dragging />
            </motion.div>
          ) : activeColumn ? (
            <motion.div initial={{ scale: 1 }} animate={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 380, damping: 24 }} className="w-72 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-lg">
              {activeColumn.name}
            </motion.div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CardDrawer cardId={openCardId} projectId={projectId} onClose={() => setOpenCardId(null)} userOptions={userOptions} recipeVersionOptions={recipeVersionOptions} />
      <NewCardDialog projectId={projectId} columns={orderedColumns} open={newCardOpen} onOpenChange={setNewCardOpen} defaultColumnId={newCardColumnId} />
    </>
  );
}
