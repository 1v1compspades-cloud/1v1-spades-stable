import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { WebView } from "react-native-webview";

const LIVE_URL = "https://1v1euchre.com";
const LIVE_ORIGIN = "https://1v1euchre.com";
const HEALTH_URL = `${LIVE_ORIGIN}/healthz`;
const CONNECTION_ERROR = "Connection unavailable. Check internet or try again.";

export default function App() {
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [loadedUrl, setLoadedUrl] = useState(LIVE_URL);

  const checkConnection = useCallback(async () => {
    setConnectionStatus("checking");
    setLoadError(null);

    try {
      const response = await fetchWithTimeout(HEALTH_URL);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      setConnectionStatus("online");
      setIsLoading(false);
      return true;
    } catch (error) {
      setConnectionStatus("offline");
      setIsLoading(false);
      setLoadError(error?.message ?? CONNECTION_ERROR);
      return false;
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleShouldStartLoad = useCallback((request) => {
    const nextUrl = request?.url ?? "";

    if (isAllowedUrl(nextUrl)) {
      return true;
    }

    return false;
  }, []);

  const retryConnection = useCallback(async () => {
    const connected = await checkConnection();
    if (connected) {
      setIsLoading(true);
      webViewRef.current?.reload();
    }
  }, [checkConnection]);

  const canLoadWebView = connectionStatus === "online";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {loadError ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>1v1 Euchre</Text>
            <Text style={styles.errorText}>{CONNECTION_ERROR}</Text>
            <Text style={styles.errorDetail}>Last load error: {loadError}</Text>
            <View style={styles.errorStatusPanel}>
              <Text style={styles.statusText}>Loaded URL: {loadedUrl}</Text>
              <Text style={styles.statusText}>Status: {statusLabel(connectionStatus)}</Text>
              <Text style={styles.statusText}>Last load error: {loadError ?? "None"}</Text>
            </View>
            <Text
              accessibilityRole="button"
              onPress={retryConnection}
              style={styles.retryText}
            >
              Retry
            </Text>
          </View>
        ) : null}

        {canLoadWebView ? (
          <WebView
            ref={webViewRef}
            source={{ uri: LIVE_URL }}
            style={styles.webView}
            containerStyle={styles.webViewContainer}
            originWhitelist={[LIVE_ORIGIN]}
            allowsBackForwardNavigationGestures
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            pullToRefreshEnabled
            startInLoadingState
            mixedContentMode="never"
            onLoadStart={(event) => {
              setIsLoading(true);
              setLoadedUrl(event.nativeEvent?.url ?? LIVE_URL);
            }}
            onLoadEnd={(event) => {
              setIsLoading(false);
              setLoadedUrl(event.nativeEvent?.url ?? LIVE_URL);
            }}
            onNavigationStateChange={(state) => {
              if (state?.url) setLoadedUrl(state.url);
            }}
            onError={(event) => {
              setIsLoading(false);
              setConnectionStatus("offline");
              setLoadError(event.nativeEvent?.description ?? CONNECTION_ERROR);
            }}
            onHttpError={(event) => {
              if (event.nativeEvent?.statusCode >= 500) {
                setConnectionStatus("offline");
                setLoadError(`Server error ${event.nativeEvent.statusCode}`);
              }
            }}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
          />
        ) : null}

        {isLoading && !loadError ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#efb72a" size="large" />
          </View>
        ) : null}

        <View style={styles.statusPanel} pointerEvents="none">
          <Text style={styles.statusText}>Loaded URL: {loadedUrl}</Text>
          <Text style={styles.statusText}>Status: {statusLabel(connectionStatus)}</Text>
          <Text style={styles.statusText}>Last load error: {loadError ?? "None"}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function isAllowedUrl(value) {
  if (value === "about:blank") return true;
  const nextUrl = String(value);
  return (
    nextUrl === LIVE_ORIGIN ||
    nextUrl.startsWith(`${LIVE_ORIGIN}/`) ||
    nextUrl.startsWith(`${LIVE_ORIGIN}?`) ||
    nextUrl.startsWith(`${LIVE_ORIGIN}#`)
  );
}

async function fetchWithTimeout(url) {
  return Promise.race([
    fetch(url, {
      headers: {
        Accept: "application/json"
      }
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Connection check timed out")), 8000);
    })
  ]);
}

function statusLabel(status) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Checking";
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505"
  },
  container: {
    flex: 1,
    backgroundColor: "#050505"
  },
  webView: {
    flex: 1,
    backgroundColor: "#050505"
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: "#050505"
  },
  statusPanel: {
    borderTopColor: "rgba(239, 183, 42, 0.34)",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#050505"
  },
  statusText: {
    color: "#aaa297",
    fontSize: 10,
    fontWeight: "700"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.72)"
  },
  errorPanel: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#050505"
  },
  errorTitle: {
    marginBottom: 10,
    color: "#efb72a",
    fontSize: 28,
    fontWeight: "900"
  },
  errorText: {
    maxWidth: 300,
    color: "#f2eee5",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "center"
  },
  errorDetail: {
    maxWidth: 320,
    marginTop: 12,
    color: "#aaa297",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center"
  },
  errorStatusPanel: {
    width: "100%",
    maxWidth: 320,
    marginTop: 16,
    padding: 10,
    borderColor: "rgba(239, 183, 42, 0.34)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.04)"
  },
  retryText: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#efb72a",
    color: "#11100d",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center"
  }
});
