import type { ImageProvider, ImageRequest, ImageResult } from "./providers/base.js";

export class MediaRouter {
  constructor(private providers: ImageProvider[]) {}

  async route(req: ImageRequest, preferredProvider = "auto"): Promise<ImageResult> {
    const ordered =
      preferredProvider !== "auto"
        ? [
            ...this.providers.filter((p) => p.name === preferredProvider),
            ...this.providers.filter((p) => p.name !== preferredProvider),
          ]
        : this.providers;

    const errors: string[] = [];
    for (const provider of ordered) {
      try {
        console.log(`[OmniMedia] trying ${provider.name}`);
        const result = await provider.generate(req);
        console.log(`[OmniMedia] ${provider.name} succeeded`);
        return result;
      } catch (err) {
        const msg = (err as Error).message;
        errors.push(`${provider.name}: ${msg}`);
        console.warn(`[OmniMedia] ${provider.name} failed:`, msg);
      }
    }

    throw new Error(`All providers failed — ${errors.join("; ")}`);
  }

  providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }
}
