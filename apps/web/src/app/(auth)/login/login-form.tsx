'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { login, type LoginState } from '@/modules/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  const [showPassword, setShowPassword] = useState(false);
  const emailError = state?.fieldErrors?.email?.[0];
  const passwordError = state?.fieldErrors?.password?.[0];

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/* Kosullu render yerine daima 44px'lik bir bolge ayrilir (Tur 4 P2 bulgusu): hata kutusu
          formun UZERINE eklendiginde E-posta/Sifre alanlari ve "Giris yap" butonu ~46px asagi
          kayiyordu — kullanici hatayi tam okurken tikladigi yer yerinden oynuyordu. Icerik kosullu
          dolar, yer her zaman ayrilir; hatasiz durumda kutu gorunmez (border/bg yok) ama yuksekligi
          korunur. */}
      <div
        role="alert"
        aria-live="polite"
        className={cn(
          'flex min-h-11 items-start gap-2 rounded-md border px-3 py-2 text-sm',
          state?.error && !state.fieldErrors ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-transparent',
        )}
      >
        {state?.error && !state.fieldErrors ? (
          <>
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-posta</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ad@plantero.local"
          required
          autoFocus
          aria-invalid={Boolean(emailError)}
          defaultValue={state?.email ?? ''}
        />
        {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Şifre</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(passwordError)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className={cn(
              'absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground',
              'hover:text-foreground focus-visible:text-foreground focus-visible:outline-none',
            )}
            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
      </div>

      <Button type="submit" className="mt-2 w-full" disabled={pending} data-testid="login-submit">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? 'Giriş yapılıyor' : 'Giriş yap'}
      </Button>
    </form>
  );
}
