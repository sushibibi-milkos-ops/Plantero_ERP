'use client';

import { LogOut, Settings, Tablet } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { initials } from '@/lib/format';
import { logout } from '@/modules/auth/actions';
import { useShell } from './app-shell';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  genel_mudur: 'Genel Müdür',
  muhasebe: 'Muhasebe',
  finans: 'Finans',
  satis: 'Satış',
  satin_alma: 'Satın Alma',
  depo: 'Depo',
  uretim_operatoru: 'Operatör',
  uretim_sefi: 'Üretim Şefi',
  kalite: 'Kalite',
  bakim: 'Bakım',
  arge: 'Ar-Ge',
  ihracat: 'İhracat',
};

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}

export function UserMenu() {
  const { user, can } = useShell();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-7"
          aria-label="Kullanıcı menüsü"
          data-testid="user-menu"
        >
          <Avatar className="size-7 border">
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.userEmail}</div>
          {user.roles.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {can('production.operate') ? (
          <DropdownMenuItem asChild>
            <Link href="/operator">
              <Tablet className="size-4" /> Operatör ekranı
            </Link>
          </DropdownMenuItem>
        ) : null}
        {can('admin.settings') || can('admin.users') ? (
          <DropdownMenuItem asChild>
            <Link href="/ayarlar/kullanicilar">
              <Settings className="size-4" /> Ayarlar
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full" data-testid="logout">
              <LogOut className="size-4" /> Çıkış yap
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
