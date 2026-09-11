# Railway'e kurulum (deneme ortamı)

Uygulama dört parçadan oluşur: **web** (Next.js), **worker** (BullMQ), **Postgres 16**, **Redis**. Hepsi tek Railway projesinde durur. Web ve worker aynı depodan, aynı `Dockerfile` ile derlenir; yalnızca başlangıç komutları farklıdır.

Depodaki dosyalar:
- `Dockerfile` — Node 22 + pnpm + Chromium (PDF üretimi) + üretim derlemesi.
- `railway.json` — web servisi (başlangıç: `scripts/deploy/start-web.sh`, sağlık ucu `/api/health`).
- `railway.worker.json` — worker servisi (başlangıç: `scripts/deploy/start-worker.sh`).
- `scripts/deploy/start-web.sh` — açılışta `packages/db/src/bootstrap.ts` çalışır: veritabanı boşsa şemayı uygular (`drizzle-kit push`) ve tek seferlik seed yükler; doluysa hiçbir şeye dokunmaz. Sonra `next start`.

## Adımlar

1. **Proje aç.** railway.com → New Project → *Deploy from GitHub repo* → `sushibibi-milkos-ops/Plantero_ERP`. Branch olarak `claude/plantero-digital-twin-dvh9ui` seçin (veya ana dala birleştirdiyseniz onu).
2. **Postgres ekle.** Proje panelinde *+ Create → Database → PostgreSQL*.
3. **Redis ekle.** *+ Create → Database → Redis*.
4. **Web servisi.** GitHub'dan gelen servisi seçin → *Settings*:
   - *Config-as-code* → `railway.json` (varsayılan zaten bu dosyayı bulur).
   - *Networking → Generate Domain* ile bir adres alın (`https://….up.railway.app`).
   - *Variables* sekmesine:
     ```
     DATABASE_URL = ${{Postgres.DATABASE_URL}}
     REDIS_URL    = ${{Redis.REDIS_URL}}
     ```
     (İki değer de Railway'in referans değişkenidir; panelde "Add Reference" ile seçilir.)
5. **Worker servisi.** *+ Create → GitHub Repo* ile aynı depoyu ikinci kez ekleyin → *Settings → Config-as-code* alanına `railway.worker.json` yazın. Variables aynı iki satır. Domain gerekmez.
6. **Değişiklikleri uygulayın.** Railway değişken ve ayar değişikliklerini bekletir: panelin üstünde beliren mor **Deploy** (ya da "Apply N changes") düğmesine basmadan hiçbir değişiklik canlıya geçmez. Günlükte `ECONNREFUSED` görüyorsanız neredeyse her zaman bu adım atlanmıştır.
7. **Deploy.** İlk derleme 8–12 dakika sürer (Chromium indirme + `next build`). Web servisi ayağa kalkarken günlükte sırayla `[bootstrap] veritabanı boş — şema uygulanıyor`, `[bootstrap] tam seed başlıyor`, `[bootstrap] hazır`, `[deploy] web başlıyor` görünür. Seed 1–2 dakika sürer; sağlık ucu 10 dakikaya kadar bekler.
8. **Giriş.** Domain'i açın → `admin@plantero.local` / `Plantero!2026`. Diğer hesaplar `docs/TEST-ACCOUNTS.md`.

## İsteğe bağlı değişkenler

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `ANTHROPIC_API_KEY` | boş | Boşsa AI özellikleri kural tabanlı çalışır. |
| `BIZIMHESAP_API_KEY`, `TRENDYOL_*`, `HEPSIBURADA_*`, `WHATSAPP_*`, `SMTP_URL`, `OPEN_BANKING_API_KEY` | boş | Boşsa ilgili entegrasyon sandbox modunda deterministik sahte veri üretir. |
| `TCMB_LIVE` | boş | `1` ise TCMB kuru gerçek servisten çekilir. |
| `PLANTERO_BOOTSTRAP` | `1` | `0` yapılırsa açılışta boş veritabanına şema/seed uygulanmaz. |

## Railway depoyu kendisi algıladıysa (Railpack)

Servisler kanvasta `@plantero/web` / `@plantero/worker` adıyla göründüyse Railway, `Dockerfile` yerine kendi algılayıcısıyla (Railpack) kurmuş ve her paketi kendi `start` betiğiyle başlatmıştır. Bu da çalışır: `apps/web` ve `apps/worker` paketlerinin `start` betikleri aynı `scripts/deploy/*.sh` dosyalarını çağırır, şema/seed bootstrap'ı yine koşar. Tek fark: bu yolda Chromium kurulmadığından PDF üretimi (satın alma siparişi, proforma, irsaliye PDF'i) çalışmaz. PDF gerekiyorsa servis → *Settings → Build → Builder* alanını **Dockerfile** yapın.

Teşhis için `https://<adres>/api/health` her zaman JSON döner: `db:false` → bağlantı yok (DATABASE_URL), `tables:0` → şema yok, `seeded:false` → seed yok.

## Notlar

- Seed yalnızca `users` tablosu boşken çalışır; yeniden başlatmalar veriyi silmez. Sıfırdan başlamak için Postgres servisini silip yeniden ekleyin.
- Şema yalnızca boş veritabanına uygulanır. Sonradan şema değişikliği gerekirse `DATABASE_URL` Railway'in genel adresine ayarlanıp `pnpm db:push` elle koşulur (TTY gerekir: drizzle-kit dolu tabloda onay sorar; TTY'siz ortamda sessizce yarım kalır). Canlı kullanımda sürümlü migration'a geçilmelidir.
- Worker olmadan da arayüz çalışır; gece mutabakat, pazaryeri senkronu, TCMB kuru, hatırlatmalar ve OEE günlük kaydı worker'a bağlıdır.
- Maliyet: Hobby planında (5 $/ay kredi dahil) deneme yükü genelde kredinin içinde kalır; web imajı büyüktür (Chromium), ilk derleme uzun sürer.

## Aynı imajı başka yerde çalıştırmak

```bash
docker build -t plantero .
docker run -e DATABASE_URL=… -e REDIS_URL=… -p 3000:3000 plantero                                   # web
docker run -e DATABASE_URL=… -e REDIS_URL=… plantero bash scripts/deploy/start-worker.sh              # worker
```
