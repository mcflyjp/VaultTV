package app.vaulttv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
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
    // Spatial nav — injected on every page load and after OAuth return.
    // window.__snav guards against duplicate keydown listeners, but CSS and
    // MutationObserver are idempotent and safe to re-run.
    private static final String SPATIAL_NAV_JS = "(function(){"

        // ── Focus-highlight CSS (injected once, survives theme changes) ────────
        + "if(!window.__snavCss){"
        +   "window.__snavCss=true;"
        +   "var st=document.createElement('style');st.id='snav-style';"
        // Visible purple outline on EVERY element type in every theme
        +   "st.textContent="
        +     "'.snav-focused{"
        +       "outline:4px solid #7c3aed!important;"
        +       "outline-offset:2px!important;"
        +       "box-shadow:0 0 0 4px rgba(124,58,237,0.4)!important;"
        +       "border-radius:4px!important;"
        +       "position:relative!important;"
        +       "z-index:9999!important;"
        +     "}';"
        +   "document.head.appendChild(st);"
        + "}"

        // Only install the keydown listener once
        + "if(window.__snav)return;"
        + "window.__snav=true;"

        // ── Selector: everything a user might want to activate ─────────────────
        // Note: does NOT use offsetParent check — that excludes position:fixed
        // elements (sidebar, player controls, top nav) which are always visible.
        + "var SEL='button:not([disabled]),a[href],[data-card],"
        +         "input:not([disabled]),select:not([disabled]),[tabindex=\"0\"]';"

        // ── Visibility: use viewport bounds, not offsetParent ─────────────────
        // offsetParent===null for position:fixed elements even when fully visible.
        + "function isVisible(el){"
        +   "if(el.disabled)return false;"
        +   "var r=el.getBoundingClientRect();"
        +   "return r.width>0&&r.height>0"
        +     "&&r.bottom>0&&r.top<window.innerHeight"
        +     "&&r.right>0&&r.left<window.innerWidth;"
        + "}"

        + "function visEls(scope){"
        +   "var root=scope||document;"
        +   "return Array.from(root.querySelectorAll(SEL)).filter(isVisible);"
        + "}"

        // ── Stamp tabindex on data-card elements ──────────────────────────────
        + "function stamp(){"
        +   "document.querySelectorAll('[data-card]').forEach(function(el){"
        +     "if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');"
        +   "});"
        + "}"

        // ── Focus an element and mark it ──────────────────────────────────────
        + "function doFocus(el){"
        +   "document.querySelectorAll('.snav-focused').forEach(function(e){"
        +     "e.classList.remove('snav-focused');"
        +   "});"
        +   "el.focus({preventScroll:true});"
        +   "el.classList.add('snav-focused');"
        +   "el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});"
        + "}"

        // ── Detect the active modal/overlay scope ─────────────────────────────
        // If a full-screen overlay (player, settings panel, dialog) is open,
        // lock D-pad focus inside it so the background page is unaffected.
        + "function getScope(){"
        // Explicit React portals / dialogs
        +   "var dlg=document.querySelector('[role=dialog]');"
        +   "if(dlg&&isVisible(dlg))return dlg;"
        // Full-screen fixed overlays (VideoPlayer, ArtworkPicker, etc.)
        // Identify by covering >80% of both dimensions
        +   "var overlays=Array.from(document.querySelectorAll('*')).filter(function(el){"
        +     "var s=window.getComputedStyle(el);"
        +     "if(s.position!=='fixed'&&s.position!=='absolute')return false;"
        +     "var r=el.getBoundingClientRect();"
        +     "return r.width>window.innerWidth*0.8&&r.height>window.innerHeight*0.8&&r.top<=10;"
        +   "});"
        +   "if(overlays.length)return overlays[overlays.length-1];"
        +   "return null;"
        + "}"

        // ── Strict beam-based move ────────────────────────────────────────────
        // Up/down: candidates MUST have horizontal pixel overlap with current.
        // Left/right: candidates MUST have vertical pixel overlap with current.
        // If nothing in the beam, scroll instead of jumping sideways.
        + "function move(dir){"
        +   "var cur=document.activeElement;"
        +   "var noFocus=!cur||cur===document.body||cur===document.documentElement;"
        +   "var scope=getScope();"
        +   "var els=visEls(scope);"
        // If scope found but current element is outside it, reset focus inside
        +   "if(scope&&cur&&!scope.contains(cur)){"
        +     "if(els.length)doFocus(els[0]);"
        +     "return;"
        +   "}"
        +   "if(noFocus){if(els.length)doFocus(els[0]);return;}"
        +   "var cr=cur.getBoundingClientRect();"
        +   "var cands=[];"
        +   "els.forEach(function(el){"
        +     "if(el===cur)return;"
        +     "var r=el.getBoundingClientRect();"
        +     "var d,overlap;"
        +     "if(dir==='down'){"
        +       "if(r.top<cr.bottom-5)return;"   // not below
        +       "overlap=Math.min(r.right,cr.right)-Math.max(r.left,cr.left);"
        +       "if(overlap<=2)return;"           // not in horizontal beam
        +       "d=r.top-cr.bottom;"
        +     "}else if(dir==='up'){"
        +       "if(r.bottom>cr.top+5)return;"   // not above
        +       "overlap=Math.min(r.right,cr.right)-Math.max(r.left,cr.left);"
        +       "if(overlap<=2)return;"
        +       "d=cr.top-r.bottom;"
        +     "}else if(dir==='right'){"
        +       "if(r.left<cr.right-5)return;"   // not to the right
        +       "overlap=Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top);"
        +       "if(overlap<=2)return;"           // not in vertical beam
        +       "d=r.left-cr.right;"
        +     "}else{"                            // left
        +       "if(r.right>cr.left+5)return;"   // not to the left
        +       "overlap=Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top);"
        +       "if(overlap<=2)return;"
        +       "d=cr.left-r.right;"
        +     "}"
        +     "if(d<0)d=0;"
        +     "cands.push({el:el,d:d});"
        +   "});"
        +   "cands.sort(function(a,b){return a.d-b.d;});"
        +   "if(cands.length){doFocus(cands[0].el);return;}"
        // Nothing in strict beam — fall back to nearest element in direction
        // (ignores overlap requirement). Fixes Netflix theme where TopNav links
        // are left-aligned and don't overlap horizontally with centred shelf cards.
        +   "var fallback=[];"
        +   "els.forEach(function(el){"
        +     "if(el===cur)return;"
        +     "var r=el.getBoundingClientRect();"
        +     "var inDir=false;"
        +     "if(dir==='down'&&r.top>=cr.bottom-5)inDir=true;"
        +     "else if(dir==='up'&&r.bottom<=cr.top+5)inDir=true;"
        +     "else if(dir==='right'&&r.left>=cr.right-5)inDir=true;"
        +     "else if(dir==='left'&&r.right<=cr.left+5)inDir=true;"
        +     "if(!inDir)return;"
        +     "var cx1=(cr.left+cr.right)/2,cy1=(cr.top+cr.bottom)/2;"
        +     "var cx2=(r.left+r.right)/2,cy2=(r.top+r.bottom)/2;"
        +     "var dist=Math.sqrt((cx2-cx1)*(cx2-cx1)+(cy2-cy1)*(cy2-cy1));"
        +     "fallback.push({el:el,d:dist});"
        +   "});"
        +   "fallback.sort(function(a,b){return a.d-b.d;});"
        +   "if(fallback.length){doFocus(fallback[0].el);return;}"
        // Still nothing in viewport — look for elements just off-screen in the
        // direction of travel (up to 4 viewport-heights away), scroll to the
        // nearest one and focus it once it's visible.
        +   "var allOffscreen=Array.from((scope||document).querySelectorAll(SEL));"
        +   "var scrollCands=[];"
        +   "allOffscreen.forEach(function(el){"
        +     "if(el===cur)return;"
        +     "var r=el.getBoundingClientRect();"
        +     "if(r.width<=0||r.height<=0)return;"
        +     "var inDir=false;"
        +     "if(dir==='down'&&r.top>=window.innerHeight&&r.top<window.innerHeight*5)inDir=true;"
        +     "else if(dir==='up'&&r.bottom<=0&&r.bottom>-window.innerHeight*5)inDir=true;"
        +     "if(!inDir)return;"
        +     "var cx1=(cr.left+cr.right)/2,cy1=(cr.top+cr.bottom)/2;"
        +     "var cx2=(r.left+r.right)/2,cy2=(r.top+r.bottom)/2;"
        +     "var dist=Math.sqrt((cx2-cx1)*(cx2-cx1)+(cy2-cy1)*(cy2-cy1));"
        +     "scrollCands.push({el:el,dist:dist});"
        +   "});"
        +   "scrollCands.sort(function(a,b){return a.dist-b.dist;});"
        +   "if(scrollCands.length){"
        +     "scrollCands[0].el.scrollIntoView({block:'nearest',behavior:'smooth'});"
        +     "setTimeout(function(){doFocus(scrollCands[0].el);},320);"
        +     "return;"
        +   "}"
        // Absolute last resort — just scroll
        +   "var scroller=document.querySelector('main')||document.scrollingElement;"
        +   "if(dir==='down')scroller.scrollTop+=160;"
        +   "else if(dir==='up')scroller.scrollTop-=160;"
        + "}"

        // ── Keydown handler ───────────────────────────────────────────────────
        + "document.addEventListener('keydown',function(e){"
        +   "var tag=(document.activeElement||{}).tagName||'';"
        +   "var isText=tag==='TEXTAREA'||(tag==='INPUT'"
        +     "&&!/checkbox|radio|submit|button/i.test((document.activeElement||{}).type||''));"
        +   "var k=e.keyCode;"
        // FireTV remote: DPAD_DOWN=40,227  DPAD_UP=38,226  DPAD_RIGHT=39,228  DPAD_LEFT=37,225
        +   "var dir=k===40||k===227?'down':k===38||k===226?'up'"
        +            ":k===39||k===228?'right':k===37||k===225?'left':null;"
        +   "if(isText&&(dir==='left'||dir==='right'))return;"
        +   "if(dir){e.preventDefault();e.stopPropagation();move(dir);return;}"
        // SELECT/ENTER: click the focused element
        // stopPropagation prevents the event reaching React's onKeyDown too,
        // which would double-fire and toggle the tray open then immediately closed.
        +   "if((k===13||k===23)&&!isText){"
        +     "var el=document.activeElement;"
        +     "if(el&&el!==document.body){el.click();e.preventDefault();e.stopPropagation();}"
        +   "}"
        + "},true);"

        // ── MutationObserver: stamp new cards + restore focus if lost ─────────
        + "var _lastFocused=null;"
        + "new MutationObserver(function(){"
        +   "stamp();"
        // If focus fell back to body (e.g. after React re-render), restore it
        +   "var cur=document.activeElement;"
        +   "if(cur&&cur!==document.body&&cur!==document.documentElement){"
        +     "_lastFocused=cur;"
        +   "}else if(_lastFocused&&isVisible(_lastFocused)){"
        +     "_lastFocused.classList.add('snav-focused');"
        +     "_lastFocused.focus({preventScroll:true});"
        +   "}"
        + "}).observe(document.body,{childList:true,subtree:true,attributes:false});"

        + "stamp();"

        // Initial focus after React's first render
        + "setTimeout(function(){"
        +   "var all=visEls(null);"
        +   "if(all.length){doFocus(all[0]);_lastFocused=all[0];}"
        + "},1000);"

        + "})();";
    // ─────────────────────────────────────────────────────────────────────

    private WebView webView;
    private ProgressBar progressBar;
    private volatile boolean backHandledByWeb = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static final int REQUEST_PLAY_VIDEO = 42;

    // ── JavaScript bridge ────────────────────────────────────────────────────
    public class VaultTVBridge {

        /** Called by web when back button is consumed by the JS layer */
        @JavascriptInterface
        public void backHandled() {
            backHandledByWeb = true;
        }

        /**
         * Called by the web app to launch the native ExoPlayer.
         * Runs on a background thread — post to main thread before starting Activity.
         *
         * @param url         Stream URL (HLS, MP4, etc.)
         * @param title       Title shown in recents / task switcher
         * @param startTimeSec Resume position in seconds (0 = from start)
         */
        @JavascriptInterface
        public void playVideo(String url, String title, double startTimeSec) {
            mainHandler.post(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra("url",           url);
                intent.putExtra("title",         title);
                intent.putExtra("start_time_ms", (long)(startTimeSec * 1000));
                startActivityForResult(intent, REQUEST_PLAY_VIDEO);
            });
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView     = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        // Hardware acceleration for smooth video decode on FireTV Stick
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Bridge so the web page can signal it consumed the back button
        webView.addJavascriptInterface(new VaultTVBridge(), "vaulttvBridge");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
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
            // Ask the web page first — if the player is open it will handle it
            // and call vaulttvBridge.backHandled() to set the flag.
            // Give JS 150ms to respond, then fall back to normal back navigation.
            backHandledByWeb = false;
            webView.evaluateJavascript("window.__vaulttvBack && window.__vaulttvBack()", null);
            mainHandler.postDelayed(() -> {
                if (!backHandledByWeb && webView.canGoBack()) {
                    webView.goBack();
                }
            }, 150);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ── Native player finished — update JS watch history ────────────────────
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PLAY_VIDEO && resultCode == RESULT_OK && data != null) {
            long posMs = data.getLongExtra("position_ms", 0);
            long durMs = data.getLongExtra("duration_ms", 0);
            String js = "window.__nativePlayerDone && window.__nativePlayerDone("
                      + posMs + "," + durMs + ");";
            webView.evaluateJavascript(js, null);
        }
    }

    @Override
    protected void onPause()  { super.onPause();  webView.onPause(); }
    @Override
    protected void onResume() { super.onResume(); webView.onResume(); }
    @Override
    protected void onDestroy(){ super.onDestroy(); webView.destroy(); }
}
