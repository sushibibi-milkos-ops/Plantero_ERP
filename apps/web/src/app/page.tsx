import { redirect } from 'next/navigation';

/** Kök: kokpite yönlendir (oturum kontrolü middleware'de) */
export default function RootPage() {
  redirect('/kokpit');
}
