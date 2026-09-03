import ExcelJS from 'exceljs';
import { requirePermission } from '@/lib/auth';

/**
 * Ana Veri Excel şablonu — `packages/db/src/import/anaveri.ts`'in beklediği başlıklarla birebir aynı
 * iki sayfa üretir ("Ana Veri", "Kod Yapısı") + birer örnek satır. `pnpm shot` gibi araçlar için değil,
 * kullanıcının indirip dolduracağı gerçek bir dosya.
 */
export const dynamic = 'force-dynamic';

const ANA_VERI_HEADERS = [
  'SKU', 'Kısa Kod', 'Ürün Adı', 'Kategori 1', 'Kategori 2', 'Kategori 3', 'Varyant',
  'Ambalaj / Adet', 'Barkod (EAN-13)', 'Koli Barkodu', 'Durum', 'Lokasyon', 'Miktar', 'Eski SKU', 'Not',
];
const ANA_VERI_EXAMPLE = [
  '110010001', 'PLT-BDM-1', 'Badem Bazı 1L', 'Bitkisel Süt Konsantreleri (Bazlar)', 'Badem', '',
  '', '1 Adet', '8683529780001', '', 'Aktif', 'Tire/R01-A1', '120', '', '',
];

export async function GET() {
  await requirePermission('masterdata.manage');

  const wb = new ExcelJS.Workbook();
  const anaVeri = wb.addWorksheet('Ana Veri');
  anaVeri.addRow(ANA_VERI_HEADERS);
  anaVeri.getRow(1).font = { bold: true };
  anaVeri.addRow(ANA_VERI_EXAMPLE);
  anaVeri.columns.forEach((c) => {
    c.width = 18;
  });

  const kodYapisi = wb.addWorksheet('Kod Yapısı');
  kodYapisi.addRow(['T — Ürün/Kayıt Tipi']);
  kodYapisi.addRow(['Kod', 'Etiket']);
  kodYapisi.addRow(['1', 'Mamul Ürünler']);
  kodYapisi.addRow(['3', 'Hammaddeler']);
  kodYapisi.addRow([]);
  kodYapisi.addRow(['AA — Ürün Ailesi (Mamul)']);
  kodYapisi.addRow(['Kod', 'Etiket']);
  kodYapisi.addRow(['01', 'Badem']);
  kodYapisi.columns.forEach((c) => {
    c.width = 28;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Plantero_AnaVeri_Sablon.xlsx"',
    },
  });
}
