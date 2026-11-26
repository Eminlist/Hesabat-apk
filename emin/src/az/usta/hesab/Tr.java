package az.usta.hesab;

import android.content.Context;

import java.util.HashMap;

/** Proqramın öz dili (Azərbaycan, Rus, Türk, İngilis): telefon tərəfindəki mətnlər. */
final class Tr {
    static Context app;

    private static final HashMap<String, String[]> M = new HashMap<>();

    private static void put(String az, String ru, String tr, String en) {
        M.put(az, new String[]{ru, tr, en});
    }

    static {
        put("Nə dəyişdi:", "Что изменилось:", "Neler değişti:", "What changed:");
        put("Google hesabı seçilməyib", "Аккаунт Google не выбран", "Google hesabı seçilmedi", "No Google account selected");
        put("Google icazə vermədi", "Google не дал разрешения", "Google izin vermedi", "Google did not grant permission");
        put("Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin", "Разрешение Google не получено — снова нажмите «Синхронизировать» и разрешите доступ", "Google izni verilmedi — tekrar «Senkronize et»e basın ve izin verin", "Google permission not granted — tap «Sync now» again and allow access");
        put("Tətbiq Google Cloud-da qeydiyyatdan keçməyib (paket adı və SHA-1 yoxlanmalıdır)", "Приложение не зарегистрировано в Google Cloud (проверьте имя пакета и SHA-1)", "Uygulama Google Cloud'da kayıtlı değil (paket adı ve SHA-1 kontrol edilmeli)", "The app is not registered in Google Cloud (check package name and SHA-1)");
        put("Google hesabına giriş alınmadı — telefonun Ayarlarında hesabı yoxlayın", "Не удалось войти в аккаунт Google — проверьте аккаунт в настройках телефона", "Google hesabına giriş yapılamadı — telefonun Ayarlarında hesabı kontrol edin", "Could not sign in to Google — check the account in phone Settings");
        put("Google xətası: ", "Ошибка Google: ", "Google hatası: ", "Google error: ");
        put("İnternet yoxdur", "Нет интернета", "İnternet yok", "No internet connection");
        put("Bu Google hesabına icazə yoxdur — hesabı yenidən seçin", "Нет доступа к этому аккаунту Google — выберите аккаунт заново", "Bu Google hesabına izin yok — hesabı yeniden seçin", "No access to this Google account — choose the account again");
        put("Google girişi alınmadı — hesabı yenidən seçin", "Вход в Google не выполнен — выберите аккаунт заново", "Google girişi yapılamadı — hesabı yeniden seçin", "Google sign-in failed — choose the account again");
        put("Google Cloud-da “Google Drive API” aktiv edilməyib", "В Google Cloud не включён «Google Drive API»", "Google Cloud'da “Google Drive API” etkin değil", "“Google Drive API” is not enabled in Google Cloud");
        put("Google Drive-da yer qalmayıb", "В Google Drive нет места", "Google Drive'da yer kalmadı", "Google Drive is full");
        put("Google icazə vermədi (403)", "Google не дал разрешения (403)", "Google izin vermedi (403)", "Google denied permission (403)");
        put("Google hazırda cavab vermir, bir az sonra yenə yoxlanacaq", "Google сейчас не отвечает, повторим чуть позже", "Google şu anda yanıt vermiyor, biraz sonra tekrar denenecek", "Google is not responding, will retry shortly");
        put("Google xətası (", "Ошибка Google (", "Google hatası (", "Google error (");
        put("Ödəniş günü çatıb", "Наступил день оплаты", "Ödeme günü geldi", "Payment day has come");
        put("Borc xatırlatmaları", "Напоминания о долгах", "Borç hatırlatmaları", "Debt reminders");
        put("Göndər", "Отправить", "Gönder", "Send");
        put("Davam etmək üçün kilidi açın", "Разблокируйте, чтобы продолжить", "Devam etmek için kilidi açın", "Unlock to continue");
        put("Fayla icazə itib, faylı yenidən seçin", "Доступ к файлу потерян, выберите файл заново", "Dosya izni kayboldu, dosyayı yeniden seçin", "File access lost, choose the file again");
        put("Drive-dakı fayl tapılmadı (silinib?) — yenidən seçin", "Файл в Drive не найден (удалён?) — выберите заново", "Drive'daki dosya bulunamadı (silindi mi?) — yeniden seçin", "File not found in Drive (deleted?) — choose again");
        put("Hesab seçilmədi", "Аккаунт не выбран", "Hesap seçilmedi", "No account chosen");
        put("Xəta: ", "Ошибка: ", "Hata: ", "Error: ");
        put("Şəkil açılmadı", "Не удалось открыть изображение", "Resim açılamadı", "Could not open the image");
        put("Ehtiyat nüsxəni göndər", "Отправить резервную копию", "Yedeği gönder", "Send backup");
        put("Kontaktlar açılmadı", "Не удалось открыть контакты", "Kişiler açılamadı", "Could not open contacts");
        put("Google hesabı seçmək mümkün olmadı", "Не удалось выбрать аккаунт Google", "Google hesabı seçilemedi", "Could not choose a Google account");
        put("Şəkil seçin", "Выберите изображение", "Resim seçin", "Choose an image");
        put("Qalereya açılmadı", "Не удалось открыть галерею", "Galeri açılamadı", "Could not open the gallery");
        put("Faylı göndər", "Отправить файл", "Dosyayı gönder", "Send file");
        put("Barmaq izi ilə açın", "Разблокируйте отпечатком пальца", "Parmak izi ile açın", "Unlock with fingerprint");
        put("PIN kod", "PIN-код", "PIN kodu", "PIN code");
        put("PIN-i sıfırlamaq üçün telefonun kilidini açın", "Разблокируйте телефон, чтобы сбросить PIN", "PIN'i sıfırlamak için telefonun kilidini açın", "Unlock the phone to reset the PIN");
        put("Bu günkü gəlir", "Доход за сегодня", "Bugünkü gelir", "Today's income");
        put("Günün xülasəsi", "Итоги дня", "Günün özeti", "Day summary");
        put("Bu gün heç nə yazılmayıb", "Сегодня ничего не записано", "Bugün hiçbir şey yazılmadı", "Nothing recorded today");
        put("Yeni versiya hazırdır", "Новая версия готова", "Yeni sürüm hazır", "A new version is ready");
        put("\n\nYükləndi. Quraşdırmaq üçün «Quraşdır» basın. Məlumatlarınız silinmir.", "\n\nЗагружено. Нажмите «Установить». Ваши данные не удаляются.", "\n\nİndirildi. Kurmak için «Kur»a basın. Verileriniz silinmez.", "\n\nDownloaded. Tap “Install”. Your data is not deleted.");
        put("Quraşdır", "Установить", "Kur", "Install");
        put("Sonra", "Позже", "Sonra", "Later");
        put("İcazəni açın, sonra proqrama qayıdın", "Включите разрешение и вернитесь в приложение", "İzni açın, sonra uygulamaya dönün", "Allow the permission, then return to the app");
        put("Google hesabı qoşulmayıb", "Аккаунт Google не подключён", "Google hesabı bağlı değil", "No Google account is linked");
        put("Bu, proqrama qoşulu Google hesabı deyil", "Это не тот аккаунт Google, что подключён к приложению", "Bu, uygulamaya bağlı Google hesabı değil", "This is not the Google account linked to the app");
        put("Google girişi alınmadı", "Вход в Google не выполнен", "Google girişi yapılamadı", "Google sign-in failed");
        put("Quraşdırmaq alınmadı", "Не удалось установить", "Kurulamadı", "Installation failed");
    }

    static String lang(Context c) {
        return c.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "az");
    }

    static String t(Context c, String az) {
        if (c == null) c = app;
        String l = c == null ? "az" : lang(c);
        String[] v = M.get(az);
        if (v == null || "az".equals(l)) return az;
        return "ru".equals(l) ? v[0] : "tr".equals(l) ? v[1] : "en".equals(l) ? v[2] : az;
    }
}
