import { createSpadesHttpServer } from "./src/http-server.js";

const port = Number(process.env.PORT ?? 5175);
const { app } = createSpadesHttpServer();

app.listen(port, () => {
  console.log(`Spades local HTTP boundary listening on http://localhost:${port}`);
});
