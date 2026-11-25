package az.usta.hesab;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * Google növbəsi: telefonda yazılan hər dəyişiklik Google-a getməyibsə burada gözləyir.
 * Proqram bağlı olsa belə, internet gələn kimi Android bu işi başladır və məlumat Google-a yüklənir.
 * (Proqram açıq olanda göndərməni proqramın özü edir.)
 */
public class SyncJob extends JobService {

    private static final int JOB_ID = 7701;
    static volatile boolean appVisible = false;

    private static SharedPreferences q(Context c) {
        return c.getSharedPreferences("syncq", Context.MODE_PRIVATE);
    }

    /** A change was saved on the phone: it waits in the queue until Google has it. */
    static synchronized void changed(Context c) {
        SharedPreferences p = q(c);
        p.edit().putLong("seq", p.getLong("seq", 0) + 1).putBoolean("pending", true).commit();
    }

    static long seq(Context c) {
        return q(c).getLong("seq", 0);
    }

    /** Google got the data as it was at change number s; if nothing changed since, the queue is empty. */
    static synchronized void uploaded(Context c, long s) {
        SharedPreferences.Editor e = q(c).edit().putLong("last", System.currentTimeMillis());
        if (seq(c) == s) e.putBoolean("pending", false);
        e.commit();
    }

    static long lastUpload(Context c) {
        return q(c).getLong("last", 0);
    }

    static boolean pending(Context c) {
        return q(c).getBoolean("pending", false);
    }

    /** Ask Android to run the upload as soon as there is internet (also after a restart). */
    static void schedule(Context c) {
        try {
            GoogleSync gs = new GoogleSync(c);
            if (!pending(c) || gs.account().isEmpty() || gs.needLink()) return;
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, SyncJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                    .setPersisted(true)
                    .build();
            js.schedule(job);
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        GoogleSync gs = new GoogleSync(this);
        // ilk qoşulmada Google-dakı hələ telefona gəlməyibsə, telefondakı onun üstünə yazılmır
        if (appVisible || !pending(this) || gs.account().isEmpty() || gs.needLink()) return false;
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean retry = false;
                try {
                    long s = seq(SyncJob.this);
                    String json = readData();
                    if (json != null) {
                        new GoogleSync(SyncJob.this).upload(json); // telefondakı tam baza Google-a
                        uploaded(SyncJob.this, s);
                    }
                } catch (Exception e) {
                    retry = true; // no internet yet / Google busy: Android tries again later
                }
                jobFinished(params, retry);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private String readData() {
        File f = new File(getFilesDir(), "data.json");
        if (!f.exists()) return null;
        try {
            InputStream in = new FileInputStream(f);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            String s = new String(bo.toByteArray(), "UTF-8").trim();
            if (!new JSONObject(s).has("mf")) return null;
            return s;
        } catch (Exception e) {
            return null;
        }
    }
}
