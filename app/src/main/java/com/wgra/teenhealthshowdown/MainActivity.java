package com.wgra.teenhealthshowdown;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * WGRALGO Teen Health & Wellness Showdown.
 *
 * A single full-screen WebView that loads the bundled offline game from
 * assets/www/index.html. No networking, no third-party SDKs. The WebView is
 * locked down: JavaScript is enabled (the game needs it) but file access,
 * content access and external navigation are all disabled.
 */
public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        WebView.setWebContentsDebuggingEnabled(false);

        webView.getSettings().setJavaScriptEnabled(true);   // game requires JS
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webView.getSettings().setMixedContentMode(
                WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setBackgroundColor(0xFF0B1437);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // Keep all navigation inside the bundled assets — block everything else.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                return !url.startsWith("file:///android_asset/");
            }
        });

        webView.loadUrl("file:///android_asset/www/index.html");
    }

    /** Immersive sticky fullscreen for an arcade feel. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    private void enterImmersive() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /**
     * Hardware back button:
     *  - first asks the web app to handle it (close Help / winner / return to
     *    the start screen);
     *  - if the web app is already on the start screen, confirm before exit.
     */
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
                "(window.onAndroidBack && window.onAndroidBack())",
                value -> {
                    if ("true".equals(value)) {
                        return; // handled inside the game
                    }
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Exit game?")
                            .setMessage("Leave WGRALGO Teen Health & Wellness Showdown?")
                            .setPositiveButton("Exit", (d, w) -> finish())
                            .setNegativeButton("Stay", null)
                            .show();
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
