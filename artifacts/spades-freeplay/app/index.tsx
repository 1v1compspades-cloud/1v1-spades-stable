import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import * as Haptics from "expo-haptics";

const LIVE_URL = "https://1v1spades.com/";
const LIVE_ORIGIN = "https://1v1spades.com";
const CONNECTION_ERROR = "Connection unavailable. Check internet or try again.";
const SERVER_UNAVAILABLE_ERROR = "Server unavailable. Tap Retry in a moment.";
const LOAD_TIMEOUT_MS = 10000;
const LOADING_HTML = `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; height: 100%; background: #050505; color: #f8f4eb; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      body { display: grid; place-items: center; }
      main { text-align: center; padding: 24px; }
      strong { color: #efb72a; }
    </style>
  </head>
  <body><main><strong>1v1 Spades</strong><p>Loading...</p></main></body>
</html>
`;

const TESTER_MODE_SCRIPT = `
  (function () {
    function hide(element) {
      if (element) element.style.display = "none";
    }

    function applyTesterMode() {
      document.body.classList.add("tester-mode");

      var transport = document.getElementById("transport-mode");
      if (transport) {
        transport.value = "real-server";
        transport.dispatchEvent(new Event("change", { bubbles: true }));
        hide(transport.closest("label"));
      }

      hide(document.getElementById("reconnect-live-sync"));
      hide(document.getElementById("advanced-diagnostics"));
      hide(document.getElementById("local-preview-tools"));
      hide(document.getElementById("manual-test-tools"));
    }

    applyTesterMode();
    setTimeout(applyTesterMode, 250);
    setTimeout(applyTesterMode, 1000);
  })();
  true;
`;

function hostedUrl() {
  const url = new URL(LIVE_URL);
  url.searchParams.set("transport", "real-server");
  url.searchParams.set("tester", "ios-testflight");
  url.searchParams.set("cacheBust", String(Date.now()));
  return url.toString();
}

export default function HostedSpadesApp() {
  const webViewRef = useRef<any>(null);
  const loadingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const stopLoading = useCallback(() => {
    if (loadingFallbackRef.current) {
      clearTimeout(loadingFallbackRef.current);
      loadingFallbackRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const startLoadingTimer = useCallback(() => {
    if (loadingFallbackRef.current) {
      clearTimeout(loadingFallbackRef.current);
    }
    loadingFallbackRef.current = setTimeout(() => {
      setIsLoading(false);
      setLoadError(CONNECTION_ERROR);
    }, LOAD_TIMEOUT_MS);
  }, []);

  const loadHostedBeta = useCallback(async () => {
    healthAbortRef.current?.abort();
    const controller = new AbortController();
    healthAbortRef.current = controller;

    setLoadError(null);
    setIsLoading(true);
    startLoadingTimer();

    try {
      const response = await fetch(LIVE_URL, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status >= 500) {
        throw new Error(`Server error ${response.status}`);
      }

      setSourceUrl(hostedUrl());
    } catch (error) {
      if (controller.signal.aborted) return;

      stopLoading();
      setSourceUrl(null);
      setLoadError(error instanceof Error ? error.message : SERVER_UNAVAILABLE_ERROR);
    }
  }, [startLoadingTimer, stopLoading]);

  useEffect(() => {
    loadHostedBeta();

    return () => {
      healthAbortRef.current?.abort();
      if (loadingFallbackRef.current) {
        clearTimeout(loadingFallbackRef.current);
      }
    };
  }, [loadHostedBeta]);

  const retryConnection = useCallback(() => {
    loadHostedBeta();
  }, [loadHostedBeta]);

  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const nextUrl = request?.url ?? "";
    return isAllowedUrl(nextUrl);
  }, []);

  const handleWebMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: string; title?: string; body?: string };
      if (payload.type !== "spades:game-attention") return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert(payload.title || "Spades needs you", payload.body || "Open the game to continue.");
    } catch {
      // Ignore non-JSON messages from the hosted web app.
    }
  }, []);

  const webViewSource = sourceUrl
    ? { uri: sourceUrl }
    : { html: LOADING_HTML, baseUrl: LIVE_ORIGIN };
  const TypedWebView = WebView as unknown as React.ComponentType<any>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <TypedWebView
          ref={webViewRef}
          source={webViewSource}
          style={styles.webView}
          containerStyle={styles.webViewContainer}
          originWhitelist={["*"]}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          pullToRefreshEnabled
          startInLoadingState={false}
          mixedContentMode="never"
          injectedJavaScript={TESTER_MODE_SCRIPT}
          onLoadStart={() => {
            setLoadError(null);
            setIsLoading(true);
          }}
          onLoadProgress={(event: any) => {
            if (event.nativeEvent.progress > 0.35) {
              stopLoading();
            }
          }}
          onLoadEnd={stopLoading}
          onError={(event: any) => {
            stopLoading();
            setLoadError(event.nativeEvent?.description ?? CONNECTION_ERROR);
          }}
          onHttpError={(event: any) => {
            if (event.nativeEvent?.statusCode >= 500) {
              stopLoading();
              setLoadError(`Server error ${event.nativeEvent.statusCode}`);
            }
          }}
          onContentProcessDidTerminate={() => {
            stopLoading();
            setSourceUrl(null);
            setLoadError("The game view restarted.");
          }}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onMessage={handleWebMessage}
        />

        {loadError ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>1v1 Spades</Text>
            <Text style={styles.errorText}>{CONNECTION_ERROR}</Text>
            <Text style={styles.errorDetail}>Last load error: {loadError}</Text>
            <Pressable accessibilityRole="button" onPress={retryConnection} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading && !loadError ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#efb72a" size="large" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function isAllowedUrl(value: string) {
  if (value === "about:blank") return true;
  if (value === LIVE_ORIGIN || value.startsWith(`${LIVE_ORIGIN}/`)) return true;
  if (/^(mailto:|tel:|https?:\/\/)/i.test(value)) {
    Linking.openURL(value).catch(() => undefined);
  }
  return false;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
  },
  container: {
    flex: 1,
    backgroundColor: "#050505",
  },
  webView: {
    flex: 1,
    backgroundColor: "#050505",
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: "#050505",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.72)",
  },
  errorPanel: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#050505",
  },
  errorTitle: {
    color: "#efb72a",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  errorText: {
    color: "#f5efe2",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  errorDetail: {
    color: "#aaa297",
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#efb72a",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: "#efb72a",
    fontSize: 14,
    fontWeight: "800",
  },
});
