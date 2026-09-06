import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listAllRecipes } from '@/modules/rnd/queries';
import { AllRecipesTable } from '@/modules/rnd/components/all-recipes-table';

export const metadata: Metadata = { title: 'Deneme Reçeteleri' };
export const dynamic = 'force-dynamic';

export default async function AllRecipesPage() {
  await requirePermission('rnd.view');
  const recipes = await listAllRecipes();

  return (
    <>
      {/* description KALDIRILDI (kök neden düzeltmesi, Tur 5 P2 arge-receteler-02): "${recipes.length}
          deneme reçetesi" metni, DataTable'ın kendi araç çubuğundaki "N kayıt" sayacıyla (toolbar.tsx,
          `total` — DataTable içeride otomatik hesaplar) BİREBİR aynı bilgiyi TEKRAR ediyordu; kaldırılması
          ilk tablo satırına kadarki dikey alanı bir satır (~24px) kısaltır. PageHeader (ortak bileşen)
          DEĞİŞMEDİ. Tam hedef (≤112px) DataTable araç çubuğunun PageHeader ile AYNI satırda birleşmesini
          gerektirir — bu, DataTable/PageHeader kompozisyonunda ortak (shell) bir değişiklik ister; bkz. rapor. */}
      <PageHeader title="Deneme Reçeteleri" />
      <AllRecipesTable recipes={recipes} />
    </>
  );
}
