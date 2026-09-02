'use client';

import { useEffect, useState } from 'react';
import { formatTime, formatDateLong } from '@/lib/format';

/** Operatör başlığındaki canlı saat (İstanbul) */
export function OperatorClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right leading-tight">
      <div className="num text-lg font-semibold">{now ? formatTime(now) : '--:--'}</div>
      <div className="hidden text-[11px] text-muted-foreground sm:block">{now ? formatDateLong(now) : ''}</div>
    </div>
  );
}
