import { createServer } from "node:http";
import { createSpadesHttpServer } from "./src/http-server.js";
import { attachSpadesWebSocketServer } from "./src/websocket-server.js";

const port = Number(process.env.PORT ?? 5175);
const { app, boundary } = createSpadesHttpServer();
const httpServer = createServer(app);
attachSpadesWebSocketServer({ httpServer, boundary });

httpServer.listen(port, () => {
  console.log(`Spades local HTTP/WebSocket boundary listening on http://localhost:${port}`);
});
