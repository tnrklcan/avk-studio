# TODO - AVK Sinema (eski ad: AVK Studio)
**Son güncelleme:** 16 Kasım 2026
**Devam eden iş:** AVK Sinema masaüstü programı (Mac + Windows) yayında (v0.1.2). Üyelere duyuru ve ilk geri bildirimler bekleniyor.

## Yapıldı
- Program (Electron): giriş, otomatik Flow/ChatGPT bağlantısı (kalibrasyonsuz), 4 mod, Videolarım (silme + toplu render), bildirimler, geri/adım gezinme, dikey/yatay seçimi → `AVK-Studio/` (main.js, lib/, src/)
- Supabase (giriş, üye listesi, CSV içe aktarma, admin) → `supabase/schema.sql`, `config.json`. Admin: aivideokulubu@gmail.com
- Sinematik: storyboard görseli, karakter + storyboard referansı (Flow kütüphanesinden), 15 sn video, devam storyboard'u (öncekinin devamı), Render (yumuşak geçiş)
- Gömülü Chromium (Mac), Windows'ta Edge; ffmpeg gömülü
- GitHub: `github.com/tnrklcan/avk-studio`, otomatik derleme + yayın (etiket `v*` gönderilince)
- İndirme sayfası: https://tnrklcan.github.io/avk-studio/ (docs/)
- Direkt linkler: `.../releases/latest/download/AVK-Sinema-Windows.exe`, `AVK-Sinema-Mac-arm64.dmg`, `AVK-Sinema-Mac-x64.dmg`
- Üye kılavuzu → `AVK-Studio/AVK Sinema Kurulum Kilavuzu.md`
- Yeni ikon (logodaki turuncu play), ad "AVK Sinema"

## 16 Kas düzeltmeleri (v0.1.4, yerelde, YAYINLANMADI)
- v0.1.3 (yayında): config.json kurulum paketine eklendi (Windows'ta "config.json eksik" hatası)
- Flow'da aynı referans görsel tekrar yüklenmiyor, "Yüklemeler"den seçiliyor → `lib/flow.js` (addUploaded)
- Video yakalama yeniden yazıldı: Flow ızgarasında video `<video>` değil `flow-video-tile` küçük resmi; yeni karo bulunup tıklanır, "Medyayı indir > 720p" ile indirilir (404 ve "bitti ama program bekliyor" hataları) → `lib/flow.js`
- ChatGPT ücretsiz tek görsel: ilk görsel gönderilir + uyarı notu; teknik hata metinleri sadeleştirildi → `lib/chat.js`, `main.js` (friendly), `src/app.js` (freeNote)
- Hazır karakter kiti: yeni kit üretilmez, sadece görsel tarif edilir (describeCharacter) → `lib/templates.js`, `src/app.js`
- Zaman Yolculuğu: klipler 15 sn; uzunluk açılır menü (15 sn-15 dk + özel saniye); 15 sn parçalara bölme + son klip kalanı (planClips); 5+ klipte önce özet sonra 4'erli gruplar → `src/app.js`, `lib/templates.js`
- Klip inceleme ekranında toplam süre + kredi tahmini (15 sn ≈ 60 kredi), 8+ klipte onay

## Sıradaki adımlar
- [ ] v0.1.4'ü yayınla (onay bekliyor): sürüm zaten 0.1.4, `git commit` + `git tag v0.1.4` + push
- [ ] Kredi gerektiren gerçek test (onay al): UGC 1 klip (video yakalama), Ürün Tanıtımı 2 sahne (referans yeniden kullanımı + indirme), Zaman Yolculuğu 30 sn
- [ ] Admin panelinden Skool CSV'sini yükle (yüklenmeden üyeler kayıt olamaz)
- [ ] Kılavuzu ve indirme linkini Skool'da paylaş
- [ ] Kredi harcamayan eksik testler: Claude seçeneği, referans fotoğrafla karakter kiti, bildirim sesi
- [ ] Kredi gerektiren testler (onay al): yatay video üretimi, Sinematik uçtan uca (15 sn video + devam storyboard'u), Ürün Tanıtımı, Zaman Yolculuğu
- [ ] Windows'ta gerçek kurulum testi (elimizde Windows yok; ilk Windows üyesinden geri bildirim)
- [ ] Sıfır bir Mac'te (Chrome yok) gömülü Chromium ile Flow girişi testi
- [ ] İsteğe bağlı: Mac imzalama (Apple Developer, 99$/yıl) ve Windows imzası; uyarı kalkar, Mac otomatik güncelleme çalışır

## Önemli kararlar / kısıtlar
- Flow düğmeleri sabit etiketlerle bulunur (TR/EN). Flow arayüzü değişirse `lib/flow.js` içindeki SEL tablosu güncellenir, yeni sürüm yayınlanır.
- Video modeli sabitlenmez (Flow'un varsayılanı kullanılır). Süre: normal 8 sn, Sinematik 15 sn (≈60 kredi).
- Her ücretli üretimden önce kredi tahmini + kullanıcı onayı şart.
- Metinlerde şapkalı â yok, üyelere "siz" hitabı.
- Test sırasında aynı anda birden fazla Chrome/süreç açma: profil kilitlenir (`pkill -f "AVK Studio/browser-profile"` ile temizle).
- Yeni sürüm yayını: `package.json` sürümünü artır, `git tag vX.Y.Z && git push origin vX.Y.Z` (akış kendisi derler ve yayınlar).
- Kullanıcı verileri `~/Library/Application Support/AVK Studio` (ad değişse de aynı kalır).
