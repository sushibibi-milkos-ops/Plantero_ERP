import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ImportWizard } from '@/modules/masterdata/components/import-wizard';

export const metadata: Metadata = { title: 'Excel İçe Aktarım' };
export const dynamic = 'force-dynamic';

export default async function AnaVeriImportPage() {
  await requirePermission('masterdata.manage');

  return (
    <>
      <PageHeader
        title="Excel'den İçe Aktarım"
        description="Ana Veri Excel'ini (Plantero_AnaVeri_KonusanKod.xlsx) yükleyin — önce önizleme (diff), sonra uygulama. Ürün adı ve barkod her zaman korunur; mevcut kayıtların üzerine yazılmaz."
      />
      <div className="max-w-4xl">
        <ImportWizard />
      </div>
    </>
  );
}
