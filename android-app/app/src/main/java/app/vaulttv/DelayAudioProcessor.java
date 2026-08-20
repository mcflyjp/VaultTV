package app.vaulttv;

import androidx.media3.common.audio.AudioProcessor;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/**
 * Buffers PCM audio and releases it after a runtime-adjustable delay — gives
 * the default (ExoPlayer) player the same A/V-sync nudge VLC's player already
 * has via setAudioDelay(). ExoPlayer has no built-in per-track delay API, so
 * this holds back the tail of the audio stream by targetDelayUs before it
 * becomes eligible for output.
 *
 * Range is [-1000ms, +2000ms], applied against a fixed 1s internal baseline
 * buffer — that baseline is what makes negative (earlier) delay achievable
 * without ever having to drop already-buffered audio, since "earlier" just
 * means holding back less than the baseline instead of holding back none.
 */
@SuppressWarnings("UnsafeOptInUsageError")
public final class DelayAudioProcessor implements AudioProcessor {

    public static final long MIN_DELAY_US = -1_000_000L;
    public static final long MAX_DELAY_US =  2_000_000L;
    private static final long BASELINE_US =  1_000_000L;

    // Compact once the already-read prefix exceeds this many bytes, so the
    // backing array doesn't grow unbounded over a long playback session.
    private static final int COMPACT_THRESHOLD_BYTES = 8 * 1024 * 1024;

    private AudioFormat pendingInputFormat = AudioFormat.NOT_SET;
    private AudioFormat inputFormat        = AudioFormat.NOT_SET;
    private boolean inputEnded;

    private volatile long delayUs = 0;

    private byte[] buffer  = new byte[0];
    private int writePos   = 0;
    private int readPos    = 0;

    private ByteBuffer outputBuffer = EMPTY_BUFFER;

    /** Clamped to [MIN_DELAY_US, MAX_DELAY_US]. Positive = audio later (video is lagging). */
    public void setDelayUs(long us) {
        delayUs = Math.max(MIN_DELAY_US, Math.min(MAX_DELAY_US, us));
    }

    public long getDelayUs() {
        return delayUs;
    }

    @Override
    public AudioFormat configure(AudioFormat inputAudioFormat) throws UnhandledAudioFormatException {
        pendingInputFormat = inputAudioFormat;
        return inputAudioFormat;
    }

    @Override
    public boolean isActive() {
        return pendingInputFormat != AudioFormat.NOT_SET;
    }

    @Override
    public void queueInput(ByteBuffer inputBuffer) {
        if (inputFormat == AudioFormat.NOT_SET) {
            inputFormat = pendingInputFormat;
            // ~4s headroom up front; grows further if a large delay setting needs more.
            buffer = new byte[Math.max(1, inputFormat.bytesPerFrame * inputFormat.sampleRate * 4)];
            writePos = 0;
            readPos = 0;
        }
        int remaining = inputBuffer.remaining();
        ensureCapacity(writePos + remaining);
        inputBuffer.get(buffer, writePos, remaining);
        writePos += remaining;
        compactIfNeeded();
    }

    @Override
    public void queueEndOfStream() {
        inputEnded = true;
    }

    @Override
    public ByteBuffer getOutput() {
        if (inputFormat == AudioFormat.NOT_SET) return EMPTY_BUFFER;

        int targetDelayBytes = usToBytes(BASELINE_US + delayUs);
        int available = inputEnded
            ? (writePos - readPos)                       // flush everything once the source is done
            : (writePos - readPos) - targetDelayBytes;
        if (available <= 0) return EMPTY_BUFFER;

        // Keep frame alignment so we never split a sample across calls.
        available -= available % inputFormat.bytesPerFrame;
        if (available <= 0) return EMPTY_BUFFER;

        if (outputBuffer.capacity() < available) {
            outputBuffer = ByteBuffer.allocateDirect(available).order(ByteOrder.nativeOrder());
        } else {
            outputBuffer.clear();
            outputBuffer.limit(available);
        }
        outputBuffer.put(buffer, readPos, available).flip();
        readPos += available;
        return outputBuffer;
    }

    @Override
    public boolean isEnded() {
        return inputEnded && (writePos - readPos) <= 0;
    }

    @Override
    public void flush() {
        writePos = 0;
        readPos = 0;
        inputEnded = false;
        outputBuffer = EMPTY_BUFFER;
    }

    @Override
    public void reset() {
        flush();
        pendingInputFormat = AudioFormat.NOT_SET;
        inputFormat = AudioFormat.NOT_SET;
        buffer = new byte[0];
    }

    private int usToBytes(long us) {
        long frames = us * inputFormat.sampleRate / 1_000_000L;
        return (int) Math.max(0, frames) * inputFormat.bytesPerFrame;
    }

    private void ensureCapacity(int needed) {
        if (needed > buffer.length) {
            buffer = Arrays.copyOf(buffer, Math.max(needed, buffer.length * 2));
        }
    }

    private void compactIfNeeded() {
        if (readPos > COMPACT_THRESHOLD_BYTES) {
            int live = writePos - readPos;
            System.arraycopy(buffer, readPos, buffer, 0, live);
            writePos = live;
            readPos = 0;
        }
    }
}
