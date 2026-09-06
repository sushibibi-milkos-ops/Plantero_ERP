import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Database,
  Package,
  Users,
  FlaskConical,
  Warehouse,
  FileInput,
  Hash,
  Boxes,
  PackageCheck,
  Truck,
  ArrowLeftRight,
  ClipboardList,
  Tags,
  CalendarClock,
  ScanLine,
  QrCode,
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
  Wallet,
  CreditCard,
  Banknote,
  Activity,
  PieChart,
  Coins,
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
  Bell,
  Inbox,
  ClipboardCheck,
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
  // Bildirimler & Onay Merkezi (docs/modules/bildirimler.md): modüller arası tek onay kuyruğu +
  // kullanıcı bildirimleri. Sayfalar `requireUser` ile açılır (izin kapısı kart/tür bazında — onay
  // kuyruğu yalnızca kullanıcının karar yetkisi olan türleri listeler), bu yüzden `permission` yok.
  {
    id: 'bildirimler',
    label: 'Bildirimler',
    icon: Bell,
    items: [
      { label: 'Onay Merkezi', href: '/onaylar', icon: Inbox, keywords: ['onay', 'approval', 'kuyruk', 'bekleyen'] },
      { label: 'Bildirimler', href: '/bildirimler', icon: Bell, keywords: ['uyarı', 'skt', 'kritik stok', 'okunmamış'] },
    ],
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
      { label: 'Kod Yapısı', href: '/ana-veri/kod-yapisi', icon: Hash, permission: 'masterdata.view', keywords: ['sku', 'segment', 'konuşan kod'] },
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
      { label: 'Tara', href: '/depo/tara', icon: ScanLine, permission: 'stock.view', keywords: ['barkod', 'qr', 'okut', 'scan'] },
      { label: 'Etiket', href: '/depo/etiket', icon: QrCode, permission: 'stock.view', keywords: ['lot etiketi', 'qr', 'yazdır'] },
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
      { label: 'Şablonlar', href: '/kalite/sablonlar', icon: ClipboardCheck, permission: 'quality.inspect', keywords: ['qc şablonu', 'kontrol kalemi', 'spesifikasyon'] },
      { label: 'Tedarikçi Skoru', href: '/kalite/tedarikci-skoru', icon: Star, permission: 'quality.view' },
      { label: 'İzlenebilirlik', href: '/kalite/izlenebilirlik', icon: GitBranch, permission: 'quality.view', keywords: ['lot izleme', 'trace'] },
      { label: 'Geri Çağırma', href: '/kalite/geri-cagirma', icon: Megaphone, permission: 'quality.recall', keywords: ['recall'] },
    ],
  },
  // 'muhasebe' grubu geri eklendi: /muhasebe/* rotaları artık gerçekten var (muhasebe modülü —
  // faturalar, tahsilatlar, banka, mutabakat, yevmiye, hesap planı, mizan, KDV, dönemler). Tur 10'da
  // buradan kaldırılmıştı (7 kalem 404 veriyordu); geri ekleme o turun bıraktığı yorumdaki açık
  // beklentiyi karşılıyor. "Tahsilatlar"/"Banka" burada VE Finans grubunda ikisinde de görünür —
  // aynı alttaki servisleri (recordPayment/importStatement) kullanan iki farklı ekrandır (muhasebe
  // modülü kendi RBAC'iyle: accounting.post/accounting.reconcile; Finans grubu finance.manage/view).
  {
    id: 'muhasebe',
    label: 'Muhasebe',
    icon: ScrollText,
    permissions: ['accounting.view'],
    items: [
      { label: 'Özet', href: '/muhasebe', icon: LayoutDashboard, permission: 'accounting.view' },
      { label: 'Faturalar', href: '/muhasebe/faturalar', icon: FileText, permission: 'accounting.view', keywords: ['inv', 'e-fatura', 'iade'] },
      { label: 'Tahsilatlar', href: '/muhasebe/tahsilatlar', icon: Wallet, permission: 'accounting.view', keywords: ['tahsilat', 'ödeme'] },
      { label: 'Banka', href: '/muhasebe/banka', icon: CreditCard, permission: 'accounting.view', keywords: ['ekstre', 'mt940'] },
      { label: 'Mutabakat', href: '/muhasebe/mutabakat', icon: Activity, permission: 'accounting.reconcile', keywords: ['ai', 'onay ekranı'] },
      { label: 'Yevmiye', href: '/muhasebe/yevmiye', icon: ScrollText, permission: 'accounting.view', keywords: ['fiş', 'vuk', 'ufrs'] },
      { label: 'Hesap Planı', href: '/muhasebe/hesap-plani', icon: ListChecks, permission: 'accounting.view' },
      { label: 'Mizan', href: '/muhasebe/mizan', icon: PieChart, permission: 'accounting.view' },
      { label: 'KDV', href: '/muhasebe/kdv', icon: Coins, permission: 'accounting.view' },
      { label: 'Dönemler', href: '/muhasebe/donemler', icon: CalendarRange, permission: 'accounting.view', keywords: ['kapat', 'aç'] },
    ],
  },
  {
    id: 'finans',
    label: 'Finans',
    icon: Banknote,
    permissions: ['finance.view'],
    items: [
      // 'Tahsilat/Ödeme' ve eski 'Tahsilat Takibi' (gecikmiş alacak hatırlatma) TEK sayfada birleşti —
      // ikisi de gerçekte /finans/tahsilat'a gidiyordu; iki ayrı menü kalemi aynı hedefe çift giriş
      // olurdu. `finance.dunning` iznine sahip ama `finance.view`'ı olmayan bir kullanıcı kalmasın diye
      // izin OR'lanır (görünürlük ikisinden biri yeterli olacak şekilde `permission` yerine grup düzeyi
      // kontrolü zaten `permissions` dizisinde var; öğe düzeyinde `finance.view` yeterli — dunning
      // rolü de pratikte finance.view taşır, bkz. RBAC ön ayarları).
      { label: 'Tahsilat/Ödeme', href: '/finans/tahsilat', icon: Wallet, permission: 'finance.view', keywords: ['fatura', 'ödeme', 'cari', 'pay'] },
      { label: 'Banka Mutabakatı', href: '/finans/banka', icon: CreditCard, permission: 'finance.view', keywords: ['hesap hareketi', 'mt940', 'mutabakat'] },
      { label: 'Nakit Akışı', href: '/finans/nakit-akisi', icon: Activity, permission: 'finance.view', keywords: ['projeksiyon', '36 ay', 'senaryo'] },
      { label: 'Break-even', href: '/finans/break-even', icon: PieChart, permission: 'finance.view', keywords: ['başabaş', 'hedef ciro'] },
      { label: 'Bütçe', href: '/finans/butce', icon: Coins, permission: 'finance.view', keywords: ['plan', 'gerçekleşen', 'sapma'] },
      { label: 'Krediler', href: '/finans/krediler', icon: Landmark, permission: 'finance.view', keywords: ['taksit', 'amortisman'] },
      // Tahsilat Takibi (kademeli hatırlatma / dunning) artık GERÇEK, ayrı bir sayfa (/finans/tahsilat-takibi —
      // finans modülü, docs/modules/finans.md §5). Önceki turda "/finans/tahsilat ile birleşti" diye menüden
      // düşürülmüştü; sayfa yazıldığı için geri eklendi.
      { label: 'Tahsilat Takibi', href: '/finans/tahsilat-takibi', icon: AlertTriangle, permission: 'finance.view', keywords: ['hatırlatma', 'vade', 'gecikmiş', 'dunning', 'yaşlandırma'] },
      { label: 'Tahmin', href: '/finans/tahmin', icon: LineChart, permission: 'finance.view', keywords: ['forecast', 'ai', 'satış tahmini'] },
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
      { label: 'GTİP', href: '/ihracat/gtip', icon: Hash, permission: 'export.view', keywords: ['gümrük tarife', 'hs code', 'ürün eşleme'] },
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
  // Muhasebe modülü artık var — dördüncü sekme gerçek hedefine (faturalar listesi) döndü.
  { label: 'Muhasebe', href: '/muhasebe/faturalar', icon: FileText, permission: 'accounting.view' },
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
  topla: 'Toplama',
  cariler: 'Cariler',
  ekstre: 'Ekstre',
  // Ar-Ge proje sekmesi ham slug'ı ('receteler') breadcrumb'a sızıyordu (Tur 1 P1 arge-recete-06) —
  // sekme etiketiyle (ProjectNavTabs) birebir aynı metin.
  receteler: 'Deneme Reçeteleri',
};

/** İstemci tarafı izin denetleyicisi: admin rolü her şeyi görür, `*` joker izindir */
export function makeCan(roles: string[], permissions: string[]): PermissionChecker {
  const set = new Set(permissions);
  const isAdmin = roles.includes('admin') || set.has('*');
  return (code: string) => isAdmin || set.has(code);
}
