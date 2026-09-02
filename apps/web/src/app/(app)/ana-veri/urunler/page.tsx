import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, FileUp } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listProducts } from '@/modules/masterdata/queries';
import { ProductsTable } from '@/modules/masterdata/components/products-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Ürünler' };
export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const user = await requirePermission('masterdata.view');
  const products = await listProducts();
  const canManage = userCan(user, 'masterdata.manage');

  return (
    <>
      <PageHeader
        title="Ürünler"
        description={`${products.length} ürün · konuşan kod (SKU) ana veri`}
        actions={
          canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/ana-veri/import">
                  <FileUp className="size-4" /> Excel&apos;den içe aktar
                </Link>
              </Button>
              <Button asChild>
                <Link href="/ana-veri/urunler/yeni">
                  <Plus className="size-4" /> Yeni ürün
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />
      <ProductsTable products={products} />
    </>
  );
}
