/**
 * PlayerActivity
 *
 * The native ExoPlayer used on FireTV, launched from the bridge. Handles remote
 * key input, subtitle and audio track selection, audio delay, resume position,
 * and the next episode prompt.
 *
 * Falls back to VLC when playback fails, which covers containers and subtitle
 * formats ExoPlayer refuses, such as PGS bitmap subtitles. That fallback is
 * the difference between an unplayable title and a working one, so any error
 * routes through it before the user is shown a failure.
 */

package app.vaulttv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.RenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

import java.util.List;

@SuppressWarnings("UnsafeOptInUsageError")
public class PlayerActivity extends Activity {

    public static final int RESULT_RETRY_VLC = 10;

    private static final long CREDITS_THRESHOLD_MS  = 20_000;
    private static final long UNKNOWN_DUR_BANNER_MS = 30 * 60_000L;
    private static final long DIM_DELAY_MS          = 5 * 60_000L;
    private static final long HUD_DURATION_MS       = 2_500;
    private static final long SEEK_STEP_MS          = 10_000;

    private ExoPlayer            player;
    private PlayerView           playerView;
    private DefaultTrackSelector trackSelector;
    private String               url;
    private long                 startTimeMs;
    private boolean              finished        = false;
    private boolean              triedVlcFallback = false;
    private boolean              dimmed          = false;
    private boolean              bannerDismissed = false;
    private boolean              subsEnabled     = true;
    private long                 lastMenuPressMs = 0;
    private final DelayAudioProcessor delayAudioProcessor = new DelayAudioProcessor();
    private TextView             nextEpBanner;
    private TextView             hudView;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable dimScreen = () -> {
        dimmed = true;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = 0.01f;
        getWindow().setAttributes(lp);
    };

    private final Runnable hideHud = () -> {
        if (hudView != null) hudView.setVisibility(View.GONE);
    };

    private final Runnable positionPoller = new Runnable() {
        @Override public void run() {
            checkCreditsWindow();
            handler.postDelayed(this, 1000);
        }
    };

    // ── onCreate ──────────────────────────────────────────────────────────────
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        setContentView(R.layout.activity_player);

        url         = getIntent().getStringExtra("url");
        startTimeMs = getIntent().getLongExtra("start_time_ms", 0);
        String subtitleUrl = getIntent().getStringExtra("subtitle_url");

        playerView = findViewById(R.id.player_view);

        trackSelector = new DefaultTrackSelector(this);
        trackSelector.setParameters(trackSelector.buildUponParameters()
                .setPreferredAudioLanguage("en")
                .setExceedAudioConstraintsIfNecessary(true)
                .build());

        // Route audio through DelayAudioProcessor so Up/Down can nudge A/V sync —
        // ExoPlayer has no built-in per-track delay API, unlike VLC's setAudioDelay().
        RenderersFactory renderersFactory = new DefaultRenderersFactory(this) {
            @Override
            protected AudioSink buildAudioSink(android.content.Context context,
                                                boolean enableFloatOutput,
                                                boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(context)
                        .setAudioProcessorChain(new DefaultAudioSink.DefaultAudioProcessorChain(delayAudioProcessor))
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .build();
            }
        };

        player = new ExoPlayer.Builder(this, renderersFactory)
                .setTrackSelector(trackSelector)
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(10000)
                .build();

        playerView.setPlayer(player);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        playerView.requestFocus();
        playerView.setControllerAutoShow(false);

        // Build MediaItem — attach external subtitle if provided
        MediaItem mediaItem;
        if (subtitleUrl != null && !subtitleUrl.isEmpty()) {
            String mime = subtitleUrl.toLowerCase().endsWith(".srt")
                    ? MimeTypes.APPLICATION_SUBRIP : MimeTypes.TEXT_VTT;
            MediaItem.SubtitleConfiguration sub = new MediaItem.SubtitleConfiguration
                    .Builder(Uri.parse(subtitleUrl))
                    .setMimeType(mime)
                    .setLanguage("en")
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build();
            mediaItem = new MediaItem.Builder()
                    .setUri(url)
                    .setSubtitleConfigurations(List.of(sub))
                    .build();
        } else {
            mediaItem = MediaItem.fromUri(url);
        }

