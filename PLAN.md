# Hesabat — hazırlanacaq funksiyalar (Eminin seçimləri, 20.11.2026)

Qayda: yalnız aşağıdakılar edilir, özündən əlavə yoxdur. Hər mərhələ ayrıca APK
(versiya 3.1.3 Rev. NN, versionCode +1), GitHub Release ilə avtoyeniləmə gedir.

## Mərhələ 1 — HAZIR (3.1.3 Rev. 01)
- [x] Klaviatura ilk toxunuşda bağlanırdı (avtodoldurma) — düzəldi
- [x] Proqrama girəndə avtoyeniləmə (yükləyir, «Quraşdır» təklif edir)

## Mərhələ 2 — HAZIR (3.1.3 Rev. 02)
- [x] 61 Sifariş kartı: cihaz modeli, IMEI, nasazlıq, qəbul tarixi
- [x] 63 «Hazırdır» olanda müştəriyə hazır WhatsApp mesajı
- [x] 65 Zəmanət müddəti + bitmə xatırlatması
- [x] 69 IMEI/barkodu kamera ilə oxumaq
- [x] 89 Müştəri etibarlılığı (vaxtında ödəyir / gecikdirir)
- [x] 91 Borcun neçə gündür ödənmədiyi sayğacı
- [x] 93 Müştərinin bütün cihazları + müştəri tarixçəsi; seçəndə girib baxa bilsin
- [x] 113 Cihaz şifrəsi / kilid naxışı (gizli sahə)
- [x] 115 Hazır olub götürülməyən cihazlar üçün xatırlatma
- [x] 118 Sifariş nömrəsi (№0001) və nömrə ilə axtarış; müştəriyə gedən mesajda da sifariş nömrəsi
- [x] 123 Müştəriyə borc qəbzi (PDF) göndərmək
- [x] 142 Model adının avtomatik tamamlanması (öz siyahısından)
- [x] 143 Eyni IMEI yenidən gələndə əvvəlki təmirləri göstərmək
- [x] 145 Cihazla qəbul olunan əşyalar (qab, şarj, SIM, yaddaş kartı)
- [x] 146 Təhvildə «hər şey yoxlanıldı» təsdiqi

## Mərhələ 3 — HAZIR (3.1.3 Rev. 03)
- [x] 72 İşdə istifadə olunan hissənin qiyməti avtomatik xərcə düşsün
- [x] 74 Hissənin kimdən və neçəyə alındığı tarixçəsi
- [x] 75 Kassa: gün başı və gün sonu qalığı
- [x] 76 Ödəniş üsulu (nağd, kart, köçürmə) və hesabat
- [x] 78 Avans (ilkin ödəniş)
- [x] 83 Günün xülasəsi bildiriş kimi — saatı özü seçir və ya yazır
- [x] 99 Əsas ekran (panel): bu gün, həftə, borclar bir baxışda
- [x] 101 Məbləğ sahəsində kalkulyator (120+50 = 170)
- [x] 106 Dəyişikliklər jurnalı — Google hesabında (Drive sinxronunda) baza kimi saxlanılsın
- [x] 107 Yedək faylının parolla şifrələnməsi
- [x] 109 Köhnə dəftərdən / Excel-dən idxal
- [x] 221 Dillər: Azərbaycan, rus, türk, ingilis
- [x] 240 Aldığım borclar və kreditlər (faizi ilə qalıq)
- [x] 274 Aylıq «pul sağlamlığı» balı (0–100)
- [x] 278 Gizli bölmə: şəxsi xərclər yalnız PIN ilə görünür
- [x] Ümumidə xərc gəlirdən çox olanda nəticə QIRMIZI və MƏNFİ (−120 ₼)
- [x] Menyunun səliqəyə salınması: aşağıda Əsas · Müştərilər · (+) · Xərclər · Hesabat;
      Ayarlar yuxarı sağda ⚙️; Ayarlar bölmələrə: Hesab və sinxron, Təhlükəsizlik,
      Görünüş, Məlumat, Haqqında; vahid ikonlar və boşluqlar

Qeyd: proqram Eminin şəxsi qeydidir — aylıq gəlir və xərci bilmək üçün.

## Mərhələ 4 — HAZIR (3.1.3 Rev. 04): buxalter hesablaması
- [x] Kassa üsulu: gəlir = alınan pul (borc ödənişi + nağd iş + digər gəlir), ödənildiyi gün
- [x] Müştəri borcu gəlir sayılmır; ayrıca cəmi göstərilir
- [x] Xərclər (hissə, iş xərci, ziyan, xərclərim) gəlirdən çıxılır və göstərilir; mənfi qırmızı
- [x] Gecikən borc (ödəniş günü keçib): qırmızı, gün sayı ilə; proqramda xəbərdarlıq + gündə bir dəfə siyahı
- [x] Ödəniş üsulu: yalnız Nağd və Köçürmə
- [x] Kredit hissəsi ekranlardan çıxarıldı
- [x] Əsas ekran sadələşdi: Bu ay / Bu gün (gəlir, xərc, qalıq), borclar, sifarişlər

