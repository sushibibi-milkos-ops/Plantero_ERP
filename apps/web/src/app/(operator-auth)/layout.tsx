/** Operatör PIN girişi: (operator) düzeninin dışında — oturum gerekmeden erişilebilir. */
export default function OperatorAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          background: 'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)',
        }}
      />
      {children}
    </div>
  );
}
