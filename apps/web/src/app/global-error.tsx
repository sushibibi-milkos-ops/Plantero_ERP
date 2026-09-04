'use client';

/**
 * Kök hata sınırı (Tur 14 P1 — orkestratörün doğrudan bildirdiği paylaşılan dev-sunucusu bellek
 * yeniden başlatma bulgusuyla aynı sınıf, bkz. artifacts/critic/shell.json shell-shared-devserver
 * -flake-01). Kök neden ortam/altyapı kaynaklı (paylaşılan `pnpm dev` süreci + eşzamanlı çoklu
 * oturum) — next.config.ts'te bu davranışı yöneten bir ayar YOK: "Server is approaching the used
 * memory threshold" eşiği Next'in dev sunucusunda V8 `heap_size_limit`in sabit %80'i olarak
 * donanıma göre otomatik hesaplanır (next/dist/server/lib/start-server.js), next.config.ts
 * tarafından okunmaz — bu yüzden konfigürasyonla "düzeltilemez" (doğrulama: bu dosyanın Tur 14
 * yorumunda `grep -r workerRestartThreshold node_modules/next/dist` sıfır sonuç verdi).
 *
 * Kod tarafında yapılabilecek TEK gerçek iyileştirme (Tur 12'de (auth)/(operator-auth) için
 * uygulanan `error.tsx` desteniyle aynı ilke, bkz. (auth)/error.tsx): bu bir route-group'un ALTINDA
 * değil, `app/layout.tsx`'in KENDİSİNDE (ör. `Providers` kurulumu, hidrasyon) atılan bir hata için
 * tek örtü buydu — daha önce HİÇ yoktu, bu yüzden kök layout'ta bir istisna Next'in Türkçe olmayan,
 * "tekrar dene" imkânı sunmayan varsayılan hata ekranına düşüyordu. Next.js kuralı gereği
 * `global-error.tsx` kök `<html>`/`<body>`'yi KENDİSİ tanımlamalı (üstündeki layout.tsx render
 * edilmez) — bu yüzden `next/font` değişkenlerine veya paylaşılan bileşenlere bağımlı değil, sistem
 * fontlarıyla kendi başına ayakta durur.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#fafafa',
          color: '#18181b',
        }}
      >
        <div style={{ width: '100%', maxWidth: 384, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              borderRadius: '9999px',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(220, 38, 38, 0.1)',
              color: '#dc2626',
              fontSize: 24,
            }}
            aria-hidden
          >
            !
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Uygulama yüklenemedi</div>
          <p style={{ marginTop: 8, fontSize: 14, color: '#71717a' }}>
            Beklenmeyen bir hata oluştu. Bağlantınızı kontrol edip tekrar deneyin; sorun devam
            ederse sayfayı yenileyin.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={reset}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 8,
                border: 'none',
                background: '#18181b',
                color: '#fafafa',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Tekrar dene
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 8,
                border: '1px solid #e4e4e7',
                background: 'transparent',
                color: '#18181b',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Sayfayı yenile
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
