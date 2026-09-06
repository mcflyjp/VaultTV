package app.vaulttv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.interfaces.IVLCVout;

import java.util.ArrayList;

public class VlcPlayerActivity extends Activity {

    private static final long SEEK_HOLD_MS    = 30_000; // seek while holding left/right on seek bar
    private static final long SEEK_BTN_MS     = 10_000; // seek buttons ±10s
    private static final long AUDIO_STEP_US   = 100_000;
    private static final long CONTROLS_TIMEOUT = 4_000;

    // Control indices
    private static final int IDX_SEEKBAR  = 0;
    private static final int IDX_SEEKBACK = 1;
    private static final int IDX_PLAYPAUSE= 2;
    private static final int IDX_SEEKFWD  = 3;
    private static final int IDX_AUDIO    = 4;
    private static final int IDX_SUBS     = 5;
    private static final int NUM_CONTROLS = 6;

    private LibVLC       libVLC;
    private MediaPlayer  mediaPlayer;
    private SurfaceView  surfaceView;

    // Controls overlay views
    private View         controlsBar;
    private View         seekBarWrapper;   // highlighted border around seek bar
    private ProgressBar  seekBarProgress;  // visual bar (read-only display)
    private TextView     timeText;
    private TextView     btnSeekBack, btnPlayPause, btnSeekFwd, btnAudio, btnSubs;
    private TextView     hudText;

    private Handler      mainHandler;
    private boolean      controlsVisible  = false;
    private int          focusedControl   = IDX_PLAYPAUSE;
    private long         startTimeMs      = 0;
    private boolean      seekApplied      = false;
    private long         audioDelayUs     = 0;

    private final Runnable hideControls = () -> showControls(false);
    private final Runnable hideHud      = () -> { if (hudText != null) hudText.setVisibility(View.GONE); };

    private final Runnable updateSeek = new Runnable() {
        @Override public void run() {
            if (mediaPlayer != null && controlsVisible) {
                long dur = mediaPlayer.getLength();
                long pos = mediaPlayer.getTime();
                if (dur > 0) seekBarProgress.setMax((int)(dur / 1000));
                seekBarProgress.setProgress((int)(Math.max(0, pos) / 1000));
                timeText.setText(formatTime(pos) + " / " + formatTime(dur));
            }
            mainHandler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        mainHandler = new Handler(Looper.getMainLooper());
        String url  = getIntent().getStringExtra("url");
        startTimeMs = getIntent().getLongExtra("start_time_ms", 0);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        surfaceView = new SurfaceView(this);
        surfaceView.setFocusable(false);
        surfaceView.setFocusableInTouchMode(false);
        root.addView(surfaceView, matchParent());

        root.addView(buildControlsOverlay());

        hudText = new TextView(this);
        hudText.setTextColor(Color.WHITE);
        hudText.setTextSize(18f);
        hudText.setPadding(28, 12, 28, 12);
        hudText.setBackgroundColor(0xBB000000);
        hudText.setGravity(Gravity.CENTER);
        hudText.setVisibility(View.GONE);
        root.addView(hudText, centered());

        setContentView(root);

        // ── VLC ───────────────────────────────────────────────────────────────
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--no-drop-late-frames");
        opts.add("--no-skip-frames");
        opts.add("--network-caching=1500");
        opts.add("--aout=opensles");

        libVLC      = new LibVLC(this, opts);
        mediaPlayer = new MediaPlayer(libVLC);
        final IVLCVout vout = mediaPlayer.getVLCVout();
        vout.setVideoView(surfaceView);
        vout.attachViews();

        // VLC does not read the surface's dimensions on its own. Without
        // setWindowSize it renders at its own default anchored to the top-left
        // of the surface, which on a TV looks like the picture shoved against
        // the left edge with a black bar down the right-hand side. The size
        // has to be pushed on every layout pass, not just once: the first
        // attach happens before the SurfaceView has been measured, so an
        // initial call alone reports 0x0 and is ignored.
        surfaceView.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or_, ob) -> {
            int w = r - l, h = b - t;
            if (w > 0 && h > 0) vout.setWindowSize(w, h);
        });
        surfaceView.post(() -> {
            int w = surfaceView.getWidth(), h = surfaceView.getHeight();
            if (w > 0 && h > 0) vout.setWindowSize(w, h);
        });

