import { Router, type Request, type Response } from "express";
import type { MediaRouter } from "../router.js";

export function nativeRoutes(mediaRouter: MediaRouter): Router {
  const router = Router();

  router.post("/v1/media/image", async (req: Request, res: Response) => {
    const { prompt, width, height, provider } = req.body as {
      prompt?: string;
      width?: number;
      height?: number;
      provider?: string;
    };

    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    try {
      const result = await mediaRouter.route({ prompt, width, height }, provider ?? "auto");
      res.json(result);
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  router.get("/v1/media/status", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "OmniMediaRoute", providers: mediaRouter.providerNames() });
  });

  return router;
}
