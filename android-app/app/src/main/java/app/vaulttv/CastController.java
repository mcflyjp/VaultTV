package app.vaulttv;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.webkit.WebView;

import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaRouter;

import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.CastState;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.images.WebImage;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Native Google Cast support, surfaced to the web layer over the JS bridge.
 *
 * Why this exists at all: the React app already has Cast code
 * (src/context/CastContext.jsx + a Remote Playback fallback in
 * VideoPlayer.jsx), but BOTH are inert inside this app. Android WebView is
 * Chromium-based yet ships without Chrome's media-router integration, so
 * neither window.chrome.cast nor video.remote exists here. Casting from the
 * APK therefore has to be done natively and handed to JS.
 *
 * Deliberately drives the SDK programmatically rather than using
 * CastButtonFactory/MediaRouteButton: those widgets require an AppCompat
 * theme, and MainActivity extends plain android.app.Activity. The device
 * picker below is a plain AlertDialog over MediaRouter's route list, which
 * keeps the whole feature free of an AppCompat migration.
 *
 * Threading: every public CastContext/RemoteMediaClient call must happen on
 * the main thread or the SDK throws IllegalStateException — and JS bridge
 * methods arrive on the WebView's JS thread, not main. Hence the
 * runOnUiThread() wrappers. isAvailable() is the exception: it can't post and
 * return a value, so it reads a volatile field kept up to date by the
 * listeners (which do run on main).
 */
public class CastController {

    private final Activity activity;
    private final WebView webView;

    private CastContext castContext;
    private MediaRouter mediaRouter;
    private MediaRouteSelector routeSelector;

    /** Written on main thread by listeners, read from the JS thread. */
    private volatile boolean available = false;
    private volatile boolean connected = false;

    // Media the user asked to cast before a session existed — loaded once the
    // session actually starts (they still have to pick a device first).
    private String pendingUrl, pendingTitle, pendingPoster, pendingContentType;
    private double pendingStartSec;
    private boolean hasPending = false;

    // A no-op callback is still required: MediaRouter only performs active
    // discovery while at least one callback is registered, so without this the
    // route list stays empty and the picker looks like "no devices".
    private final MediaRouter.Callback routerCallback = new MediaRouter.Callback() { };

