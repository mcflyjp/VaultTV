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
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;

@SuppressWarnings("UnsafeOptInUsageError")
public class PlayerActivity extends Activity {

    /** Returned to MainActivity when ExoPlayer can't play the audio — triggers VLC fallback */
    public static final int RESULT_RETRY_VLC = 10;

    private static final long CREDITS_THRESHOLD_MS   = 20_000;
    private static final long UNKNOWN_DUR_BANNER_MS  = 30 * 60_000L;
    private static final long DIM_DELAY_MS           = 5 * 60_000L;

    private ExoPlayer          player;
    private PlayerView         playerView;
    private AudioDelayProcessor audioDelayProcessor;
    private String             url;
    private long               startTimeMs;
    private boolean            finished        = false;
    private boolean            dimmed          = false;
    private boolean            bannerDismissed = false;
    private TextView           nextEpBanner;

    // ── Settings overlay ────────────────────────────────────────────────────
    private View           settingsOverlay;
    private TextView       subToggleBtn;
    private TextView       delayDecBtn;
    private TextView       delayLabel;
    private TextView       delayIncBtn;
    private boolean        subsEnabled     = true;
    private int            audioDelayMs    = 0;   // positive = delay audio (video is ahead)
    private int            overlayFocusIdx = 0;   // 0=subToggle 1=decDelay 2=incDelay
    private static final int DELAY_STEP_MS = 50;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable dimScreen = () -> {
        dimmed = true;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = 0.01f;
        getWindow().setAttributes(lp);
    };

    private final Runnable positionPoller = new Runnable() {
        @Override public void run() {
            checkCreditsWindow();
            handler.postDelayed(this, 1000);
        }
    };

    // ── AudioDelayProcessor ─────────────────────────────────────────────────
    // Buffers PCM audio to introduce a sync delay (positive = audio plays late).
    // Negative delay is clamped to 0 — advancing audio is not supported.
    static class AudioDelayProcessor implements AudioProcessor {
        AudioFormat   format     = AudioFormat.NOT_SET;
        private ByteBuffer    delayBuf   = ByteBuffer.allocate(0);
        private int           delayBytes = 0; // bytes of silence to prefix
        private int           silenceFed = 0; // silence bytes already fed into output
        private ByteBuffer    output     = ByteBuffer.allocate(0);
        private boolean       inputEnded = false;

        void setDelayMs(int ms, AudioFormat fmt) {
            if (ms < 0) ms = 0;
            if (fmt == null || fmt.equals(AudioFormat.NOT_SET)) return;
            // bytes = ms * sampleRate/1000 * channels * bytesPerSample(PCM_16BIT=2)
            int newDelayBytes = (int)(ms / 1000.0 * fmt.sampleRate * fmt.channelCount * 2);
            // round to frame boundary
            int frameSize = fmt.channelCount * 2;
            newDelayBytes = (newDelayBytes / frameSize) * frameSize;
            this.delayBytes = newDelayBytes;
            this.silenceFed = 0;
            // Rebuild silence prefix
            delayBuf = ByteBuffer.allocate(newDelayBytes).order(ByteOrder.nativeOrder());
            // fill with zeroes (silence)
        }

        @Override
        public AudioFormat configure(AudioFormat inputAudioFormat) throws UnhandledAudioFormatException {
            if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
                throw new UnhandledAudioFormatException(inputAudioFormat);
            }
            format = inputAudioFormat;
            return inputAudioFormat;
        }

        @Override public boolean isActive() { return delayBytes > 0; }

        @Override
        public void queueInput(ByteBuffer inputBuffer) {
            // First drain any remaining silence prefix
            if (silenceFed < delayBytes) {
                int silenceRemaining = delayBytes - silenceFed;
                int available        = inputBuffer.remaining();
                // We "consume" input but output silence instead
                int consume = Math.min(available, silenceRemaining);
                output = ByteBuffer.allocate(consume).order(ByteOrder.nativeOrder());
                // output stays zeroed (silence)
                inputBuffer.position(inputBuffer.position() + consume);
                silenceFed += consume;
                return;
            }
            // Pass through directly
            output = inputBuffer.duplicate();
            inputBuffer.position(inputBuffer.limit());
        }

        @Override public void queueEndOfStream() { inputEnded = true; }

        @Override
        public ByteBuffer getOutput() {
            ByteBuffer result = output;
            output = ByteBuffer.allocate(0);
            return result;
        }

        @Override public boolean isEnded() { return inputEnded && output.remaining() == 0; }

        @Override
        public void flush() {
            silenceFed = 0;
            output     = ByteBuffer.allocate(0);
            inputEnded = false;
        }

