import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ImportWizard } from '@/modules/masterdata/components/import-wizard';
import { listImportHistory } from '@/modules/masterdata/queries';

export const metadata: Metadata = { title: 'Excel İçe Aktarım' };
export const dynamic = 'force-dynamic';

export default async function AnaVeriImportPage() {
  await requirePermission('masterdata.manage');
  const history = await listImportHistory();

  return (
    <>
      <PageHeader
        title="Excel'den İçe Aktarım"
        description="Ana Veri Excel'ini (Plantero_AnaVeri_KonusanKod.xlsx) yükleyin — önce önizleme (diff), sonra uygulama. Ürün adı ve barkod her zaman korunur; mevcut kayıtların üzerine yazılmaz."
        actions={
          <Button variant="outline" asChild>
            <a href="/ana-veri/import/template">
              <Download className="size-4" /> Şablonu indir
            </a>
          </Button>
        }
      />
      <div className="max-w-4xl">
        <ImportWizard history={history} />
      </div>
    </>
  );
}
