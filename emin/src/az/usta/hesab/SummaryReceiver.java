package az.usta.hesab;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * «Günün xülasəsi»: every day at the time the user chose (Ayarlar), one notification with the
 * day's income and spending. The figures are written by the app whenever the data changes;
 * if nothing was written today, the notification says so.
 */
public class SummaryReceiver extends BroadcastReceiver {

    static final String ACTION = "az.usta.hesab.SUMMARY";
    private static final String CHANNEL = "summary";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("summary", Context.MODE_PRIVATE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (ACTION.equals(i.getAction())) show(c);
        schedule(c); // the next day (also after a restart / update)
    }

    /** time "HH:MM" or "" (off) */
    static void setTime(Context c, String time) {
        prefs(c).edit().putString("time", time == null ? "" : time).apply();
        schedule(c);
    }

    static void setData(Context c, String date, String title, String text, String empty) {
        prefs(c).edit().putString("date", date).putString("title", title).putString("text", text).putString("empty", empty).apply();
    }

    static void schedule(Context c) {
        Intent i = new Intent(c, SummaryReceiver.class).setAction(ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(pi);
        String t = prefs(c).getString("time", "");
        if (!t.matches("\\d{1,2}:\\d{2}")) return;
        String[] hm = t.split(":");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
        cal.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 30000) cal.add(Calendar.DAY_OF_YEAR, 1);
        // a 5-minute window keeps it on time without the special "exact alarm" permission
        if (Build.VERSION.SDK_INT >= 19) am.setWindow(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), 5 * 60 * 1000L, pi);
        else am.set(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
    }

    private static void show(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            SharedPreferences p = prefs(c);
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            String title = p.getString("title", Tr.t(c, "Günün xülasəsi"));
            String text = today.equals(p.getString("date", "")) ? p.getString("text", "") : p.getString("empty", Tr.t(c, "Bu gün heç nə yazılmayıb"));
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_DEFAULT));
                b = new Notification.Builder(c, CHANNEL);
            } else {
                b = new Notification.Builder(c);
            }
            Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setSmallIcon(R.drawable.ic_notify).setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(pi).setAutoCancel(true);
            nm.notify(2, b.build());
        } catch (Exception ignored) {
        }
    }
}
