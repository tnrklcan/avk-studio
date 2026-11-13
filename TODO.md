# TODO - AVK Studio
**Son güncelleme:** 14 Kasım 2026
**Devam eden iş:** Electron masaüstü programı (Mac+Windows). İskelet, arayüz, giriş, admin, 4 mod, otomasyon kodu yazıldı.
## Yapıldı
- Arayüz + 4 mod sihirbazı + admin paneli → src/app.js, styles.css
- Supabase şeması (üye listesi, CSV içe aktarma, uzaktan ayar) → supabase/schema.sql
- Tarayıcı otomasyonu + kalibrasyon → lib/browser.js, flow.js, chat.js
- Prompt kalıpları (Sinematik Dersler) → lib/templates.js
- ffmpeg birleştirme → lib/stitch.js; GitHub Actions yayın → .github/workflows/release.yml
## Sıradaki adımlar
- [ ] Kullanıcıdan: Supabase URL + anon key, GitHub repo adı -> config.json ve package.json (publish.owner)
- [ ] Gerçek Flow/ChatGPT hesabıyla canlı test (kalibrasyon adımlarını Flow arayüzüne göre düzelt)
- [ ] Mac/Windows kurulum paketi + Mac "sağ tık > Aç" kılavuzu
- [ ] Üyelere kurulum kılavuzu (PDF/metin, "siz" dili)
## Önemli kararlar
- Supabase (ücretsiz), ilk girişte üye kendi şifresini belirler, sohbet üyenin kendi ChatGPT/Claude hesabı, Mac imzasız (kılavuz)
- Metinlerde şapkalı â yok, üyelere "siz" hitabı
