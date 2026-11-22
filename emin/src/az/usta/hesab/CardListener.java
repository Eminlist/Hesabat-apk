package az.usta.hesab;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.regex.Pattern;

/**
 * Reads the bank app's notifications (now: ABB Mobile) and keeps each card operation in a queue.
 * The page takes the queue when it is open and writes the operations into the account itself:
 * money in → income, money out of the main card → expense, failed payments are skipped.
 */
public class CardListener extends NotificationListenerService {

    /** ABB Mobile's package name on Google Play. */
    static final String ABB = "iba.mobilbank";
    private static final String PREFS = "cards";

    /** The open app, told at once when a new operation arrives. */
    static WeakReference<MainActivity> live;

    /** Is this the ABB bank app? The exact package name is not guessed any more. */
    static boolean isBank(String pkg) {
        if (pkg == null) return false;
        String p = pkg.toLowerCase();
        if (p.equals("az.usta.hesab")) return false;
        return p.equals(ABB) || p.contains("abb") || p.contains("iba") || p.contains("ibar") || p.contains("mobilbank") || p.contains("mobilebank");
    }

    /** An SMS (or any app's notification) whose sender/title is the bank. */
    static boolean fromBankSender(String title) {
        if (title == null) return false;
        String t = title.trim().toLowerCase();
        return t.equals("abb") || t.startsWith("abb ") || t.startsWith("abb-") || t.startsWith("abb:") || t.contains("abb bank") || t.contains("abb mobile") || t.equals("iba") || t.equals("ibar");
    }

    @Override
    public void onListenerConnected() {
        // notifications already sitting in the panel are read too
        try {
            StatusBarNotification[] all = getActiveNotifications();
            if (all != null) for (StatusBarNotification s : all) onNotificationPosted(s);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            // a group summary only repeats its children; the children come one by one
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle x = n.extras;
            String title = str(x, Notification.EXTRA_TITLE_BIG);
            if (title.isEmpty()) title = str(x, Notification.EXTRA_TITLE);
            String body = str(x, Notification.EXTRA_BIG_TEXT);
            if (body.isEmpty()) body = str(x, Notification.EXTRA_TEXT);
            if (body.isEmpty()) {
                CharSequence[] lines = x == null ? null : x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if (lines != null) { StringBuilder b = new StringBuilder(); for (CharSequence l : lines) b.append(l).append('\n'); body = b.toString().trim(); }
            }
            if (body.isEmpty() && x != null) {
                // chat-style notifications keep the text in their messages
                try {
                    android.os.Parcelable[] ms = x.getParcelableArray(Notification.EXTRA_MESSAGES);
                    if (ms != null) {
                        StringBuilder b = new StringBuilder();
                        for (android.os.Parcelable p : ms) if (p instanceof Bundle) { CharSequence t = ((Bundle) p).getCharSequence("text"); if (t != null) b.append(t).append('\n'); }
                        body = b.toString().trim();
                    }
                } catch (Throwable ignored) {
                }
            }
            if (body.isEmpty() && n.tickerText != null) body = n.tickerText.toString().trim();
            String pkg = sbn.getPackageName();
            boolean sender = fromBankSender(title);
            boolean bank = isBank(pkg) || sender;
            boolean money = MONEY.matcher(title + " " + body).find();
            if (!bank && !money) return;
            if (!bank) { log(this, pkg, title, body, sbn.getPostTime(), false, "bank proqramı deyil"); return; }
            CardParse.Res r = CardParse.read(title, body, sbn.getPostTime(), sender);
            log(this, pkg, title, body, sbn.getPostTime(), r.op != null, r.why);
            if (r.op == null) return;
            add(this, r.op);
        } catch (Throwable e) {
            try { log(this, sbn == null ? "" : sbn.getPackageName(), "", "", System.currentTimeMillis(), false, "xəta: " + e.getClass().getSimpleName()); } catch (Throwable ignored) { }
        }
    }

    private static final Pattern MONEY = Pattern.compile("[0-9]\\s*(₼|AZN|azn|man\\.?)");

    /** The last bank-like notifications, exactly as they came, with what was done — shown in Ayarlar. */
    static synchronized void log(Context ctx, String pkg, String title, String body, long when, boolean ok, String why) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray a = new JSONArray(p.getString("log", "[]"));
            JSONArray keep = new JSONArray();
            for (int i = Math.max(0, a.length() - 29); i < a.length(); i++) keep.put(a.get(i));
            keep.put(new JSONObject().put("pkg", pkg).put("title", title).put("body", body).put("at", when).put("ok", ok).put("why", why == null ? "" : why));
            p.edit().putString("log", keep.toString()).commit();
        } catch (Throwable ignored) {
        }
    }

    static String log(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("log", "[]");
    }

    private static String str(Bundle b, String k) {
        if (b == null) return "";
        CharSequence c = b.getCharSequence(k);
        return c == null ? "" : c.toString().trim();
    }

    /** Into the queue (once); the open app is told at once. */
    static synchronized void add(Context ctx, JSONObject op) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // the same text again within 10 minutes is the bank re-posting it, not a new payment
        JSONArray seen = new JSONArray(p.getString("seen", "[]"));
        String sig = op.getString("sig");
        long at = op.getLong("at");
        for (int i = 0; i < seen.length(); i++) {
            JSONObject s = seen.getJSONObject(i);
            if (sig.equals(s.optString("sig")) && Math.abs(at - s.optLong("at")) < 10 * 60000L) return;
        }
        JSONArray keep = new JSONArray();
        for (int i = Math.max(0, seen.length() - 299); i < seen.length(); i++) keep.put(seen.get(i));
        keep.put(new JSONObject().put("sig", sig).put("at", at));
        JSONArray q = new JSONArray(p.getString("queue", "[]"));
        q.put(op);
        p.edit().putString("seen", keep.toString()).putString("queue", q.toString()).commit();
        MainActivity a = live == null ? null : live.get();
        if (a != null) a.cardsArrived();
    }

    /** Everything waiting, handed to the page and removed from the queue. */
    static synchronized String take(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String q = p.getString("queue", "[]");
        p.edit().putString("queue", "[]").commit();
        return q;
    }

    /** Has the user allowed Hesabat to read notifications? */
    static boolean allowed(Context ctx) {
        String s = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        if (s == null) return false;
        String me = new ComponentName(ctx, CardListener.class).flattenToString();
        for (String part : s.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(part);
            if (c != null && (c.flattenToString().equals(me) || (c.getPackageName().equals(ctx.getPackageName()) && c.getClassName().endsWith("CardListener")))) return true;
        }
        return false;
    }
}
