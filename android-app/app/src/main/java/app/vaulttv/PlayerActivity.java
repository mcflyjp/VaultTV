package app.vaulttv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
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
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

@SuppressWarnings("UnsafeOptInUsageError")
public class PlayerActivity extends Activity {

    /** Returned to MainActivity when ExoPlayer can't play the audio — triggers VLC fallback */
    public static final int RESULT_RETRY_VLC = 10;

    private static final long CREDITS_THRESHOLD_MS   = 20_000;        // show Next Episode in last 20s
    private static final long UNKNOWN_DUR_BANNER_MS  = 30 * 60_000L; // HLS fallback: show after 30 min
    private static final long DIM_DELAY_MS           = 5 * 60_000L;  // dim after 5 min paused

    private ExoPlayer  player;
    private PlayerView playerView;
    private String     url;
    private long       startTimeMs;
    private boolean    finished         = false;
    private boolean    dimmed           = false;
    private boolean    bannerDismissed  = false; // user pressed Back to hide banner; don't re-show
    private TextView   nextEpBanner;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable dimScreen = () -> {
        dimmed = true;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = 0.01f; // near-off but keeps display alive
        getWindow().setAttributes(lp);
    };

    private final Runnable positionPoller = new Runnable() {
        @Override public void run() {
            checkCreditsWindow();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on and go truly full-screen
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        setContentView(R.layout.activity_player);

        url         = getIntent().getStringExtra("url");
        startTimeMs = getIntent().getLongExtra("start_time_ms", 0);

        playerView = findViewById(R.id.player_view);

        // Track selector — prefer AAC audio but allow any codec as fallback
        DefaultTrackSelector trackSelector = new DefaultTrackSelector(this);
        trackSelector.setParameters(
            trackSelector.buildUponParameters()
                .setPreferredAudioLanguage("en")            // prefer English audio track
                .setExceedAudioConstraintsIfNecessary(true) // fall back if constraints unmet
                .build()
        );

        // Build ExoPlayer — uses hardware MediaCodec which supports HEVC, AC3, DTS
        // natively on FireTV without any transcoding
        player = new ExoPlayer.Builder(this)
                .setTrackSelector(trackSelector)
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(10000)
                .build();
        playerView.setPlayer(player);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        playerView.requestFocus();
        // Don't auto-show controls on buffering state changes — only on explicit user input.
        // Without this, every brief HTTP buffer cycle reshows the controller and resets the
        // hide timer, keeping controls visible for the entire duration of playback.
        playerView.setControllerAutoShow(false);

        // Load the stream
        MediaItem mediaItem = MediaItem.fromUri(url);
        player.setMediaItem(mediaItem);
        player.prepare();
        if (startTimeMs > 0) player.seekTo(startTimeMs);
        player.setPlayWhenReady(true);

        // Show controls once on start so they're visible on old-gen FireTV Sticks
        // where D-pad presses don't auto-trigger controller visibility.
        playerView.showController();

        // "Next Episode" banner — shown in the last 90s (credits window).
        // Pressing CENTER on the remote at any time will advance to the next episode.
        nextEpBanner = new TextView(this);
        nextEpBanner.setText("▶  Next Episode  (●)");
        nextEpBanner.setTextColor(Color.WHITE);
        nextEpBanner.setTextSize(18);
        nextEpBanner.setBackgroundColor(Color.argb(180, 0, 0, 0));
        nextEpBanner.setPadding(40, 20, 40, 20);
        nextEpBanner.setVisibility(View.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.END);
        lp.bottomMargin = 80;
        lp.rightMargin  = 80;
        ((FrameLayout) playerView.getParent()).addView(nextEpBanner, lp);

        handler.postDelayed(positionPoller, 1000);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                android.util.Log.e("VaultTV", "Player error: " + error.getMessage());
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    // Resumed — cancel dim timer and restore brightness immediately
                    undim();
                } else if (player != null && player.getPlaybackState() != Player.STATE_ENDED) {
                    // Paused (not finished) — start 5-min dim countdown
                    handler.removeCallbacks(dimScreen);
                    handler.postDelayed(dimScreen, DIM_DELAY_MS);
                }
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                // Auto-advance when episode ends naturally — triggers __nativePlayerDone
                // in the WebView which fires onEpisodeEnded() → auto-continue next episode.
                if (state == Player.STATE_ENDED) {
                    finishWithProgress(true);
                }
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                // Check whether any audio track is actually being rendered
                boolean hasAudio = false;
                boolean hasAudioTrack = false;
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_AUDIO) {
                        for (int i = 0; i < group.length; i++) {
                            hasAudioTrack = true;
                            if (group.isTrackSelected(i)) {
                                hasAudio = true;
                                break;
                            }
                        }
                    }
                }
                // Audio tracks exist but none selected = unsupported codec on this device.
                // Signal MainActivity to silently relaunch with VLC instead.
                if (hasAudioTrack && !hasAudio) {
                    android.util.Log.w("VaultTV", "ExoPlayer: audio codec unsupported, falling back to VLC");
                    finishForVlcFallback();
                }
            }
        });
    }

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
        long dur = player.getDuration();
        long pos = player.getCurrentPosition();
        boolean inCredits;
        if (dur != C.TIME_UNSET && dur > 0) {
            // Duration known — show banner in the last 90 seconds
            long remaining = dur - pos;
            inCredits = remaining > 0 && remaining <= CREDITS_THRESHOLD_MS;
        } else {
            // Duration unknown (HLS/DASH stream) — show banner after 30 min of playback
            inCredits = pos >= UNKNOWN_DUR_BANNER_MS;
        }
        nextEpBanner.setVisibility(inCredits ? View.VISIBLE : View.GONE);
    }

    // ── Return position to MainActivity so JS watch history can be updated ──
    // autoAdvance=true  → episode ended naturally, web app should load next episode
    // autoAdvance=false → user pressed Back, just save progress and stop
    private void finishWithProgress(boolean autoAdvance) {
        if (finished) return;
        finished = true;
        long posMs = player != null ? player.getCurrentPosition() : 0;
        long durMs = player != null && player.getDuration() != C.TIME_UNSET
                   ? player.getDuration() : 0;
        Intent result = new Intent();
        result.putExtra("position_ms", posMs);
        result.putExtra("duration_ms", durMs);
        result.putExtra("auto_advance", autoAdvance);
        setResult(RESULT_OK, result);
        finish();
    }

    // ── Audio codec unsupported — ask MainActivity to retry with VLC ──
    private void finishForVlcFallback() {
        Intent result = new Intent();
        result.putExtra("url",           url);
        result.putExtra("start_time_ms", startTimeMs);
        setResult(RESULT_RETRY_VLC, result);
        finish();
    }

    @Override
    public void onBackPressed() {
        finishWithProgress(false);
    }

    // ── Remote control ───────────────────────────────────────────────────────
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        boolean bannerVisible = nextEpBanner != null && nextEpBanner.getVisibility() == View.VISIBLE;

        // ── Banner is a modal: only CENTER (advance) and BACK (dismiss) work ──
        // All other keys are consumed so nothing behind the banner is clickable.
        if (bannerVisible) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                undim();
                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
                    finishWithProgress(true);
                } else if (keyCode == KeyEvent.KEYCODE_BACK) {
                    // Dismiss banner — user wants to keep watching
                    bannerDismissed = true;
                    nextEpBanner.setVisibility(View.GONE);
                }
            }
            return true; // block everything else (play/pause, rewind, etc.)
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            undim();
            if (keyCode == KeyEvent.KEYCODE_BACK) {
                finishWithProgress(false);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────
    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) player.pause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (playerView != null) playerView.requestFocus();
    }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(positionPoller);
        handler.removeCallbacks(dimScreen);
        // Release player in onStop (not just onDestroy) so the ExoPlayer media session
        // is unregistered as soon as the Activity loses visibility. Without this, FireTV
        // keeps routing D-pad media keys to this session even after the user switches apps.
        if (player != null) {
            player.release();
            player = null;
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
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
