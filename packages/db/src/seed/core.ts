import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { roles, permissions, rolePermissions, users, userRoles, sequences, settings } from '../schema/index.js';
import { log, type SeedSummary } from './_helpers.js';

/**
 * İzin kodları — packages/core/src/auth/rbac.ts `PERMISSIONS` ile BİREBİR AYNI KODLAR.
 * packages/db, packages/core'a bağımlı OLAMAZ (core, db'ye bağımlı — döngüsel import olur);
 * bu yüzden liste burada bilinçli olarak tekrar tanımlanır. Kod eklenirse iki dosya birlikte güncellenmeli.
 */
const PERMISSIONS: ReadonlyArray<{ code: string; module: string; description: string }> = [
  { code: 'masterdata.view', module: 'masterdata', description: 'Ana veriyi görüntüle (ürün, cari, reçete, depo)' },
  { code: 'masterdata.manage', module: 'masterdata', description: 'Ana veriyi düzenle / içe aktar' },

  { code: 'stock.view', module: 'stock', description: 'Stok, lot ve hareketleri görüntüle' },
  { code: 'stock.receive', module: 'stock', description: 'Mal kabul yap' },
  { code: 'stock.pick', module: 'stock', description: 'Sevkiyat topla / sevk et' },
  { code: 'stock.transfer', module: 'stock', description: 'Lokasyonlar arası transfer' },
  { code: 'stock.count', module: 'stock', description: 'Sayım gir' },
  { code: 'stock.approve_count', module: 'stock', description: 'Sayım farkını onayla ve kaydet' },

  { code: 'production.view', module: 'production', description: 'İş emirlerini görüntüle' },
  { code: 'production.plan', module: 'production', description: 'İş emri oluştur / planla' },
  { code: 'production.operate', module: 'production', description: 'Operatör ekranı: başlat, okut, fire, bitir' },
  { code: 'production.close', module: 'production', description: 'İş emrini kapat (maliyet kesinleşir)' },

  { code: 'sales.view', module: 'sales', description: 'Satış belgelerini görüntüle' },
  { code: 'sales.quote', module: 'sales', description: 'Teklif ve fırsat oluştur' },
  { code: 'sales.order', module: 'sales', description: 'Sipariş oluştur / düzenle' },
  { code: 'sales.confirm', module: 'sales', description: 'Siparişi onayla' },
  { code: 'sales.price', module: 'sales', description: 'Fiyat listesi ve müşteri özel fiyat yönet' },

  { code: 'purchasing.view', module: 'purchasing', description: 'Satın alma belgelerini görüntüle' },
  { code: 'purchasing.draft', module: 'purchasing', description: 'Satın alma siparişi taslağı oluştur' },
  { code: 'purchasing.approve', module: 'purchasing', description: 'Satın alma siparişini onayla' },
  { code: 'purchasing.send', module: 'purchasing', description: 'Siparişi tedarikçiye gönder' },

  { code: 'quality.view', module: 'quality', description: 'Kalite kayıtlarını görüntüle' },
  { code: 'quality.inspect', module: 'quality', description: 'Kalite kontrolü yap' },
  { code: 'quality.release', module: 'quality', description: 'Lot serbest bırak / reddet' },
  { code: 'quality.recall', module: 'quality', description: 'Geri çağırma başlat / simüle et' },

  { code: 'accounting.view', module: 'accounting', description: 'Muhasebe kayıtlarını görüntüle' },
  { code: 'accounting.post', module: 'accounting', description: 'Yevmiye fişi kaydet / ters kayıt' },
  { code: 'accounting.invoice', module: 'accounting', description: 'Fatura kes / alış faturası gir' },
  { code: 'accounting.einvoice', module: 'accounting', description: 'e-Fatura / e-Arşiv / e-İrsaliye gönder' },
  { code: 'accounting.reconcile', module: 'accounting', description: 'Banka mutabakatı yap' },
  { code: 'accounting.close_period', module: 'accounting', description: 'Dönem kapat' },

  { code: 'finance.view', module: 'finance', description: 'Finans ekranlarını görüntüle' },
  { code: 'finance.manage', module: 'finance', description: 'Kredi, bütçe, nakit akışı yönet' },
  { code: 'finance.dunning', module: 'finance', description: 'Tahsilat hatırlatması gönder' },

  { code: 'export.view', module: 'export', description: 'İhracat sevkiyatlarını görüntüle' },
  { code: 'export.manage', module: 'export', description: 'İhracat belgeleri ve sevkiyat yönet' },

  { code: 'maintenance.view', module: 'maintenance', description: 'Bakım kayıtlarını görüntüle' },
  { code: 'maintenance.report', module: 'maintenance', description: 'Arıza bildir' },
  { code: 'maintenance.plan', module: 'maintenance', description: 'Bakım planı oluştur' },
  { code: 'maintenance.execute', module: 'maintenance', description: 'Bakım iş emrini yürüt / kapat' },

  { code: 'rnd.view', module: 'rnd', description: 'Ar-Ge projelerini görüntüle' },
  { code: 'rnd.manage', module: 'rnd', description: 'Ar-Ge projesi ve deneme reçetesi yönet' },
  { code: 'rnd.release', module: 'rnd', description: 'Deneme reçetesini üretime devret' },

  { code: 'cockpit.view', module: 'cockpit', description: 'Yönetim kokpiti' },

  { code: 'admin.users', module: 'admin', description: 'Kullanıcı ve rol yönetimi' },
  { code: 'admin.settings', module: 'admin', description: 'Sistem ayarları' },
  { code: 'admin.audit', module: 'admin', description: 'Denetim günlüğü' },
] as const;

