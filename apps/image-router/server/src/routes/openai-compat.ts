import { Router, type Request, type Response } from "express";
import type { MediaRouter } from "../router.js";

export function openaiCompatRoutes(mediaRouter: MediaRouter): Router {
  const router = Router();

  router.post("/v1/images/generations", async (req: Request, res: Response) => {
    const { prompt, size } = req.body as { prompt?: string; size?: string };

    if (!prompt) {
      res.status(400).json({ error: { message: "prompt is required", type: "invalid_request_error" } });
      return;
    }

    const [width, height] = (size ?? "1280x720").split("x").map(Number);

    try {
      const result = await mediaRouter.route({ prompt, width, height });
      res.json({
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: result.image_b64 }],
        _provider: result.provider,
      });
    } catch (err) {
      res.status(503).json({ error: { message: (err as Error).message, type: "service_unavailable" } });
    }
  });

  return router;
}
