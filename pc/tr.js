'use strict';
// Proqramın öz dili (Azərbaycan, Rus, Türk, İngilis): kompüter tərəfindəki mətnlər (telefondakı Tr.java ilə eyni)
const M = {
 "Nə dəyişdi:": [
  "Что изменилось:",
  "Neler değişti:",
  "What changed:"
 ],
 "Google hesabı seçilməyib": [
  "Аккаунт Google не выбран",
  "Google hesabı seçilmedi",
  "No Google account selected"
 ],
 "Google icazə vermədi": [
  "Google не дал разрешения",
  "Google izin vermedi",
  "Google did not grant permission"
 ],
 "Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin": [
  "Разрешение Google не получено — снова нажмите «Синхронизировать» и разрешите доступ",
  "Google izni verilmedi — tekrar «Senkronize et»e basın ve izin verin",
  "Google permission not granted — tap «Sync now» again and allow access"
 ],
 "Tətbiq Google Cloud-da qeydiyyatdan keçməyib (paket adı və SHA-1 yoxlanmalıdır)": [
  "Приложение не зарегистрировано в Google Cloud (проверьте имя пакета и SHA-1)",
  "Uygulama Google Cloud'da kayıtlı değil (paket adı ve SHA-1 kontrol edilmeli)",
  "The app is not registered in Google Cloud (check package name and SHA-1)"
 ],
 "Google hesabına giriş alınmadı — telefonun Ayarlarında hesabı yoxlayın": [
  "Не удалось войти в аккаунт Google — проверьте аккаунт в настройках телефона",
  "Google hesabına giriş yapılamadı — telefonun Ayarlarında hesabı kontrol edin",
  "Could not sign in to Google — check the account in phone Settings"
 ],
 "Google xətası: ": [
  "Ошибка Google: ",
  "Google hatası: ",
  "Google error: "
 ],
 "İnternet yoxdur": [
  "Нет интернета",
  "İnternet yok",
  "No internet connection"
 ],
 "Bu Google hesabına icazə yoxdur — hesabı yenidən seçin": [
  "Нет доступа к этому аккаунту Google — выберите аккаунт заново",
  "Bu Google hesabına izin yok — hesabı yeniden seçin",
  "No access to this Google account — choose the account again"
 ],
 "Google girişi alınmadı — hesabı yenidən seçin": [
  "Вход в Google не выполнен — выберите аккаунт заново",
  "Google girişi yapılamadı — hesabı yeniden seçin",
  "Google sign-in failed — choose the account again"
 ],
 "Google Cloud-da “Google Drive API” aktiv edilməyib": [
  "В Google Cloud не включён «Google Drive API»",
  "Google Cloud'da “Google Drive API” etkin değil",
  "“Google Drive API” is not enabled in Google Cloud"
 ],
 "Google Drive-da yer qalmayıb": [
  "В Google Drive нет места",
  "Google Drive'da yer kalmadı",
  "Google Drive is full"
 ],
 "Google icazə vermədi (403)": [
  "Google не дал разрешения (403)",
  "Google izin vermedi (403)",
  "Google denied permission (403)"
 ],
 "Google hazırda cavab vermir, bir az sonra yenə yoxlanacaq": [
  "Google сейчас не отвечает, повторим чуть позже",
  "Google şu anda yanıt vermiyor, biraz sonra tekrar denenecek",
  "Google is not responding, will retry shortly"
 ],
 "Google xətası (": [
  "Ошибка Google (",
  "Google hatası (",
  "Google error ("
 ],
 "Ödəniş günü çatıb": [
  "Наступил день оплаты",
  "Ödeme günü geldi",
  "Payment day has come"
 ],
 "Borc xatırlatmaları": [
  "Напоминания о долгах",
  "Borç hatırlatmaları",
  "Debt reminders"
 ],
 "Göndər": [
  "Отправить",
  "Gönder",
  "Send"
 ],
 "Davam etmək üçün kilidi açın": [
  "Разблокируйте, чтобы продолжить",
  "Devam etmek için kilidi açın",
  "Unlock to continue"
 ],
 "Fayla icazə itib, faylı yenidən seçin": [
  "Доступ к файлу потерян, выберите файл заново",
  "Dosya izni kayboldu, dosyayı yeniden seçin",
  "File access lost, choose the file again"
 ],
 "Drive-dakı fayl tapılmadı (silinib?) — yenidən seçin": [
  "Файл в Drive не найден (удалён?) — выберите заново",
  "Drive'daki dosya bulunamadı (silindi mi?) — yeniden seçin",
  "File not found in Drive (deleted?) — choose again"
 ],
 "Hesab seçilmədi": [
  "Аккаунт не выбран",
  "Hesap seçilmedi",
  "No account chosen"
 ],
 "Xəta: ": [
  "Ошибка: ",
  "Hata: ",
  "Error: "
 ],
 "Şəkil açılmadı": [
  "Не удалось открыть изображение",
  "Resim açılamadı",
  "Could not open the image"
 ],
 "Ehtiyat nüsxəni göndər": [
  "Отправить резервную копию",
  "Yedeği gönder",
  "Send backup"
 ],
 "Kontaktlar açılmadı": [
  "Не удалось открыть контакты",
  "Kişiler açılamadı",
  "Could not open contacts"
 ],
 "Google hesabı seçmək mümkün olmadı": [
  "Не удалось выбрать аккаунт Google",
  "Google hesabı seçilemedi",
  "Could not choose a Google account"
 ],
 "Şəkil seçin": [
  "Выберите изображение",
  "Resim seçin",
  "Choose an image"
 ],
 "Qalereya açılmadı": [
  "Не удалось открыть галерею",
  "Galeri açılamadı",
  "Could not open the gallery"
 ],
 "Faylı göndər": [
  "Отправить файл",
  "Dosyayı gönder",
  "Send file"
 ],
 "Barmaq izi ilə açın": [
  "Разблокируйте отпечатком пальца",
  "Parmak izi ile açın",
  "Unlock with fingerprint"
 ],
 "PIN kod": [
  "PIN-код",
  "PIN kodu",
  "PIN code"
 ],
 "PIN-i sıfırlamaq üçün telefonun kilidini açın": [
  "Разблокируйте телефон, чтобы сбросить PIN",
  "PIN'i sıfırlamak için telefonun kilidini açın",
  "Unlock the phone to reset the PIN"
 ],
 "Bu günkü gəlir": [
  "Доход за сегодня",
  "Bugünkü gelir",
  "Today's income"
 ],
 "Günün xülasəsi": [
  "Итоги дня",
  "Günün özeti",
  "Day summary"
 ],
 "Bu gün heç nə yazılmayıb": [
  "Сегодня ничего не записано",
  "Bugün hiçbir şey yazılmadı",
  "Nothing recorded today"
 ],
 "Yeni versiya hazırdır": [
  "Новая версия готова",
  "Yeni sürüm hazır",
  "A new version is ready"
 ],
 "\n\nYükləndi. Quraşdırmaq üçün «Quraşdır» basın. Məlumatlarınız silinmir.": [
  "\n\nЗагружено. Нажмите «Установить». Ваши данные не удаляются.",
  "\n\nİndirildi. Kurmak için «Kur»a basın. Verileriniz silinmez.",
  "\n\nDownloaded. Tap “Install”. Your data is not deleted."
 ],
 "Quraşdır": [
  "Установить",
  "Kur",
  "Install"
 ],
 "Sonra": [
  "Позже",
  "Sonra",
  "Later"
 ],
 "İcazəni açın, sonra proqrama qayıdın": [
  "Включите разрешение и вернитесь в приложение",
  "İzni açın, sonra uygulamaya dönün",
  "Allow the permission, then return to the app"
 ],
 "Quraşdırmaq alınmadı": [
  "Не удалось установить",
  "Kurulamadı",
  "Installation failed"
 ],
 "Kompüterdə kontaktlar yoxdur": [
  "На компьютере нет контактов",
  "Bilgisayarda kişiler yok",
  "There are no contacts on the computer"
 ],
 "Google girişi qurulmayıb (proqram Google Cloud-da qeyd olunmayıb)": [
  "Вход Google не настроен (приложение не зарегистрировано в Google Cloud)",
  "Google girişi kurulmadı (uygulama Google Cloud’da kayıtlı değil)",
  "Google sign-in is not set up (the app is not registered in Google Cloud)"
 ],
 "Brauzerdə Google hesabınızı seçin və icazə verin": [
  "Выберите аккаунт Google в браузере и разрешите доступ",
  "Tarayıcıda Google hesabınızı seçin ve izin verin",
  "Choose your Google account in the browser and allow access"
 ],
 "Giriş tamamlandı. Bu pəncərəni bağlayıb My Finance™-ə qayıdın.": [
  "Вход выполнен. Закройте это окно и вернитесь в My Finance™.",
  "Giriş tamamlandı. Bu pencereyi kapatıp My Finance™’a dönün.",
  "Signed in. Close this window and return to My Finance™."
 ],
 "Aç": [
  "Открыть",
  "Aç",
  "Open"
 ],
 "Çıxış": [
  "Выход",
  "Çıkış",
  "Quit"
 ],
 "Proqram arxada işləyir — xatırlatmalar gələcək": [
  "Программа работает в фоне — напоминания будут приходить",
  "Program arka planda çalışıyor — hatırlatmalar gelecek",
  "The app keeps running in the background — reminders will arrive"
 ],
 "Fayl yadda saxlandı": [
  "Файл сохранён",
  "Dosya kaydedildi",
  "File saved"
 ],
 "Yadda saxla": [
  "Сохранить",
  "Kaydet",
  "Save"
 ]
};
let lang = 'az';
function setLang(l) { lang = l || 'az'; }
function t(az) { const v = M[az]; if (!v || lang === 'az') return az; return lang === 'ru' ? v[0] : lang === 'tr' ? v[1] : lang === 'en' ? v[2] : az; }
module.exports = { t, setLang };
