# ASL Solar Calculator API — x402 paid endpoint

Local build only. Nothing published, nothing paid, nothing signed.

## Run locally
```
cd ~/workspace/vapi-call-api
node index.mjs          # http://localhost:4242
```

## Endpoints
- `GET /solar-calc?monthlyBill=3000&roofSqft=1200` — paid, $0.01/call (x402 v2, Base USDC)
- `GET /openapi.json` — OpenAPI 3.0.3, declares 402 + x-payment-info
- `GET /.well-known/x402` — discovery document

## Offer
- scheme `exact`, network `eip155:8453` (Base), asset canonical USDC
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, amount `10000` ($0.01),
  payTo `0x512a01200d4a765a7a3a050ac880cb5fb1429a3a` (user's personal wallet —
  change PAY_TO in app.mjs before publishing if a different payout wallet is wanted),
  maxTimeoutSeconds 120.

## Layout
- `app.mjs` — the shared Hono app (all routes + x402 logic, unchanged from the local build)
- `index.mjs` — local dev server (`node index.mjs`, port 4242)
- `api/index.js` — Vercel serverless entry (`export default app.fetch`; vercel.json
  rewrites every path to it, so the same three routes serve at the project root)
- `vercel.json` — rewrite rule only; no build step beyond `npm install`
- `test-vercel-local.mjs` — calls the Vercel handler with plain Requests, no login needed
- `package.json` — `"type": "module"` so `api/index.js` runs as ESM

## PUBLIC_URL env var
The x402 offer's `resource.url` is built from `PUBLIC_URL` (app.mjs).
- Unset: defaults to `http://localhost:4242` (local dev).
- On Vercel: set `PUBLIC_URL` to the deployed URL, e.g.
  `https://vapi-call-api.vercel.app` (no trailing slash).
- After the first deploy, set the env var in Vercel and redeploy so the offer
  carries the real public URL.

## Deploy to Vercel (free)
1. Push this folder to GitHub (public repo; `node_modules/` is gitignored).
   ```
   cd ~/workspace/vapi-call-api
   git init && git add . && git commit -m "ASL Solar Calculator API (x402)"
   git remote add origin https://github.com/rayhanbhuiyan01/vapi-call-api.git
   git push -u origin main
   ```
2. In Vercel: Add New → Project → Import the repo. Framework preset: Other.
   No build command, no output directory (defaults are fine).
3. Deploy once to get the public URL (e.g. `https://vapi-call-api.vercel.app`).
4. In the Vercel project: Settings → Environment Variables → add
   `PUBLIC_URL` = the deployed URL. Redeploy (Deployments → ⋯ → Redeploy).
5. Check the live URL:
   `curl -i "https://vapi-call-api.vercel.app/solar-calc?monthlyBill=3000"`
   should return HTTP 402 with the x402 offer; `/openapi.json` and
   `/.well-known/x402` should return 200.
6. Then run `vapi check https://vapi-call-api.vercel.app/solar-calc --method GET`
   from a machine where the CLI network guard does not block it (blocked from this VM).

## Verified 2026-11-21 (local only)
- Vercel handler (`node test-vercel-local.mjs`, no PUBLIC_URL): no payment ->
  HTTP 402, body x402Version 2, accepts[0] scheme/network/amount/asset/payTo as above;
  PAYMENT-REQUIRED header decodes to the identical offer; resource.url
  `http://localhost:4242/solar-calc`. /openapi.json -> 200, 402 + x-payment-info
  present. /.well-known/x402 -> 200. Missing monthlyBill -> 400. CORS `*` present.
- Same run with `PUBLIC_URL=https://vapi-call-api.vercel.app`: all checks pass,
  resource.url `https://vapi-call-api.vercel.app/solar-calc`.
- Refactored local server over real HTTP: 402 + header as above, /openapi.json 200,
  /.well-known/x402 200, missing monthlyBill 400.
- Paid path (verify/settle via https://x402.org/facilitator) is implemented but NOT
  tested — no real payment was made.

## Still needed to list on vAPI (NOT done here)
1. Deploy to Vercel (steps above) — localhost cannot be listed.
2. User proves the payout wallet by signature in the Add API wizard, then Go live.
3. `vapi check <public-url>/solar-calc --method GET` from a machine where the CLI
   network guard does not block it (blocked from this VM).
