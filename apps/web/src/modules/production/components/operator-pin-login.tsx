'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Delete, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { operatorPinLogin } from '../actions';
import type { OperatorUserRow } from '../queries';

const ROLE_LABEL: Record<string, string> = { uretim_operatoru: 'Operatör', uretim_sefi: 'Üretim Şefi' };

export function OperatorPinLogin({ users }: { users: OperatorUserRow[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pending, startTransition] = useTransition();

  const selectedUser = users.find((u) => u.id === userId) ?? null;

  function press(digit: string) {
    if (pending) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4 && userId) submit(next);
  }

  function submit(value: string) {
    if (!userId) return;
    startTransition(async () => {
      const res = await operatorPinLogin({ userId, pin: value });
      if (res.ok) {
        router.push('/operator');
        router.refresh();
      } else {
        toast.error(res.error);
        setPin('');
      }
    });
  }

  if (!selectedUser) {
    return (
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-lg font-semibold tracking-tight">Kim çalışıyor?</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Vardiya için adınızı seçin</p>
        <div className="grid grid-cols-2 gap-3">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setUserId(u.id)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-card p-3 text-center transition-transform active:scale-[0.97]"
            >
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(u.fullName)}</span>
              <span className="text-sm font-medium">{u.fullName}</span>
              <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[u.roleCode] ?? u.roleCode}</span>
            </button>
          ))}
          {users.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              <User className="size-6" />
              Tanımlı operatör kullanıcısı yok
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xs">
      <div className="mb-6 flex flex-col items-center gap-2">
        <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initials(selectedUser.fullName)}</span>
        <div className="text-base font-semibold">{selectedUser.fullName}</div>
        <button type="button" onClick={() => { setUserId(null); setPin(''); }} className="text-xs text-muted-foreground underline underline-offset-2">
          Farklı kullanıcı
        </button>
      </div>

      <div className="mb-6 flex items-center justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('size-3.5 rounded-full border-2 border-primary/40 transition-colors', pin.length > i && 'border-primary bg-primary')} />
        ))}
        {pending ? <Loader2 className="ml-1 size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinKey key={d} onClick={() => press(d)} disabled={pending}>{d}</PinKey>
        ))}
        <div />
        <PinKey onClick={() => press('0')} disabled={pending}>0</PinKey>
        <PinKey onClick={() => setPin((p) => p.slice(0, -1))} disabled={pending || pin.length === 0} aria-label="Sil">
          <Delete className="size-5" />
        </PinKey>
      </div>
    </div>
  );
}

function PinKey({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; 'aria-label'?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className="grid h-16 place-items-center rounded-xl border border-border/70 bg-card text-xl font-medium tabular-nums transition-transform active:scale-[0.95] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
