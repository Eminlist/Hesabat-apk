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
import java.util.Calendar;
import java.util.regex.Matcher;
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

    // "Ödəniş: -0.60₼", "Köçürmə: +1.88€ (+3.47₼)", "Uğursuz ödəniş: -23.60$ (-40.57₼)"
    private static final Pattern HEAD = Pattern.compile(
            "^[^\\p{L}\\p{N}]*([^:\\n]{2,40}?)\\s*:\\s*([+\\-−])\\s*([0-9][0-9 ]*(?:[.,][0-9]{1,2})?)\\s*(₼|AZN|€|EUR|\\$|USD|₽|RUB|£|GBP|₺|TRY)?\\s*(?:\\(\\s*[+\\-−]?\\s*([0-9][0-9 ]*(?:[.,][0-9]{1,2})?)\\s*(₼|AZN|€|EUR|\\$|USD|₽|RUB|£|GBP|₺|TRY)\\s*\\))?");
    private static final Pattern CARD = Pattern.compile("Kart\\s*:?\\s*\\*+\\s*([0-9]{4})");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || !ABB.equals(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            Bundle x = n.extras;
            String title = str(x, Notification.EXTRA_TITLE);
            String body = str(x, Notification.EXTRA_BIG_TEXT);
            if (body.isEmpty()) body = str(x, Notification.EXTRA_TEXT);
            JSONObject op = parse(title, body, sbn.getPostTime());
            if (op == null) return;
            add(this, op);
        } catch (Throwable ignored) {
        }
    }

    private static String str(Bundle b, String k) {
        if (b == null) return "";
        CharSequence c = b.getCharSequence(k);
        return c == null ? "" : c.toString().trim();
    }

    /** One bank notification → an operation, or null when it isn't a card operation (or it failed). */
    static JSONObject parse(String title, String body, long when) throws Exception {
        String head = title, rest = body;
        Matcher m = HEAD.matcher(head);
        if (!m.find()) {
            // some phones give the whole text in one line
            String all = (title + "\n" + body).trim();
            int nl = all.indexOf('\n');
            head = nl < 0 ? all : all.substring(0, nl);
            rest = nl < 0 ? "" : all.substring(nl + 1);
            m = HEAD.matcher(head);
            if (!m.find()) return null;
        }
        String word = m.group(1).trim();
        String lw = word.toLowerCase();
        if (lw.contains("uğursuz") || lw.contains("ugursuz") || lw.contains("ləğv") || lw.contains("imtina")) return null;
        boolean in = !"-".equals(m.group(2)) && !"−".equals(m.group(2));
        String cur1 = cur(m.group(4)), cur2 = cur(m.group(6));
        long azn;
        if ("AZN".equals(cur1) || cur1.isEmpty()) azn = cents(m.group(3));
        else if ("AZN".equals(cur2)) azn = cents(m.group(5));
        else azn = -1; // no manat amount in the notification
        if (azn == 0) return null;

        String card = "", place = "";
        Matcher c = CARD.matcher(title + "\n" + body);
        if (c.find()) card = c.group(1);
        for (String line : rest.split("\n")) {
            String l = line.trim();
            if (l.isEmpty() || l.startsWith("Kart") || l.startsWith("Balans") || HEAD.matcher(l).find()) continue;
            place = l;
            break;
        }
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(when);
        JSONObject o = new JSONObject();
        o.put("bank", "ABB");
        o.put("dir", in ? "in" : "out");
        o.put("word", word);
        o.put("amount", azn);
        o.put("orig", m.group(3).replace(" ", "") + (cur1.isEmpty() ? "₼" : sym(cur1)));
        o.put("card", card);
        o.put("place", place);
        o.put("date", String.format(java.util.Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH)));
        o.put("time", String.format(java.util.Locale.US, "%02d:%02d", k.get(Calendar.HOUR_OF_DAY), k.get(Calendar.MINUTE)));
        o.put("at", when);
        // the same notification shown again (updated, re-posted) is the same operation; the balance line makes two
        // equal payments in one minute different
        o.put("key", "abb:" + Integer.toHexString((title + "|" + body).hashCode()) + ":" + (when / 60000));
        o.put("sig", "abb:" + Integer.toHexString((title + "|" + body).hashCode()));
        return o;
    }

    private static String cur(String s) {
        if (s == null) return "";
        switch (s) {
            case "₼": case "AZN": return "AZN";
            case "€": case "EUR": return "EUR";
            case "$": case "USD": return "USD";
            case "₽": case "RUB": return "RUB";
            case "£": case "GBP": return "GBP";
            case "₺": case "TRY": return "TRY";
        }
        return s;
    }

    private static String sym(String c) {
        switch (c) {
            case "EUR": return "€";
            case "USD": return "$";
            case "RUB": return "₽";
            case "GBP": return "£";
            case "TRY": return "₺";
        }
        return "₼";
    }

    private static long cents(String s) {
        s = s.replace(" ", "").replace(',', '.');
        return Math.round(Double.parseDouble(s) * 100);
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