const ALL_CODES = PERMISSIONS.map((p) => p.code);

const ROLE_NAMES: Record<string, string> = {
  admin: 'Sistem Yöneticisi',
  genel_mudur: 'Genel Müdür',
  muhasebe: 'Muhasebe',
  finans: 'Finans',
  satis: 'Satış',
  satin_alma: 'Satın Alma',
  depo: 'Depo',
  uretim_operatoru: 'Üretim Operatörü',
  uretim_sefi: 'Üretim Şefi',
  kalite: 'Kalite',
  bakim: 'Bakım',
  arge: 'Ar-Ge',
  ihracat: 'İhracat',
};

const byModule = (...modules: string[]) => ALL_CODES.filter((c) => modules.includes(c.split('.')[0] ?? ''));
const views = (...modules: string[]) => modules.map((m) => `${m}.view`);

/** packages/core/src/auth/rbac.ts `ROLE_PRESETS` ile birebir aynı — bkz. yukarıdaki not */
const ROLE_PRESETS: Record<string, string[]> = {
  admin: [...ALL_CODES],
  genel_mudur: [...ALL_CODES.filter((c) => !c.startsWith('admin.')), 'admin.audit'],
  muhasebe: [...byModule('accounting'), ...views('masterdata', 'stock', 'sales', 'purchasing', 'finance', 'export', 'cockpit'), 'masterdata.manage', 'finance.dunning'],
  finans: [...byModule('finance'), ...views('accounting', 'sales', 'purchasing', 'masterdata', 'cockpit', 'export'), 'accounting.reconcile'],
  satis: [...byModule('sales'), ...views('masterdata', 'stock', 'accounting', 'finance', 'export', 'cockpit'), 'accounting.invoice', 'finance.dunning'],
  satin_alma: [...byModule('purchasing'), ...views('masterdata', 'stock', 'quality', 'accounting', 'production'), 'masterdata.manage', 'accounting.invoice'],
  depo: [...byModule('stock'), ...views('masterdata', 'sales', 'purchasing', 'production', 'quality')],
  uretim_operatoru: ['production.view', 'production.operate', 'stock.view', 'maintenance.report', 'masterdata.view', 'quality.view'],
  uretim_sefi: [
    ...byModule('production'),
    'stock.view', 'stock.transfer', 'stock.count',
    ...views('masterdata', 'quality', 'maintenance', 'purchasing', 'sales', 'rnd'),
    'maintenance.report', 'quality.inspect',
  ],
  kalite: [...byModule('quality'), ...views('masterdata', 'stock', 'production', 'purchasing', 'rnd'), 'stock.transfer'],
  bakim: [...byModule('maintenance'), ...views('production', 'masterdata', 'stock')],
  arge: [...byModule('rnd'), ...views('masterdata', 'production', 'quality', 'stock'), 'masterdata.manage'],
  ihracat: [...byModule('export'), ...views('sales', 'stock', 'masterdata', 'accounting', 'finance'), 'sales.quote', 'sales.order', 'accounting.invoice'],
};
for (const r of Object.keys(ROLE_PRESETS)) ROLE_PRESETS[r] = Array.from(new Set(ROLE_PRESETS[r]));

/** docs/TEST-ACCOUNTS.md ile birebir aynı */
const TEST_USERS: Array<{ email: string; fullName: string; password: string; roles: string[]; pin?: string }> = [
  { email: 'admin@plantero.local', fullName: 'Sistem Yöneticisi', password: 'Plantero!2026', roles: ['admin'] },
  { email: 'gm@plantero.local', fullName: 'Genel Müdür', password: 'Plantero!2026', roles: ['genel_mudur'] },
  { email: 'muhasebe@plantero.local', fullName: 'Muhasebe Sorumlusu', password: 'Plantero!2026', roles: ['muhasebe', 'finans'] },
  { email: 'depo@plantero.local', fullName: 'Depo Sorumlusu', password: 'Plantero!2026', roles: ['depo'] },
  { email: 'operator@plantero.local', fullName: 'Üretim Operatörü', password: 'Plantero!2026', roles: ['uretim_operatoru'], pin: '1234' },
  { email: 'uretim@plantero.local', fullName: 'Üretim Şefi', password: 'Plantero!2026', roles: ['uretim_sefi'] },
  { email: 'satis@plantero.local', fullName: 'Satış Sorumlusu', password: 'Plantero!2026', roles: ['satis'] },
  { email: 'satinalma@plantero.local', fullName: 'Satın Alma Sorumlusu', password: 'Plantero!2026', roles: ['satin_alma'] },
  { email: 'kalite@plantero.local', fullName: 'Kalite Sorumlusu', password: 'Plantero!2026', roles: ['kalite'] },
  { email: 'bakim@plantero.local', fullName: 'Bakım Sorumlusu', password: 'Plantero!2026', roles: ['bakim'] },
  { email: 'arge@plantero.local', fullName: 'Ar-Ge Sorumlusu', password: 'Plantero!2026', roles: ['arge'] },
  { email: 'ihracat@plantero.local', fullName: 'İhracat Sorumlusu', password: 'Plantero!2026', roles: ['ihracat'] },
];

