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
    // Injected after every page load. Makes all interactive elements (cards,
    // buttons, AND form inputs) reachable with D-pad arrows + OK button.
    private static final String SPATIAL_NAV_JS = "(function(){"
        // Focusable selector — includes inputs/selects so forms are reachable
        + "var SEL='button,input,textarea,select,[data-card],[role=button],a[href]';"
        // Add tabindex to card divs so they can receive focus
        + "function makeFocusable(){"
        +   "document.querySelectorAll('[data-card]').forEach(function(el){"
        +     "if(!el.getAttribute('tabindex'))el.setAttribute('tabindex','0');"
        +   "});"
        + "}"
        + "function rect(el){return el.getBoundingClientRect();}"
        + "function cx(r){return r.left+r.width/2;}"
        + "function cy(r){return r.top+r.height/2;}"
        + "function navigate(dir){"
        +   "var cur=document.activeElement;"
        +   "var cr=(cur&&cur!==document.body)?rect(cur):null;"
        +   "var candidates=Array.from(document.querySelectorAll(SEL)).filter(function(el){"
        +     "if(el===cur||el.offsetParent===null||el.disabled)return false;"
        +     "var r=rect(el);"
        +     "if(r.width===0||r.height===0)return false;"
        // No viewport clipping — allow off-screen elements so D-pad can navigate
        // into a grid that starts below the fold; scrollIntoView brings them in.
        // Only exclude elements that are wildly far away (> 5 screens) to keep perf.
        +     "var FAR=window.innerHeight*5;"
        +     "if(r.bottom<-FAR||r.top>FAR*2)return false;"
        +     "if(!cr)return true;"
        +     "if(dir==='right')return r.left>=(cr.right-4);"
        +     "if(dir==='left') return r.right<=(cr.left+4);"
        +     "if(dir==='down') return r.top>=(cr.bottom-4);"
        +     "if(dir==='up')   return r.bottom<=(cr.top+4);"
        +     "return false;"
        +   "});"
        +   "if(!candidates.length)return false;"
        +   "var best=candidates.reduce(function(a,b){"
        +     "var ra=rect(a),rb=rect(b);"
        +     "var dax,day,dbx,dby;"
        +     "if(cr){"
        +       "dax=cx(ra)-cx(cr);day=cy(ra)-cy(cr);"
        +       "dbx=cx(rb)-cx(cr);dby=cy(rb)-cy(cr);"
        +     "}else{dax=cx(ra);day=cy(ra);dbx=cx(rb);dby=cy(rb);}"
        // Weight: primary axis counts 1x, perpendicular counts 2x (prefer straight-line movement)
        +     "var pw=(dir==='up'||dir==='down')?1:2;"
        +     "var wa=Math.sqrt(dax*dax*pw+day*day*(pw===1?2:1));"
        +     "var wb=Math.sqrt(dbx*dbx*pw+dby*dby*(pw===1?2:1));"
        +     "return wa<wb?a:b;"
        +   "});"
        +   "best.focus({preventScroll:false});"
        +   "best.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});"
        +   "return true;"
        + "}"
        + "var SCROLL_STEP=220;"
        + "document.addEventListener('keydown',function(e){"
        +   "var active=document.activeElement;"
        +   "var tag=active?active.tagName:'';"
        // When inside a text input, only intercept Up/Down (to leave the field);
        // Left/Right/Enter pass through so typing still works normally
        +   "var inText=(tag==='INPUT'&&active.type!=='checkbox'&&active.type!=='radio'&&active.type!=='submit'&&active.type!=='button')||tag==='TEXTAREA';"
        +   "var dir=null;"
        +   "if(e.keyCode===39||e.keyCode===228)dir='right';"
        +   "if(e.keyCode===37||e.keyCode===225)dir='left';"
        +   "if(e.keyCode===40||e.keyCode===227)dir='down';"
        +   "if(e.keyCode===38||e.keyCode===226)dir='up';"
        // Inside a text input: let left/right move cursor; only intercept up/down to leave field
        +   "if(inText&&(dir==='left'||dir==='right'))return;"
        +   "if(dir){"
        +     "e.preventDefault();e.stopPropagation();"
        +     "if(!navigate(dir)){"
        +       "var scroller=document.querySelector('main')||document.scrollingElement||document.documentElement;"
        +       "if(dir==='down')scroller.scrollTop+=SCROLL_STEP;"
        +       "else if(dir==='up')scroller.scrollTop-=SCROLL_STEP;"
        +     "}"
        +   "}"
        // Enter on a non-input element = click it.
        // Enter on an input/select = submit or toggle (let default happen)
        +   "if(e.keyCode===13||e.keyCode===23){"
        +     "if(!inText&&tag!=='SELECT'){"
        +       "if(active&&active!==document.body){active.click();e.preventDefault();}"
        +     "}"
        +   "}"
        + "},true);"
        + "var obs=new MutationObserver(function(){makeFocusable();});"
        + "obs.observe(document.body,{childList:true,subtree:true});"
        + "makeFocusable();"
        + "setTimeout(function(){"
        +   "var first=document.querySelector(SEL);"
        +   "if(first)first.focus();"
        + "},800);"
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
