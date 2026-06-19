export type FindMatchErrorCode =
  | "disabled"
  | "invalid_name"
  | "rate_limited"
  | "server_full"
  | "match_failed";

export type FindMatchCancelReason = "cancelled" | "timeout" | "disconnect";

export type FindMatchSocketLike = {
  id: string;
  emit: (event: string, payload: unknown) => void;
};

export type FindMatchPlayer<TSocket extends FindMatchSocketLike = FindMatchSocketLike> = {
  socket: TSocket;
  playerName: string;
  profileUsername: string | null;
};

export type FindMatchMatchedPayload = {
  roomCode: string;
  playerIndex: 0 | 1;
  token?: string;
  route: string;
};

type QueuedPlayer<TSocket extends FindMatchSocketLike> = FindMatchPlayer<TSocket> & {
  queuedAt: number;
  timeoutAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type FindMatchQueueOptions<TSocket extends FindMatchSocketLike> = {
  isEnabled: () => boolean;
  timeoutMs: () => number;
  matchPlayers: (
    first: FindMatchPlayer<TSocket>,
    second: FindMatchPlayer<TSocket>,
  ) => Promise<[FindMatchMatchedPayload, FindMatchMatchedPayload]>;
  onWaitingCountChange?: (count: number) => void;
  now?: () => number;
};

export class FindMatchQueue<TSocket extends FindMatchSocketLike = FindMatchSocketLike> {
  private waiting: QueuedPlayer<TSocket> | null = null;
  private readonly isEnabled: () => boolean;
  private readonly timeoutMs: () => number;
  private readonly matchPlayers: FindMatchQueueOptions<TSocket>["matchPlayers"];
  private readonly onWaitingCountChange?: (count: number) => void;
  private readonly now: () => number;

  constructor(options: FindMatchQueueOptions<TSocket>) {
    this.isEnabled = options.isEnabled;
    this.timeoutMs = options.timeoutMs;
    this.matchPlayers = options.matchPlayers;
    this.onWaitingCountChange = options.onWaitingCountChange;
    this.now = options.now ?? Date.now;
  }

  async join(player: FindMatchPlayer<TSocket>): Promise<void> {
    if (!this.isEnabled()) {
      this.emitError(player.socket, "disabled", "Find Match is not enabled.");
      return;
    }

    if (!player.playerName.trim()) {
      this.emitError(player.socket, "invalid_name", "Player name is required.");
      return;
    }

    if (this.waiting?.socket.id === player.socket.id) {
      this.emitWaiting(this.waiting);
      return;
    }

    if (!this.waiting) {
      this.queue(player);
      return;
    }

    const first = this.waiting;
    this.clearWaiting();
    try {
      const [firstPayload, secondPayload] = await this.matchPlayers(first, player);
      first.socket.emit("find_match_matched", firstPayload);
      player.socket.emit("find_match_matched", secondPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create match.";
      this.emitError(first.socket, "match_failed", message);
      this.emitError(player.socket, "match_failed", message);
    }
  }

  cancel(socket: TSocket, reason: FindMatchCancelReason = "cancelled"): boolean {
    if (this.waiting?.socket.id !== socket.id) {
      socket.emit("find_match_cancelled", { reason });
      return false;
    }
    this.clearWaiting();
    socket.emit("find_match_cancelled", { reason });
    return true;
  }

  disconnect(socket: TSocket): boolean {
    if (this.waiting?.socket.id !== socket.id) return false;
    this.clearWaiting();
    return true;
  }

  hasWaitingSocket(socketId: string): boolean {
    return this.waiting?.socket.id === socketId;
  }

  getWaitingCount(): number {
    return this.waiting ? 1 : 0;
  }

  private queue(player: FindMatchPlayer<TSocket>): void {
    const queuedAt = this.now();
    const timeoutAt = queuedAt + this.timeoutMs();
    const timeoutHandle = setTimeout(() => {
      if (this.waiting?.socket.id !== player.socket.id) return;
      this.clearWaiting();
      player.socket.emit("find_match_cancelled", { reason: "timeout" });
    }, Math.max(0, timeoutAt - queuedAt));
    timeoutHandle.unref?.();

    this.waiting = { ...player, queuedAt, timeoutAt, timeoutHandle };
    this.onWaitingCountChange?.(1);
    this.emitWaiting(this.waiting);
  }

  private clearWaiting(): void {
    const hadWaiting = !!this.waiting;
    if (this.waiting) clearTimeout(this.waiting.timeoutHandle);
    this.waiting = null;
    if (hadWaiting) this.onWaitingCountChange?.(0);
  }

  private emitWaiting(player: QueuedPlayer<TSocket>): void {
    player.socket.emit("find_match_waiting", {
      queuedAt: player.queuedAt,
      timeoutAt: player.timeoutAt,
    });
  }

  private emitError(socket: TSocket, code: FindMatchErrorCode, message: string): void {
    socket.emit("find_match_error", { code, message });
  }
}
