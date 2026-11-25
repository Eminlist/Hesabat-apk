package az.usta.hesab;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.app.backup.BackupManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.database.Cursor;
import android.provider.ContactsContract;
import org.json.JSONObject;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

public class MainActivity extends Activity {

    private static final int REQ_IMPORT = 2;
    private static final int REQ_CONTACT = 3;
    private static final int REQ_ACCOUNT = 4;
    private static final int REQ_UNLOCK = 5;
    private static final int REQ_RESET_PIN = 6;
    private static final int REQ_PHOTO = 7;
    private static final int REQ_NOTIF = 8;
    private static final int REQ_CAMERA = 9;
    /** The page asked for the camera (IMEI scan) before Android's permission was given. */
    private android.webkit.PermissionRequest camAsk;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private WebView web;
    private GoogleSync gsync;
    private android.net.ConnectivityManager.NetworkCallback netCb;
    /** Kept while a printout is being prepared, so it isn't thrown away halfway. */
    /** Where a home-screen shortcut asked to go ("mine" or "cat:<id>"); handed to the page once. */
    private boolean locked = true;
    private boolean unlocking;
    /** Set while a screen we opened ourselves (picker, share...) is on top, so returning doesn't lock. */
    private boolean internalNav;
    private Updater updater;
    /** When we went behind a screen we opened ourselves; coming back much later counts as leaving the app. */
    private long navStoppedAt;
    /** Page calls made before index.html finished loading wait here (e.g. a picker result after the app was restarted). */
    private boolean pageReady;
    private final java.util.ArrayList<String> pendingJs = new java.util.ArrayList<>();
    /** Shaking the phone hides every amount (Ayarlar → Silkələyəndə gizlət). */
    private android.hardware.SensorManager sensors;
    private long lastShake;
    private final android.hardware.SensorEventListener shakeListener = new android.hardware.SensorEventListener() {
        @Override
        public void onSensorChanged(android.hardware.SensorEvent e) {
            float x = e.values[0], y = e.values[1], z = e.values[2];
            double g = Math.sqrt(x * x + y * y + z * z) / android.hardware.SensorManager.GRAVITY_EARTH;
            long now = System.currentTimeMillis();
            if (g > 2.6 && now - lastShake > 1500) {
                lastShake = now;
                js("window.onShake && window.onShake()");
            }
        }

        @Override
        public void onAccuracyChanged(android.hardware.Sensor s, int a) {
        }
    };