## Mərhələ 5 — HAZIR (3.1.3 Rev. 05): cibimə girən-çıxan hamısı
- [x] Borc verdiyim pul verildiyi günün xərci, qaytarılan pul qaytarıldığı günün gəliri
- [x] Borc verəndə «Nə vaxt qaytaracaq» tarixi; o gün telefon bildirişi; gecikəndə qırmızı + gün, proqramda xəbərdarlıq

## Mərhələ 6 — HAZIR (3.1.3 Rev. 06): yeni dizayn və yeni funksiyalar
- [x] Yeni dizayn: gündüz — firuzəyi balans kartı; gecə — qara-qızılı, azca dumanlı
- [x] İlk səhifə sadə: bu ayın qalığı (gəlir / xərc), bu gün, borc kartları, son əməliyyatlar
- [x] Ayarlar yuxarıda ⚙️ — bir siyahı, rəngli ikonlarla (dil, valyuta, tema, xülasə, yedək, PIN, fayllar, jurnal, zibil qutusu, məxfilik, versiya)
- [x] Zibil qutusu yalnız bir yerdə: Ayarlar
- [x] Məxfilik siyasəti proqramın içində açılır
- [x] Xərclər: kateqoriya üzrə dairəvi qrafik (faizlə)
- [x] Abunələr və aylıq ödənişlər: vaxtından əvvəl xatırlatma, «Ödədim» xərci yazır
- [x] Aylıq hesabat PDF
- [x] + → Xərc: bölmə adına görə avtomatik seçilir
- [x] + → Borc verdim (−) / Borc aldım (+, qaytarma tarixi və xatırlatma; qaytardığım −)
- [x] Hesabat: gün üzrə gəlir / xərc xətti qrafiki

## Mərhələ 7 — HAZIR (3.1.3 Rev. 07): hər dəyişiklik dərhal Google hesabına
- [x] Hər dəyişiklik 1 saniyə sonra Google hesabına gedir (əvvəl 3 san.)
- [x] Göndərilməmiş dəyişiklik yadda qalır (proqram bağlansa da) və proqramdan çıxanda, açanda dərhal göndərilir
- [x] İnternet yoxdursa: internet gələn kimi özü göndərir; arada özü təkrar yoxlayır (15 san. → 5 dəq.)
- [x] Ayarlar → Google yedək: «Göndərilir...» / «internet gələn kimi göndəriləcək» yazısı

## Mərhələ 8 — HAZIR (3.1.3 Rev. 08)
- [x] Borc verdiyim pul gündəlik/aylıq gəlir-xərcə qarışmır (nə verəndə xərc, nə qaytaranda gəlir);
      yalnız «Mənə borclu olanlar» bölməsində qalır — qaytarma günü, bildiriş, gecikmə, mesajlar əvvəlki kimi
- [x] İkinci proqram «Hesabatım» (az.usta.hesabatim): Hesabat-ın yanında ayrıca qurulur, öz məlumatı,
      öz Google faylı (Hesabatim-sinxron.json), öz avtoyeniləməsi (Hesabatim-*.apk)

## Mərhələ 9 — HAZIR (3.1.3 Rev. 09): hesablama ilk proqramdakı kimi (17.6)
- [x] Ustaya yazılan iş yazıldığı günün gəliridir; müştərinin ödənişi yenidən gəlir sayılmır
- [x] Gəlirim = yazılan iş + nağd işlər − hissə/xərc (ay üzrə ziyan da çıxılır); Xalis gəlir köhnədəki kimi
- [x] Xərclərim köhnədəki kimi ayrıca; Qalıq = Gəlirim − Xərclərim
- [x] Borc verdim və Borc aldım heç bir hesaba qarışmır — öz bölmələrində, qaytarma günü və bildirişlərlə
- [x] Aylıq PDF hesabat da eyni hesablama ilə

## Mərhələ 10 — HAZIR (3.1.3 Rev. 10)
- [x] Əsas ekran: ortada böyük «Bu ayın gəliri»; aşağıda Qalıq və Xərc

## İki proqram ayrıldı (20.11.2026)
- **Akif Hesabat** = «Hesabatım» (az.usta.hesabatim) — kod əsas qovluqda; APK: Hesabatim-*.apk
- **Emin Hesabat** = «Hesabat» (az.usta.hesab) — kod `emin/` qovluğunda (3.1.3 Rev. 07); APK: Hesabat-*.apk
- Hər birinin öz release-i var; proqram yalnız öz APK-sı olan release-i götürür, o birinin yeniləməsini almır
- Yeni versiya: yalnız dəyişən proqramın versionCode-u artırılır (hər iki proqram üçün nömrələr təkrarlanmır)
