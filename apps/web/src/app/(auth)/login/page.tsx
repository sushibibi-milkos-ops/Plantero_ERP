import type { Metadata } from 'next';
import { Logotype } from '@/components/logotype';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="enter-up w-full max-w-[380px]">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logotype size="lg" />
        <p className="text-sm text-muted-foreground">Bigetaş Biyoteknoloji · Üretim ve finans ikizi</p>
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
        <h1 className="mb-1 text-base font-semibold tracking-tight">Hesabınıza girin</h1>
        <p className="mb-5 text-sm text-muted-foreground">Kurumsal e-posta adresiniz ve şifrenizle.</p>
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <a
          href="mailto:admin@plantero.local?subject=Şifremi%20unuttum"
          className="underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
        >
          Şifremi unuttum
        </a>
        {' · '}
        Sorun mu yaşıyorsunuz? Sistem yöneticinize başvurun.
      </p>
    </div>
  );
}
