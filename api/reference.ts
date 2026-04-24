// api/reference.ts
// Vercel Edge Function — thin proxy between your React app and Render

import type { VercelRequest, VercelResponse } from "@vercel/node";

const RENDER_API_URL = "https://medmacs-refs.onrender.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const allowedOrigins = [
    "https://medistics.app",
    "http://localhost:8080",
    "http://localhost:8081",
    "https://com.hmacs.medistics"
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, top_k = 5 } = req.body ?? {};

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const upstream = await fetch(`${RENDER_API_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), top_k }),
      signal: AbortSignal.timeout(15_000), // 15s max
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("Render error:", upstream.status, text);
      return res.status(502).json({ error: "Reference service unavailable" });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err: any) {
    console.error("Proxy error:", err.message);
    return res.status(504).json({ error: "Request timed out" });
  }
}