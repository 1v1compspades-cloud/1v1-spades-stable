import { useEffect, useState } from "react";
import { RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocket, type SocketStatus } from "@/hooks/useSocket";
import { cn } from "@/lib/utils";

const RECOVERY_HELP_DELAY_MS = 6500;

function statusCopy(status: SocketStatus): { title: string; detail: string } {
  if (status === "online") {
    return {
      title: "Still loading?",
      detail: "If the table does not return, refresh and we will restore your room.",
    };
  }
  if (status === "offline") {
    return {
      title: "Connection offline",
      detail: "We keep retrying automatically. If it stays stuck, refresh to reclaim your seat.",
    };
  }
  if (status === "connecting") {
    return {
      title: "Connecting",
      detail: "We are opening the table connection. If it stalls, refresh and we will restore your room.",
    };
  }
  return {
    title: "Still reconnecting?",
    detail: "We keep retrying automatically. If it stays stuck, refresh to reclaim your seat.",
  };
}

export function ConnectionRecoveryActions({
  className,
  compact = false,
  showImmediately = false,
  showWhenOnline = false,
}: {
  className?: string;
  compact?: boolean;
  showImmediately?: boolean;
  showWhenOnline?: boolean;
}) {
  const { status, connect, reportReconnectTelemetry } = useSocket();
  const [showHelp, setShowHelp] = useState(showImmediately);
  const [reportedHelp, setReportedHelp] = useState(false);

  useEffect(() => {
    if (status === "online" && !showWhenOnline) {
      setShowHelp(false);
      setReportedHelp(false);
      return;
    }
    if (showImmediately) {
      setShowHelp(true);
      return;
    }
    setShowHelp(false);
    const timeout = window.setTimeout(() => setShowHelp(true), RECOVERY_HELP_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [showImmediately, showWhenOnline, status]);

  useEffect(() => {
    if (!showHelp || reportedHelp || status === "online") return;
    reportReconnectTelemetry("reconnect_help_shown", {
      source: compact ? "connection_pill" : "room_reconnect_screen",
    });
    setReportedHelp(true);
  }, [compact, reportReconnectTelemetry, reportedHelp, showHelp, status]);

  if ((status === "online" && !showWhenOnline) || !showHelp) return null;

  const copy = statusCopy(status);
  const retryConnection = () => {
    reportReconnectTelemetry("manual_retry", {
      source: compact ? "connection_pill" : "room_reconnect_screen",
    });
    connect();
  };
  const refreshPage = () => {
    reportReconnectTelemetry("manual_refresh", {
      source: compact ? "connection_pill" : "room_reconnect_screen",
    });
    window.location.reload();
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-400/35 bg-black/80 p-3 text-amber-100 shadow-lg backdrop-blur-md",
        compact ? "w-72 text-left" : "w-full max-w-sm text-center",
        className,
      )}
      data-testid="connection-recovery-actions"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-amber-200">{copy.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.detail}</p>
      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retryConnection}
          className="h-9 border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15 hover:text-amber-50"
          data-testid="button-retry-connection"
        >
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Retry
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={refreshPage}
          className="h-9"
          data-testid="button-refresh-page"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Refresh
        </Button>
      </div>
    </div>
  );
}
