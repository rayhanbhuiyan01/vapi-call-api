// Vercel serverless entry — documented Hono-on-Vercel pattern.
// vercel.json rewrites every path to this function, so the app serves
// /solar-calc, /openapi.json and /.well-known/x402 at the project root.
import vercelHandler from "../app.mjs";

// Node-style handler (see app.mjs): the Vercel Node runtime calls the
// default export as (req, res) => void and ignores a returned Response,
// so a bare app.fetch hangs. vercelHandler adapts Node req/res to Hono.
export default vercelHandler;
