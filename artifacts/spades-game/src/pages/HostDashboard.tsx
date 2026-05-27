import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdminAuditEntry, AdminDashboardSnapshot, AdminMatchSnapshot } from "@/lib/game";

function tokenKey(code: string): string {
  return `spades_tournament_token_${code}`;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function roundLabel(round: number, position: number, totalRounds: number): string {
  if (round === totalRounds) return "Finals";
  if (round === totalRounds - 1) return `Semifinal ${position + 1}`;
  if (round === totalRounds - 2) return `Quarterfinal ${position + 1}`;
  return `R${round} M${position + 1}`;
}

type Confirm = {
  title: string;
  description: string;
  onConfirm: () => void;
  destructive?: boolean;
} | null;

export default function HostDashboard() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [, setLocation] = useLocation();
  const {
    socket,
    connected,
    adminDashboard,
    adminAuditLog,
    adminPauseMatch,
    adminResumeMatch,
    adminResetTimer,
    adminRemakeRoom,
    adminMarkWinner,
    adminForceForfeit,
  } = useSocket();

  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // Token-gated: if no localStorage token exists, this is not the host
  // (or they cleared cache). Bounce back to the tournament page.
  useEffect(() => {
    const t = localStorage.getItem(tokenKey(code));
    if (!t) {
      setLocation(`/tournament/${code}`);
      return;
    }
    setToken(t);
  }, [code, setLocation]);

  const refresh = useCallback(async () => {
    if (!token || !connected) return;
    try {
      const [snap, log] = await Promise.all([
        adminDashboard(code, token),
        adminAuditLog(code, token, 50),
      ]);
      setSnapshot(snap);
      setAudit(log);
      setErr(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      // If host rejection (wrong token), bounce out.
      if (msg.toLowerCase().includes("host")) {
        setLocation(`/tournament/${code}`);
      }
    }
  }, [token, connected, code, adminDashboard, adminAuditLog, setLocation]);

  useEffect(() => {
    if (!token || !connected) return;
    refresh();
    const tick = setInterval(refresh, 3000);
    if (socket) {
      const onAudit = (data: { code: string }) => {
        if (data.code === code) refresh();
      };
      const onState = () => refresh();
      socket.on("admin_audit_appended", onAudit);
      socket.on("tournament_state", onState);
      socket.on("state", onState);
      return () => {
        clearInterval(tick);
        socket.off("admin_audit_appended", onAudit);
        socket.off("tournament_state", onState);
        socket.off("state", onState);
      };
    }
    return () => clearInterval(tick);
  }, [token, connected, refresh, socket, code]);

  const runWithBusy = useCallback(
    async (matchId: string, fn: () => Promise<unknown>) => {
      setBusyId(matchId);
      setErr(null);
      try {
        await fn();
        await refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const totalRounds = useMemo(() => {
    if (!snapshot) return 0;
    return Math.max(0, ...snapshot.matches.map((m) => m.round));
  }, [snapshot]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading host dashboard…
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        {err ?? "Loading tournament state…"}
      </div>
    );
  }

  const liveMatches = snapshot.matches.filter((m) => m.live && !m.winner);
  const otherMatches = snapshot.matches.filter((m) => !liveMatches.includes(m));

  return (
    <div className="min-h-screen bg-background text-foreground p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Host dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {snapshot.name} · <span className="font-mono">{snapshot.code}</span> · {snapshot.status}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation(`/tournament/${code}`)}
          data-testid="back-to-tournament"
        >
          Back
        </Button>
      </div>

      {err && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded p-2" data-testid="admin-error">
          {err}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Live matches ({liveMatches.length})</h2>
        {liveMatches.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches currently in play.</p>
        )}
        {liveMatches.map((m) => (
          <MatchCard
            key={m.matchId}
            m={m}
            totalRounds={totalRounds}
            busy={busyId === m.matchId}
            onPause={() => runWithBusy(m.matchId, () => adminPauseMatch(code, m.matchId, token))}
            onResume={() => runWithBusy(m.matchId, () => adminResumeMatch(code, m.matchId, token))}
            onResetTimer={() => runWithBusy(m.matchId, () => adminResetTimer(code, m.matchId, token))}
            onRemake={() =>
              setConfirm({
                title: "Remake match room?",
                description: "This abandons the current room and creates a fresh one with the same players. In-progress scores will be lost.",
                destructive: true,
                onConfirm: () =>
                  runWithBusy(m.matchId, () => adminRemakeRoom(code, m.matchId, token)),
              })
            }
            onMarkWinner={(seat) =>
              setConfirm({
                title: `Mark ${seat === "A" ? m.playerA?.name : m.playerB?.name} as winner?`,
                description: "This ends the match immediately and advances the bracket. Use only when a normal finish is impossible.",
                destructive: true,
                onConfirm: () =>
                  runWithBusy(m.matchId, () => adminMarkWinner(code, m.matchId, seat, token)),
              })
            }
            onForfeit={(seat) =>
              setConfirm({
                title: `Force ${seat === "A" ? m.playerA?.name : m.playerB?.name} to forfeit?`,
                description: "This ends the match with the other player advancing. The forfeited player is eliminated.",
                destructive: true,
                onConfirm: () =>
                  runWithBusy(m.matchId, () => adminForceForfeit(code, m.matchId, seat, token)),
              })
            }
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other matches ({otherMatches.length})</h2>
        {otherMatches.map((m) => (
          <MatchCard
            key={m.matchId}
            m={m}
            totalRounds={totalRounds}
            busy={busyId === m.matchId}
            compact
            onMarkWinner={
              !m.winner && m.playerA && m.playerB
                ? (seat) =>
                    setConfirm({
                      title: `Mark ${seat === "A" ? m.playerA?.name : m.playerB?.name} as winner?`,
                      description: "This advances the bracket without playing the match. Use only when a normal finish is impossible.",
                      destructive: true,
                      onConfirm: () =>
                        runWithBusy(m.matchId, () => adminMarkWinner(code, m.matchId, seat, token)),
                    })
                : undefined
            }
          />
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Audit log</h2>
        <Card className="p-3 text-xs space-y-1 max-h-64 overflow-y-auto font-mono" data-testid="admin-audit">
          {audit.length === 0 && <div className="text-muted-foreground">No admin actions yet.</div>}
          {audit.map((e, i) => (
            <div key={i} className="border-b border-border/40 last:border-0 pb-1">
              <span className="text-muted-foreground">{formatTs(e.ts)}</span>{" "}
              <span className="font-semibold">{e.action}</span>{" "}
              <span>by {e.actorName}</span>
              {e.matchId && <span className="text-muted-foreground"> · match {e.matchId.slice(0, 8)}</span>}
              {e.payload && Object.keys(e.payload).length > 0 && (
                <div className="text-muted-foreground pl-2">{JSON.stringify(e.payload)}</div>
              )}
            </div>
          ))}
        </Card>
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.destructive ? "bg-destructive text-destructive-foreground" : ""}
              data-testid="confirm-action"
              onClick={() => {
                const fn = confirm?.onConfirm;
                setConfirm(null);
                fn?.();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MatchCardProps {
  m: AdminMatchSnapshot;
  totalRounds: number;
  busy: boolean;
  compact?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onResetTimer?: () => void;
  onRemake?: () => void;
  onMarkWinner?: (seat: "A" | "B") => void;
  onForfeit?: (seat: "A" | "B") => void;
}

function MatchCard({
  m,
  totalRounds,
  busy,
  compact,
  onPause,
  onResume,
  onResetTimer,
  onRemake,
  onMarkWinner,
  onForfeit,
}: MatchCardProps) {
  const label = roundLabel(m.round, m.position, totalRounds);
  const a = m.playerA;
  const b = m.playerB;
  const live = m.live;
  return (
    <Card className="p-3 space-y-2" data-testid={`match-${m.matchId}`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{label}</span>
          {m.roomCode && <span className="ml-2 text-xs text-muted-foreground font-mono">{m.roomCode}</span>}
        </div>
        <div className="text-xs">
          {m.winner ? (
            <span className="text-primary font-semibold">Winner: {m.winnerName}</span>
          ) : live ? (
            <span className={live.isPaused ? "text-yellow-500" : "text-green-500"}>
              {live.isPaused ? "Paused" : `${live.phase} · R${live.roundNumber}`}
            </span>
          ) : (
            <span className="text-muted-foreground">Not started</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <SeatPill seat="A" name={a?.name ?? "—"} connected={!!a?.connected} score={live?.scores?.[0] ?? null} />
        <SeatPill seat="B" name={b?.name ?? "—"} connected={!!b?.connected} score={live?.scores?.[1] ?? null} />
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-2">
          {onPause && live && !live.isPaused && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onPause} data-testid={`pause-${m.matchId}`}>Pause</Button>
          )}
          {onResume && live?.isPaused && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onResume} data-testid={`resume-${m.matchId}`}>Resume</Button>
          )}
          {onResetTimer && live && !live.isPaused && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onResetTimer} data-testid={`reset-timer-${m.matchId}`}>Reset timer</Button>
          )}
          {onRemake && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onRemake} data-testid={`remake-${m.matchId}`}>Remake room</Button>
          )}
        </div>
      )}

      {(onMarkWinner || onForfeit) && !m.winner && a && b && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
          <div className="space-y-1">
            {onMarkWinner && <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={() => onMarkWinner("A")} data-testid={`mark-a-${m.matchId}`}>{a.name} wins</Button>}
            {onForfeit && <Button size="sm" variant="ghost" className="w-full text-destructive" disabled={busy} onClick={() => onForfeit("A")} data-testid={`forfeit-a-${m.matchId}`}>Forfeit {a.name}</Button>}
          </div>
          <div className="space-y-1">
            {onMarkWinner && <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={() => onMarkWinner("B")} data-testid={`mark-b-${m.matchId}`}>{b.name} wins</Button>}
            {onForfeit && <Button size="sm" variant="ghost" className="w-full text-destructive" disabled={busy} onClick={() => onForfeit("B")} data-testid={`forfeit-b-${m.matchId}`}>Forfeit {b.name}</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

function SeatPill({ seat, name, connected, score }: { seat: "A" | "B"; name: string; connected: boolean; score: number | null }) {
  return (
    <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs text-muted-foreground">{seat}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} title={connected ? "online" : "offline"} />
        <span className="truncate text-sm">{name}</span>
      </div>
      {score !== null && <span className="text-xs font-mono text-muted-foreground">{score}</span>}
    </div>
  );
}
