package az.usta.hesab;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Checks the public repo Eminlist/Hesabat-apk for a newer release each time the app is opened,
 * downloads the APK in the background and then offers «Quraşdır». Android always asks the user to
 * confirm an install itself; that one tap is the only step left to the user.
 */
public class Updater {

    private static final String LATEST = "https://api.github.com/repos/Eminlist/Hesabat-apk/releases/latest";
    private static final String FILE = "Hesabat-update.apk";
    private static boolean running;
    private static long lastCheck;
    /** Waiting for the user to allow installs in Android settings; installs when they come back. */
    private File waiting;

    private final Activity act;

    public Updater(Activity act) {
        this.act = act;
    }

    private int myCode() {
        try {
            return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return Integer.MAX_VALUE;
        }
    }

    /** Release files: Hesabat-3.1.3-RevNN.apk for Hesabat, Hesabatim-3.1.3-RevNN.apk for Hesabatım. */
    private String apkPrefix() {
        return "az.usta.hesab".equals(act.getPackageName()) ? "Hesabat-" : "Hesabatim-";
    }

    private File apkFile() {
        File dir = new File(act.getCacheDir(), "share");
        dir.mkdirs();
        return new File(dir, FILE);
    }

    /** Runs on every app start; quiet when offline or when there is nothing new. */
    public void check() {
        // every time the app is entered, but at most once in 30 minutes
        long now = System.currentTimeMillis();
        if (running || now - lastCheck < 30 * 60 * 1000L) return;
        running = true;
        lastCheck = now;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    work();
                } catch (Exception ignored) {
                } finally {
                    running = false;
                }
            }
        }).start();
    }

    private void work() throws Exception {
        JSONObject rel = new JSONObject(get(LATEST));
        // release tags are "r<versionCode>", e.g. r168
        String tag = rel.optString("tag_name", "");
        if (!tag.startsWith("r")) return;
        int code = Integer.parseInt(tag.substring(1));
        final File f = apkFile();
        if (code <= myCode()) {
            f.delete(); // an old download is no longer needed
            return;
        }
        String url = null;
        long size = -1;
        JSONArray assets = rel.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject a = assets.getJSONObject(i);
            String an = a.optString("name");
            if (an.endsWith(".apk") && an.startsWith(apkPrefix())) {
                url = a.optString("browser_download_url");
                size = a.optLong("size", -1);
                break;
            }
        }
        if (url == null) return;
        if (!(f.exists() && f.length() == size)) download(url, f);
        if (size > 0 && f.length() != size) return;
        final String name = rel.optString("name", tag);
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                offer(name, f);
            }
        });
    }

    private void offer(String name, final File f) {
        if (act.isFinishing()) return;
        new AlertDialog.Builder(act)
                .setTitle("Yeni versiya hazırdır")
                .setMessage(name + "\n\nYükləndi. Quraşdırmaq üçün «Quraşdır» basın. Məlumatlarınız silinmir.")
                .setPositiveButton("Quraşdır", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        install(f);
                    }
                })
                .setNegativeButton("Sonra", null)
                .show();
    }

    private void install(File f) {
        try {
            if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
                // first time only: Android asks to allow installs from this app
                waiting = f;
                act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + act.getPackageName())));
                android.widget.Toast.makeText(act, "İcazəni açın, sonra proqrama qayıdın", android.widget.Toast.LENGTH_LONG).show();
                return;
            }
            Uri uri = Uri.parse("content://" + ShareProvider.authority(act) + "/" + f.getName());
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(i);
        } catch (Exception e) {
            android.widget.Toast.makeText(act, "Quraşdırmaq alınmadı", android.widget.Toast.LENGTH_LONG).show();
        }
    }

    /** Called from onResume: back from the permission screen with installs allowed → install now. */
    public void resume() {
        if (waiting == null) return;
        File f = waiting;
        waiting = null;
        if (Build.VERSION.SDK_INT >= 26 && act.getPackageManager().canRequestPackageInstalls() && f.exists()) install(f);
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setRequestProperty("User-Agent", "Hesabat-app");
        return c;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private static void download(String url, File f) throws Exception {
        // GitHub sends the file from another host: follow the redirect by hand (HTTPS → HTTPS)
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = open(url);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept", "application/octet-stream");
            int rc = c.getResponseCode();
            if (rc >= 300 && rc < 400) {
                url = c.getHeaderField("Location");
                c.disconnect();
                if (url == null) throw new Exception("no redirect");
                continue;
            }
            if (rc != 200) {
                c.disconnect();
                throw new Exception("HTTP " + rc);
            }
            File tmp = new File(f.getPath() + ".part");
            InputStream in = c.getInputStream();
            OutputStream out = new FileOutputStream(tmp);
            try {
                byte[] b = new byte[65536];
                int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            } finally {
                out.close();
                c.disconnect();
            }
            if (!tmp.renameTo(f)) throw new Exception("rename");
            return;
        }
        throw new Exception("too many redirects");
    }
}
