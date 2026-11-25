# TODO - AVK Sinema (eski ad: AVK Studio)
**Son güncelleme:** 25 Kasım 2026
**Devam eden iş:** AVK Sinema v0.1.8 yayında (25 Kas 2026, 3 platform dosyası yüklü). Üyelerden hata raporu/geri bildirim bekleniyor; gerçek üretimle (kredi) test sırada.

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

## 16 Kas düzeltmeleri (v0.1.4, YAYINDA)
- v0.1.3 (yayında): config.json kurulum paketine eklendi (Windows'ta "config.json eksik" hatası)
- Flow'da aynı referans görsel tekrar yüklenmiyor, "Yüklemeler"den seçiliyor → `lib/flow.js` (addUploaded)
- Video yakalama yeniden yazıldı: Flow ızgarasında video `<video>` değil `flow-video-tile` küçük resmi; yeni karo bulunup tıklanır, "Medyayı indir > 720p" ile indirilir (404 ve "bitti ama program bekliyor" hataları) → `lib/flow.js`
- ChatGPT ücretsiz tek görsel: ilk görsel gönderilir + uyarı notu; teknik hata metinleri sadeleştirildi → `lib/chat.js`, `main.js` (friendly), `src/app.js` (freeNote)
- Hazır karakter kiti: yeni kit üretilmez, sadece görsel tarif edilir (describeCharacter) → `lib/templates.js`, `src/app.js`
- Zaman Yolculuğu: klipler 15 sn; uzunluk açılır menü (15 sn-15 dk + özel saniye); 15 sn parçalara bölme + son klip kalanı (planClips); 5+ klipte önce özet sonra 4'erli gruplar → `src/app.js`, `lib/templates.js`
- Klip inceleme ekranında toplam süre + kredi tahmini (15 sn ≈ 60 kredi), 8+ klipte onay
- Hazır karakter kiti: buton "İleri", ChatGPT/Flow açılmadan doğrudan sonraki adım (not kutusu karakter tarifi olur) → `src/app.js` characterStep

## 16 Kas: Mac "damaged" hatası (YAYINDA, sayfa güncellendi)
- Bir Mac üyesi "AVK Sinema is damaged and can't be opened" hatası aldı (DMG + program). Sebep: Mac build imzasız (`package.json` mac `identity: null`, Apple imzası/notarization yok); internetten inen imzasız program karantinaya alınır, Apple çipli Mac "damaged" der. Dosya bozuk değil. Hata resimleri: `AVK-Studio Hatalar/`
- Çözüm talimatı: Applications'a sürükle, Terminal'de `xattr -cr /Applications/AVK\ Sinema.app`, yeniden aç. DMG açılmazsa DMG'ye de `xattr -cr`.
- Talimat eklendi → `docs/index.html` (yeni kutu), `AVK Sinema Kurulum Kilavuzu.md` (3. adım). GitHub'a gönderildi (commit d6ae51f).

## 17 Kas: v0.1.5 (YAYINDA, commit 539bbea)
- Üyelerden gelen hata1 (zaman aşımı, muhtemelen Windows) ve hata2 (Mac, Flow bağlantısında takılma) → `AVK-Studio Hatalar/`. Kesin neden bilinmiyor.
- Hata kutusuna "Hata raporunu kopyala" düğmesi (sürüm, sistem, tarayıcı, son adımlar) → `main.js` (report), `preload.js`, `src/app.js` (errBox)
- Zaman aşımı mesajına "Son adım" eklendi → `main.js`
- Flow bağlantısı: 3 dk bekleme, 45 sn/2 dk sonra yardım yazısı, "Vazgeç" düğmesi, hangi tarayıcının açıldığı logda → `lib/flow.js`, `lib/browser.js`, `src/app.js`
- video44 geri bildirimi (Zaman Yolculuğu 15+15: geçiş kötü, ses yok, kişiler/arabalar karıştı, 29 sn): geçiş hayalet görüntü yapıyordu → çapraz geçiş kaldırıldı, kesintisiz bağlama, süre kaybı yok → `lib/stitch.js`; prompta karakter/araç "kimlik listesi", önceki klibin devamı, her klipte Türkçe konuşma, hikayenin kendi dönemi kuralları → `lib/templates.js` (HIST_RULES)
- Ayarlar'a "Şifre değiştir" (mevcut şifre doğrulanır) → `lib/supabase.js`, `main.js`, `src/app.js` (passwordBox). Gerçek hesapla denenmedi
- Sıradaki: üyelerden "Hata raporunu kopyala" raporu iste; Mac üyeler yeni DMG'yi elle indirmeli (imzasız)

## 18 Kas: Manuel üye ekleme (yerelde, v0.1.6'ya DAHİL EDİLMEDİ)
- Yönetici paneline "Manuel ekle" sekmesi: e-posta + isim yazılıp tek üye eklenir; mevcut `admin_import` (deactivateMissing=false) kullanılır, Supabase değişikliği yok → `src/app.js` (viewAdmin)
- Kullanıcı denedi, "olmuş" dedi. Üyeler görmesin diye acele yok; sonraki sürümle (v0.1.6) yayınlanabilir

## 20 Kas: v0.1.6 (YAYINDA)
- Bir üye karakter kiti oluştururken "Bad control character in string literal in JSON" hatası aldı (hata resmi: `AVK-Studio Hatalar/claude-sorunu.png`). Sebep: ChatGPT cevabındaki JSON metni içinde gerçek satır sonu/sekme vardı. Çözüm: okunamazsa kontrol karakterleri kaçışlanıp yeniden denenir → `lib/chat.js` (extractJson, fixJsonStrings)
- Sürüm 0.1.6, etiket `v0.1.6` gönderildi, GitHub derlemesi başarılı. Gerçek hesapla denenmedi, sadece örnek metinle test edildi
- Yalnızca `lib/chat.js` + `package.json` yayınlandı; "Manuel ekle" sekmesi (`src/app.js`) hâlâ yayınlanmadı

## 24-25 Kas: v0.1.7 (YAYINDA)
- GitHub'da Mac arm64 derlemesi 2 kez "runner bulunamadı" (GitHub kapasite sorunu, kod değil) ile düştü. Çözüm: arm64 DMG kullanıcının Mac'inde derlendi (`npx electron-builder --mac --arm64 --publish never`), `gh release upload` ile yüklendi, `gh release edit --draft=false --latest` ile yayınlandı. Tekrar olursa aynı yol
- Bir üye (hata resmi: `AVK-Studio Hatalar/Ekran Resmi 2026-11-23 20.57.18.png`) önceki karakter görselini referans verip yeni karakter üretti; Flow üretti ama AVK "Flow zaman aşımı: sonuç gelmedi" dedi, işlem takıldı. Kesin neden bilinmiyor (gerçek hesapla denenmedi)
- Düzeltme → `lib/flow.js`: görsel yakalama `data:` adreslerini de sayar, en az 256 px, aynı görselin farklı boyut adresi "yeni" sayılmaz (SNAP, seenBase); indirme başarısızsa sayfa oturumuyla yedek deneme (download); zaman aşımında "Teşhis: sayfada X görsel" satırı loga yazılır
- "Manuel ekle" sekmesi (`src/app.js`) bu sürümle yayınlandı
- Üyeye geçici çözüm: Flow'dan görseli elle indirip hazır görsel yolunu kullanmak
- Başka üyelerin "indirme hatası" resmi henüz gelmedi; gelirse `AVK-Studio Hatalar/`'a atılacak

## 25 Kas: video üretiminde 1 saat takılma (v0.1.8, YAYINDA)
- Üye storyboard sonrası "Flow: video üretiliyor" ekranında 1 saat kaldı (hata resmi: `AVK-Studio Hatalar/Screenshot_3.png`). Sebep: bekleme döngüsündeki sayfa sorguları süresiz bekleyebiliyordu (ör. Flow uyarı penceresi açınca), 12 dk sınırı hiç işlemedi; "Durdur" da üretim sırasında çalışmıyordu
- Düzeltme: sorgulara 20 sn sınır (guard), genel bekçi (12 dk + 6 dk sonra kesin hata), Durdur üretim sırasında anında çalışır, sitenin uyarı pencereleri otomatik kapanır, video zaman aşımında otomatik yeniden üretim yok (boşa kredi) → `lib/flow.js`, `lib/browser.js`, `lib/pipeline.js`
- v0.1.8 yayınlandı (25 Kas), 3 platform derlemesi başarılı. Gerçek üretimle denenmedi

## Sıradaki adımlar
- [ ] Aynı hatayı alan üyeden "Hata raporunu kopyala" çıktısı iste (Teşhis satırı nedeni gösterir)
- [ ] İsteğe bağlı (v0.1.6): açık kalan programda periyodik güncelleme kontrolü (şu an yalnızca açılışta kontrol ediyor, `main.js` checkUpdate)
- [ ] Şifre değiştirmeyi gerçek hesapla dene
- [ ] Üyelere duyur: şifre değiştirme, Flow "Vazgeç", hata raporu düğmesi, Zaman Yolculuğu'nda konuşma yazmak
- [ ] Skool duyurusuna/kılavuza Mac "damaged" çözümünü de ekle (Mac kullanıcıları için)
- [ ] Kredi gerektiren gerçek test (onay al): UGC 1 klip (video yakalama), Ürün Tanıtımı 2 sahne (referans yeniden kullanımı + indirme), Zaman Yolculuğu 30 sn
- [ ] Admin panelinden Skool CSV'sini yükle (yüklenmeden üyeler kayıt olamaz)
- [ ] Kılavuzu ve indirme linkini Skool'da paylaş
- [ ] Kredi harcamayan eksik testler: Claude seçeneği, referans fotoğrafla karakter kiti, bildirim sesi
- [ ] Kredi gerektiren testler (onay al): yatay video üretimi, Sinematik uçtan uca (15 sn video + devam storyboard'u), Ürün Tanıtımı, Zaman Yolculuğu
- [ ] Windows'ta gerçek kurulum testi (elimizde Windows yok; ilk Windows üyesinden geri bildirim)
- [ ] Sıfır bir Mac'te (Chrome yok) gömülü Chromium ile Flow girişi testi
- [ ] İsteğe bağlı: Mac imzalama (Apple Developer, 99$/yıl) ve Windows imzası; uyarı kalkar, Mac otomatik güncelleme çalışır; "damaged" hatasını da kökten çözer

## Önemli kararlar / kısıtlar
- Flow ızgarasında video `<video>` değil `flow-video-tile` küçük resmidir. İndirme: karoya tıkla > "Medyayı indir" > 720p (ücretsiz). 1080p/4K yükseltilmiş seçenekler kredi harcar, dokunulmaz.
- Zaman Yolculuğu: tek klip en fazla 15 sn; toplam süre planClips ile bölünür, son klip en az 4 sn. Yumuşak geçiş klip başına ~0,4 sn kısaltır.
- ChatGPT ücretsiz sürümü tek görsel kabul eder: ilk görsel gönderilir, uyarı notu gösterilir.
- Flow düğmeleri sabit etiketlerle bulunur (TR/EN). Flow arayüzü değişirse `lib/flow.js` içindeki SEL tablosu güncellenir, yeni sürüm yayınlanır.
- Video modeli sabitlenmez (Flow'un varsayılanı kullanılır). Süre: normal 8 sn, Sinematik 15 sn (≈60 kredi).
- Her ücretli üretimden önce kredi tahmini + kullanıcı onayı şart.
- Metinlerde şapkalı â yok, üyelere "siz" hitabı.
- Test sırasında aynı anda birden fazla Chrome/süreç açma: profil kilitlenir (`pkill -f "AVK Studio/browser-profile"` ile temizle).
- Yeni sürüm yayını: `package.json` sürümünü artır, `git tag vX.Y.Z && git push origin vX.Y.Z` (akış kendisi derler ve yayınlar).
- Kullanıcı verileri `~/Library/Application Support/AVK Studio` (ad değişse de aynı kalır).