    private void mailFile(String name, String mime, String to, String subject) {
        Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(name));
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_STREAM, uri);
        if (to != null && !to.isEmpty()) i.putExtra(Intent.EXTRA_EMAIL, new String[]{to});
        i.putExtra(Intent.EXTRA_SUBJECT, subject);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent gm = new Intent(i).setPackage("com.google.android.gm");
        internalNav = true;
        try {
            startActivity(gm);
        } catch (Exception e) {
            startActivity(Intent.createChooser(i, Tr.t(MainActivity.this, "Göndər")));
        }
    }

    private void applySecure() {
        if (appPrefs().getBoolean("secure", false)) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
    }

    private void shakeOnOff(boolean on) {
        if (sensors == null) sensors = (android.hardware.SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensors == null) return;
        sensors.unregisterListener(shakeListener);
        android.hardware.Sensor acc = sensors.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER);
        if (on && acc != null) sensors.registerListener(shakeListener, acc, android.hardware.SensorManager.SENSOR_DELAY_UI);
    }
    /** The fingerprint dialog is on screen / was already offered since the app was last left. */
    private boolean bioShowing, bioAsked;
    /** Locks the app whenever the phone's screen goes off. */
    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (unlocking || !(pinSet() || lockOn())) return;
            locked = true;
            bioAsked = false;
            if (pinSet()) js("window.showPinLock && window.showPinLock(false)");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 21) {
            w.setStatusBarColor(Color.parseColor("#F4F7F9"));
            w.setNavigationBarColor(Color.parseColor("#FFFFFF"));
        }
        if (Build.VERSION.SDK_INT >= 26) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        } else if (Build.VERSION.SDK_INT >= 23) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        Tr.app = getApplicationContext();
        gsync = new GoogleSync(this);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        // Android's autofill (Google/Samsung) grabbed every name/phone/card field on its first tap:
        // the keyboard opened and closed at once and the field had to be tapped again. The app's
        // own forms need no autofill, so the WebView is taken out of it completely.
        s.setSaveFormData(false);
        if (Build.VERSION.SDK_INT >= 26) {
            web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            w.getDecorView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (pageReady) return;
                pageReady = true;
                for (String code : pendingJs) web.evaluateJavascript(code, null);
                pendingJs.clear();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        // the page's own alert/confirm boxes, without the "file://" title the WebView puts on them
        web.setWebChromeClient(new WebChromeClient() {
            // the IMEI scanner uses the camera inside the page
            @Override
            public void onPermissionRequest(final android.webkit.PermissionRequest r) {
                boolean video = false;
                for (String res : r.getResources()) if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) video = true;
                if (!video) { r.deny(); return; }
                final String[] want = {android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE};
                if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    r.grant(want);
                } else {
                    camAsk = r;
                    internalNav = true; // the permission dialog must not lock the app
                    requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_CAMERA);
                }
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int w) {
                                result.confirm();
                            }
                        })
                        .setOnCancelListener(new android.content.DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(android.content.DialogInterface d) {
                                result.confirm();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int w) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int w) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new android.content.DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(android.content.DialogInterface d) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

            // Rev. 09: a text question (the reason of a change), answered in the app's own dialog
            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String def, final android.webkit.JsPromptResult result) {
                final android.widget.EditText in = new android.widget.EditText(MainActivity.this);
                in.setSingleLine(true);
                if (def != null) in.setText(def);
                android.widget.FrameLayout box = new android.widget.FrameLayout(MainActivity.this);
                int pd = (int) (20 * getResources().getDisplayMetrics().density);
                box.setPadding(pd, pd / 2, pd, 0);
                box.addView(in);
                final android.app.AlertDialog dlg = new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(box)
                        .setPositiveButton(android.R.string.ok, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int w) {
                                result.confirm(in.getText().toString());
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int w) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new android.content.DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(android.content.DialogInterface d) {
                                result.cancel();
                            }
                        })
                        .create();
                dlg.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
                dlg.show();
                in.requestFocus();
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        // ana ekran qısayolu ilə açılanda həmin bölmə açılır (səhifə hazır olanda)
        String go0 = getIntent().getStringExtra("go");
        if (go0 != null) js("window.onLaunchTarget && window.onLaunchTarget(" + JSONObject.quote(go0) + ")");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
        registerReceiver(screenOff, new IntentFilter(Intent.ACTION_SCREEN_OFF));
        // internet came back: changes that could not be sent go to Google at once
        try {
            netCb = new android.net.ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(android.net.Network n) {
                    js("window.onOnline && window.onOnline()");
                }
            };
            ((android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).registerDefaultNetworkCallback(netCb);
        } catch (Exception ignored) {
            netCb = null;
        }
        // a newer version on GitHub is fetched quietly and offered with «Quraşdır»
        updater = new Updater(this);
    }

    /** A new card operation came from the bank's notification: the page writes it in now. */
    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(screenOff);
        } catch (Exception ignored) {
        }
        try {
            if (netCb != null) ((android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCb);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String go = intent.getStringExtra("go");
        if (go != null) js("window.onLaunchTarget && window.onLaunchTarget(" + JSONObject.quote(go) + ")");
    }

    /** Leaving the app: a change still waiting is sent to Google right now, not later. */
    @Override
    protected void onPause() {
        super.onPause();
        shakeOnOff(false);
        js("window.onAppPause && window.onAppPause()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        SyncJob.appVisible = true;
        applySecure();
        shakeOnOff(appPrefs().getBoolean("shake", false));
        // back on top: a share sheet or picker we opened is gone (some never stop us, so onRestart doesn't run)
        internalNav = false;
        if (updater != null) { updater.resume(); updater.check(); }
        // a locked app shows no data in the recent-apps screen (screenshots still work)
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(!(pinSet() || lockOn()));
        if (locked && pinSet()) {
            // the page draws its own PIN screen; offer the fingerprint once. Closing the dialog brings
            // us back here, and asking again then would never let the PIN pad be used.
            js("window.showPinLock && window.showPinLock(" + !bioAsked + ")");
            return;
        }
        if (lockOn() && locked) {
            if (!unlocking) askUnlock();
            return;
        }
        js("window.onAppResume && window.onAppResume()");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code != REQ_CAMERA || camAsk == null) return;
        if (res.length > 0 && res[0] == android.content.pm.PackageManager.PERMISSION_GRANTED)
            camAsk.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else camAsk.deny();
        camAsk = null;
    }

    @Override
    protected void onStop() {
        super.onStop();
        // proqramdan çıxdı: Google-a getməmiş dəyişiklik varsa, internet olan kimi arxada yüklənir
        SyncJob.appVisible = false;
        SyncJob.schedule(this);
        if (internalNav) navStoppedAt = System.currentTimeMillis();
        if (unlocking || internalNav || !(pinSet() || lockOn())) return;
        bioAsked = false;
        // chosen in Ayarlar: stay open until the phone itself is locked (screenOff does it then)
        if (lockOnScreen()) return;
        // the user left the app: lock right away and draw the PIN screen while we're in the background
        locked = true;
        if (pinSet()) js("window.showPinLock && window.showPinLock(false)");
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        // left through a picker/share screen and came back minutes later (e.g. via the launcher): lock as if the app was left
        if (internalNav && navStoppedAt > 0 && !lockOnScreen() && System.currentTimeMillis() - navStoppedAt > 3 * 60 * 1000 && (pinSet() || lockOn())) {
            locked = true;
            if (pinSet()) js("window.showPinLock && window.showPinLock(false)");
        }
        navStoppedAt = 0;
        internalNav = false;
    }

    @Override
    public void startActivityForResult(Intent intent, int requestCode) {
        if (requestCode != REQ_UNLOCK && requestCode != REQ_RESET_PIN) internalNav = true;
        super.startActivityForResult(intent, requestCode);
    }

    @Override
    public void startActivity(Intent intent) {
        internalNav = true;
        super.startActivity(intent);
    }

    private SharedPreferences appPrefs() {
        return getSharedPreferences("app", MODE_PRIVATE);
    }

    private boolean lockOn() {
        return appPrefs().getBoolean("lock", false);
    }

    private boolean lockOnScreen() {
        return appPrefs().getBoolean("lockOnScreen", false);
    }

    private boolean pinSet() {
        return appPrefs().contains("pinHash");
    }

    private static String sha256(String text) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(UTF8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @SuppressWarnings("deprecation")
    private Intent phoneLockIntent(String title) {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        return km == null ? null : km.createConfirmDeviceCredentialIntent("My Finance™", title);
    }

    /** Hides the data and asks for the phone's own screen lock (PIN, pattern, fingerprint). */
    private void askUnlock() {
        Intent i = phoneLockIntent(Tr.t(MainActivity.this, "Davam etmək üçün kilidi açın"));
        if (i == null) {
            // the phone has no screen lock any more; don't lock the user out
            locked = false;
            return;
        }
        web.setVisibility(View.INVISIBLE);
        unlocking = true;
        startActivityForResult(i, REQ_UNLOCK);
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (pageReady) web.evaluateJavascript(code, null);
                else pendingJs.add(code);
            }
        });
    }

    private void syncStatus(String state, String msg) {
        js("window.onSyncStatus(" + JSONObject.quote(state) + "," + JSONObject.quote(msg) + ")");
    }

    private String explain(Exception e) {
        if (e instanceof GoogleSync.SyncError) return e.getMessage();
        String m = String.valueOf(e.getMessage());
        if (e instanceof SecurityException) return Tr.t(MainActivity.this, "Fayla icazə itib, faylı yenidən seçin");
        if (e instanceof java.io.FileNotFoundException) return Tr.t(MainActivity.this, "Drive-dakı fayl tapılmadı (silinib?) — yenidən seçin");
        if (m.contains("network") || m.contains("Network")) return Tr.t(MainActivity.this, "İnternet yoxdur");
        return m;
    }

    private void runSync(final Runnable r) {
        new Thread(r).start();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? String(window.onBack()) : 'false'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (v == null || !v.contains("true")) finish();
            }
        });
    }

    private File dataFile() {
        return new File(getFilesDir(), "data.json");
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return new String(bo.toByteArray(), UTF8);
    }

    private static void writeAll(OutputStream out, String s) throws Exception {
        out.write(s.getBytes(UTF8));
        out.flush();
        out.close();
    }

    /** A message from the Java side goes through the page, so it comes out in the chosen language. */
    private void pageToast(String msg) {
        js("toast(" + JSONObject.quote(msg) + ")");
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_RESET_PIN) {
            unlocking = false;
            if (resultCode == RESULT_OK) {
                appPrefs().edit().remove("pinHash").remove("pinSalt").remove("pinLen").apply();
                locked = false;
                js("window.onPinReset && window.onPinReset()");
            }
            return;
        }
        if (requestCode == REQ_UNLOCK) {
            unlocking = false;
            if (resultCode == RESULT_OK) {
                locked = false;
                web.setVisibility(View.VISIBLE);
            } else {
                finish();
            }
            return;
        }
        if (requestCode == REQ_ACCOUNT) {
            String name = resultCode == RESULT_OK && data != null ? data.getStringExtra(android.accounts.AccountManager.KEY_ACCOUNT_NAME) : null;
            if (name == null || name.isEmpty()) {
                pageToast(Tr.t(MainActivity.this, "Hesab seçilmədi"));
                return;
            }
            gsync.link(name);
            gsync.setNeedLink(true); // ilk qoşulma: əvvəlcə Google-dakı telefona gəlir
            js("window.onSyncLinked(" + JSONObject.quote(name) + ")");
            return;
        }
        if (requestCode == REQ_PHOTO) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) photoPicked(data.getData());
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            if (requestCode == REQ_CONTACT) {
                String[] cols = {ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER};
                Cursor c = getContentResolver().query(uri, cols, null, null, null);
                if (c != null) {
                    if (c.moveToFirst()) {
                        String name = c.getString(0), phone = c.getString(1);
                        js("window.onContactPicked(" + JSONObject.quote(name == null ? "" : name)
                                + "," + JSONObject.quote(phone == null ? "" : phone) + ")");
                    }
                    c.close();
                }
            } else if (requestCode == REQ_IMPORT) {
                InputStream in = getContentResolver().openInputStream(uri);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                byte[] all = bo.toByteArray();
                if (all.length > 1 && all[0] == 'P' && all[1] == 'K') // a zip: Excel .xlsx
                    js("window.onImportedXlsx(" + org.json.JSONObject.quote(android.util.Base64.encodeToString(all, android.util.Base64.NO_WRAP)) + ")");
                else
                    js("window.onImported(" + org.json.JSONObject.quote(new String(all, "UTF-8")) + ")");
            }
        } catch (Exception e) {
            pageToast(Tr.t(MainActivity.this, "Xəta: ") + e.getMessage());
        }
    }

    /** Reads the picked photo, turns it upright and makes it small (longest side 800 px, JPEG). */
    private void photoPicked(final Uri uri) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    InputStream in = getContentResolver().openInputStream(uri);
                    android.graphics.BitmapFactory.decodeStream(in, null, o);
                    in.close();
                    int big = Math.max(o.outWidth, o.outHeight);
                    if (big <= 0) throw new Exception("not an image");
                    int sample = 1;
                    while (big / (sample * 2) >= 800) sample *= 2;
                    o = new android.graphics.BitmapFactory.Options();
                    o.inSampleSize = sample;
                    in = getContentResolver().openInputStream(uri);
                    android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeStream(in, null, o);
                    in.close();
                    if (bm == null) throw new Exception("not an image");
                    int rot = 0;
                    try {
                        in = getContentResolver().openInputStream(uri);
                        int or = new android.media.ExifInterface(in).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL);
                        in.close();
                        rot = or == android.media.ExifInterface.ORIENTATION_ROTATE_90 ? 90 : or == android.media.ExifInterface.ORIENTATION_ROTATE_180 ? 180
                                : or == android.media.ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
                    } catch (Exception ignored) {
                    }
                    float k = Math.min(1f, 800f / Math.max(bm.getWidth(), bm.getHeight()));
                    android.graphics.Matrix mx = new android.graphics.Matrix();
                    mx.postScale(k, k);
                    if (rot != 0) mx.postRotate(rot);
                    android.graphics.Bitmap out = android.graphics.Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), mx, true);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    out.compress(android.graphics.Bitmap.CompressFormat.JPEG, 60, bo);
                    String url = "data:image/jpeg;base64," + android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP);
                    js("window.onPhotoPicked(" + JSONObject.quote(url) + ")");
                } catch (Exception e) {
                    pageToast(Tr.t(MainActivity.this, "Şəkil açılmadı"));
                }
            }
        }).start();
    }

    private class Bridge {
        /** Proqramın dili: telefon tərəfindəki mətnlər (bildiriş kanalı, yeniləmə pəncərəsi və s.) də bu dildə olur. */
        @JavascriptInterface
        public void setLang(String lang) {
            appPrefs().edit().putString("lang", lang == null ? "az" : lang).apply();
        }

        /** Köhnə Emin Hesabatın məlumatı (borclar köçürülsün deyə): ayrıca saxlanmış fayl, yoxdursa köhnə formatda qalan əsas fayl. */
        @JavascriptInterface
        public String loadOld() {
            for (File f : new File[]{new File(getFilesDir(), "hesabat-kohne.json"), dataFile(), new File(getFilesDir(), "data.prev.json")}) {
                if (!f.exists()) continue;
                try {
                    String s = readAll(new FileInputStream(f)).trim();
                    if (s.startsWith("{") && s.contains("\"loans\"") && !s.contains("\"mf\":")) return s;
                } catch (Exception ignored) {
                }
            }
            return "";
        }

        /** Köhnə Hesabatın məlumat faylı bir dəfə ayrıca saxlanılır (hesabat-kohne.json), My Finance™ ondan təmiz başlayır. */
        @JavascriptInterface
        public void archiveOld() {
            try {
                File f = dataFile();
                File old = new File(getFilesDir(), "hesabat-kohne.json");
                if (!f.exists() || old.exists()) return;
                FileInputStream in = new FileInputStream(f);
                FileOutputStream out = new FileOutputStream(old);
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
                in.close();
                out.close();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String load() {
            // fall back to the previous copy when the main file is missing or cut short (e.g. power lost while saving)
            boolean any = false;
            for (File f : new File[]{dataFile(), new File(getFilesDir(), "data.prev.json"), new File(getFilesDir(), "data.json.tmp")}) {
                if (!f.exists()) continue;
                any = true;
                try {
                    String s = readAll(new FileInputStream(f)).trim();
                    // only a file that reads as whole JSON; a damaged one falls back to the previous copy
                    if (s.startsWith("{") && s.endsWith("}")) {
                        new JSONObject(s);
                        return s;
                    }
                } catch (Exception ignored) {
                }
            }
            // fayl var, amma heç biri oxunmur: proqram boş baza ilə başlamasın, üstünə yazmasın
            return any ? "!BROKEN" : "";
        }

        @JavascriptInterface
        public boolean save(String json) {
            try {
                File f = dataFile();
                File tmp = new File(getFilesDir(), "data.json.tmp");
                FileOutputStream out = new FileOutputStream(tmp);
                out.write(json.getBytes(UTF8));
                out.flush();
                out.getFD().sync(); // on disk before the old file is moved away
                out.close();
                if (f.exists()) {
                    File prev = new File(getFilesDir(), "data.prev.json");
                    prev.delete();
                    f.renameTo(prev);
                }
                if (!tmp.renameTo(f)) return false;
                new BackupManager(MainActivity.this).dataChanged();
                SyncJob.changed(MainActivity.this); // Google növbəsinə düşür
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void shareFile(String json, String name) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                for (File old : dir.listFiles()) old.delete();
                writeAll(new FileOutputStream(new File(dir, name)), json);
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(name));
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.putExtra(Intent.EXTRA_SUBJECT, name);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(i, Tr.t(MainActivity.this, "Ehtiyat nüsxəni göndər")));
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Xəta: ") + e.getMessage());
            }
        }

        @JavascriptInterface
        public void importFile() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            startActivityForResult(i, REQ_IMPORT);
        }

        @JavascriptInterface
        public void pickContact() {
            try {
                startActivityForResult(new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI), REQ_CONTACT);
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Kontaktlar açılmadı"));
            }
        }

        /** Opens the phone's own window for choosing a Google account. */
        @JavascriptInterface
        public void syncLink() {
            try {
                startActivityForResult(GoogleSync.chooseIntent(), REQ_ACCOUNT);
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Google hesabı seçmək mümkün olmadı"));
            }
        }

        @JavascriptInterface
        public void syncUnlink() {
            gsync.unlink();
        }

        /** İlk qoşulmadan sonra Google-dakı baza hələ telefona gəlməyibsə true. */
        @JavascriptInterface
        public boolean needLink() {
            return gsync.needLink();
        }

        @JavascriptInterface
        public void linkDone() {
            gsync.setNeedLink(false);
        }

        @JavascriptInterface
        public String syncLinked() {
            return gsync.account();
        }

        /** Downloads the Google copy and hands it to window.onSyncRemote for merging. */
        @JavascriptInterface
        public void syncStart() {
            if (gsync.account().isEmpty()) return;
            runSync(new Runnable() {
                @Override
                public void run() {
                    try {
                        String remote = gsync.download();
                        js("window.onSyncRemote(" + JSONObject.quote(remote) + ")");
                    } catch (Exception e) {
                        syncStatus("error", explain(e));
                    }
                }
            });
        }

        @JavascriptInterface
        public void syncUpload(final String json) {
            if (gsync.account().isEmpty()) return;
            final long seq = SyncJob.seq(MainActivity.this);
            runSync(new Runnable() {
                @Override
                public void run() {
                    try {
                        gsync.upload(json);
                        SyncJob.uploaded(MainActivity.this, seq);
                        syncStatus("ok", "");
                    } catch (Exception e) {
                        syncStatus("error", explain(e));
                    }
                }
            });
        }

        /** A photo for a customer: the gallery opens, the picked photo comes back small (window.onPhotoPicked). */
        @JavascriptInterface
        public void pickPhoto() {
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(Intent.createChooser(i, Tr.t(MainActivity.this, "Şəkil seçin")), REQ_PHOTO);
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Qalereya açılmadı"));
            }
        }

        /** Shares a file made by the page (e.g. the Excel report), given as base64. */
        @JavascriptInterface
        public void shareBase64(String b64, String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                FileOutputStream out = new FileOutputStream(new File(dir, name));
                out.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
                out.close();
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(name));
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.putExtra(Intent.EXTRA_SUBJECT, name);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(i, Tr.t(MainActivity.this, "Faylı göndər")));
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Xəta: ") + e.getMessage());
            }
        }

        /** «Günün xülasəsi» time ("HH:MM" or "" = off). */
        @JavascriptInterface
        public void setSummaryTime(String time) {
            SummaryReceiver.setTime(MainActivity.this, time);
            if (time != null && !time.isEmpty() && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                internalNav = true;
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
            }
        }

        @JavascriptInterface
        public String summaryTime() {
            return SummaryReceiver.prefs(MainActivity.this).getString("time", "");
        }

        /** Today's figures for the summary notification. */
        @JavascriptInterface
        public void setSummary(String date, String title, String text, String empty) {
            SummaryReceiver.setData(MainActivity.this, date, title, text, empty);
        }

        /** Debts with a payment day; the daily reminder reads this list. */
        @JavascriptInterface
        public void setDueList(String json) {
            DueReceiver.saveList(MainActivity.this, json);
            if (!json.contains("\"line\"")) return;
            DueReceiver.schedule(MainActivity.this, false);
            // Android 13+ asks once whether the app may show notifications
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED
                    && !appPrefs().getBoolean("askedNotif", false)) {
                appPrefs().edit().putBoolean("askedNotif", true).apply();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
                    }
                });
            }
        }

        /** Today's income for the home-screen widget. */
        @JavascriptInterface
        public void setWidget(String date, String label, String amount, String zero) {
            TodayWidget.save(MainActivity.this, date, label, amount, zero);
        }

        @JavascriptInterface
        public void haptic() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                }
            });
        }

        @JavascriptInterface
        public boolean bioAvailable() {
            if (Build.VERSION.SDK_INT >= 29) {
                android.hardware.biometrics.BiometricManager bm = getSystemService(android.hardware.biometrics.BiometricManager.class);
                return bm != null && bm.canAuthenticate() == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            }
            return Build.VERSION.SDK_INT >= 28 && getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_FINGERPRINT);
        }

        @JavascriptInterface
        public boolean bioEnabled() {
            return appPrefs().getBoolean("bio", false);
        }

        @JavascriptInterface
        public void setBio(boolean on) {
            appPrefs().edit().putBoolean("bio", on).apply();
        }

        /** Shows the system fingerprint dialog; success unlocks and calls window.onBioOk. */
        @JavascriptInterface
        public void bioPrompt() {
            if (Build.VERSION.SDK_INT < 28) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (bioShowing) return;
                    try {
                        java.util.concurrent.Executor ex = getMainExecutor();
                        android.hardware.biometrics.BiometricPrompt bp = new android.hardware.biometrics.BiometricPrompt.Builder(MainActivity.this)
                                .setTitle("My Finance™")
                                .setSubtitle(Tr.t(MainActivity.this, "Barmaq izi ilə açın"))
                                .setNegativeButton(Tr.t(MainActivity.this, "PIN kod"), ex, new android.content.DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(android.content.DialogInterface d, int w) {
                                        bioShowing = false;
                                    }
                                })
                                .build();
                        bioShowing = true;
                        bioAsked = true;
                        bp.authenticate(new android.os.CancellationSignal(), ex,
                                new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                                    @Override
                                    public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r) {
                                        bioShowing = false;
                                        locked = false;
                                        js("window.onBioOk && window.onBioOk()");
                                    }

                                    @Override
                                    public void onAuthenticationError(int code, CharSequence msg) {
                                        // closed, cancelled or locked out: the PIN pad stays usable
                                        bioShowing = false;
                                    }
                                });
                    } catch (Exception ignored) {
                        // no usable sensor: the PIN pad stays
                        bioShowing = false;
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean pinSet() {
            return MainActivity.this.pinSet();
        }

        @JavascriptInterface
        public int pinLength() {
            return appPrefs().getInt("pinLen", 4);
        }

        @JavascriptInterface
        public void setPin(String pin) {
            String salt = Long.toHexString(new java.security.SecureRandom().nextLong());
            appPrefs().edit().putString("pinSalt", salt).putString("pinHash", sha256(salt + pin))
                    .putInt("pinLen", pin.length()).putBoolean("lock", false).apply();
            locked = false;
        }

        @JavascriptInterface
        public boolean checkPin(String pin) {
            String salt = appPrefs().getString("pinSalt", "");
            boolean ok = sha256(salt + pin).equals(appPrefs().getString("pinHash", null));
            if (ok) locked = false;
            return ok;
        }

        /** Giriş kilidi Google sinxronuna gedir (yalnız duz + heş, kodun özü yox). */
        @JavascriptInterface
        public String pinBlob() {
            String h = appPrefs().getString("pinHash", null);
            if (h == null) return "";
            try {
                return new JSONObject().put("salt", appPrefs().getString("pinSalt", "")).put("hash", h)
                        .put("len", appPrefs().getInt("pinLen", 4)).toString();
            } catch (Exception e) {
                return "";
            }
        }

        /** Google-dakı kilid bu telefona qoyulur ("" = kilid götürülür). */
        @JavascriptInterface
        public void setPinBlob(String json) {
            try {
                if (json == null || json.isEmpty()) {
                    appPrefs().edit().remove("pinHash").remove("pinSalt").remove("pinLen").apply();
                    return;
                }
                JSONObject o = new JSONObject(json);
                appPrefs().edit().putString("pinSalt", o.optString("salt", "")).putString("pinHash", o.getString("hash"))
                        .putInt("pinLen", o.optInt("len", 4)).apply();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void clearPin() {
            appPrefs().edit().remove("pinHash").remove("pinSalt").remove("pinLen").apply();
        }

        @JavascriptInterface
        public boolean isLocked() {
            return locked && (MainActivity.this.pinSet() || lockOn());
        }

        /** "Forgot PIN": the phone's own screen lock proves it's the owner, then the PIN is removed. */
        @JavascriptInterface
        public boolean resetPinWithPhone() {
            final Intent i = phoneLockIntent(Tr.t(MainActivity.this, "PIN-i sıfırlamaq üçün telefonun kilidini açın"));
            if (i == null) return false;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    unlocking = true;
                    startActivityForResult(i, REQ_RESET_PIN);
                }
            });
            return true;
        }

        @JavascriptInterface
        public void setDarkBars(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Window w = getWindow();
                    // light: pale page colour with dark icons; dark: black-gold with light icons
                    w.setStatusBarColor(Color.parseColor(dark ? "#070708" : "#F4F7F9"));
                    w.setNavigationBarColor(Color.parseColor(dark ? "#0E0D0B" : "#FFFFFF"));
                    if (Build.VERSION.SDK_INT >= 26) {
                        w.getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                    } else if (Build.VERSION.SDK_INT >= 23) {
                        w.getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                    }
                    web.setBackgroundColor(Color.parseColor(dark ? "#070708" : "#F4F7F9"));
                }
            });
        }

        /** Long-press menu on the app icon: today's income and the starred section's spending. */
        @JavascriptInterface
        public void updateShortcuts(String income, String spent, String catId) {
            if (Build.VERSION.SDK_INT < 25) return;
            try {
                android.content.pm.ShortcutManager sm = getSystemService(android.content.pm.ShortcutManager.class);
                if (sm == null) return;
                android.graphics.drawable.Icon icon = android.graphics.drawable.Icon.createWithResource(MainActivity.this, getApplicationInfo().icon);
                Intent a = new Intent(Intent.ACTION_VIEW, null, MainActivity.this, MainActivity.class).putExtra("go", "people");
                Intent b = new Intent(Intent.ACTION_VIEW, null, MainActivity.this, MainActivity.class)
                        .putExtra("go", catId.isEmpty() ? "mine" : "cat:" + catId);
                java.util.List<android.content.pm.ShortcutInfo> list = new java.util.ArrayList<>();
                list.add(new android.content.pm.ShortcutInfo.Builder(MainActivity.this, "income")
                        .setShortLabel(income).setLongLabel(income).setIcon(icon).setIntent(a).setRank(0).build());
                list.add(new android.content.pm.ShortcutInfo.Builder(MainActivity.this, "spent")
                        .setShortLabel(spent).setLongLabel(spent).setIcon(icon).setIntent(b).setRank(1).build());
                sm.setDynamicShortcuts(list);
            } catch (Exception ignored) {
                // launchers may rate-limit updates; the next change tries again
            }
        }

        @JavascriptInterface
        public void toast(String msg) {
            MainActivity.this.toast(msg);
        }

        /** A receipt as a real PDF file, shared with WhatsApp etc. json: {file, title, sub, rows:[[l,r,bold]], foot} */
        @JavascriptInterface
        public void setSecure(final boolean on) {
            appPrefs().edit().putBoolean("secure", on).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applySecure();
                }
            });
        }

        @JavascriptInterface
        public boolean secureOn() {
            return appPrefs().getBoolean("secure", false);
        }

        /** A file sent by e-mail: Gmail opens with the address, subject and the file already in it. */
        @JavascriptInterface
        public void mailBase64(String b64, String name, String mime, String to, String subject) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                FileOutputStream out = new FileOutputStream(new File(dir, name));
                out.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
                out.close();
                mailFile(name, mime, to, subject);
            } catch (Exception e) {
                pageToast(Tr.t(MainActivity.this, "Xəta: ") + e.getMessage());
            }
        }

    }
}
