package app.vaulttv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

public class MainActivity extends Activity {

    // ── Change this to your VaultTV URL ──────────────────────────────────
    // LAN access (same network as the host machine):
    private static final String VAULTTV_URL = "http://192.168.1.232:5174";
    // ─────────────────────────────────────────────────────────────────────

    private WebView webView;
    private ProgressBar progressBar;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView     = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);       // localStorage (addons, library)
        settings.setMediaPlaybackRequiresUserGesture(false); // auto-play video
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW); // http companion

        // Keep app inside WebView; open nothing in external browser
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false; // handle all URLs inside WebView
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        // Grant fullscreen requests from the video player
        webView.setWebChromeClient(new WebChromeClient() {
            private View customView;

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                customView = view;
                setContentView(view);
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
            }

            @Override
            public void onHideCustomView() {
                setContentView(R.layout.activity_main);
                webView     = findViewById(R.id.webView);
                progressBar = findViewById(R.id.progressBar);
                progressBar.setVisibility(View.GONE);
                customView = null;
            }
        });

        webView.loadUrl(VAULTTV_URL);
    }

    // ── FireTV / Android TV d-pad + back button ───────────────────────
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BACK:
                if (webView.canGoBack()) { webView.goBack(); return true; }
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                // Simulate click on focused element
                webView.evaluateJavascript(
                    "document.activeElement && document.activeElement.click()", null);
                return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause()  { super.onPause();  webView.onPause(); }
    @Override
    protected void onResume() { super.onResume(); webView.onResume(); }
    @Override
    protected void onDestroy(){ super.onDestroy(); webView.destroy(); }
}
