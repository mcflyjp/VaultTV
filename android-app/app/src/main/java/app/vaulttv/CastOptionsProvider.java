package app.vaulttv;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionProvider;

import java.util.List;

/**
 * Required by the Cast SDK — CastContext.getSharedInstance() looks this class
 * up by name via the OPTIONS_PROVIDER_CLASS_NAME meta-data in the manifest and
 * throws if it can't find it.
 *
 * Uses Google's default media receiver (CC1AD845), the same receiver the web
 * sender in CastContext.jsx targets. That receiver just plays a URL we hand it,
 * so no custom Cast Receiver app needs registering with Google. Worth knowing
 * for later: a branded "VaultTV on your TV" receiver would be a registered
 * custom receiver app and would replace this ID.
 */
public class CastOptionsProvider implements OptionsProvider {

    @NonNull
    @Override
    public CastOptions getCastOptions(@NonNull Context context) {
        return new CastOptions.Builder()
                .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
                // Don't hijack the session when the app is backgrounded/resumed —
                // playback continues on the TV and the user reconnects explicitly.
                .setResumeSavedSession(false)
                .setEnableReconnectionService(false)
                .build();
    }

    @Nullable
    @Override
    public List<SessionProvider> getAdditionalSessionProviders(@NonNull Context context) {
        return null;
    }
}
