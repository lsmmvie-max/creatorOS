import type { ImageProvider, ImageRequest, ImageResult } from "./base.js";

export class HuggingFaceProvider implements ImageProvider {
  name = "huggingface";
  private keys: string[];
  private keyIndex = 0;

  constructor(keys: string[]) {
    this.keys = keys.filter((k) => k.length > 0);
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    if (this.keys.length === 0) throw new Error("No HuggingFace API keys configured");

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[this.keyIndex % this.keys.length];
      this.keyIndex++;
      try {
        const response = await fetch(
          "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: req.prompt }),
            signal: AbortSignal.timeout(120_000),
          },
        );
        if (!response.ok) throw new Error(`HuggingFace ${response.status}`);
        const buf = Buffer.from(await response.arrayBuffer());
        return { image_b64: buf.toString("base64"), provider: this.name };
      } catch (err) {
        console.warn(`[HuggingFace] key[${i}] failed:`, (err as Error).message);
        if (i === this.keys.length - 1) throw err;
      }
    }
    throw new Error("All HuggingFace keys exhausted");
  }
}
