package app.zaroori;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: today's medicines and reminders, with Add and Speak buttons.
 * The list comes from the app (WidgetPlugin), so it is as fresh as the last time
 * the app ran; after midnight it asks the person to open the app.
 */
public class TodayWidget extends AppWidgetProvider {

    static final String PREFS = "zaroori_widget";
    static final String KEY_LINES = "lines";
    static final String KEY_DAY = "day";
    private static final int MAX_LINES = 6;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String day = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DAY, "");
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LINES, null);

        views.setTextViewText(R.id.widget_date, new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(new Date()));
        views.setTextViewText(R.id.widget_body, raw == null || !today.equals(day) ? context.getString(R.string.widget_open_app) : body(context, raw));

        views.setOnClickPendingIntent(R.id.widget_root, link(context, "app.zaroori://home", 1));
        views.setOnClickPendingIntent(R.id.widget_add, link(context, "app.zaroori://add", 2));
        views.setOnClickPendingIntent(R.id.widget_voice, link(context, "app.zaroori://add?voice=1", 3));
        return views;
    }

    private static CharSequence body(Context context, String raw) {
        SpannableStringBuilder out = new SpannableStringBuilder();
        try {
            JSONArray lines = new JSONArray(raw);
            if (lines.length() == 0) return context.getString(R.string.widget_empty);
            int shown = Math.min(lines.length(), MAX_LINES);
            for (int i = 0; i < shown; i++) {
                JSONObject l = lines.getJSONObject(i);
                if (out.length() > 0) out.append('\n');
                String time = l.optBoolean("overdue") ? context.getString(R.string.widget_overdue) : l.optString("time", "");
                if (time.isEmpty()) time = "•";
                int start = out.length();
                out.append(time);
                out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                if (l.optBoolean("overdue")) {
                    out.setSpan(new ForegroundColorSpan(Color.parseColor("#C2410C")), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                }
                out.append("  ");
                if (l.optBoolean("medicine")) out.append("💊 ");
                out.append(l.optString("title", ""));
            }
            if (lines.length() > shown) {
                out.append('\n').append(context.getString(R.string.widget_more, lines.length() - shown));
            }
        } catch (Exception e) {
            return context.getString(R.string.widget_open_app);
        }
        return out;
    }

    private static PendingIntent link(Context context, String url, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
