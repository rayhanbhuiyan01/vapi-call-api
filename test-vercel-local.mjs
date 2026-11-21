// Local test for the Vercel handler — simulates Vercel's Node-style
// invocation: the default export is called as (req, res) with a Node
// IncomingMessage-like req and a ServerResponse-like res. Run:
//   node test-vercel-local.mjs
//   PUBLIC_URL=https://vapi-call-api-sigma.vercel.app node test-vercel-local.mjs
import handler from "./api/index.js";

function mockRes() {
  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      this.body = Buffer.concat(chunks).toString("utf-8");
      this.finished = true;
    },
  };
  return res;
}
function mockReq(url) {
  return { method: "GET", url, headers: { host: "vapi-call-api-sigma.vercel.app" } };
}

let failures = 0;
function passFail(ok, label, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra}`);
  if (!ok) failures++;
}

async function call(url) {
  const req = mockReq(url);
  const res = mockRes();
  const done = new Promise((resolve) => {
    const origEnd = res.end.bind(res);
    res.end = (c) => { origEnd(c); resolve(); };
  });
  const ret = handler(req, res);
  if (ret instanceof Promise) await ret;
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  return res;
}

// 1. /solar-calc with no payment -> 402 with the x402 offer
const r402 = await call("/solar-calc?monthlyBill=3000");
passFail(r402.finished && r402.statusCode === 402, "GET /solar-calc?monthlyBill=3000 (no payment): HTTP 402", ` (got ${r402.statusCode})`);
let offer = {};
try { offer = JSON.parse(r402.body || "{}"); } catch {}
passFail(offer.x402Version === 2, "offer x402Version 2");
passFail(offer.accepts?.[0]?.amount === "10000", "offer amount 10000 ($0.01)");
passFail(offer.accepts?.[0]?.payTo === "0x512a01200d4a765a7a3a050ac880cb5fb1429a3a", "offer payTo 0x512a…");
const expectedBase = (process.env.PUBLIC_URL || "http://localhost:4242").replace(/\/$/, "");
passFail(offer.resource?.url === `${expectedBase}/solar-calc`, `resource.url = ${offer.resource?.url}`);
const headerOffer = JSON.parse(Buffer.from(r402.headers["payment-required"] || "", "base64").toString("utf-8") || "{}");
passFail(JSON.stringify(headerOffer) === JSON.stringify(offer), "PAYMENT-REQUIRED header decodes to identical offer");
passFail(r402.headers["access-control-allow-origin"] === "*", "CORS allow-origin: * on 402 response");

// 2. /openapi.json -> 200 with 402 + x-payment-info + 402 content schema
const rOpen = await call("/openapi.json");
passFail(rOpen.finished && rOpen.statusCode === 200, "GET /openapi.json: HTTP 200", ` (got ${rOpen.statusCode})`);
let openapi = {};
try { openapi = JSON.parse(rOpen.body || "{}"); } catch {}
passFail(!!openapi.paths?.["/solar-calc"]?.get?.["x-payment-info"], "openapi has 402 + x-payment-info");
passFail(!!openapi.paths?.["/solar-calc"]?.get?.responses?.["402"]?.content?.["application/json"]?.schema?.$ref, "openapi 402 response has content schema");

// 3. /.well-known/x402 -> 200, version 1 document listing resources (vAPI wizard check)
const rWell = await call("/.well-known/x402");
passFail(rWell.finished && rWell.statusCode === 200, "GET /.well-known/x402: HTTP 200", ` (got ${rWell.statusCode})`);
let wellKnown = {};
try { wellKnown = JSON.parse(rWell.body || "{}"); } catch {}
passFail(wellKnown.x402Version === 1 && Array.isArray(wellKnown.resources) && wellKnown.resources.length === 1, "well-known is x402 v1 doc with 1 resource");

// 5. GET / (origin root, what the vAPI wizard tests) -> 402
const rRoot = await call("/");
passFail(rRoot.finished && rRoot.statusCode === 402, "GET / (origin root): HTTP 402", ` (got ${rRoot.statusCode})`);

// 4. /solar-calc without monthlyBill -> 400
const r400 = await call("/solar-calc");
passFail(r400.finished && r400.statusCode === 400, "GET /solar-calc (no monthlyBill): HTTP 400", ` (got ${r400.statusCode})`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exitCode = failures === 0 ? 0 : 1;
