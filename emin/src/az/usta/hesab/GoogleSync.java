package az.usta.hesab;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AuthenticatorException;
import android.accounts.OperationCanceledException;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.Charset;

/**
 * Syncs through one JSON file in the hidden app folder of the user's Google Drive (like WhatsApp's
 * backup): the user only picks a Google account. The token comes from the phone's own Google account
 * (AccountManager), so no Google library is needed; the app must be registered in Google Cloud with
 * its package name and the SHA-1 of its signing key, and the Google Drive API must be turned on there.
 */
class GoogleSync {

    static final String FILE_NAME = "MyFinance-sinxron.json";
    private static final String SCOPE = "oauth2:https://www.googleapis.com/auth/drive.appdata";
    private static final String API = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
    private static final Charset UTF8 = Charset.forName("UTF-8");

    /** An error whose message is already written for the user. */
    static class SyncError extends Exception {
        SyncError(String msg) {
            super(msg);
        }
    }

    private static class HttpError extends Exception {
        final int code;
        final String body;

        HttpError(int code, String body) {
            super("HTTP " + code);
            this.code = code;
            this.body = body == null ? "" : body;
        }
    }

    private final Context ctx;
    private final Activity activity; // null in the background job: then Google shows no "allow" window
    private final SharedPreferences prefs;

    GoogleSync(Context c) {
        this.ctx = c;
        this.activity = c instanceof Activity ? (Activity) c : null;
        this.prefs = c.getSharedPreferences("gsync", Context.MODE_PRIVATE);
    }

    /** First link: until the Google copy has come to the phone, nothing is sent from the phone. */
    boolean needLink() {
        return prefs.getBoolean("needLink", false);
    }

    void setNeedLink(boolean on) {
        prefs.edit().putBoolean("needLink", on).apply();
    }

    /** The linked Google account (e-mail), or "" when sync is off. */
    String account() {
        return prefs.getString("account", "");
    }

    /** The phone's own "choose an account" window, showing Google accounts only. */
    static Intent chooseIntent() {
        return AccountManager.newChooseAccountIntent(null, null, new String[]{"com.google"}, null, null, null, null);
    }

    void link(String name) {
        prefs.edit().clear().putString("account", name).apply();
    }

    void unlink() {
        prefs.edit().clear().apply();
    }

    /** Blocking; the Drive copy, or "" when there is none yet. */
    String download() throws Exception {
        String token = token();
        try {
            return downloadWith(token);
        } catch (HttpError e) {
            if (e.code != 401) throw explain(e);
            token = freshToken(token);
            try {
                return downloadWith(token);
            } catch (HttpError e2) {
                throw explain(e2);
            }
        }
    }

    /** Blocking; replaces the Drive copy (makes it the first time). */
    void upload(String json) throws Exception {
        String token = token();
        try {
            uploadWith(token, json);
        } catch (HttpError e) {
            if (e.code != 401) throw explain(e);
            token = freshToken(token);
            try {
                uploadWith(token, json);
            } catch (HttpError e2) {
                throw explain(e2);
            }
        }
    }

    private String downloadWith(String token) throws Exception {
        String id = fileId(token);
        if (id == null) return "";
        try {
            return new String(http("GET", API + "/" + id + "?alt=media", token, null, null), UTF8).trim();
        } catch (HttpError e) {
            if (e.code != 404) throw e;
            // the file was removed on Drive: look it up again by name
            prefs.edit().remove("fileId").apply();
            id = fileId(token);
            return id == null ? "" : new String(http("GET", API + "/" + id + "?alt=media", token, null, null), UTF8).trim();
        }
    }