        // Scale 0 means "fit the window, preserving aspect ratio" — letterbox
        // rather than stretch. A null aspect ratio keeps the source's own.
        mediaPlayer.setAspectRatio(null);
        mediaPlayer.setScale(0f);

        mediaPlayer.setEventListener(event -> {
            if (event.type == MediaPlayer.Event.Buffering
                    && event.getBuffering() >= 100f && !seekApplied) {
                seekApplied = true;
                if (startTimeMs > 0) mediaPlayer.setTime(startTimeMs);
            }
            if (event.type == MediaPlayer.Event.EndReached) {
                // Episode finished naturally — signal auto-advance
                runOnUiThread(() -> finishWithProgress(true));
            }
        });

        Media media = new Media(libVLC, Uri.parse(url));
        mediaPlayer.setMedia(media);
        media.release();
        mediaPlayer.play();

        mainHandler.post(updateSeek);
    }

    // ── Build controls ────────────────────────────────────────────────────────

    private View buildControlsOverlay() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setBackgroundColor(0xCC000000);
        bar.setPadding(40, 16, 40, 24);

        // ── Seek bar row ──────────────────────────────────────────────────────
        // Wrapper gives a visible focus highlight when seek bar is selected
        seekBarWrapper = new LinearLayout(this);
        ((LinearLayout) seekBarWrapper).setOrientation(LinearLayout.HORIZONTAL);
        ((LinearLayout) seekBarWrapper).setGravity(Gravity.CENTER_VERTICAL);
        seekBarWrapper.setPadding(12, 8, 12, 8);
        seekBarWrapper.setBackgroundColor(0x00000000); // transparent by default

        timeText = makeLabel("0:00 / 0:00");
        timeText.setPadding(0, 0, 16, 0);
        ((LinearLayout) seekBarWrapper).addView(timeText);

        seekBarProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        seekBarProgress.setMax(1000);
        seekBarProgress.setProgress(0);
        LinearLayout.LayoutParams pbParams = new LinearLayout.LayoutParams(0, 12, 1f);
        ((LinearLayout) seekBarWrapper).addView(seekBarProgress, pbParams);

        // Seek position hint label (right side)
        TextView seekHint = makeLabel("  ← →");
        seekHint.setPadding(16, 0, 0, 0);
        seekHint.setTag("seekhint");
        seekHint.setVisibility(View.GONE);
        ((LinearLayout) seekBarWrapper).addView(seekHint);

        bar.addView(seekBarWrapper, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // ── Button row ────────────────────────────────────────────────────────
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(Gravity.CENTER);
        btnRow.setPadding(0, 10, 0, 0);

        btnSeekBack  = makeBtn("⏪  -10s");
        btnPlayPause = makeBtn("⏸  Pause");
        btnSeekFwd   = makeBtn("⏩  +10s");
        btnAudio     = makeBtn("🔊  Audio");
        btnSubs      = makeBtn("CC  Subs");

        for (TextView btn : new TextView[]{ btnSeekBack, btnPlayPause, btnSeekFwd, btnAudio, btnSubs }) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.setMargins(6, 0, 6, 0);
            btnRow.addView(btn, p);
        }
        bar.addView(btnRow, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        controlsBar = bar;
        controlsBar.setVisibility(View.GONE);
        controlsBar.setLayoutParams(barParams);
        return controlsBar;
    }

    // ── Controls state ────────────────────────────────────────────────────────

    private void showControls(boolean show) {
        mainHandler.removeCallbacks(hideControls);
        controlsVisible = show;
        controlsBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            highlight(focusedControl);
            resetHideTimer();
            updatePlayPauseLabel();
        }
    }

    private void resetHideTimer() {
        mainHandler.removeCallbacks(hideControls);
        mainHandler.postDelayed(hideControls, CONTROLS_TIMEOUT);
    }

    private void highlight(int idx) {
        focusedControl = idx;
        // Seek bar wrapper highlight
        boolean seekFocused = (idx == IDX_SEEKBAR);
        seekBarWrapper.setBackgroundColor(seekFocused ? 0x447C3AED : 0x00000000);
        View hint = seekBarWrapper.findViewWithTag("seekhint");
        if (hint != null) hint.setVisibility(seekFocused ? View.VISIBLE : View.GONE);
        // Button highlights
        TextView[] btns = { btnSeekBack, btnPlayPause, btnSeekFwd, btnAudio, btnSubs };
        for (int i = 0; i < btns.length; i++) {
            btns[i].setBackgroundColor((i + 1) == idx ? 0xCC7C3AED : 0x44FFFFFF);
        }
    }

    private void updatePlayPauseLabel() {
        if (mediaPlayer == null) return;
        btnPlayPause.setText(mediaPlayer.isPlaying() ? "⏸  Pause" : "▶  Play");
    }

    // ── Key handling ──────────────────────────────────────────────────────────

    // dispatchKeyEvent intercepts keys before any view (including SurfaceView) consumes them
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (onKeyDown(event.getKeyCode(), event)) return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {

        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (controlsVisible) { showControls(false); return true; }
            finishWithProgress(false);
            return true;
        }

        // Controls hidden
        if (!controlsVisible) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP)   { adjustAudioDelay(+AUDIO_STEP_US); return true; }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) { adjustAudioDelay(-AUDIO_STEP_US); return true; }
            showControls(true);
            return true;
        }

        // Controls visible
        switch (keyCode) {

            case KeyEvent.KEYCODE_DPAD_LEFT:
                if (focusedControl == IDX_SEEKBAR) {
                    seekBy(-SEEK_HOLD_MS);
                } else {
                    highlight(Math.max(IDX_SEEKBAR, focusedControl - 1));
                }
                resetHideTimer();
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
                if (focusedControl == IDX_SEEKBAR) {
                    seekBy(+SEEK_HOLD_MS);
                } else {
                    highlight(Math.min(NUM_CONTROLS - 1, focusedControl + 1));
                }
                resetHideTimer();
                return true;

            case KeyEvent.KEYCODE_DPAD_UP:
                if (focusedControl != IDX_SEEKBAR) {
                    adjustAudioDelay(+AUDIO_STEP_US);
                }
                resetHideTimer();
                return true;

            case KeyEvent.KEYCODE_DPAD_DOWN:
                if (focusedControl != IDX_SEEKBAR) {
                    adjustAudioDelay(-AUDIO_STEP_US);
                }
                resetHideTimer();
                return true;

            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                activateControl(focusedControl);
                resetHideTimer();
                return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    private void seekBy(long deltaMs) {
        if (mediaPlayer == null) return;
        long target = Math.max(0, mediaPlayer.getTime() + deltaMs);
        mediaPlayer.setTime(target);
        // Immediately refresh seek bar display
        long dur = mediaPlayer.getLength();
        if (dur > 0) seekBarProgress.setProgress((int)(target / 1000));
        timeText.setText(formatTime(target) + " / " + formatTime(dur));
    }

    private void activateControl(int idx) {
        if (mediaPlayer == null) return;
        switch (idx) {
            case IDX_SEEKBAR:   // pressing OK on seek bar = play/pause
                if (mediaPlayer.isPlaying()) mediaPlayer.pause(); else mediaPlayer.play();
                updatePlayPauseLabel();
                break;
            case IDX_SEEKBACK:
                seekBy(-SEEK_BTN_MS);
                break;
            case IDX_PLAYPAUSE:
                if (mediaPlayer.isPlaying()) mediaPlayer.pause(); else mediaPlayer.play();
                updatePlayPauseLabel();
                break;
            case IDX_SEEKFWD:
                seekBy(+SEEK_BTN_MS);
                break;
            case IDX_AUDIO:
                showTrackPicker("Audio Track", mediaPlayer.getAudioTracks(),
                    mediaPlayer.getAudioTrack(), id -> mediaPlayer.setAudioTrack(id),
                    () -> mediaPlayer.getAudioTrack());
                break;
            case IDX_SUBS:
                showTrackPicker("Subtitles", mediaPlayer.getSpuTracks(),
                    mediaPlayer.getSpuTrack(), id -> mediaPlayer.setSpuTrack(id),
                    () -> mediaPlayer.getSpuTrack());
                break;
        }
    }

    // ── Track picker dialog ───────────────────────────────────────────────────

    interface TrackSetter { void set(int id); }
    interface TrackGetter { int get(); }

    private void showTrackPicker(String title, MediaPlayer.TrackDescription[] tracks,
                                  int currentId, TrackSetter setter, TrackGetter getter) {
        mainHandler.removeCallbacks(hideControls);
        if (tracks == null || tracks.length == 0) {
            showHud("No " + title + " tracks available");
            return;
        }
        String[] names = new String[tracks.length];
        int checkedItem = 0;
        for (int i = 0; i < tracks.length; i++) {
            names[i] = (tracks[i].name != null && !tracks[i].name.isEmpty())
                ? tracks[i].name : "Track " + (i + 1);
            if (tracks[i].id == currentId) checkedItem = i;
        }
        final int[] selected = { checkedItem };
        new AlertDialog.Builder(this)
            .setTitle(title)
            .setSingleChoiceItems(names, checkedItem, (d, which) -> selected[0] = which)
            .setPositiveButton("OK", (d, w) -> {
                setter.set(tracks[selected[0]].id);
                // Report what the player actually did, not what was picked.
                // This HUD echoed the selection unconditionally, so a set that
                // silently failed still displayed as success -- which is how
                // "subtitles off" could sit on screen over visible subtitles.
                mainHandler.postDelayed(() -> {
                    int now = getter.get();
                    String actual = null;
                    for (MediaPlayer.TrackDescription t : tracks) {
                        if (t.id == now) { actual = (t.name != null && !t.name.isEmpty()) ? t.name : ("Track " + t.id); break; }
                    }
                    if (actual == null) actual = "Disabled";
                    boolean ok = now == tracks[selected[0]].id;
                    showHud(title + ": " + actual + (ok ? "" : "  (could not switch)"));
                    resetHideTimer();
                }, 250);
            })
            .setNegativeButton("Cancel", (d, w) -> resetHideTimer())
            .show();
    }

    // ── Audio delay ───────────────────────────────────────────────────────────

    private void adjustAudioDelay(long stepUs) {
        if (mediaPlayer == null) return;
        audioDelayUs += stepUs;
        mediaPlayer.setAudioDelay(audioDelayUs);
        long ms = audioDelayUs / 1000;
        showHud("Audio delay: " + (ms >= 0 ? "+" : "") + ms + " ms\n(↑ later  ↓ earlier)");
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    private void showHud(String msg) {
        mainHandler.removeCallbacks(hideHud);
        hudText.setText(msg);
        hudText.setVisibility(View.VISIBLE);
        mainHandler.postDelayed(hideHud, 2500);
    }

    // ── Finish ────────────────────────────────────────────────────────────────

    private void finishWithProgress(boolean autoAdvance) {
        if (isFinishing()) return;
        long posMs = mediaPlayer != null ? mediaPlayer.getTime()   : 0;
        long durMs = mediaPlayer != null ? mediaPlayer.getLength() : 0;
        Intent result = new Intent();
        result.putExtra("position_ms",  posMs);
        result.putExtra("duration_ms",  durMs);
        result.putExtra("auto_advance", autoAdvance);
        setResult(RESULT_OK, result);
        finish();
    }

    @Override public void onBackPressed() { finishWithProgress(false); }

    @Override protected void onPause()  { super.onPause();  if (mediaPlayer != null) mediaPlayer.pause(); }
    @Override protected void onResume() { super.onResume(); hideSystemUi(); }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mainHandler.removeCallbacks(updateSeek);
        mainHandler.removeCallbacks(hideControls);
        mainHandler.removeCallbacks(hideHud);
        if (mediaPlayer != null) {
            mediaPlayer.stop();
            mediaPlayer.getVLCVout().detachViews();
            mediaPlayer.release();
        }
        if (libVLC != null) libVLC.release();
    }

    // ── Layout helpers ────────────────────────────────────────────────────────

    private TextView makeBtn(String label) {
        TextView tv = new TextView(this);
        tv.setText(label);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(14f);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(10, 14, 10, 14);
        tv.setBackgroundColor(0x44FFFFFF);
        tv.setTypeface(null, Typeface.BOLD);
        return tv;
    }

    private TextView makeLabel(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(0xAAFFFFFF);
        tv.setTextSize(13f);
        return tv;
    }

    private static String formatTime(long ms) {
        if (ms <= 0) return "0:00";
        long s = ms / 1000; long m = s / 60; s %= 60; long h = m / 60; m %= 60;
        return h > 0 ? String.format("%d:%02d:%02d", h, m, s) : String.format("%d:%02d", m, s);
    }

    private static FrameLayout.LayoutParams matchParent() {
        return new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private static FrameLayout.LayoutParams centered() {
        return new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
}