        player.setMediaItem(mediaItem);
        player.prepare();
        if (startTimeMs > 0) player.seekTo(startTimeMs);
        player.setPlayWhenReady(true);
        playerView.showController();

        FrameLayout root = (FrameLayout) playerView.getParent();

        // HUD — top-centre toast, same pattern as VLC player
        hudView = new TextView(this);
        hudView.setTextColor(Color.WHITE);
        hudView.setTextSize(18);
        hudView.setBackgroundColor(Color.argb(180, 0, 0, 0));
        hudView.setPadding(48, 24, 48, 24);
        hudView.setVisibility(View.GONE);
        FrameLayout.LayoutParams hudLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        hudLp.topMargin = 60;
        root.addView(hudView, hudLp);

        // Next Episode banner — bottom-right, shown in last 20s
        nextEpBanner = new TextView(this);
        nextEpBanner.setText("▶  Next Episode  (●)");
        nextEpBanner.setTextColor(Color.WHITE);
        nextEpBanner.setTextSize(18);
        nextEpBanner.setBackgroundColor(Color.argb(180, 0, 0, 0));
        nextEpBanner.setPadding(40, 20, 40, 20);
        nextEpBanner.setVisibility(View.GONE);
        FrameLayout.LayoutParams bannerLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.END);
        bannerLp.bottomMargin = 80;
        bannerLp.rightMargin  = 80;
        root.addView(nextEpBanner, bannerLp);

        handler.postDelayed(positionPoller, 1000);

        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                android.util.Log.e("VaultTV", "Player error: " + e.getMessage());
                // Previously this ONLY logged. Any failure ExoPlayer couldn't
                // recover from therefore left a black surface with no message
                // and no fallback, indistinguishable from a hung download,
                // and invisible without adb. A Pokemon episode carrying a PGS
                // (bitmap) subtitle track failed exactly this way while the
                // same show's SRT-subtitled seasons played fine.
                //
                // VLC handles far more container/track combinations than
                // ExoPlayer, so hand off to it once. Only once: a VLC failure
                // must not bounce back here and loop.
                if (!triedVlcFallback) {
                    triedVlcFallback = true;
                    reportPlayerError(e);
                    android.util.Log.w("VaultTV", "Falling back to VLC after player error");
                    finishForVlcFallback();
                    return;
                }
                reportPlayerError(e);
                showFatalError(e);
            }
            @Override public void onIsPlayingChanged(boolean playing) {
                if (playing) { undim(); }
                else if (player != null && player.getPlaybackState() != Player.STATE_ENDED) {
                    handler.removeCallbacks(dimScreen);
                    handler.postDelayed(dimScreen, DIM_DELAY_MS);
                }
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) finishWithProgress(true);
            }
            @Override public void onTracksChanged(Tracks tracks) {
                boolean hasAudio = false, hasAudioTrack = false;
                for (Tracks.Group g : tracks.getGroups()) {
                    if (g.getType() == C.TRACK_TYPE_AUDIO) {
                        for (int i = 0; i < g.length; i++) {
                            hasAudioTrack = true;
                            if (g.isTrackSelected(i)) { hasAudio = true; break; }
                        }
                    }
                }
                if (hasAudioTrack && !hasAudio) {
                    android.util.Log.w("VaultTV", "Audio codec unsupported — falling back to VLC");
                    finishForVlcFallback();
                }
            }
        });
    }

    // ── HUD helpers ───────────────────────────────────────────────────────────
    private void showHud(String text) {
        handler.removeCallbacks(hideHud);
        hudView.setText(text);
        hudView.setVisibility(View.VISIBLE);
        handler.postDelayed(hideHud, HUD_DURATION_MS);
    }

    /**
     * Report what the player actually holds, rather than what we assume.
     *
     * Two subtitle fixes have now failed to change the symptom, which means the
     * model is wrong somewhere rather than the next patch being the right one.
     * This answers the three questions that distinguish the possibilities: did
     * the key arrive at all, does a text track exist, and did the selection
     * actually change. Goes to the on screen HUD as well as the companion,
     * because a television has no reachable devtools and the person holding the
     * remote is the one who can see it.
     */
    private String describeTextTracks() {
        if (player == null) return "no player";
        int groups = 0, selected = 0;
        StringBuilder langs = new StringBuilder();
        try {
            for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
                if (g.getType() != C.TRACK_TYPE_TEXT) continue;
                groups++;
                for (int i = 0; i < g.length; i++) {
                    if (g.isTrackSelected(i)) selected++;
                    String lang = g.getTrackFormat(i).language;
                    String mime = g.getTrackFormat(i).sampleMimeType;
                    if (langs.length() > 0) langs.append(",");
                    langs.append(lang == null ? "und" : lang).append("/").append(mime == null ? "?" : mime);
                }
            }
        } catch (Exception e) {
            return "track read failed: " + e.getMessage();
        }
        return "textGroups=" + groups + " selected=" + selected + " [" + langs + "]";
    }

    /** POST a short diagnostic line to the companion's /clientlog. */
    private void reportDiag(String at, String detail) {
        if (url == null || url.isEmpty()) return;
        if (!url.contains("/stream") && !url.contains("/transcode")) return;
        final String base;
        try {
            java.net.URL u = new java.net.URL(url);
            base = u.getProtocol() + "://" + u.getAuthority();
        } catch (Exception e) { return; }
        final String payload = detail;
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c =
                        (java.net.HttpURLConnection) new java.net.URL(base + "/clientlog").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("at", at);
                o.put("detail", payload);
                o.put("build", "subs-diag-1");
                c.getOutputStream().write(o.toString().getBytes("UTF-8"));
                c.getInputStream().close();
            } catch (Exception ignored) { }
        }).start();
    }

    private void toggleSubtitles() {
        subsEnabled = !subsEnabled;
        // setRendererDisabled takes a renderer INDEX, not a track type.
        // C.TRACK_TYPE_TEXT is 3, and in the default renderer ordering
        // (0=video, 1=audio, 2=text, 3=metadata) that disabled the metadata
        // renderer while subtitles carried on rendering — the HUD said OFF and
        // the text stayed on screen. setTrackTypeDisabled is the type-based
        // API this always wanted.
        String before = describeTextTracks();
        trackSelector.setParameters(trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subsEnabled)
                .build());
        // Read back rather than trusting the call: the previous two attempts
        // both reported success over subtitles that were still on screen.
        handler.postDelayed(() -> {
            String after = describeTextTracks();
            showHud("Subtitles: " + (subsEnabled ? "ON" : "OFF") + "\n" + after);
            reportDiag("subs.toggle", "want=" + (subsEnabled ? "ON" : "OFF") + " | before: " + before + " | after: " + after);
        }, 250);
    }

    /**
     * Skip forward or back, clamped to the media. Held keys repeat, so each
     * press is a modest step rather than a jump: a remote's auto-repeat turns
     * ten seconds into a fast scrub, while thirty would overshoot constantly.
     */
    private void seekBy(long deltaMs) {
        if (player == null) return;
        long dur = player.getDuration();
        long pos = player.getCurrentPosition() + deltaMs;
        if (pos < 0) pos = 0;
        if (dur != C.TIME_UNSET && pos > dur) pos = dur;
        player.seekTo(pos);
        playerView.showController();
        showHud((deltaMs > 0 ? "⏩  " : "⏪  ") + fmtTime(pos)
                + (dur != C.TIME_UNSET ? " / " + fmtTime(dur) : ""));
    }

    private static String fmtTime(long ms) {
        long t = ms / 1000, h = t / 3600, m = (t % 3600) / 60, sec = t % 60;
        return h > 0 ? String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, sec)
                     : String.format(java.util.Locale.US, "%d:%02d", m, sec);
    }

    private void adjustAudioDelay(long deltaUs) {
        delayAudioProcessor.setDelayUs(delayAudioProcessor.getDelayUs() + deltaUs);
        long ms = delayAudioProcessor.getDelayUs() / 1000;
        showHud("Audio delay: " + (ms >= 0 ? "+" : "") + ms + " ms\n(↑ later  ↓ earlier)");
    }

    // ── Lifecycle helpers ─────────────────────────────────────────────────────
    private void undim() {
        handler.removeCallbacks(dimScreen);
        if (dimmed) {
            dimmed = false;
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            getWindow().setAttributes(lp);
        }
    }

    private void checkCreditsWindow() {
        if (player == null || bannerDismissed) return;
        long dur = player.getDuration(), pos = player.getCurrentPosition();
        boolean inCredits = (dur != C.TIME_UNSET && dur > 0)
                ? ((dur - pos) > 0 && (dur - pos) <= CREDITS_THRESHOLD_MS)
                : pos >= UNKNOWN_DUR_BANNER_MS;
        nextEpBanner.setVisibility(inCredits ? View.VISIBLE : View.GONE);
    }

    private void finishWithProgress(boolean autoAdvance) {
        if (finished) return;
        finished = true;
        long posMs = player != null ? player.getCurrentPosition() : 0;
        long durMs = player != null && player.getDuration() != C.TIME_UNSET ? player.getDuration() : 0;
        Intent result = new Intent();
        result.putExtra("position_ms",  posMs);
        result.putExtra("duration_ms",  durMs);
        result.putExtra("auto_advance", autoAdvance);
        setResult(RESULT_OK, result);
        finish();
    }

    /**
     * Surface a playback failure to the user. Reaching here means VLC has
     * already been tried, so there is nothing left to fall back to and the
     * only wrong answer is a silent black screen.
     */
    private void showFatalError(PlaybackException e) {
        runOnUiThread(() -> {
            String msg = "Playback failed: " + (e.getMessage() != null ? e.getMessage() : e.getErrorCodeName());
            android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_LONG).show();
            handler.postDelayed(() -> finishWithProgress(false), 400);
        });
    }

    /**
     * POST the failure to the Media Server's /clientlog. A FireTV has no
     * reachable devtools and this player's errors previously went only to
     * logcat, so a failure here was invisible unless someone had adb attached
     * to the television.
     */
    private void reportPlayerError(PlaybackException e) {
        // The media URL is itself served by the companion for local playback, so
        // its origin is the right place to report to. Addon/torrent streams
        // point elsewhere and are simply not reported, so no extra plumbing
        // through the JS bridge for the case that matters.
        if (url == null || url.isEmpty()) return;
        final String base;
        try {
            java.net.URL u = new java.net.URL(url);
            if (!url.contains("/stream") && !url.contains("/transcode")) return;
            base = u.getProtocol() + "://" + u.getAuthority();
        } catch (Exception ex) { return; }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c =
                        (java.net.HttpURLConnection) new java.net.URL(base + "/clientlog").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("at", "exoplayer.onPlayerError");
                o.put("code", e.getErrorCodeName());
                o.put("message", e.getMessage() == null ? "" : e.getMessage());
                o.put("cause", e.getCause() == null ? "" : String.valueOf(e.getCause()));
                o.put("url", url == null ? "" : url.substring(0, Math.min(url.length(), 200)));
                o.put("build", "firetv-error-fallback-1");
                c.getOutputStream().write(o.toString().getBytes("UTF-8"));
                c.getInputStream().close();
            } catch (Exception ignored) { /* diagnostics must never break playback */ }
        }).start();
    }

    private void finishForVlcFallback() {
        Intent result = new Intent();
        result.putExtra("url",           url);
        result.putExtra("start_time_ms", startTimeMs);
        setResult(RESULT_RETRY_VLC, result);
        finish();
    }

    // ── Key handling — mirrors VLC player ────────────────────────────────────
    //
    //  Controls HIDDEN:
    //    Up        → audio delay +100ms  (HUD flash)
    //    Down      → audio delay −100ms  (HUD flash)
    //    Any key   → show controls bar
    //
    //  Controls VISIBLE:
    //    Up/Down   → audio delay (same, regardless of focus position)
    //    Menu      → subtitle toggle (HUD flash)
    //    Back      → hide controls (first press); exit (second press)
    //
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        boolean bannerVisible = nextEpBanner != null
                && nextEpBanner.getVisibility() == View.VISIBLE;

        if (bannerVisible) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                undim();
                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
                    finishWithProgress(true);
                } else if (keyCode == KeyEvent.KEYCODE_BACK) {
                    bannerDismissed = true;
                    nextEpBanner.setVisibility(View.GONE);
                }
            }
            return true;
        }

        // Consume both ACTION_DOWN and ACTION_UP for KEYCODE_BACK — prevents
        // ACTION_UP reaching super.dispatchKeyEvent which triggers onBackPressed
        // on an already-finishing activity and causes a freeze.
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                undim();
                boolean controlsVisible = playerView.isControllerFullyVisible();
                if (controlsVisible) { playerView.hideController(); }
                else { finishWithProgress(false); }
            }
            return true;
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            undim();
            boolean controlsVisible = playerView.isControllerFullyVisible();

            if (keyCode == KeyEvent.KEYCODE_BACK) {  // unreachable — kept for clarity
                return true;
            }

            // Every key, once, so we can tell "the button does nothing" apart
            // from "the button never arrived". Fire TV remotes differ in what
            // their menu button actually sends, and assuming KEYCODE_MENU is
            // exactly the kind of guess that has already cost two attempts.
            reportDiag("key", "code=" + keyCode + " name=" + KeyEvent.keyCodeToString(keyCode));

            if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_CAPTIONS
                    || keyCode == KeyEvent.KEYCODE_INFO || keyCode == KeyEvent.KEYCODE_SETTINGS) {
                long now = System.currentTimeMillis();
                if (now - lastMenuPressMs < 1500) {
                    // Double-tap MENU → switch to VLC
                    showHud("Switching to VLC…");
                    handler.postDelayed(this::finishForVlcFallback, 600);
                } else {
                    toggleSubtitles();
                }
                lastMenuPressMs = now;
                return true;
            }

            // Seek. Left and right were not handled at all, and the transport
            // controls could not be reached with the D-pad either, so there was
            // no way to skip forward or back from the remote. Handling the keys
            // directly does not depend on anything holding focus.
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                seekBy(-SEEK_STEP_MS);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
                seekBy(+SEEK_STEP_MS);
                return true;
            }

            if (!controlsVisible) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    adjustAudioDelay(+100_000);
                    return true;
                }
                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    adjustAudioDelay(-100_000);
                    return true;
                }
                playerView.showController();
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                adjustAudioDelay(+100_000);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                adjustAudioDelay(-100_000);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    // onBackPressed intentionally omitted — dispatchKeyEvent handles KEYCODE_BACK
    // for both ACTION_DOWN and ACTION_UP. Having both caused double-finish on exit
    // (ACTION_UP fell through to super which called onBackPressed on a finishing activity).

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    @Override protected void onPause()  { super.onPause();  if (player != null) player.pause(); }
    @Override protected void onResume() { super.onResume(); hideSystemUi(); if (playerView != null) playerView.requestFocus(); }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(positionPoller);
        handler.removeCallbacks(dimScreen);
        handler.removeCallbacks(hideHud);
        if (player != null) { player.release(); player = null; }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) { player.release(); player = null; }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN         |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION    |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY   |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN  |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }
}
