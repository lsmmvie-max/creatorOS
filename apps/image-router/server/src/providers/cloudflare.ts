import type { ImageProvider, ImageRequest, ImageResult } from "./base.js";

export class CloudflareProvider implements ImageProvider {
  name = "cloudflare";

  constructor(
    private accountId: string,
    private token: string,
  ) {}

  async generate(req: ImageRequest): Promise<ImageResult> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ prompt: req.prompt, num_steps: 4 }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`Cloudflare ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    let b64: string;

    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { image?: string; result?: { image?: string } };
      b64 = data.image ?? data.result?.image ?? "";
      if (!b64) throw new Error("No image in Cloudflare response");
    } else {
      b64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    }

    return { image_b64: b64, provider: this.name };
  }
}
