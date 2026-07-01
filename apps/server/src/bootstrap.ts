import fs from "fs";
import path from "path";

const DATA_DIR = "C:\\YouStudio";
const KEYS_PATH = path.join(DATA_DIR, "keys.json");
// Matches overnight-brain.ts / index.ts, which both read the story queue
// directly from C:\YouStudio\story-queue.json — NOT from inside queue/.
const STORY_QUEUE_PATH = path.join(DATA_DIR, "story-queue.json");
const PROFILE_PATH = path.join(DATA_DIR, "channel-profile.json");

const SUBFOLDERS = [
  "queue",
  "recordings",
  "assets",
  "characters",
  "backgrounds",
  "references",
  "exports",
  "projects",
];

// Shape must match the KeysFile interface in key-manager.ts exactly, since
// getProviderTokens()/getCloudflareConfig() index into these fields directly.
const DEFAULT_KEYS = {
  openrouter: [],
  gemini: [],
  fal: [],
  stability: [],
  zenmux: [],
  cloudflare: { accountId: "", tokens: [] },
  youtube: [],
  groq: [],
};

// Mirrors the default profile object returned by GET /settings/profile in
// index.ts when no file exists, plus storyStylePrompt which overnight-brain.ts
// reads optionally.
const DEFAULT_PROFILE = {
  channelName: "",
  mainCharacterName: "",
  contentStyle: "Storytelling",
  targetAudienceAge: "",
  language: "English",
  storyStylePrompt: "",
};

export function runBootstrap(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[Bootstrap] Created ${DATA_DIR}`);
  }

  for (const folder of SUBFOLDERS) {
    const dir = path.join(DATA_DIR, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Bootstrap] Created ${dir}`);
    }
  }

  if (!fs.existsSync(KEYS_PATH)) {
    fs.writeFileSync(KEYS_PATH, JSON.stringify(DEFAULT_KEYS, null, 2), "utf-8");
    console.log(`[Bootstrap] Created ${KEYS_PATH}`);
  }

  if (!fs.existsSync(STORY_QUEUE_PATH)) {
    fs.writeFileSync(STORY_QUEUE_PATH, "[]", "utf-8");
    console.log(`[Bootstrap] Created ${STORY_QUEUE_PATH}`);
  }

  if (!fs.existsSync(PROFILE_PATH)) {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(DEFAULT_PROFILE, null, 2), "utf-8");
    console.log(`[Bootstrap] Created ${PROFILE_PATH}`);
  }
}

// Runs immediately when this module is imported (not just when runBootstrap()
// is called explicitly). This is what actually guarantees C:\YouStudio exists
// before key-manager.js's module-level sqlite Database() call — see the
// import-order comment in index.ts.
runBootstrap();
