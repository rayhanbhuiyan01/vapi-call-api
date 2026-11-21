// Vercel serverless entry — documented Hono-on-Vercel pattern.
// vercel.json rewrites every path to this function, so the app serves
// /solar-calc, /openapi.json and /.well-known/x402 at the project root.
import { app } from "../app.mjs";

export default app.fetch;