    private void uploadWith(String token, String json) throws Exception {
        String id = fileId(token);
        byte[] data = json.getBytes(UTF8);
        if (id != null) {
            try {
                http("PATCH", UPLOAD + "/" + id + "?uploadType=media", token, "application/json; charset=UTF-8", data);
                return;
            } catch (HttpError e) {
                if (e.code != 404) throw e;
                prefs.edit().remove("fileId").apply();
            }
        }
        String boundary = "hesabat_" + Long.toHexString(System.nanoTime());
        String meta = new JSONObject().put("name", FILE_NAME).put("parents", new JSONArray().put("appDataFolder")).toString();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary
                + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").getBytes(UTF8));
        body.write(data);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(UTF8));
        byte[] res = http("POST", UPLOAD + "?uploadType=multipart&fields=id", token, "multipart/related; boundary=" + boundary, body.toByteArray());
        String newId = new JSONObject(new String(res, UTF8)).optString("id", "");
        if (!newId.isEmpty()) prefs.edit().putString("fileId", newId).apply();
    }

    /** The sync file's id in the app folder (newest one, if two phones made one each), or null. */
    private String fileId(String token) throws Exception {
        String id = prefs.getString("fileId", null);
        if (id != null) return id;
        String q = URLEncoder.encode("name = '" + FILE_NAME + "' and trashed = false", "UTF-8");
        byte[] res = http("GET", API + "?spaces=appDataFolder&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id)&q=" + q, token, null, null);
        JSONArray files = new JSONObject(new String(res, UTF8)).optJSONArray("files");
        if (files == null || files.length() == 0) return null;
        id = files.getJSONObject(0).getString("id");
        prefs.edit().putString("fileId", id).apply();
        return id;
    }

    // ---------- the Google token from the phone's account ----------

    private String token() throws Exception {
        String name = account();
        if (name.isEmpty()) throw new SyncError(Tr.t(ctx, "Google hesabı seçilməyib"));
        try {
            // with the activity given, the phone shows Google's "allow" window itself when it is needed
            Account acc = new Account(name, "com.google");
            Bundle b = activity != null
                    ? AccountManager.get(ctx).getAuthToken(acc, SCOPE, null, activity, null, null).getResult()
                    : AccountManager.get(ctx).getAuthToken(acc, SCOPE, null, false, null, null).getResult();
            String t = b.getString(AccountManager.KEY_AUTHTOKEN);
            if (t == null || t.isEmpty()) throw new SyncError(Tr.t(ctx, "Google icazə vermədi"));
            return t;
        } catch (OperationCanceledException e) {
            throw new SyncError(Tr.t(ctx, "Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin"));
        } catch (AuthenticatorException e) {
            String m = String.valueOf(e.getMessage());
            if (m.contains("UNREGISTERED_ON_API_CONSOLE") || m.contains("INVALID_AUDIENCE"))
                throw new SyncError(Tr.t(ctx, "Tətbiq Google Cloud-da qeydiyyatdan keçməyib (paket adı və SHA-1 yoxlanmalıdır)"));
            if (m.contains("BadAuthentication") || m.contains("NeedPermission"))
                throw new SyncError(Tr.t(ctx, "Google hesabına giriş alınmadı — telefonun Ayarlarında hesabı yoxlayın"));
            throw new SyncError(Tr.t(ctx, "Google xətası: ") + m);
        } catch (IOException e) {
            throw new SyncError(Tr.t(ctx, "İnternet yoxdur"));
        } catch (SecurityException e) {
            throw new SyncError(Tr.t(ctx, "Bu Google hesabına icazə yoxdur — hesabı yenidən seçin"));
        }
    }

    /** The old token was refused: forget it and ask for a new one. */
    private String freshToken(String old) throws Exception {
        AccountManager.get(ctx).invalidateAuthToken("com.google", old);
        return token();
    }

    private SyncError explain(HttpError e) {
        String b = e.body;
        if (e.code == 401) return new SyncError(Tr.t(ctx, "Google girişi alınmadı — hesabı yenidən seçin"));
        if (e.code == 403 && (b.contains("accessNotConfigured") || b.contains("SERVICE_DISABLED") || b.contains("has not been used")))
            return new SyncError(Tr.t(ctx, "Google Cloud-da “Google Drive API” aktiv edilməyib"));
        if (e.code == 403 && (b.contains("storageQuotaExceeded") || b.contains("quotaExceeded")))
            return new SyncError(Tr.t(ctx, "Google Drive-da yer qalmayıb"));
        if (e.code == 403) return new SyncError(Tr.t(ctx, "Google icazə vermədi (403)"));
        if (e.code == 429 || e.code >= 500) return new SyncError(Tr.t(ctx, "Google hazırda cavab vermir, bir az sonra yenə yoxlanacaq"));
        return new SyncError(Tr.t(ctx, "Google xətası (") + e.code + ")");
    }

    // ---------- plain HTTPS ----------

    private static byte[] http(String method, String url, String token, String type, byte[] body) throws Exception {
        HttpURLConnection c;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
        } catch (IOException e) {
            throw new SyncError(Tr.t(null, "İnternet yoxdur"));
        }
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            // HttpURLConnection has no PATCH; Google accepts it as POST with this header
            if ("PATCH".equals(method)) {
                c.setRequestMethod("POST");
                c.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            } else {
                c.setRequestMethod(method);
            }
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", type);
                c.setFixedLengthStreamingMode(body.length);
                OutputStream out = c.getOutputStream();
                out.write(body);
                out.close();
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] res = readAll(in);
            if (code >= 400) throw new HttpError(code, new String(res, UTF8));
            return res;
        } catch (HttpError e) {
            throw e;
        } catch (IOException e) {
            throw new SyncError(Tr.t(null, "İnternet yoxdur"));
        } finally {
            c.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        if (in == null) return new byte[0];
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }
}
