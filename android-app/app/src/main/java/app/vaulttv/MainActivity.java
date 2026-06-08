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
    private static final String VAULTTV_URL = "https://vaulttv.pages.dev";
    // Option B: LAN dev server (same network as host machine)
    // private static final String VAULTTV_URL = "http://192.168.1.232:5174";
    // ─────────────────────────────────────────────────────────────────────

    // ── Spatial navigation JS ─────────────────────────────────────────────
    // Reinitialise spatial nav — called on first load and after OAuth return.
    // Setting window.__snav=false before evaluating lets us re-run safely.
    private static final String SPATIAL_NAV_JS = "(function(){"
        + "if(window.__snav)return;"
        + "window.__snav=true;"

        // ── Inject focus-highlight CSS once ──────────────────────────────────
        // Covers every focusable element type: cards, buttons, nav items, etc.
        + "if(!window.__snavCss){"
        +   "window.__snavCss=true;"
        +   "var st=document.createElement('style');"
        +   "st.textContent="
        +     "'.snav-focused{"
        +       "outline:3px solid #7c3aed!important;"
        +       "outline-offset:3px!important;"
        +       "z-index:100!important;"
        +       "position:relative!important;"
        +       "box-shadow:0 0 0 3px #7c3aed,0 8px 32px rgba(0,0,0,0.7)!important;"
        +       "border-radius:6px!important;"
        +     "}';"
        +   "document.head.appendChild(st);"
        + "}"

        // ── Focusable selector ────────────────────────────────────────────────
        + "var SEL='button:not([disabled]),input:not([disabled]),select:not([disabled]),"
        +         "[data-card],[tabindex=\"0\"],[role=button],a[href]';"

        // Give [data-card] elements a tabindex so they can receive focus
        + "function stamp(){"
        +   "document.querySelectorAll('[data-card]').forEach(function(el){"
        +     "if(!el.getAttribute('tabindex')||el.getAttribute('tabindex')<0)"
        +       "el.setAttribute('tabindex','0');"
        +   "});"
        + "}"

        // Set focus + highlight on an element
        + "function doFocus(el){"
        +   "document.querySelectorAll('.snav-focused').forEach(function(e){e.classList.remove('snav-focused');});"
        +   "el.focus({preventScroll:false});"
        +   "el.classList.add('snav-focused');"
        +   "el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});"
        + "}"

        // All currently visible focusable elements
        + "function visEls(){"
        +   "return Array.from(document.querySelectorAll(SEL)).filter(function(e){"
        +     "if(e.disabled||e.offsetParent===null)return false;"
        +     "var r=e.getBoundingClientRect();"
        +     "return r.width>0&&r.height>0;"
        +   "});"
        + "}"

        // ── Modal focus trap ──────────────────────────────────────────────────
        // If a modal/dialog/overlay is open, restrict navigation to elements
        // inside it so the background page is not affected.
        + "function getScope(){"
        +   "var modal=document.querySelector("
        +     "'[role=dialog],[data-modal],[data-overlay],"
        +     ".modal-backdrop,.settings-panel,.context-menu-open'"
        +   ");"
        +   "if(modal)return modal;"
        // Also treat any element with position:fixed that is visible and tall
        // (likely an overlay) as the scope boundary
        +   "var fixed=Array.from(document.querySelectorAll('[style*=\"position: fixed\"],[style*=\"position:fixed\"]')).filter(function(el){"
        +     "var r=el.getBoundingClientRect();"
        +     "return r.height>window.innerHeight*0.3&&r.width>window.innerWidth*0.3&&el.offsetParent!==null;"
        +   "});"
        +   "return fixed.length?fixed[fixed.length-1]:document;"
        + "}"

        // ── Strict beam-based directional move ────────────────────────────────
        // Phase 1: find candidates strictly in the beam (true column/row overlap).
        // Phase 2: only if no beam candidates, fall back to nearest in direction.
        // This means up/down NEVER goes left/right and vice versa.
        + "function move(dir){"
        +   "var cur=document.activeElement;"
        +   "var hasFocus=cur&&cur!==document.body&&cur!==document.documentElement;"
        +   "var scope=getScope();"
        +   "var els=visEls().filter(function(el){"
        +     "return scope===document||scope.contains(el);"
        +   "});"
        +   "if(!hasFocus){if(els.length)doFocus(els[0]);return;}"
        +   "var cr=cur.getBoundingClientRect();"
        // Phase 1: strictly in-beam candidates only
        +   "var beam=[];"
        +   "els.forEach(function(el){"
        +     "if(el===cur)return;"
        +     "var r=el.getBoundingClientRect();"
        +     "if(dir==='down'||dir==='up'){"
        // For up/down: element must have horizontal overlap with current element
        +       "var overlap=Math.min(r.right,cr.right)-Math.max(r.left,cr.left);"
        +       "if(overlap<=0)return;"  // no horizontal overlap → skip entirely
        +       "if(dir==='down'&&r.top<cr.bottom-5)return;"
        +       "if(dir==='up'&&r.bottom>cr.top+5)return;"
        +       "beam.push({el:el,d:dir==='down'?r.top-cr.bottom:cr.top-r.bottom});"
        +     "}else{"
        // For left/right: element must have vertical overlap with current element
        +       "var overlap=Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top);"
        +       "if(overlap<=0)return;"  // no vertical overlap → skip entirely
        +       "if(dir==='right'&&r.left<cr.right-5)return;"
        +       "if(dir==='left'&&r.right>cr.left+5)return;"
        +       "beam.push({el:el,d:dir==='right'?r.left-cr.right:cr.left-r.right});"
        +     "}"
        +   "});"
        +   "beam.sort(function(a,b){return a.d-b.d;});"
        +   "var best=beam.length?beam[0].el:null;"
        // Phase 2: no beam match → scroll (don't jump sideways)
        +   "if(!best){"
        +     "var s=document.querySelector('main')||document.scrollingElement;"
        +     "if(dir==='down')s.scrollTop+=180;"
        +     "else if(dir==='up')s.scrollTop-=180;"
        +     "return;"
        +   "}"
        +   "doFocus(best);"
        + "}"

        // ── Keydown handler ───────────────────────────────────────────────────
        + "document.addEventListener('keydown',function(e){"
        +   "var tag=(document.activeElement||{}).tagName||'';"
        +   "var isText=tag==='TEXTAREA'||(tag==='INPUT'"
        +     "&&!/checkbox|radio|submit|button/i.test((document.activeElement||{}).type||''));"
        +   "var k=e.keyCode;"
        +   "var dir=k===40||k===227?'down':k===38||k===226?'up'"
        +            ":k===39||k===228?'right':k===37||k===225?'left':null;"
        +   "if(isText&&(dir==='left'||dir==='right'))return;"
        +   "if(dir){e.preventDefault();e.stopPropagation();move(dir);return;}"
        +   "if((k===13||k===23)&&!isText){"
        +     "var el=document.activeElement;"
        +     "if(el&&el!==document.body){el.click();e.preventDefault();}"
        +   "}"
        + "},true);"

        // Re-stamp whenever React adds new cards to the DOM
        + "new MutationObserver(stamp).observe(document.body,{childList:true,subtree:true});"
        + "stamp();"

        // Initial focus — wait for React to finish first render
        + "setTimeout(function(){var all=visEls();if(all.length)doFocus(all[0]);},800);"
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
            // Re-inject spatial nav after returning from OAuth (Silk clears focus state)
            webView.evaluateJavascript("window.__snav=false;", null);
            webView.evaluateJavascript(SPATIAL_NAV_JS, null);
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