/** packages/core/src/sequences.ts `DOC_PREFIXES` ile aynı kod listesi */
const SEQUENCE_CODES = ['QT', 'SO', 'DN', 'INV', 'PINV', 'PAY', 'GR', 'PO', 'WO', 'TR', 'CNT', 'SCR', 'SM', 'JE', 'QC', 'RC', 'OPP', 'EXP', 'MO', 'RD'];

const SEED_YEAR = 2026;

export async function seedCore(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('core', 'roller ve izinler...');
  const roleIdByCode = new Map<string, string>();
  for (const code of Object.keys(ROLE_NAMES)) {
    await db
      .insert(roles)
      .values({ code, name: ROLE_NAMES[code] ?? code, isSystem: true })
      .onConflictDoUpdate({ target: roles.code, set: { name: ROLE_NAMES[code] ?? code } });
    const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
    if (row) roleIdByCode.set(code, row.id);
  }
  summary.add('roles', roleIdByCode.size);

  const permIdByCode = new Map<string, string>();
  for (const p of PERMISSIONS) {
    await db
      .insert(permissions)
      .values({ code: p.code, module: p.module, description: p.description })
      .onConflictDoUpdate({ target: permissions.code, set: { module: p.module, description: p.description } });
    const [row] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, p.code)).limit(1);
    if (row) permIdByCode.set(p.code, row.id);
  }
  summary.add('permissions', permIdByCode.size);

  let rolePermCount = 0;
  for (const [roleCode, codes] of Object.entries(ROLE_PRESETS)) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) continue;
    for (const code of codes) {
      const permissionId = permIdByCode.get(code);
      if (!permissionId) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
      rolePermCount++;
    }
  }
  summary.add('role_permissions', rolePermCount);

  log('core', 'test kullanıcıları...');
  let userCount = 0;
  let userRoleCount = 0;
  for (const u of TEST_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const pinHash = u.pin ? await bcrypt.hash(u.pin, 10) : null;
    await db
      .insert(users)
      .values({ email: u.email, fullName: u.fullName, passwordHash, pinHash, locale: 'tr' })
      .onConflictDoUpdate({ target: users.email, set: { fullName: u.fullName, passwordHash, pinHash } });
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
    if (!row) continue;
    userCount++;
    for (const roleCode of u.roles) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) continue;
      await db.insert(userRoles).values({ userId: row.id, roleId }).onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
      userRoleCount++;
    }
  }
  summary.add('users', userCount);
  summary.add('user_roles', userRoleCount);

  log('core', 'belge numara dizileri...');
  for (const code of SEQUENCE_CODES) {
    await db.insert(sequences).values({ code, prefix: code, year: SEED_YEAR, next: 1, padding: 6 }).onConflictDoNothing({ target: [sequences.code, sequences.year] });
  }
  summary.add('sequences', SEQUENCE_CODES.length);

  log('core', 'ayarlar...');
  const settingsRows: Array<{ key: string; value: unknown; description: string }> = [
    {
      key: 'company',
      description: 'Şirket kimliği (kapasite raporu + denetim raporu)',
      value: {
        legalName: 'Bigetaş Biyoteknoloji Anonim Şirketi (Tire Şubesi)',
        brand: 'Plantero',
        taxNumber: '1700727314',
        taxOffice: 'Tire Vergi Dairesi',
        mersis: '0170072731400002',
        tradeRegistryNo: '4201',
        chamberRegistryNo: '7581',
        productionAddress: 'Duatepe Mah. Küçük Sanayi Sitesi Sk. G-B Blok No: 14/19 Tire / İzmir',
        headOfficeAddress: 'Adalet Mh. Manas Blv. No:39/2511 Bayraklı / İzmir',
        website: 'https://plantero.co',
        currency: 'TRY',
        nace: ['10.39.02', '20.59.06', '20.59.14'],
        productionStartDate: '2026-07-20',
      },
    },
    {
      key: 'vat_rates',
      description: 'Varsayılan KDV oranları (%) — satış gıda %1, alış ağırlıklı %20',
      value: { salesFood: '1', purchaseDefault: '20', promoSales: '20', export: '0' },
    },
    { key: 'timezone', description: 'Ekran gösterim saat dilimi (veri UTC saklanır)', value: 'Europe/Istanbul' },
    { key: 'locale', description: 'Varsayılan arayüz dili', value: 'tr' },
  ];
  for (const s of settingsRows) {
    await db.insert(settings).values(s).onConflictDoUpdate({ target: settings.key, set: { value: s.value, description: s.description } });
  }
  summary.add('settings', settingsRows.length);
}
