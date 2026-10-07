package app.zaroori;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app hand today's list to the home-screen widget (see src/lib/widget.ts). */
@CapacitorPlugin(name = "ZarooriWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String lines = call.getString("lines", "[]");
        String day = call.getString("day", "");
        getContext()
            .getSharedPreferences(TodayWidget.PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(TodayWidget.KEY_LINES, lines)
            .putString(TodayWidget.KEY_DAY, day)
            .apply();
        TodayWidget.refreshAll(getContext());
        call.resolve(new JSObject());
    }
}
