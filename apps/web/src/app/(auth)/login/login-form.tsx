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

      {state?.error && !state.fieldErrors ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

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
            placeholder="••••••••"
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
