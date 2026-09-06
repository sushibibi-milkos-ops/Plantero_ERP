'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUDIT_ACTION_INFO, AUDIT_ACTION_ORDER } from '../audit-labels';

const ALL = '__all__';

/** İzin verilen sistem tablosu adlarını okunabilir kılan basit dönüşüm (ör. `work_orders` → "İş Emirleri") */
function tableLabel(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ');
}

export type AuditUserOption = { id: string; fullName: string };

/**
 * Sunucu tarafı filtre çubuğu: her değişiklik URL arama parametrelerini günceller (sayfa 1'e
 * döner) — sayfa bir server component olarak yeniden render olur, istemci filtre durumu tutmaz.
 * Metin arama debounce'lu (400ms); diğer kontroller anında navigasyon tetikler.
 */
export function AuditFiltersBar({ tables, users }: { tables: string[]; users: AuditUserOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
  }, [searchParams]);

  function setParam(key: string, value: string | null, opts: { resetPage?: boolean } = { resetPage: true }) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    if (opts.resetPage !== false) params.delete('page');
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function onSearchChange(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam('q', v || null), 400);
  }

  const hasFilters = ['table', 'userId', 'action', 'from', 'to', 'q'].some((k) => searchParams.get(k));

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Özet, tablo, kayıt id veya e-posta ara…"
          className="h-11 pl-9 md:h-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={searchParams.get('table') ?? ALL} onValueChange={(v) => setParam('table', v)}>
          <SelectTrigger size="sm" className="w-full data-[size=sm]:h-11 sm:w-44 md:data-[size=sm]:h-8">
            <SelectValue placeholder="Tablo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm tablolar</SelectItem>
            {tables.map((t) => (
              <SelectItem key={t} value={t} className="font-mono text-[12px]">
                {tableLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={searchParams.get('action') ?? ALL} onValueChange={(v) => setParam('action', v)}>
          <SelectTrigger size="sm" className="w-full data-[size=sm]:h-11 sm:w-40 md:data-[size=sm]:h-8">
            <SelectValue placeholder="Eylem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm eylemler</SelectItem>
            {AUDIT_ACTION_ORDER.map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIT_ACTION_INFO[a]?.label ?? a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={searchParams.get('userId') ?? ALL} onValueChange={(v) => setParam('userId', v)}>
          <SelectTrigger size="sm" className="w-full data-[size=sm]:h-11 sm:w-48 md:data-[size=sm]:h-8">
            <SelectValue placeholder="Kullanıcı" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm kullanıcılar</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Başlangıç tarihi"
            value={searchParams.get('from') ?? ''}
            onChange={(e) => setParam('from', e.target.value || null)}
            className="h-11 w-[130px] text-[13px] md:h-8"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Bitiş tarihi"
            value={searchParams.get('to') ?? ''}
            onChange={(e) => setParam('to', e.target.value || null)}
            className="h-11 w-[130px] text-[13px] md:h-8"
          />
        </div>

        {hasFilters ? (
          <Button variant="ghost" size="sm" className="h-11 md:h-8" onClick={() => router.push(pathname)}>
            <X className="size-3.5" /> Temizle
          </Button>
        ) : null}
      </div>
    </div>
  );
}
