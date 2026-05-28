import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { setupSocketIO, rehydrateRoomsOnBoot } from "./game/socket.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
const io = setupSocketIO(httpServer);

// Expose io to HTTP routes (read-only) so /api/admin/stats can report live
// socket counts without importing the socket module directly.
app.locals["io"] = io;

// Rehydrate persisted rooms in the background. Don't block listen() — if
// the DB is slow or down, the server should still accept new connections;
// new rooms simply won't have the older sessions available until the
// rehydrate completes.
void rehydrateRoomsOnBoot(io).catch((err) => {
  logger.error({ err }, "rehydrateRoomsOnBoot failed");
});

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});

httpServer.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
