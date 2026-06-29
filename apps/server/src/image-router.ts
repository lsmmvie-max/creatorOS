import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { getCloudflareConfig } from "./key-manager.js";

const router = Router();

const ASSETS_DIR = "C:\\YouStudio\\assets";
const CLOUDFLARE_URL = "https://api.cloudflare.com/client/v4/accounts";
const OMNI_URL = "http://localhost:8765/v1/media/image";

interface ImageRequest {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
}

function ensureDateDir(): string {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(ASSETS_DIR, date);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function tryOmniMedia(body: ImageRequest): Promise<{ provider: string; url: string } | null> {
  try {
    const response = await fetch(OMNI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        width: body.width ?? 1280,
        height: body.height ?? 720,
        provider: "auto",
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) throw new Error(`OmniMediaRoute returned ${response.status}`);

    const data = (await response.json()) as { image_b64?: string; provider?: string };
    if (!data.image_b64) throw new Error("No image_b64 in response");

    const buffer = Buffer.from(data.image_b64, "base64");
    const dir = ensureDateDir();
    const filename = `gen_${Date.now()}.png`;
    const outPath = path.join(dir, filename);
    fs.writeFileSync(outPath, buffer);

    return { provider: data.provider ?? "omni", url: outPath };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const isOffline =
      e.cause?.code === "ECONNREFUSED" ||
      e.message.includes("ECONNREFUSED") ||
      e.name === "TimeoutError";
    console.warn(`[image] OmniMediaRoute ${isOffline ? "offline" : "error"}:`, e.message);
    return null;
  }
}

async function callCloudflare(body: ImageRequest, accountId: string, token: string): Promise<{ url: string }> {
  const url = `${CLOUDFLARE_URL}/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt: body.prompt, num_steps: 4 }),
  });

  if (!response.ok) throw new Error(`Cloudflare returned ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  let buffer: Buffer;

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { image?: string; result?: { image?: string } };
    const b64 = data.image ?? data.result?.image;
    if (!b64) throw new Error("No image data in Cloudflare response");
    buffer = Buffer.from(b64, "base64");
  } else {
    buffer = Buffer.from(await response.arrayBuffer());
  }

  const dir = ensureDateDir();
  const filename = `gen_${Date.now()}.png`;
  const outPath = path.join(dir, filename);
  fs.writeFileSync(outPath, buffer);
  return { url: outPath };
}

router.post("/generate", async (req: Request, res: Response) => {
  const body = req.body as ImageRequest;
  if (!body.prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  try {
    const result = await generateImage(body);
    res.json(result);
  } catch (err) {
    res.status(503).json({
      error: "All image providers unavailable",
      detail: (err as Error).message,
    });
  }
});

router.get("/test", (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    primary: "OmniMediaRoute (localhost:8765) — Pollinations → HuggingFace → Cloudflare",
    fallback: "Cloudflare direct",
  });
});

export async function generateImage(body: ImageRequest): Promise<{ provider: string; url: string }> {
  const omni = await tryOmniMedia(body);
  if (omni) return omni;

  const cf = getCloudflareConfig();
  if (cf.accountId && cf.token) {
    try {
      const r = await callCloudflare(body, cf.accountId, cf.token);
      return { provider: "cloudflare", ...r };
    } catch (err) {
      console.error("[image] Cloudflare fallback failed:", (err as Error).message);
    }
  }

  throw new Error("OmniMediaRoute offline and no Cloudflare fallback available");
}

export default router;