        @Override public void reset() { flush(); format = AudioFormat.NOT_SET; }
    }

    // ── onCreate ─────────────────────────────────────────────────────────────
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

        DefaultTrackSelector trackSelector = new DefaultTrackSelector(this);
        trackSelector.setParameters(
            trackSelector.buildUponParameters()
                .setPreferredAudioLanguage("en")
                .setExceedAudioConstraintsIfNecessary(true)
                .build()
        );

        audioDelayProcessor = new AudioDelayProcessor();

        // Custom renderers factory wires in our AudioDelayProcessor via DefaultAudioSink
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

        // Build MediaItem — attach external subtitle if provided
        MediaItem mediaItem;
        if (subtitleUrl != null && !subtitleUrl.isEmpty()) {
            String mime = subtitleUrl.toLowerCase().endsWith(".srt")
                    ? MimeTypes.APPLICATION_SUBRIP : MimeTypes.TEXT_VTT;
            MediaItem.SubtitleConfiguration sub = new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
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

        // ── Next Episode banner ──────────────────────────────────────────────
        nextEpBanner = new TextView(this);
        nextEpBanner.setText("▶  Next Episode  (●)");
        nextEpBanner.setTextColor(Color.WHITE);
        nextEpBanner.setTextSize(18);
        nextEpBanner.setBackgroundColor(Color.argb(180, 0, 0, 0));
        nextEpBanner.setPadding(40, 20, 40, 20);
        nextEpBanner.setVisibility(View.GONE);
        FrameLayout root = (FrameLayout) playerView.getParent();
        FrameLayout.LayoutParams bannerLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.END);
        bannerLp.bottomMargin = 80;
        bannerLp.rightMargin  = 80;
        root.addView(nextEpBanner, bannerLp);

        // ── Settings overlay ─────────────────────────────────────────────────
        buildSettingsOverlay(root);

        handler.postDelayed(positionPoller, 1000);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                android.util.Log.e("VaultTV", "Player error: " + error.getMessage());
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    undim();
                } else if (player != null && player.getPlaybackState() != Player.STATE_ENDED) {
                    handler.removeCallbacks(dimScreen);
                    handler.postDelayed(dimScreen, DIM_DELAY_MS);
                }
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) finishWithProgress(true);
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                boolean hasAudio = false, hasAudioTrack = false;
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_AUDIO) {
                        for (int i = 0; i < group.length; i++) {
                            hasAudioTrack = true;
                            if (group.isTrackSelected(i)) { hasAudio = true; break; }
                        }
                    }
                }
                if (hasAudioTrack && !hasAudio) {
                    android.util.Log.w("VaultTV", "ExoPlayer: audio codec unsupported, falling back to VLC");
                    finishForVlcFallback();
                }
            }
        });
    }

    // ── Settings overlay ─────────────────────────────────────────────────────
    private void buildSettingsOverlay(FrameLayout root) {
        // Semi-transparent card anchored to bottom-left
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(Color.argb(210, 15, 15, 15));
        card.setPadding(48, 36, 48, 36);
        card.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("Playback Settings");
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        title.setAlpha(0.6f);
        title.setPadding(0, 0, 0, 24);
        card.addView(title);

        // Row 1: Subtitles toggle
        subToggleBtn = new TextView(this);
        subToggleBtn.setPadding(24, 18, 24, 18);
        subToggleBtn.setTextSize(16);
        card.addView(subToggleBtn);
        updateSubToggleLabel();

        // Divider
        View div = new View(this);
        div.setBackgroundColor(Color.argb(60, 255, 255, 255));
        LinearLayout.LayoutParams divLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 1);
        divLp.setMargins(0, 12, 0, 12);
        card.addView(div, divLp);

        // Row 2: Audio delay — [−]  0 ms  [+]
        LinearLayout delayRow = new LinearLayout(this);
        delayRow.setOrientation(LinearLayout.HORIZONTAL);
        delayRow.setGravity(Gravity.CENTER_VERTICAL);
        delayRow.setPadding(0, 8, 0, 8);

        TextView delayTitle = new TextView(this);
        delayTitle.setText("Audio delay");
        delayTitle.setTextColor(Color.WHITE);
        delayTitle.setTextSize(16);
        delayTitle.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        delayRow.addView(delayTitle);

        delayDecBtn = makeBtn("−");
        delayRow.addView(delayDecBtn);

        delayLabel = new TextView(this);
        delayLabel.setTextColor(Color.WHITE);
        delayLabel.setTextSize(16);
        delayLabel.setMinWidth(160);
        delayLabel.setGravity(Gravity.CENTER);
        delayRow.addView(delayLabel);
        updateDelayLabel();

        delayIncBtn = makeBtn("+");
        delayRow.addView(delayIncBtn);

        card.addView(delayRow);

        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.START);
        cardLp.bottomMargin = 80;
        cardLp.leftMargin   = 80;
        root.addView(card, cardLp);

        settingsOverlay = card;
        updateOverlayFocus();
    }

    private TextView makeBtn(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(22);
        tv.setBackgroundColor(Color.argb(80, 255, 255, 255));
        tv.setPadding(28, 10, 28, 10);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(8, 0, 8, 0);
        tv.setLayoutParams(lp);
        return tv;
    }

    private void updateSubToggleLabel() {
        if (subToggleBtn == null) return;
        subToggleBtn.setText(subsEnabled ? "Subtitles:  ON" : "Subtitles:  OFF");
        subToggleBtn.setTextColor(subsEnabled ? Color.WHITE : Color.argb(180, 200, 200, 200));
    }

    private void updateDelayLabel() {
        if (delayLabel == null) return;
        delayLabel.setText(audioDelayMs + " ms");
    }

    private void updateOverlayFocus() {
        int unfocusedBg  = Color.argb(0,   0,   0,   0);
        int focusedBg    = Color.argb(180, 80,  60, 200);
        subToggleBtn.setBackgroundColor(overlayFocusIdx == 0 ? focusedBg : unfocusedBg);
        delayDecBtn .setBackgroundColor(overlayFocusIdx == 1 ? focusedBg : Color.argb(80, 255, 255, 255));
        delayIncBtn .setBackgroundColor(overlayFocusIdx == 2 ? focusedBg : Color.argb(80, 255, 255, 255));
    }

    private boolean isOverlayVisible() {
        return settingsOverlay != null && settingsOverlay.getVisibility() == View.VISIBLE;
    }

    private void showOverlay() {
        if (settingsOverlay != null) {
            settingsOverlay.setVisibility(View.VISIBLE);
            overlayFocusIdx = 0;
            updateOverlayFocus();
        }
    }

    private void hideOverlay() {
        if (settingsOverlay != null) settingsOverlay.setVisibility(View.GONE);
    }

    private void activateOverlayItem() {
        switch (overlayFocusIdx) {
            case 0: // subtitle toggle
                subsEnabled = !subsEnabled;
                // Enable/disable the subtitle renderer via TrackSelector
                if (player != null) {
                    DefaultTrackSelector ts = (DefaultTrackSelector) player.getTrackSelector();
                    if (ts != null) {
                        ts.setParameters(ts.buildUponParameters()
                                .setRendererDisabled(C.TRACK_TYPE_TEXT, !subsEnabled)
                                .build());
                    }
                }
                updateSubToggleLabel();
                break;
            case 1: // delay −
                audioDelayMs = Math.max(0, audioDelayMs - DELAY_STEP_MS);
                applyAudioDelay();
                updateDelayLabel();
                break;
            case 2: // delay +
                audioDelayMs += DELAY_STEP_MS;
                applyAudioDelay();
                updateDelayLabel();
                break;
        }
    }

    private void applyAudioDelay() {
        if (audioDelayProcessor == null || player == null) return;
        AudioProcessor.AudioFormat fmt = audioDelayProcessor.format;
        if (fmt.equals(AudioProcessor.AudioFormat.NOT_SET)) return;
        audioDelayProcessor.setDelayMs(audioDelayMs, fmt);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
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
        boolean inCredits;
        if (dur != C.TIME_UNSET && dur > 0) {
            inCredits = (dur - pos) > 0 && (dur - pos) <= CREDITS_THRESHOLD_MS;
        } else {
            inCredits = pos >= UNKNOWN_DUR_BANNER_MS;
        }
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

    // ── Key handling ──────────────────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        if (isOverlayVisible()) { hideOverlay(); return; }
        finishWithProgress(false);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        boolean bannerVisible = nextEpBanner != null && nextEpBanner.getVisibility() == View.VISIBLE;

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

            // MENU button (or long-press on some remotes) opens settings overlay
            if (keyCode == KeyEvent.KEYCODE_MENU) {
                if (isOverlayVisible()) hideOverlay(); else showOverlay();
                return true;
            }

            if (isOverlayVisible()) {
                switch (keyCode) {
                    case KeyEvent.KEYCODE_DPAD_UP:
                        overlayFocusIdx = Math.max(0, overlayFocusIdx - 1);
                        updateOverlayFocus();
                        return true;
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                        overlayFocusIdx = Math.min(2, overlayFocusIdx + 1);
                        updateOverlayFocus();
                        return true;
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                        if (overlayFocusIdx != 0) { overlayFocusIdx = 1; updateOverlayFocus(); }
                        return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        if (overlayFocusIdx != 0) { overlayFocusIdx = 2; updateOverlayFocus(); }
                        return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_ENTER:
                        activateOverlayItem();
                        return true;
                    case KeyEvent.KEYCODE_BACK:
                        hideOverlay();
                        return true;
                }
                return true; // swallow all other keys while overlay is open
            }

            if (keyCode == KeyEvent.KEYCODE_BACK) {
                finishWithProgress(false);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    @Override protected void onPause()  { super.onPause();  if (player != null) player.pause(); }
    @Override protected void onResume() { super.onResume(); hideSystemUi(); if (playerView != null) playerView.requestFocus(); }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(positionPoller);
        handler.removeCallbacks(dimScreen);
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
