// Local dev server — `node index.mjs` (http://localhost:4242)
// Same app that Vercel serves from api/index.js.
import { serve } from "@hono/node-server";
import { app } from "./app.mjs";

serve({ fetch: app.fetch, port: 4242 }, (info) => {
  console.log(`ASL Solar Calculator API listening on http://localhost:${info.port}`);
});
