import type { ImageProvider, ImageRequest, ImageResult } from "./base.js";

export class PollinationsProvider implements ImageProvider {
  name = "pollinations";

  async generate(req: ImageRequest): Promise<ImageResult> {
    const w = req.width ?? 1280;
    const h = req.height ?? 720;
    const encoded = encodeURIComponent(req.prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&model=flux`;

    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`Pollinations ${response.status}`);

    const buf = Buffer.from(await response.arrayBuffer());
    return { image_b64: buf.toString("base64"), provider: this.name };
  }
}
