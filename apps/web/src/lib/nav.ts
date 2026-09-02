import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Database,
  Package,
  Users,
  FlaskConical,
  Warehouse,
  FileInput,
  Boxes,
  PackageCheck,
  Truck,
  ArrowLeftRight,
  ClipboardList,
  Tags,
  CalendarClock,
  Factory,
  ListChecks,
  Rows3,
  CalendarRange,
  Tablet,
  ShoppingCart,
  FileText,
  Target,
  Store,
  BadgePercent,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  CheckSquare,
  Building2,
  ShieldCheck,
  Star,
  GitBranch,
  Megaphone,
  Landmark,
  Receipt,
  Wallet,
  CreditCard,
  Scale,
  BookOpen,
  ListTree,
  Percent,
  Banknote,
  Activity,
  PieChart,
  Coins,
  BellRing,
  LineChart,
  Globe,
  Ship,
  Files,
  DollarSign,
  Wrench,
  Cog,
  CalendarCheck,
  Gauge,
  Lightbulb,
  Beaker,
  Settings,
  UserCog,
  KeyRound,
  ScrollText,
} from 'lucide-react';

/**
 * Menü tanımı + izin eşlemesi. Sidebar, mobil sekmeler, breadcrumb ve ⌘K
 * bu tek kaynaktan beslenir. `permission` yoksa herkes görür.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Arama için ek anahtar sözcükler */
  keywords?: string[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Grup düzeyinde görünürlük izni (herhangi biri yeterli) */
  permissions?: string[];
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    id: 'kokpit',
    label: 'Kokpit',
    icon: LayoutDashboard,
    items: [{ label: 'Kokpit', href: '/kokpit', icon: LayoutDashboard, permission: 'cockpit.view', keywords: ['dashboard', 'özet', 'kpi'] }],
  },
  {
    id: 'ana-veri',
    label: 'Ana Veri',
    icon: Database,
    permissions: ['masterdata.view'],
    items: [
      { label: 'Ürünler', href: '/ana-veri/urunler', icon: Package, permission: 'masterdata.view', keywords: ['sku', 'barkod', 'stok kartı'] },
      { label: 'Cariler', href: '/ana-veri/cariler', icon: Users, permission: 'masterdata.view', keywords: ['müşteri', 'tedarikçi'] },
      { label: 'Reçeteler', href: '/ana-veri/receteler', icon: FlaskConical, permission: 'masterdata.view', keywords: ['bom', 'formül'] },
      { label: 'Depolar', href: '/ana-veri/depolar', icon: Warehouse, permission: 'masterdata.view', keywords: ['lokasyon', 'raf'] },
      { label: 'İçe Aktarım', href: '/ana-veri/import', icon: FileInput, permission: 'masterdata.manage', keywords: ['excel', 'import'] },
    ],
  },
  {
    id: 'depo',
    label: 'Depo',
    icon: Boxes,
    permissions: ['stock.view'],
    items: [
      { label: 'Stok', href: '/depo/stok', icon: Boxes, permission: 'stock.view', keywords: ['envanter', 'quant'] },
      { label: 'Mal Kabul', href: '/depo/mal-kabul', icon: PackageCheck, permission: 'stock.receive', keywords: ['giriş', 'gr'] },
      { label: 'Sevkiyat', href: '/depo/sevkiyat', icon: Truck, permission: 'stock.pick', keywords: ['irsaliye', 'çıkış', 'dn'] },
      { label: 'Transfer', href: '/depo/transfer', icon: ArrowLeftRight, permission: 'stock.transfer' },
      { label: 'Sayım', href: '/depo/sayim', icon: ClipboardList, permission: 'stock.count', keywords: ['envanter sayımı'] },
      { label: 'Lotlar', href: '/depo/lotlar', icon: Tags, permission: 'stock.view', keywords: ['parti', 'lot'] },
      { label: 'SKT Takibi', href: '/depo/skt', icon: CalendarClock, permission: 'stock.view', keywords: ['son kullanma', 'fefo'] },
    ],
  },
  {
    id: 'uretim',
    label: 'Üretim',
    icon: Factory,
    permissions: ['production.view'],
    items: [
      { label: 'İş Emirleri', href: '/uretim/is-emirleri', icon: ListChecks, permission: 'production.view', keywords: ['wo', 'üretim emri'] },
      { label: 'Hatlar', href: '/uretim/hatlar', icon: Rows3, permission: 'production.view' },
      { label: 'Planlama', href: '/uretim/planlama', icon: CalendarRange, permission: 'production.plan' },
      { label: 'Operatör Ekranı', href: '/operator', icon: Tablet, permission: 'production.operate', keywords: ['tablet', 'terminal'] },
    ],
  },
  {
    id: 'satis',
    label: 'Satış & CRM',
    icon: ShoppingCart,
    permissions: ['sales.view'],
    items: [
      { label: 'Siparişler', href: '/satis/siparisler', icon: ShoppingCart, permission: 'sales.view', keywords: ['so', 'sipariş'] },
      { label: 'Teklifler', href: '/satis/teklifler', icon: FileText, permission: 'sales.quote', keywords: ['qt', 'teklif'] },
      { label: 'Fırsatlar', href: '/satis/firsatlar', icon: Target, permission: 'sales.view', keywords: ['crm', 'pipeline'] },
      { label: 'Kanallar', href: '/satis/kanallar', icon: Store, permission: 'sales.view', keywords: ['trendyol', 'hepsiburada', 'pazaryeri'] },
      { label: 'Fiyat Listeleri', href: '/satis/fiyat-listeleri', icon: BadgePercent, permission: 'sales.price' },
      { label: 'Net Ciro', href: '/satis/net-ciro', icon: TrendingUp, permission: 'sales.view', keywords: ['komisyon', 'hakediş'] },
    ],
  },
  {
    id: 'satin-alma',
    label: 'Satın Alma',
    icon: ShoppingBag,
    permissions: ['purchasing.view'],
    items: [
      { label: 'Siparişler', href: '/satin-alma/siparisler', icon: ShoppingBag, permission: 'purchasing.view', keywords: ['po'] },
      { label: 'Kritik Stok', href: '/satin-alma/kritik-stok', icon: AlertTriangle, permission: 'purchasing.view', keywords: ['yeniden sipariş', 'min stok'] },
      { label: 'Onay Kuyruğu', href: '/satin-alma/onay-kuyrugu', icon: CheckSquare, permission: 'purchasing.approve' },
      { label: 'Tedarikçiler', href: '/satin-alma/tedarikciler', icon: Building2, permission: 'purchasing.view' },
    ],
  },
  {
    id: 'kalite',
    label: 'Kalite',
    icon: ShieldCheck,
    permissions: ['quality.view'],
    items: [
      { label: 'Kontroller', href: '/kalite/kontroller', icon: ShieldCheck, permission: 'quality.view', keywords: ['qc', 'karantina'] },
      { label: 'Tedarikçi Skoru', href: '/kalite/tedarikci-skoru', icon: Star, permission: 'quality.view' },
      { label: 'İzlenebilirlik', href: '/kalite/izlenebilirlik', icon: GitBranch, permission: 'quality.view', keywords: ['lot izleme', 'trace'] },
      { label: 'Geri Çağırma', href: '/kalite/geri-cagirma', icon: Megaphone, permission: 'quality.recall', keywords: ['recall'] },
    ],
  },
  {
    id: 'muhasebe',
    label: 'Muhasebe',
    icon: Landmark,
    permissions: ['accounting.view'],
    items: [
      { label: 'Faturalar', href: '/muhasebe/faturalar', icon: Receipt, permission: 'accounting.view', keywords: ['e-fatura', 'inv'] },
      { label: 'Tahsilatlar', href: '/muhasebe/tahsilatlar', icon: Wallet, permission: 'accounting.view', keywords: ['ödeme', 'pay'] },
      { label: 'Banka', href: '/muhasebe/banka', icon: CreditCard, permission: 'accounting.view', keywords: ['hesap hareketi', 'mt940'] },
      { label: 'Mutabakat', href: '/muhasebe/mutabakat', icon: Scale, permission: 'accounting.reconcile', keywords: ['eşleştirme'] },
      { label: 'Yevmiye', href: '/muhasebe/yevmiye', icon: BookOpen, permission: 'accounting.view', keywords: ['fiş', 'je'] },
      { label: 'Hesap Planı', href: '/muhasebe/hesap-plani', icon: ListTree, permission: 'accounting.view', keywords: ['tdhp'] },
      { label: 'KDV', href: '/muhasebe/kdv', icon: Percent, permission: 'accounting.view', keywords: ['vergi', '191', '391'] },
    ],
  },
  {
    id: 'finans',
    label: 'Finans',
    icon: Banknote,
    permissions: ['finance.view'],
    items: [
      { label: 'Nakit Akışı', href: '/finans/nakit-akisi', icon: Activity, permission: 'finance.view' },
      { label: 'Break-even', href: '/finans/break-even', icon: PieChart, permission: 'finance.view', keywords: ['başabaş'] },
      { label: 'Bütçe', href: '/finans/butce', icon: Coins, permission: 'finance.view' },
      { label: 'Krediler', href: '/finans/krediler', icon: Landmark, permission: 'finance.view', keywords: ['taksit'] },
      { label: 'Tahsilat Takibi', href: '/finans/tahsilat-takibi', icon: BellRing, permission: 'finance.dunning', keywords: ['hatırlatma', 'vade'] },
      { label: 'Tahmin', href: '/finans/tahmin', icon: LineChart, permission: 'finance.view', keywords: ['forecast'] },
    ],
  },
  {
    id: 'ihracat',
    label: 'İhracat',
    icon: Globe,
    permissions: ['export.view'],
    items: [
      { label: 'Sevkiyatlar', href: '/ihracat/sevkiyatlar', icon: Ship, permission: 'export.view', keywords: ['exp'] },
      { label: 'Belgeler', href: '/ihracat/belgeler', icon: Files, permission: 'export.view', keywords: ['proforma', 'packing list'] },
      { label: 'Kurlar', href: '/ihracat/kurlar', icon: DollarSign, permission: 'export.view', keywords: ['tcmb', 'döviz'] },
    ],
  },
  {
    id: 'bakim',
    label: 'Bakım',
    icon: Wrench,
    permissions: ['maintenance.view'],
    items: [
      { label: 'Makineler', href: '/bakim/makineler', icon: Cog, permission: 'maintenance.view' },
      { label: 'Planlar', href: '/bakim/planlar', icon: CalendarCheck, permission: 'maintenance.plan' },
      { label: 'İş Emirleri', href: '/bakim/is-emirleri', icon: Wrench, permission: 'maintenance.view', keywords: ['arıza', 'mo'] },
      { label: 'OEE', href: '/bakim/oee', icon: Gauge, permission: 'maintenance.view' },
    ],
  },
  {
    id: 'arge',
    label: 'Ar-Ge',
    icon: Lightbulb,
    permissions: ['rnd.view'],
    items: [
      { label: 'Projeler', href: '/arge/projeler', icon: Lightbulb, permission: 'rnd.view', keywords: ['board'] },
      { label: 'Deneme Reçeteleri', href: '/arge/receteler', icon: Beaker, permission: 'rnd.view' },
    ],
  },
  {
    id: 'ayarlar',
    label: 'Ayarlar',
    icon: Settings,
    permissions: ['admin.users', 'admin.settings', 'admin.audit'],
    items: [
      { label: 'Kullanıcılar', href: '/ayarlar/kullanicilar', icon: UserCog, permission: 'admin.users' },
      { label: 'Roller', href: '/ayarlar/roller', icon: KeyRound, permission: 'admin.users', keywords: ['izin', 'yetki'] },
      { label: 'Denetim Kaydı', href: '/ayarlar/audit', icon: ScrollText, permission: 'admin.audit', keywords: ['audit', 'log'] },
    ],
  },
];

