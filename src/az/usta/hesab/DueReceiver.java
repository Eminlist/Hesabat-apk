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
 * Debt payment days: once a day (around 10:00) the phone shows one notification listing the
 * customers whose payment day has come or passed and who still owe. The list itself is written
 * by the app (MainActivity.setDueList) every time the data changes.
 */
public class DueReceiver extends BroadcastReceiver {

    static final String ACTION = "az.usta.hesab.DUE";
    private static final String CHANNEL = "due";

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (ACTION.equals(a)) {
            notifyDue(c);
        } else {
            // the phone restarted or the app was updated: alarms are gone, set it again
            schedule(c, true);
        }
    }

    static void saveList(Context c, String json) {
        c.getSharedPreferences("due", Context.MODE_PRIVATE).edit().putString("list", json).apply();
    }

    /** The daily check at about 10:00; force=false leaves an alarm that is already set alone. */
    static void schedule(Context c, boolean force) {
        Intent i = new Intent(c, DueReceiver.class).setAction(ACTION);
        if (!force && PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE) != null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 10);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
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
                if (it.optString("d", "9999").compareTo(today) <= 0 && (until.isEmpty() || today.compareTo(until) <= 0)) lines.add(it.optString("line"));
            }
            if (lines.isEmpty()) return;
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            String title = o.optString("title", "Ödəniş günü çatıb");
            String text = lines.size() == 1 ? lines.get(0) : o.optString("more", "{0}").replace("{0}", String.valueOf(lines.size()));
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_DEFAULT));
                b = new Notification.Builder(c, CHANNEL);
            } else {
                b = new Notification.Builder(c);
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
