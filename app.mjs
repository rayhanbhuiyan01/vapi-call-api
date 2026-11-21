// ASL Solar Calculator API — shared Hono app (local server + Vercel serverless)
// Price: $0.01 per call (10000 units of USDC, 6 decimals), Base network.
// payTo is the user's personal wallet; change PAY_TO before publishing if needed.
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

const facilitator = "https://x402.org/facilitator";
const PAY_TO = "0x512a01200d4a765a7a3a050ac880cb5fb1429a3a"; // user's personal wallet
const PRICE_USDC_UNITS = "10000"; // $0.01 (USDC has 6 decimals)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // canonical USDC on Base

// Public base URL of the deployed API. Set PUBLIC_URL in Vercel env vars
// (e.g. https://vapi-call-api.vercel.app). Locally it defaults to localhost:4242.
const BASE_URL = (process.env.PUBLIC_URL || "http://localhost:4242").replace(/\/$/, "");
const RESOURCE_URL = `${BASE_URL}/solar-calc`;

const offer = {
  x402Version: 2,
  error: "Payment required",
  resource: {
    url: RESOURCE_URL,
    description: "ASL solar system sizing estimate for a Bangladeshi home: recommended kW, panel count, cost in BDT and monthly savings.",
    mimeType: "application/json",
    serviceName: "ASL Solar Calculator API",
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: PRICE_USDC_UNITS,
      asset: USDC_BASE,
      payTo: PAY_TO,
      maxTimeoutSeconds: 120,
      extra: { name: "USD Coin", version: "2" },
    },
  ],
};

// Solar sizing (simple, documented):
// - Bangladesh average solar yield: ~4 kWh per installed kW per day.
// - Monthly generation target = monthlyBill / tariff. Tariff ~ 10 BDT/kWh (residential avg).
// - kW needed = monthly kWh / (30 days * 4 kWh/kW/day), rounded up to 0.5 kW steps.
// - Panels: 550W LONGi panels, ceil(kW * 1000 / 550).
// - System cost: ~95,000 BDT per kW installed (panels + Growatt hybrid inverter + structure).
// - Monthly savings: ~85% of the bill (system covers most daytime use).
// - Optional roofSqft: 1 kW needs ~100 sqft; cap kW by roof if given.
function solarCalc(monthlyBill, roofSqft) {
  const TARIFF_BDT_PER_KWH = 10;
  const KWH_PER_KW_PER_DAY = 4;
  const PANEL_W = 550;
  const COST_PER_KW_BDT = 95000;
  const SQFT_PER_KW = 100;

  const monthlyKwh = monthlyBill / TARIFF_BDT_PER_KWH;
  let kw = monthlyKwh / (30 * KWH_PER_KW_PER_DAY);
  kw = Math.ceil(kw * 2) / 2; // round up to nearest 0.5 kW
  if (kw < 1) kw = 1;

  let roofLimited = false;
  if (roofSqft && roofSqft > 0) {
    const maxKwByRoof = Math.floor(roofSqft / SQFT_PER_KW);
    if (maxKwByRoof < kw) {
      kw = Math.max(maxKwByRoof, 0.5);
      roofLimited = true;
    }
  }

  const panels = Math.ceil((kw * 1000) / PANEL_W);
  const systemCostBdt = Math.round(kw * COST_PER_KW_BDT);
  const monthlySavingsBdt = Math.round(monthlyBill * 0.85);
  const monthlyGenerationKwh = Math.round(kw * KWH_PER_KW_PER_DAY * 30);

  return {
    monthlyBillBdt: monthlyBill,
    roofSqft: roofSqft || null,
    recommendedKw: kw,
    panels550wLongi: panels,
    estimatedSystemCostBdt: systemCostBdt,
    estimatedMonthlySavingsBdt: monthlySavingsBdt,
    estimatedMonthlyGenerationKwh: monthlyGenerationKwh,
    roofLimited,
    currency: "BDT",
    note: "Estimate only. Final sizing needs a site survey by ASL Greentech Power.",
  };
}

app.use("*", cors({ origin: "*", exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] }));

app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.0.3",
    info: { title: "ASL Solar Calculator API", version: "1.0.0" },
    paths: {
      "/solar-calc": {
        get: {
          summary: "Estimate a home solar system for Bangladesh",
          parameters: [
            { name: "monthlyBill", in: "query", required: true, schema: { type: "number" }, description: "Monthly electricity bill in BDT" },
            { name: "roofSqft", in: "query", required: false, schema: { type: "number" }, description: "Usable roof area in sq ft" },
          ],
          "x-payment-info": offer.accepts[0],
          responses: {
            200: { description: "Solar sizing estimate" },
            402: { description: "Payment required" },
          },
        },
      },
    },
  })
);

app.get("/.well-known/x402", (c) =>
  c.json({
    x402Version: 2,
    resources: [
      {
        url: RESOURCE_URL,
        description: offer.resource.description,
        accepts: offer.accepts,
      },
    ],
  })
);

app.get("/solar-calc", async (c) => {
  const monthlyBill = Number(c.req.query("monthlyBill"));
  const roofSqft = c.req.query("roofSqft") ? Number(c.req.query("roofSqft")) : undefined;

  if (!monthlyBill || monthlyBill <= 0) {
    return c.json({ error: "monthlyBill query param (BDT, > 0) is required" }, 400);
  }

  const encoded = c.req.header("PAYMENT-SIGNATURE");
  if (!encoded) {
    return c.json(offer, 402, { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(offer)).toString("base64") });
  }

  let payment;
  try {
    payment = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
  } catch {
    return c.json({ error: "Invalid payment" }, 400);
  }

  const body = { x402Version: 2, paymentPayload: payment, paymentRequirements: offer.accepts[0] };
  const headers = { "content-type": "application/json" };

  let verify;
  try {
    verify = await fetch(`${facilitator}/verify`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    return c.json({ error: "Payment verification unavailable", detail: String(e) }, 502);
  }
  const verified = await verify.json().catch(() => ({}));
  if (!verify.ok || !verified.isValid) {
    return c.json({ error: "Payment verification failed" }, 402);
  }

  let settle;
  try {
    settle = await fetch(`${facilitator}/settle`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    return c.json({ error: "Payment settlement unavailable", detail: String(e) }, 502);
  }
  const settlement = await settle.json().catch(() => ({}));
  if (!settle.ok || !settlement.success) {
    return c.json({ error: "Payment settlement failed" }, 502);
  }

  return c.json(solarCalc(monthlyBill, roofSqft), 200, {
    "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(settlement)).toString("base64"),
  });
});

export { app, offer, RESOURCE_URL };

// Default export for Vercel: with the Hono framework preset, Vercel treats
// the root app.mjs as the serverless function entry and requires its default
// export to be a function (request handler). app.fetch is the bound Hono
// request handler — the same handler api/index.js exports. Without this,
// the deployment fails with 500 FUNCTION_INVOCATION_FAILED ("Invalid export
// found in module /var/task/app.mjs. The default export must be a function
// or server."). No behaviour change: same app, same routes, same x402 offer.
export default app.fetch;
