export type OnlineCountUpdate = {
  onlineCount: number;
  findingMatchCount: number;
  rankedFindingMatchCount: number;
};

export class OnlinePresenceTracker {
  private readonly connectedSocketIds = new Set<string>();
  private findingMatchCount = 0;
  private rankedFindingMatchCount = 0;

  connect(socketId: string): OnlineCountUpdate {
    this.connectedSocketIds.add(socketId);
    return this.snapshot();
  }

  disconnect(socketId: string): OnlineCountUpdate {
    this.connectedSocketIds.delete(socketId);
    return this.snapshot();
  }

  setFindingMatchCount(count: number): OnlineCountUpdate {
    this.findingMatchCount = Math.max(0, Math.floor(count));
    return this.snapshot();
  }

  setRankedFindingMatchCount(count: number): OnlineCountUpdate {
    this.rankedFindingMatchCount = Math.max(0, Math.floor(count));
    return this.snapshot();
  }

  snapshot(): OnlineCountUpdate {
    return {
      onlineCount: this.connectedSocketIds.size,
      findingMatchCount: this.findingMatchCount,
      rankedFindingMatchCount: this.rankedFindingMatchCount,
    };
  }
}
