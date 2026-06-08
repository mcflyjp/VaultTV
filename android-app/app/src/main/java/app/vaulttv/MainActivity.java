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
    // Option A: hosted URL (works anywhere, companion via LAN for local files)
    // private static final String VAULTTV_URL = "https://vaulttv.pages.dev";
    // Option B: LAN dev server (same network as host machine)
    private static final String VAULTTV_URL = "http://192.168.1.232:5174";
    // ─────────────────────────────────────────────────────────────────────

    // ── Spatial navigation JS injected after every page load ─────────────
    // Makes all cards/buttons focusable and enables arrow-key navigation.
    private static final String SPATIAL_NAV_JS = "(function(){"
        // Selector for everything we want to be D-pad reachable
        + "var SEL='button,[data-card],[role=button],a[href],[tabindex]';"
        // Make items focusable and give visual focus ring
        + "function makeFocusable(){"
        +   "document.querySelectorAll('[data-card]').forEach(function(el){"
        +     "if(!el.getAttribute('tabindex'))el.setAttribute('tabindex','0');"
        +   "});"
        + "}"
        // Spatial nav: find closest focusable in a given direction
        + "function rect(el){return el.getBoundingClientRect();}"
        + "function cx(r){return r.left+r.width/2;}"
        + "function cy(r){return r.top+r.height/2;}"
        + "function navigate(dir){"
        +   "var cur=document.activeElement;"
        +   "var cr=cur?rect(cur):null;"
        +   "var candidates=Array.from(document.querySelectorAll(SEL)).filter(function(el){"
        +     "if(el===cur||el.offsetParent===null)return false;"
        +     "var r=rect(el);"
        +     "if(r.width===0||r.height===0)return false;"
        +     "if(dir==='right')return r.left>=(cr?cr.right-4:0);"
        +     "if(dir==='left') return r.right<=(cr?cr.left+4:window.innerWidth);"
        +     "if(dir==='down') return r.top>=(cr?cr.bottom-4:0);"
        +     "if(dir==='up')   return r.bottom<=(cr?cr.top+4:window.innerHeight);"
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
        // Weight perpendicular axis less (prefer items in the primary direction)
        +     "var wa=Math.sqrt(dax*dax*1.5+day*day*(dir==='left'||dir==='right'?3:1));"
        +     "var wb=Math.sqrt(dbx*dbx*1.5+dby*dby*(dir==='left'||dir==='right'?3:1));"
        +     "return wa<wb?a:b;"
        +   "});"
        +   "best.focus({preventScroll:false});"
        +   "best.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});"
        +   "return true;"
        + "}"
        // Scroll amount when no focusable target exists in that direction
        + "var SCROLL_STEP=220;"
        // Arrow key handler — always intercepts arrows so WebView never does its
        // own page-jump scroll (Android WebView treats DPAD up/down as Home/End)
        + "document.addEventListener('keydown',function(e){"
        +   "var tag=document.activeElement?document.activeElement.tagName:'BODY';"
        +   "if(tag==='INPUT'||tag==='TEXTAREA')return;"
        +   "var dir=null;"
        +   "if(e.keyCode===39||e.keyCode===228)dir='right';"
        +   "if(e.keyCode===37||e.keyCode===225)dir='left';"
        +   "if(e.keyCode===40||e.keyCode===227)dir='down';"
        +   "if(e.keyCode===38||e.keyCode===226)dir='up';"
        +   "if(dir){"
        // Always stop WebView from doing its own scroll
        +     "e.preventDefault();"
        +     "e.stopPropagation();"
        +     "if(!navigate(dir)){"
        // No focusable target — scroll the page manually instead
        +       "var scroller=document.querySelector('main')||document.scrollingElement||document.documentElement;"
        +       "if(dir==='down')scroller.scrollTop+=SCROLL_STEP;"
        +       "else if(dir==='up')scroller.scrollTop-=SCROLL_STEP;"
        +       "else if(dir==='right')scroller.scrollLeft+=SCROLL_STEP;"
        +       "else if(dir==='left')scroller.scrollLeft-=SCROLL_STEP;"
        +     "}"
        +   "}"
        // Enter / DPAD_CENTER = click focused element
        +   "if(e.keyCode===13||e.keyCode===23){"
        +     "var el=document.activeElement;"
        +     "if(el&&el!==document.body){el.click();e.preventDefault();}"
        +   "}"
        + "},true);"
        // Re-run makeFocusable when DOM changes (React route changes add new cards)
        + "var obs=new MutationObserver(function(){makeFocusable();});"
        + "obs.observe(document.body,{childList:true,subtree:true});"
        + "makeFocusable();"
        // Focus first interactive element after a short delay
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
        // Append identifier so the React app can detect FireTV WebView
        // and suppress Google OAuth (blocked by Google in embedded browsers)
        settings.setUserAgentString(settings.getUserAgentString() + " VaultTV-FireTV");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                // Inject spatial navigation after every page / route load
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
                // Re-inject after returning from fullscreen
                webView.evaluateJavascript(SPATIAL_NAV_JS, null);
            }
        });

        webView.loadUrl(VAULTTV_URL);
    }

    // ── FireTV / Android TV d-pad + back button ───────────────────────────
    // Arrow keys and Enter are forwarded to the WebView as key events.
    // The spatial nav JS above handles them; we only intercept Back here.
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView.canGoBack()) { webView.goBack(); return true; }
        }
        // Let all other keys (arrows, enter, play/pause, etc.) pass to WebView
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause()  { super.onPause();  webView.onPause(); }
    @Override
    protected void onResume() { super.onResume(); webView.onResume(); }
    @Override
    protected void onDestroy(){ super.onDestroy(); webView.destroy(); }
}
