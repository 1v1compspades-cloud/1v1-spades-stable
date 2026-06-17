import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const publicDir = resolve("artifacts/spades-game/dist/public");
const port = Number(process.env.PORT || 10000);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function fileForUrl(url) {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  const cleaned = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(join(publicDir, cleaned));

  if (!candidate.startsWith(publicDir)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  const indexCandidate = resolve(join(candidate, "index.html"));
  if (existsSync(indexCandidate) && statSync(indexCandidate).isFile()) {
    return indexCandidate;
  }

  return resolve(join(publicDir, "index.html"));
}

const server = createServer((req, res) => {
  const file = fileForUrl(req.url);

  if (!file || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "cache-control": file.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    "content-type": contentTypes.get(extname(file)) || "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Spades dist from ${publicDir} on ${port}`);
});