    private final SessionManagerListener<CastSession> sessionListener = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarted(CastSession s, String sessionId) { onConnected(s); }
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { onConnected(s); }
        @Override public void onSessionEnded(CastSession s, int error)      { onDisconnected(); }
        @Override public void onSessionSuspended(CastSession s, int reason) { onDisconnected(); }
        @Override public void onSessionStartFailed(CastSession s, int error){ onDisconnected(); }
        @Override public void onSessionResumeFailed(CastSession s, int error){ onDisconnected(); }
        @Override public void onSessionStarting(CastSession s) { }
        @Override public void onSessionResuming(CastSession s, String sessionId) { }
        @Override public void onSessionEnding(CastSession s) { }
    };

    private final RemoteMediaClient.ProgressListener progressListener = (progressMs, durationMs) -> {
        RemoteMediaClient rmc = remoteClient();
        boolean playing = rmc != null && rmc.isPlaying();
        pushJs("window.__castProgress && window.__castProgress("
                + (progressMs / 1000.0) + "," + (durationMs / 1000.0) + "," + playing + ")");
    };

    public CastController(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    /** Safe to call on any device — no-ops where Cast can't work. */
    public void init() {
        // FireTV has no Play services, so this is the expected path there, not
        // an error. Fail soft and leave available=false.
        int status = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity);
        if (status != ConnectionResult.SUCCESS) return;

        try {
            castContext = CastContext.getSharedInstance(activity);
            routeSelector = castContext.getMergedSelector();
            mediaRouter = MediaRouter.getInstance(activity.getApplicationContext());

            castContext.addCastStateListener(state -> {
                available = state != CastState.NO_DEVICES_AVAILABLE;
                pushState();
            });
            available = castContext.getCastState() != CastState.NO_DEVICES_AVAILABLE;

            CastSession existing = castContext.getSessionManager().getCurrentCastSession();
            if (existing != null && existing.isConnected()) onConnected(existing);
        } catch (Exception e) {
            // Play services present but Cast unusable (old version, blocked, etc.)
            castContext = null;
            available = false;
        }
    }

    public void onResume() {
        if (castContext == null) return;
        castContext.getSessionManager().addSessionManagerListener(sessionListener, CastSession.class);
        if (mediaRouter != null && routeSelector != null) {
            mediaRouter.addCallback(routeSelector, routerCallback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);
        }
        pushState();
    }

    public void onPause() {
        if (castContext == null) return;
        castContext.getSessionManager().removeSessionManagerListener(sessionListener, CastSession.class);
        if (mediaRouter != null) mediaRouter.removeCallback(routerCallback);
    }

    public boolean isAvailable() { return available; }

    /**
     * Cast a URL. If no session is live yet the media is stashed and the device
     * picker opens; it loads as soon as the session connects.
     *
     * The Cast device fetches this URL itself, so it must be reachable from the
     * TV — a LAN address or the tunnel, never localhost — and must already
     * carry any auth the server needs (see requireAuth's ?token= support).
     */
    public void castVideo(String url, String title, String poster, String contentType, double startSec) {
        activity.runOnUiThread(() -> {
            if (castContext == null || url == null || url.isEmpty()) return;
            pendingUrl = url;
            pendingTitle = title;
            pendingPoster = poster;
            pendingContentType = (contentType == null || contentType.isEmpty()) ? "video/mp4" : contentType;
            pendingStartSec = startSec;
            hasPending = true;

            CastSession session = castContext.getSessionManager().getCurrentCastSession();
            if (session != null && session.isConnected()) loadPending(session);
            else showDevicePicker();
        });
    }

    public void stop() {
        activity.runOnUiThread(() -> {
            if (castContext != null) castContext.getSessionManager().endCurrentSession(true);
        });
    }

    public void playPause() {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = remoteClient();
            if (rmc == null) return;
            if (rmc.isPlaying()) rmc.pause(); else rmc.play();
        });
    }

    public void seek(double sec) {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = remoteClient();
            if (rmc != null) rmc.seek(new com.google.android.gms.cast.MediaSeekOptions.Builder()
                    .setPosition((long) (sec * 1000)).build());
        });
    }

    // ── internals ────────────────────────────────────────────────────────────

    private RemoteMediaClient remoteClient() {
        if (castContext == null) return null;
        CastSession s = castContext.getSessionManager().getCurrentCastSession();
        return s == null ? null : s.getRemoteMediaClient();
    }

    private void showDevicePicker() {
        if (mediaRouter == null || routeSelector == null) return;
        List<MediaRouter.RouteInfo> routes = new ArrayList<>();
        for (MediaRouter.RouteInfo r : mediaRouter.getRoutes()) {
            if (r.isDefaultOrBluetooth() || !r.isEnabled()) continue;
            if (r.matchesSelector(routeSelector)) routes.add(r);
        }
        if (routes.isEmpty()) {
            new AlertDialog.Builder(activity)
                    .setTitle("Cast")
                    .setMessage("No cast devices found on this network.")
                    .setPositiveButton("OK", null)
                    .show();
            return;
        }
        String[] names = new String[routes.size()];
        for (int i = 0; i < routes.size(); i++) names[i] = routes.get(i).getName();
        new AlertDialog.Builder(activity)
                .setTitle("Cast to")
                .setItems(names, (d, which) -> mediaRouter.selectRoute(routes.get(which)))
                .setNegativeButton("Cancel", (d, w) -> { hasPending = false; })
                .show();
    }

    private void loadPending(CastSession session) {
        if (!hasPending) return;
        RemoteMediaClient rmc = session.getRemoteMediaClient();
        if (rmc == null) return;

        MediaMetadata meta = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
        if (pendingTitle != null) meta.putString(MediaMetadata.KEY_TITLE, pendingTitle);
        if (pendingPoster != null && !pendingPoster.isEmpty()) {
            try { meta.addImage(new WebImage(Uri.parse(pendingPoster))); } catch (Exception ignored) { }
        }

        MediaInfo info = new MediaInfo.Builder(pendingUrl)
                .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                .setContentType(pendingContentType)
                .setMetadata(meta)
                .build();

        rmc.load(new MediaLoadRequestData.Builder()
                .setMediaInfo(info)
                .setAutoplay(true)
                .setCurrentTime((long) (pendingStartSec * 1000))
                .build());

        hasPending = false;
    }

    private void onConnected(CastSession session) {
        connected = true;
        RemoteMediaClient rmc = session.getRemoteMediaClient();
        if (rmc != null) rmc.addProgressListener(progressListener, 1000);
        loadPending(session);
        pushState();
    }

    private void onDisconnected() {
        connected = false;
        RemoteMediaClient rmc = remoteClient();
        if (rmc != null) rmc.removeProgressListener(progressListener);
        pushState();
    }

    private void pushState() {
        String name = "";
        try {
            CastSession s = castContext == null ? null : castContext.getSessionManager().getCurrentCastSession();
            if (s != null && s.getCastDevice() != null) name = s.getCastDevice().getFriendlyName();
        } catch (Exception ignored) { }
        pushJs("window.__castState && window.__castState("
                + available + "," + connected + "," + JSONObject.quote(name == null ? "" : name) + ")");
    }

    private void pushJs(String js) {
        activity.runOnUiThread(() -> {
            try { webView.evaluateJavascript(js, null); } catch (Exception ignored) { }
        });
    }
}
