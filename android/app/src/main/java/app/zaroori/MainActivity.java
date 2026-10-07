package app.zaroori;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * "Share to ZarooriBox": Android hands shared text or photos over as ACTION_SEND.
 * They are turned into an app.zaroori://share link before Capacitor sees the intent,
 * so the web app's /app/share page handles them like any other deep link.
 */
public class MainActivity extends BridgeActivity {

    private static final long MAX_SHARED_BYTES = 20L * 1024 * 1024;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Intent converted = fromShare(getIntent());
        if (converted != null) setIntent(converted);
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        Intent converted = fromShare(intent);
        super.onNewIntent(converted != null ? converted : intent);
    }

    private Intent fromShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType() == null ? "" : intent.getType();
        Uri.Builder link = new Uri.Builder().scheme("app.zaroori").authority("share");

        if (type.startsWith("image/")) {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            File copy = stream == null ? null : copyToShareFolder(stream, type);
            if (copy == null) return null;
            link.appendQueryParameter("file", copy.getAbsolutePath()).appendQueryParameter("type", type);
        } else {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text == null && subject == null) return null;
            if (subject != null) link.appendQueryParameter("title", subject);
            if (text != null) link.appendQueryParameter("text", text.toString());
        }

        Intent view = new Intent(Intent.ACTION_VIEW, link.build());
        view.setPackage(getPackageName());
        return view;
    }

    /** Copies a shared photo into cache/shared, the only folder the web app will read shared files from. */
    private File copyToShareFolder(Uri uri, String type) {
        File dir = new File(getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();

        String ext = type.endsWith("png") ? ".png" : type.endsWith("webp") ? ".webp" : ".jpg";
        File out = new File(dir, "shared-" + System.currentTimeMillis() + ext);
        try (InputStream in = getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) return null;
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_SHARED_BYTES) {
                    os.close();
                    out.delete();
                    return null;
                }
                os.write(buf, 0, n);
            }
            return out;
        } catch (Exception e) {
            out.delete();
            return null;
        }
    }
}
