import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listSuppliersForExpense, listExpenseAccounts } from '@/modules/accounting/queries';
import { ExpenseInvoiceForm } from '@/modules/accounting/components/expense-invoice-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Gider Faturası' };
export const dynamic = 'force-dynamic';

export default async function NewExpenseInvoicePage() {
  await requirePermission('accounting.invoice');
  const [suppliers, expenseAccounts] = await Promise.all([listSuppliersForExpense(), listExpenseAccounts()]);

  return (
    <>
      <PageHeader title="Gider Faturası" description="Kaynak PO/mal kabulü olmayan alış — kira, elektrik, muhasebe ücreti vb." />
      <ExpenseInvoiceForm suppliers={suppliers} expenseAccounts={expenseAccounts} />
    </>
  );
}
