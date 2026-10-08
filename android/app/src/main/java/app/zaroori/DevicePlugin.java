package app.zaroori;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * What can stop reminders popping up on time on this phone, and shortcuts to the
 * settings screens that fix it (see "Pop-up check" in Settings > Notifications).
 */
@CapacitorPlugin(name = "ZarooriDevice")
public class DevicePlugin extends Plugin {

    @PluginMethod
    public void reminderHealth(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        JSObject r = new JSObject();
        r.put("notificationsOn", nm == null || nm.areNotificationsEnabled());
        int importance = -1;
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(call.getString("channel", "zaroori-alerts"));
            if (ch != null) importance = ch.getImportance();
        }
        // -1: the channel isn't made yet (it is created with the first reminder).
        r.put("channelImportance", importance);
        r.put("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am == null || am.canScheduleExactAlarms());
        r.put("batteryUnrestricted", pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** The app's own notification settings, where "Pop on screen" / "Floating notifications" live. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i;
        String channel = call.getString("channel");
        if (channel != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, channel);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            i = appDetails();
        }
        open(call, i);
    }

    /** App info, where Battery > "Unrestricted" (or "No restrictions") is set. */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        open(call, appDetails());
    }

    /**
     * Xiaomi, Oppo, Vivo and Realme phones also block apps from starting in the
     * background unless "Autostart" is on. Their screens aren't public, so each is
     * tried in turn and App info is the fallback.
     */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        String[][] screens = {
            { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
            { "com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity" },
            { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
            { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        };
        for (String[] s : screens) {
            Intent i = new Intent().setComponent(new ComponentName(s[0], s[1])).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(getContext().getPackageManager()) != null) {
                try {
                    getContext().startActivity(i);
                    call.resolve();
                    return;
                } catch (Exception ignored) {
                    // Not exported on this version; try the next one.
                }
            }
        }
        open(call, appDetails());
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
    }

    private void open(PluginCall call, Intent i) {
        try {
            getContext().startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            getContext().startActivity(appDetails().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }
}
