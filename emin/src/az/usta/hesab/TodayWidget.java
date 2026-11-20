package az.usta.hesab;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget: today's income. The app writes the figure every time the data changes;
 * after midnight, until the app is opened again, the widget shows the "zero" text for the new day.
 */
public class TodayWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = views(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    static void save(Context c, String date, String label, String amount, String zero) {
        c.getSharedPreferences("widget", Context.MODE_PRIVATE).edit()
                .putString("date", date).putString("label", label).putString("amount", amount).putString("zero", zero).apply();
        updateAll(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return;
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = views(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    private static RemoteViews views(Context c) {
        SharedPreferences p = c.getSharedPreferences("widget", Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String amount = today.equals(p.getString("date", "")) ? p.getString("amount", "—") : p.getString("zero", "—");
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setTextViewText(R.id.w_label, p.getString("label", "Bu günkü gəlir"));
        v.setTextViewText(R.id.w_amount, amount);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        return v;
    }
}
