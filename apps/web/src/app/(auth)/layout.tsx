/** Kimlik doğrulama sayfaları: sakin, ortalanmış düzen */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      {/* Arka plan: çok hafif yeşil ışıma — kurumsal gri yerine canlı ama sakin */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)',
        }}
      />
      {children}
    </div>
  );
}
