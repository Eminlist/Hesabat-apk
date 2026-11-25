package az.usta.hesab;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Debt payment days: once a day (at the time chosen in Ayarlar, 10:00 by default) the phone shows one notification listing the
 * customers whose payment day has come or passed and who still owe. The list itself is written
 * by the app (MainActivity.setDueList) every time the data changes.
 */
public class DueReceiver extends BroadcastReceiver {

    static final String ACTION = "az.usta.hesab.DUE";
    private static final String CHANNEL = "due_sms";

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (ACTION.equals(a)) {
            notifyDue(c);
            schedule(c, true); // sabahkı
        } else {
            // the phone restarted or the app was updated: alarms are gone, set it again
            schedule(c, true);
            SummaryReceiver.schedule(c);
        }
    }

    private static long daysBetween(String a, String b) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            return Math.round((f.parse(b).getTime() - f.parse(a).getTime()) / 86400000.0);
        } catch (Exception e) {
            return 0;
        }
    }

    /** Borc xatırlatmasının saatı ("HH:MM"), Ayarlarda seçilir; standart 10:00. */
    static String time(Context c) {
        return c.getSharedPreferences("due", Context.MODE_PRIVATE).getString("time", "10:00");
    }

    static void setTime(Context c, String t) {
        c.getSharedPreferences("due", Context.MODE_PRIVATE).edit().putString("time", t == null || t.isEmpty() ? "10:00" : t).apply();
        schedule(c, true);
    }

    static void saveList(Context c, String json) {
        c.getSharedPreferences("due", Context.MODE_PRIVATE).edit().putString("list", json).apply();
    }

    /** The daily check at the chosen time; force=false leaves an alarm that is already set alone. */
    static void schedule(Context c, boolean force) {
        Intent i = new Intent(c, DueReceiver.class).setAction(ACTION);
        if (!force && PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE) != null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar cal = Calendar.getInstance();
        int h = 10, m = 0;
        try {
            String[] t = time(c).split(":");
            h = Integer.parseInt(t[0]);
            m = Integer.parseInt(t[1]);
        } catch (Exception ignored) {
        }
        cal.set(Calendar.HOUR_OF_DAY, h);
        cal.set(Calendar.MINUTE, m);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 30000) cal.add(Calendar.DAY_OF_YEAR, 1);
        am.cancel(pi);
        // 5 dəqiqəlik pəncərə: seçilən saatda gəlir, xüsusi «dəqiq zəngli saat» icazəsi lazım deyil
        am.setWindow(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), 5 * 60 * 1000L, pi);
    }

    static void notifyDue(Context c) {
        try {
            String raw = c.getSharedPreferences("due", Context.MODE_PRIVATE).getString("list", null);
            if (raw == null) return;
            JSONObject o = new JSONObject(raw);
            JSONArray items = o.optJSONArray("items");
            if (items == null) return;
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            List<String> lines = new ArrayList<>();
            for (int k = 0; k < items.length(); k++) {
                JSONObject it = items.getJSONObject(k);
                // "u": last day to remind (e.g. a warranty that ends that day)
                String until = it.optString("u", "");
                if (it.optString("d", "9999").compareTo(today) <= 0 && (until.isEmpty() || today.compareTo(until) <= 0)) {
                    String line = it.optString("line");
                    String due = it.optString("due", "");
                    if (!due.isEmpty()) {
                        // gün sayı bu gün hesablanır: proqram neçə gün açılmasa da düz göstərilir
                        long days = daysBetween(today, due);
                        String st = days > 0 ? o.optString("soon", "{0}").replace("{0}", String.valueOf(days))
                                : days == 0 ? o.optString("today", "") : o.optString("late", "{0}").replace("{0}", String.valueOf(-days));
                        if (!st.isEmpty()) line += " · " + st;
                    }
                    lines.add(line);
                }
            }
            if (lines.isEmpty()) return;
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            String title = o.optString("title", Tr.t(c, "Ödəniş günü çatıb"));
            String text = lines.size() == 1 ? lines.get(0) : o.optString("more", "{0}").replace("{0}", String.valueOf(lines.size()));
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                // the phone's own message (SMS) sound, so a debt reminder is heard like a new message
                NotificationChannel ch = new NotificationChannel(CHANNEL, Tr.t(c, "Borc xatırlatmaları"), NotificationManager.IMPORTANCE_HIGH);
                ch.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION),
                        new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                ch.enableVibration(true);
                nm.createNotificationChannel(ch);
                b = new Notification.Builder(c, CHANNEL);
            } else {
                b = new Notification.Builder(c);
                b.setDefaults(Notification.DEFAULT_ALL).setPriority(Notification.PRIORITY_HIGH);
            }
            Notification.InboxStyle box = new Notification.InboxStyle();
            for (String l : lines) box.addLine(l);
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setSmallIcon(R.drawable.ic_notify)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(box)
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            nm.notify(1, b.build());
        } catch (Exception ignored) {
        }
    }
}
