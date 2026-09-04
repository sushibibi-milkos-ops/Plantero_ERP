import type { Metadata } from 'next';
import { Logotype } from '@/components/logotype';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="enter-up w-full max-w-[380px]">
      {/* login-01 (Tur 13 P1, kriter 1/11): "Bigetaş Biyoteknoloji · ..." ve kart açıklaması
          uygulamanın geri kalanındaki baskın gövde ölçeğiyle (13px) hizalandı — önceden text-sm
          (14px) idi, hiçbir yerde 13px kullanılmıyordu. */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logotype size="lg" />
        <p className="text-[13px] text-muted-foreground">Bigetaş Biyoteknoloji · Üretim ve finans ikizi</p>
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
        {/* login-01: h1 16px/600 → 20px/500 (tracking -0.01em) — puan kartı h1 için 20-24px/medium
            istiyor, önceki 16px hiçbir yerde kullanılmayan tek seferlik bir boyuttu. */}
        <h1 className="mb-1 text-xl font-medium tracking-[-0.01em]">Hesabınıza girin</h1>
        <p className="mb-5 text-[13px] text-muted-foreground">Kurumsal e-posta adresiniz ve şifrenizle.</p>
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {/* login-02 (Tur 13 P1, kriter 8): dinlenme durumunda komşu düz metinle birebir aynı
            görünüyordu (ayırt edicilik yalnızca hover'a bağlıydı, dokunmatikte hiç görünmüyordu) —
            artık kalıcı alt çizgi var. Mobilde dokunma alanı 15px → 44px (`max-md:inline-flex
            max-md:min-h-11 max-md:items-center`, masaüstünde eski satır-içi görünüm korunur). */}
        <a
          href="mailto:admin@plantero.local?subject=Şifremi%20unuttum"
          className="underline underline-offset-2 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none max-md:inline-flex max-md:min-h-11 max-md:items-center"
        >
          Şifremi unuttum
        </a>
        {' · '}
        Sorun mu yaşıyorsunuz? Sistem yöneticinize başvurun.
      </p>
    </div>
  );
}
