package app.vaulttv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
    // Option A: hosted URL (works anywhere, companion via LAN for local files)
    // private static final String VAULTTV_URL = "https://vaulttv.pages.dev";
    // Option B: LAN dev server (same network as host machine)
    private static final String VAULTTV_URL = "http://192.168.1.232:5174";
    // ─────────────────────────────────────────────────────────────────────

    // ── Spatial navigation JS ─────────────────────────────────────────────
    private static final String SPATIAL_NAV_JS = "(function(){"
        // Guard: only install once per page — onPageFinished can fire multiple times
        // (resource loads, hash changes), which would stack duplicate keydown listeners.
        + "if(window.__snav)return;"
        + "window.__snav=true;"
        + "var SEL='button,input,textarea,select,[data-card],[role=button],a[href]';"
        // Give card divs a tabindex so they can receive focus
        + "function stamp(){"
        +   "document.querySelectorAll('[data-card]').forEach(function(el){"
        +     "if(!el.tabIndex||el.tabIndex<0)el.setAttribute('tabindex','0');"
        +   "});"
        + "}"
        // Return center-x and center-y of a DOMRect
        + "function cx(r){return r.left+r.width/2;}"
        + "function cy(r){return r.top+r.height/2;}"
        // Find the best focusable neighbour in direction dir
        + "function move(dir){"
        +   "var cur=document.activeElement,cr=cur?cur.getBoundingClientRect():null;"
        +   "var best=null,bestScore=Infinity;"
        +   "document.querySelectorAll(SEL).forEach(function(el){"
        +     "if(el===cur||el.disabled||el.offsetParent===null)return;"
        +     "var r=el.getBoundingClientRect();"
        +     "if(!r.width||!r.height)return;"
        // Directional gate: element must be clearly in the right direction
        +     "if(dir==='down' &&r.top  <(cr?cr.bottom-2:0))return;"
        +     "if(dir==='up'   &&r.bottom>(cr?cr.top+2   :window.innerHeight))return;"
        +     "if(dir==='right'&&r.left  <(cr?cr.right-2 :0))return;"
        +     "if(dir==='left' &&r.right >(cr?cr.left+2  :window.innerWidth))return;"
        // Score = primary distance + 0.3 * perpendicular distance
        // Primary = movement in the pressed direction; perp = sideways drift
        +     "var primary,perp;"
        +     "if(dir==='down' ){primary=r.top   -(cr?cr.bottom:0);perp=Math.abs(cx(r)-(cr?cx(cr):cx(r)));}"
        +     "else if(dir==='up'   ){primary=(cr?cr.top:window.innerHeight)-r.bottom;perp=Math.abs(cx(r)-(cr?cx(cr):cx(r)));}"
        +     "else if(dir==='right'){primary=r.left  -(cr?cr.right:0);perp=Math.abs(cy(r)-(cr?cy(cr):cy(r)));}"
        +     "else                  {primary=(cr?cr.left:window.innerWidth)-r.right; perp=Math.abs(cy(r)-(cr?cy(cr):cy(r)));}"
        +     "if(primary<0)return;"  // shouldn't happen after gate, but safety
        +     "var score=primary+perp*0.3;"
        +     "if(score<bestScore){bestScore=score;best=el;}"
        +   "});"
        +   "if(!best)return false;"
        +   "best.focus({preventScroll:false});"
        +   "best.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});"
        +   "return true;"
        + "}"
        + "document.addEventListener('keydown',function(e){"
        +   "var tag=(document.activeElement||{}).tagName||'';"
        +   "var isText=(tag==='TEXTAREA')||(tag==='INPUT'&&!/checkbox|radio|submit|button/i.test((document.activeElement||{}).type||''));"
        +   "var k=e.keyCode,dir=k===40||k===227?'down':k===38||k===226?'up':k===39||k===228?'right':k===37||k===225?'left':null;"
        // In a text field, left/right move cursor — don't intercept them
        +   "if(isText&&(dir==='left'||dir==='right'))return;"
        +   "if(dir){"
        +     "e.preventDefault();e.stopPropagation();"
        +     "if(!move(dir)){"
        +       "var s=document.querySelector('main')||document.scrollingElement;"
        +       "if(dir==='down')s.scrollTop+=200;"
        +       "else if(dir==='up')s.scrollTop-=200;"
        +     "}"
        +     "return;"
        +   "}"
        // OK / Enter — click the focused element (unless it's a text input)
        +   "if((k===13||k===23)&&!isText){"
        +     "var el=document.activeElement;"
        +     "if(el&&el!==document.body){el.click();e.preventDefault();}"
        +   "}"
        + "},true);"
        // Re-stamp new cards whenever React injects them
        + "new MutationObserver(stamp).observe(document.body,{childList:true,subtree:true});"
        + "stamp();"
        + "setTimeout(function(){var f=document.querySelector(SEL);if(f)f.focus();},600);"
        + "})();";
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
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " VaultTV-FireTV");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Intercept the Supabase OAuth authorize URL and open it in Silk.
                // This must happen BEFORE Supabase can 302-redirect to accounts.google.com —
                // Android's shouldOverrideUrlLoading does NOT fire on server-side redirects,
                // so if we let the WebView load the Supabase URL, the WebView silently
                // follows the redirect to Google and Google blocks it as an embedded browser.
                // Opening the Supabase URL in Silk means the entire auth flow (Supabase →
                // Google → back to Supabase → vaulttv://callback) stays in Silk.
                if (url.contains("/auth/v1/authorize") || url.contains("accounts.google.com")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                webView.evaluateJavascript(SPATIAL_NAV_JS, null);
            }
        });

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
                webView.evaluateJavascript(SPATIAL_NAV_JS, null);
            }
        });

        webView.loadUrl(VAULTTV_URL);
    }

    // ── Deep-link callback from Silk after Google OAuth ───────────────────
    // When Silk finishes OAuth it redirects to vaulttv://auth/callback#tokens.
    // Android fires onNewIntent (not shouldOverrideUrlLoading) because the URL
    // comes from an external app (Silk), not from within the WebView.
    // singleTop launchMode ensures this activity is reused rather than recreated.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null && "vaulttv".equals(data.getScheme())) {
            String fragment = data.getFragment();
            String query    = data.getQuery();
            String payload  = (fragment != null && !fragment.isEmpty()) ? fragment
                            : (query    != null && !query.isEmpty())    ? query
                            : "";
            if (!payload.isEmpty()) {
                String safe = payload.replace("\\", "\\\\").replace("'", "\\'");
                String js   = "window.__vaulttvAuthCallback && window.__vaulttvAuthCallback('" + safe + "');";
                webView.evaluateJavascript(js, null);
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView.canGoBack()) { webView.goBack(); return true; }
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
