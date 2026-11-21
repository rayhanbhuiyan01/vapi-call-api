// Vercel serverless entry — documented Hono-on-Vercel pattern.
// vercel.json rewrites every path to this function, so the app serves
// /solar-calc, /openapi.json and /.well-known/x402 at the project root.
import { app } from "../app.mjs";

// ONE-argument wrapper (see app.mjs): exporting app.fetch directly breaks
// on Vercel because its 3-arg arity makes Vercel treat it as a Node
// (req, res) handler and wait forever -> 504 timeout.
export default (request) => app.fetch(request);
