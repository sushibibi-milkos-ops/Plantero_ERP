'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Plus, ArrowRight, type LucideIcon } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useShell } from './app-shell';

export type QuickAction = {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
  permission?: string;
  keywords?: string[];
  shortcut?: string;
};

/** Varsayılan hızlı eylemler — modüller kendi sayfalarında genişletebilir */
const DEFAULT_ACTIONS: QuickAction[] = [
  { id: 'new-order', label: 'Yeni satış siparişi', href: '/satis/siparisler/yeni', icon: Plus, permission: 'sales.order', keywords: ['sipariş', 'so'] },
  { id: 'new-quote', label: 'Yeni teklif', href: '/satis/teklifler/yeni', icon: Plus, permission: 'sales.quote' },
  { id: 'new-receipt', label: 'Yeni mal kabul', href: '/depo/mal-kabul/yeni', icon: Plus, permission: 'stock.receive' },
  { id: 'new-transfer', label: 'Yeni transfer', href: '/depo/transfer/yeni', icon: Plus, permission: 'stock.transfer' },
  { id: 'new-wo', label: 'Yeni iş emri', href: '/uretim/is-emirleri/yeni', icon: Plus, permission: 'production.plan' },
  { id: 'new-po', label: 'Yeni satın alma siparişi', href: '/satin-alma/siparisler/yeni', icon: Plus, permission: 'purchasing.draft' },
  // 'new-invoice' kaldırıldı (Tur 10 P1): /muhasebe/faturalar/yeni hiç yazılmamış bir modüle
  // gidiyordu (kalıcı 404) — fatura modülü yazılana kadar ⌘K'da bu eylem sunulmaz (bkz. rapor
  // "şema/route talepleri"). 'new-payment' gerçek sayfaya (/finans/tahsilat) düzeltildi.
  { id: 'new-payment', label: 'Yeni tahsilat/ödeme', href: '/finans/tahsilat/yeni', icon: Plus, permission: 'finance.manage' },
  { id: 'new-fault', label: 'Arıza bildir', href: '/bakim/is-emirleri/yeni', icon: Plus, permission: 'maintenance.report' },
];

/**
 * ⌘K komut menüsü: sayfalar + hızlı eylemler + tema.
 * Klavyeyle günde yüzlerce kez açılır → içerik animasyonsuz (yalnızca overlay solar).
 */
export function CommandMenu({ actions = DEFAULT_ACTIONS }: { actions?: QuickAction[] }) {
  const router = useRouter();
  const { nav, can, commandOpen, setCommandOpen } = useShell();
  const { setTheme } = useTheme();

  const pages = useMemo(
    () => nav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))),
    [nav],
  );
  const visibleActions = useMemo(() => actions.filter((a) => !a.permission || can(a.permission)), [actions, can]);

  const go = (href: string) => {
    setCommandOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={setCommandOpen}
      title="Komut menüsü"
      description="Sayfa ara veya hızlı eylem çalıştır"
      showCloseButton={false}
      className="top-[18%] translate-y-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-xl"
    >
      <CommandInput placeholder="Sayfa, belge veya eylem ara…" />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>Sonuç yok.</CommandEmpty>

        {visibleActions.length ? (
          <CommandGroup heading="Hızlı eylemler">
            {visibleActions.map((a) => {
              const Icon = a.icon ?? Plus;
              return (
                <CommandItem
                  key={a.id}
                  value={`${a.label} ${(a.keywords ?? []).join(' ')}`}
                  onSelect={() => {
                    if (a.onSelect) {
                      setCommandOpen(false);
                      a.onSelect();
                    } else if (a.href) go(a.href);
                  }}
                >
                  <Icon className="size-4 text-primary" />
                  {a.label}
                  {a.shortcut ? <CommandShortcut>{a.shortcut}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        <CommandSeparator />
        <CommandGroup heading="Sayfalar">
          {pages.map((p) => (
            <CommandItem key={p.href} value={`${p.group} ${p.label} ${(p.keywords ?? []).join(' ')}`} onSelect={() => go(p.href)}>
              <p.icon className="size-4 text-muted-foreground" />
              <span>{p.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{p.group}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Tema">
          <CommandItem value="tema açık light" onSelect={() => { setTheme('light'); setCommandOpen(false); }}>
            <Sun className="size-4" /> Açık tema
          </CommandItem>
          <CommandItem value="tema koyu dark" onSelect={() => { setTheme('dark'); setCommandOpen(false); }}>
            <Moon className="size-4" /> Koyu tema
          </CommandItem>
          <CommandItem value="tema sistem system" onSelect={() => { setTheme('system'); setCommandOpen(false); }}>
            <Monitor className="size-4" /> Sistem teması
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> gez
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd> aç
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <ArrowRight className="size-3" /> Belge no yazınca doğrudan açılır (yakında)
        </span>
      </div>
    </CommandDialog>
  );
}
