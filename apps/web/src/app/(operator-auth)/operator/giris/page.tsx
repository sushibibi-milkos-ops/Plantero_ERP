import type { Metadata } from 'next';
import { Logotype } from '@/components/logotype';
import { listOperatorUsers } from '@/modules/production/queries';
import { OperatorPinLogin } from '@/modules/production/components/operator-pin-login';

export const metadata: Metadata = { title: 'Operatör Girişi' };
export const dynamic = 'force-dynamic';

export default async function OperatorLoginPage() {
  const users = await listOperatorUsers();
  return (
    <div className="enter-up flex w-full flex-col items-center">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logotype size="lg" />
        <p className="text-sm text-muted-foreground">Operatör terminali</p>
      </div>
      <OperatorPinLogin users={users} />
    </div>
  );
}
