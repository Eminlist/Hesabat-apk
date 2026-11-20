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
