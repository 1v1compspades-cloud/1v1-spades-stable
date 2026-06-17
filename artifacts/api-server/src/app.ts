import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the single Replit reverse-proxy hop so Express populates req.ip
// with the real client address (from the sanitised X-Forwarded-For that the
// proxy sets). Without this, req.ip is the proxy's address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const webPublicDir = path.resolve(process.cwd(), "artifacts/spades-game/dist/public");
const webIndex = path.join(webPublicDir, "index.html");

if (existsSync(webIndex)) {
  app.use(express.static(webPublicDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(webIndex);
  });
}

export default app;