/** Mobil alt sekme çubuğu: ilk dört + Menü */
export const MOBILE_TABS: NavItem[] = [
  { label: 'Kokpit', href: '/kokpit', icon: LayoutDashboard, permission: 'cockpit.view' },
  { label: 'Depo', href: '/depo/stok', icon: Boxes, permission: 'stock.view' },
  { label: 'Satış', href: '/satis/siparisler', icon: ShoppingCart, permission: 'sales.view' },
  { label: 'Muhasebe', href: '/muhasebe/faturalar', icon: Landmark, permission: 'accounting.view' },
];

export type PermissionChecker = (code: string) => boolean;

export function canSee(item: { permission?: string }, can: PermissionChecker): boolean {
  return !item.permission || can(item.permission);
}

/** İzinlere göre süzülmüş menü */
export function filterNav(can: PermissionChecker): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, can)) })).filter((g) => g.items.length > 0);
}

/** Yol → { grup, öğe } eşlemesi (breadcrumb için). En uzun eşleşen href kazanır. */
export function matchNav(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.item.href.length) best = { group, item };
      }
    }
  }
  return best;
}

/** Yolun aktif olup olmadığı (alt yollar dahil) */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

/** Bilinen alt yol etiketleri (breadcrumb için) */
export const SUBPATH_LABELS: Record<string, string> = {
  yeni: 'Yeni',
  duzenle: 'Düzenle',
  board: 'Pano',
  detay: 'Detay',
};
