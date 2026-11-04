package com.steveharrisantony.lyricflow;

import android.app.Activity;
import android.os.CancellationSignal;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "LyricFlowGoogleSignIn")
public class GoogleSignInPlugin extends Plugin {
    private CancellationSignal pendingSignIn;

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = call.getString("webClientId", "");
        if (!webClientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("Google sign-in needs the Firebase project's Web OAuth client ID.");
            return;
        }
        Activity activity = getActivity();
        activity.runOnUiThread(() -> startSignIn(activity, webClientId, call));
    }

    private void startSignIn(Activity activity, String webClientId, PluginCall call) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Reopen LyricFlow to sign in with Google.");
            return;
        }
        if (pendingSignIn != null) {
            call.reject("Google sign-in is already open.");
            return;
        }

        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetSignInWithGoogleOption.Builder(webClientId).build())
            .build();
        pendingSignIn = new CancellationSignal();
        CredentialManager.create(activity).getCredentialAsync(
            activity, request, pendingSignIn, ContextCompat.getMainExecutor(activity),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(@NonNull GetCredentialResponse response) {
                    pendingSignIn = null;
                    Credential credential = response.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("Google sign-in did not return an account credential.");
                        return;
                    }
                    GoogleIdTokenCredential googleCredential;
                    try {
                        googleCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    } catch (Exception error) {
                        call.reject("Could not read the Google account credential. Please try again.");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("idToken", googleCredential.getIdToken());
                    call.resolve(result);
                }

                @Override
                public void onError(@NonNull GetCredentialException error) {
                    pendingSignIn = null;
                    if (error instanceof GetCredentialCancellationException) {
                        call.resolve(new JSObject());
                    } else if (error instanceof NoCredentialException) {
                        call.reject("No Google account was available. Add one in Android Settings and try again.");
                    } else {
                        call.reject("Google sign-in could not start. Check Google Play services and the APK signing fingerprint in Firebase.");
                    }
                }
            }
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (pendingSignIn != null) pendingSignIn.cancel();
        super.handleOnDestroy();
    }
}
