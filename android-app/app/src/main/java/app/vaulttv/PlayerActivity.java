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
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;

@SuppressWarnings("UnsafeOptInUsageError")
public class PlayerActivity extends Activity {

    public static final int RESULT_RETRY_VLC = 10;

    private static final long CREDITS_THRESHOLD_MS  = 20_000;
    private static final long UNKNOWN_DUR_BANNER_MS = 30 * 60_000L;
    private static final long DIM_DELAY_MS          = 5 * 60_000L;
    private static final long AUDIO_STEP_MS         = 100; // match VLC's 100ms steps
    private static final long HUD_DURATION_MS       = 2_500;

    private ExoPlayer           player;
    private PlayerView          playerView;
    private AudioDelayProcessor audioDelayProcessor;
    private DefaultTrackSelector trackSelector;
    private String              url;
    private long                startTimeMs;
    private boolean             finished        = false;
    private boolean             dimmed          = false;
    private boolean             bannerDismissed = false;
    private boolean             subsEnabled     = true;
    private long                audioDelayMs    = 0;
    private TextView            nextEpBanner;
    private TextView            hudView;

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

    // ── AudioDelayProcessor ───────────────────────────────────────────────────
    // Buffers PCM audio to introduce a positive sync delay (audio plays later).
    static class AudioDelayProcessor implements AudioProcessor {
        AudioFormat format     = AudioFormat.NOT_SET;
        private int delayBytes = 0;
        private int silenceFed = 0;
        private ByteBuffer output    = ByteBuffer.allocate(0);
        private boolean    inputEnded = false;

        void setDelayMs(long ms) {
            if (format.equals(AudioFormat.NOT_SET)) return;
            if (ms < 0) ms = 0;
            int bytes = (int)(ms / 1000.0 * format.sampleRate * format.channelCount * 2);
            int frame = format.channelCount * 2;
            delayBytes = (bytes / frame) * frame;
            silenceFed = 0;
        }

        @Override
        public AudioFormat configure(AudioFormat f) throws UnhandledAudioFormatException {
            if (f.encoding != C.ENCODING_PCM_16BIT) throw new UnhandledAudioFormatException(f);
            format = f;
            return f;
        }

        @Override public boolean isActive() { return delayBytes > 0; }

        @Override
        public void queueInput(ByteBuffer in) {
            if (silenceFed < delayBytes) {
                int consume = Math.min(in.remaining(), delayBytes - silenceFed);
                output = ByteBuffer.allocate(consume).order(ByteOrder.nativeOrder());
                in.position(in.position() + consume);
                silenceFed += consume;
                return;
            }
            output = in.duplicate();
            in.position(in.limit());
        }

        @Override public void queueEndOfStream() { inputEnded = true; }
        @Override public ByteBuffer getOutput() { ByteBuffer r = output; output = ByteBuffer.allocate(0); return r; }
        @Override public boolean isEnded()       { return inputEnded && output.remaining() == 0; }
        @Override public void flush()            { silenceFed = 0; output = ByteBuffer.allocate(0); inputEnded = false; }
        @Override public void reset()            { flush(); format = AudioFormat.NOT_SET; }
    }

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

        audioDelayProcessor = new AudioDelayProcessor();

        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this) {
            @Override
            protected AudioSink buildAudioSink(android.content.Context context,
                    boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(context)
                        .setAudioProcessors(new AudioProcessor[]{ audioDelayProcessor })
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .build();
            }
        };

        player = new ExoPlayer.Builder(this)
                .setRenderersFactory(renderersFactory)
                .setTrackSelector(trackSelector)
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(10000)
                .build();

        playerView.setPlayer(player);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        playerView.requestFocus();
        playerView.setControllerAutoShow(false);

        // Build MediaItem with optional subtitle track
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

        // ── HUD (toast-style, centre-top) — same pattern as VLC ──────────────
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

        // ── Next Episode banner ───────────────────────────────────────────────
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

    private void adjustAudioDelay(long stepMs) {
        audioDelayMs = Math.max(0, audioDelayMs + stepMs);
        audioDelayProcessor.setDelayMs(audioDelayMs);
        String sign = audioDelayMs >= 0 ? "+" : "";
        showHud("Audio delay: " + sign + audioDelayMs + " ms\n(↑ later  ↓ earlier)");
    }

    private void toggleSubtitles() {
        subsEnabled = !subsEnabled;
        trackSelector.setParameters(trackSelector.buildUponParameters()
                .setRendererDisabled(C.TRACK_TYPE_TEXT, !subsEnabled)
                .build());
        showHud("Subtitles: " + (subsEnabled ? "ON" : "OFF"));
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
    //    Up        → audio delay +100ms
    //    Down      → audio delay -100ms
    //    Any key   → show ExoPlayer controls bar
    //
    //  Controls VISIBLE:
    //    Up/Down   → audio delay (same as VLC — works from any focused button)
    //    Left/Right → seek / navigate buttons (handled by PlayerView)
    //    Menu      → toggle subtitles (HUD flash)
    //    Back      → hide controls bar (first press); exit (second press)
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

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            undim();
            boolean controlsVisible = playerView.isControllerFullyVisible();

            if (keyCode == KeyEvent.KEYCODE_BACK) {
                if (controlsVisible) {
                    playerView.hideController();
                } else {
                    finishWithProgress(false);
                }
                return true;
            }

            // Up/Down always adjust audio delay (same in both states — matches VLC)
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                adjustAudioDelay(+AUDIO_STEP_MS);
                if (!controlsVisible) return true; // don't also show controls
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                adjustAudioDelay(-AUDIO_STEP_MS);
                if (!controlsVisible) return true;
            }

            // Menu / options = subtitle toggle (HUD flash, no overlay)
            if (keyCode == KeyEvent.KEYCODE_MENU) {
                toggleSubtitles();
                return true;
            }

            // Any other key while controls hidden = show controls
            if (!controlsVisible) {
                playerView.showController();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (playerView.isControllerFullyVisible()) {
            playerView.hideController();
        } else {
            finishWithProgress(false);
        }
    }

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
