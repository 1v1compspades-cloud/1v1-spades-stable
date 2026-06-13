import { createServer } from "node:http";
import { createSpadesHttpServer } from "./src/http-server.js";
import { attachSpadesWebSocketServer } from "./src/websocket-server.js";

const port = Number(process.env.PORT ?? 5175);
let websocketServer = null;
const { app, boundary } = createSpadesHttpServer({
  onBoundaryResponse: (payload) => {
    const roomCode = payload.view?.roomCode ?? payload.spectatorView?.roomCode;
    if (roomCode) {
      websocketServer?.broadcastRoom(roomCode, {
        sourceClientId: "http",
        requestId: payload.requestId,
        responseType: payload.type,
        actionId: payload.actionId,
        duplicate: payload.duplicate
      });
    }
  },
  onQueueResponse: (payload) => {
    websocketServer?.broadcastQueue(payload);
    const roomCode = payload.match?.roomCode;
    if (roomCode) {
      websocketServer?.broadcastRoom(roomCode, {
        sourceClientId: "quick-match",
        requestId: payload.requestId,
        responseType: payload.type,
        actionId: payload.actionId,
        duplicate: payload.duplicate
      });
    }
  }
});
const httpServer = createServer(app);
websocketServer = attachSpadesWebSocketServer({ httpServer, boundary });

httpServer.listen(port, () => {
  console.log(`Spades local HTTP/WebSocket boundary listening on http://localhost:${port}`);
});
