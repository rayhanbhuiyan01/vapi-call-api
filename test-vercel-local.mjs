// Local check of the Vercel handler — calls api/index.js default export with
// plain Request objects, exactly as Vercel's Node runtime does.
// Run: node test-vercel-local.mjs
// With a public URL: PUBLIC_URL=https://vapi-call-api.vercel.app node test-vercel-local.mjs
import handler from "./api/index.js";

const base = "http://localhost";
let failures = 0;

async function check(label, path, expectStatus, fn) {
  const res = await handler(new Request(base + path));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const ok = res.status === expectStatus && (!fn || fn(res, json, text));
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${res.status}`);
  if (!ok) failures++;
  return { res, json, text };
}

// 1. No payment -> 402 with x402 v2 offer in body + PAYMENT-REQUIRED header
const r1 = await check("GET /solar-calc?monthlyBill=3000 (no payment)", "/solar-calc?monthlyBill=3000", 402,
  (res, json) =>
    json?.x402Version === 2 &&
    json.accepts?.[0]?.scheme === "exact" &&
    json.accepts?.[0]?.network === "eip155:8453" &&
    json.accepts?.[0]?.amount === "10000" &&
    json.accepts?.[0]?.asset === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" &&
    json.accepts?.[0]?.payTo === "0x512a01200d4a765a7a3a050ac880cb5fb1429a3a" &&
    json.accepts?.[0]?.maxTimeoutSeconds === 120);
const headerOffer = JSON.parse(Buffer.from(r1.res.headers.get("PAYMENT-REQUIRED") || "", "base64").toString("utf-8"));
const headerMatchesBody = JSON.stringify(headerOffer) === JSON.stringify(r1.json);
console.log(`${headerMatchesBody ? "PASS" : "FAIL"} PAYMENT-REQUIRED header decodes to identical offer`);
if (!headerMatchesBody) failures++;
console.log(`  resource.url = ${r1.json?.resource?.url}`);

// 2. OpenAPI doc
await check("GET /openapi.json", "/openapi.json", 200,
  (res, json) =>
    json?.openapi === "3.0.3" &&
    json.paths?.["/solar-calc"]?.get?.responses?.["402"] !== undefined &&
    json.paths?.["/solar-calc"]?.get?.["x-payment-info"] !== undefined);

// 3. Discovery doc
await check("GET /.well-known/x402", "/.well-known/x402", 200,
  (res, json) => json?.x402Version === 2 && Array.isArray(json.resources) && json.resources.length === 1);

// 4. Missing monthlyBill -> 400
await check("GET /solar-calc (no monthlyBill)", "/solar-calc", 400);

// 5. CORS headers present on a 402 response
const corsOk = r1.res.headers.get("access-control-allow-origin") === "*";
console.log(`${corsOk ? "PASS" : "FAIL"} CORS allow-origin: * on 402 response`);
if (!corsOk) failures++;

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
