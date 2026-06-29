import express from "express";
import { CloudflareProvider } from "./providers/cloudflare.js";
import { HuggingFaceProvider } from "./providers/huggingface.js";
import { PollinationsProvider } from "./providers/pollinations.js";
import { MediaRouter } from "./router.js";
import { nativeRoutes } from "./routes/native.js";
import { openaiCompatRoutes } from "./routes/openai-compat.js";

const PORT = parseInt(process.env.PORT ?? "8765", 10);
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "";
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";
const HF_API_KEYS = (process.env.HF_API_KEYS ?? "").split(",").filter(Boolean);

const providers = [
  new PollinationsProvider(),
  ...(HF_API_KEYS.length > 0 ? [new HuggingFaceProvider(HF_API_KEYS)] : []),
  ...(CF_ACCOUNT_ID && CF_API_TOKEN ? [new CloudflareProvider(CF_ACCOUNT_ID, CF_API_TOKEN)] : []),
];

const mediaRouter = new MediaRouter(providers);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(nativeRoutes(mediaRouter));
app.use(openaiCompatRoutes(mediaRouter));

app.listen(PORT, () => {
  console.log(`[OmniMediaRoute] Listening on :${PORT}`);
  console.log(`[OmniMediaRoute] Provider chain: ${mediaRouter.providerNames().join(" → ")}`);
});
