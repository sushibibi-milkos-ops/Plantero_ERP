import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'plantero_session';

/** Oturum gerektirmeyen yollar */
const PUBLIC_PATHS = ['/login', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Yalnızca cookie varlığına bakar (edge'de DB yok); gerçek doğrulama
 * sayfa/aksiyon tarafında `getCurrentUser` ile yapılır.
 * - Oturumsuz → /login?next=<yol>
 * - /login'de oturumlu → /kokpit
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login' && hasSession) {
    return NextResponse.redirect(new URL('/kokpit', req.url));
  }
  if (!hasSession && !isPublic(pathname)) {
    const url = new URL('/login', req.url);
    if (pathname !== '/' && pathname !== '/kokpit') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Statik dosyalar ve Next iç yolları hariç her şey
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'],
};
