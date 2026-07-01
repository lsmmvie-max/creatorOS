import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const RECORDINGS_DIR = "C:\\YouStudio\\recordings";
const QUEUE_DIR = "C:\\YouStudio\\queue";

function getTodayDir(): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return path.join(RECORDINGS_DIR, date);
}

function parseBlockIndex(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function getBlockDir(dayDir: string, blockIndex: number): string {
  return path.join(dayDir, `block-${blockIndex}`);
}

// Multer requires the "blockIndex" field to be appended to the FormData
// BEFORE the "audio" file field — multer parses multipart fields in stream
// order, so anything after the file is not yet in req.body when destination()
// and filename() run.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const blockIndex = parseBlockIndex((req.body as Record<string, unknown>)?.blockIndex);
    const dir = getBlockDir(getTodayDir(), blockIndex);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `take-${Date.now()}.webm`);
  },
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

router.post("/upload", upload.single("audio"), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }
  const blockIndex = parseBlockIndex((req.body as Record<string, unknown>)?.blockIndex);
  res.json({
    id: path.basename(file.filename, ".webm"),
    filename: file.filename,
    path: file.path,
    blockIndex,
  });
});

router.get("/takes", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  if (!fs.existsSync(dir)) {
    res.json({ takes: [], selected: null, blockIndex });
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      return {
        id: path.basename(f, ".webm"),
        filename: f,
        size: stat.size,
        duration: null,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let selected: string | null = null;
  const selPath = path.join(dir, "selected-take.json");
  if (fs.existsSync(selPath)) {
    try {
      selected = JSON.parse(fs.readFileSync(selPath, "utf-8")).id ?? null;
    } catch {}
  }

  res.json({ takes: files, selected, blockIndex });
});

router.delete("/takes/:id", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  const fp = path.join(dir, `${req.params.id}.webm`);
  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: "Take not found" });
    return;
  }
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

router.put("/takes/:id/select", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  const fp = path.join(dir, `${req.params.id}.webm`);
  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: "Take not found" });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "selected-take.json"),
    JSON.stringify({ id: req.params.id, selectedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
  res.json({ ok: true, id: req.params.id, blockIndex });
});

router.get("/blocks/status", (_req: Request, res: Response) => {
  const dayDir = getTodayDir();
  if (!fs.existsSync(dayDir)) {
    res.json([]);
    return;
  }

  const blockDirs = fs
    .readdirSync(dayDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^block-\d+$/.test(d.name))
    .map((d) => ({ name: d.name, index: Number(d.name.slice("block-".length)) }))
    .sort((a, b) => a.index - b.index);

  const status = blockDirs.map(({ name, index }) => {
    const dir = path.join(dayDir, name);
    const takeCount = fs.readdirSync(dir).filter((f) => f.endsWith(".webm")).length;
    const hasSelectedTake = fs.existsSync(path.join(dir, "selected-take.json"));
    return { blockIndex: index, hasSelectedTake, takeCount };
  });

  res.json(status);
});

function getEditingScriptLength(): number {
  if (!fs.existsSync(QUEUE_DIR)) return 0;
  const dirs = fs
    .readdirSync(QUEUE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const manifestPath = path.join(QUEUE_DIR, dir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        return Array.isArray(manifest.editingScript) ? manifest.editingScript.length : 0;
      } catch {
        return 0;
      }
    }
  }
  return 0;
}

async function isBinaryOnPath(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

router.get("/episode-audio", async (_req: Request, res: Response) => {
  const hasFfmpeg = await isBinaryOnPath("ffmpeg");
  const hasFfprobe = await isBinaryOnPath("ffprobe");
  if (!hasFfmpeg || !hasFfprobe) {
    res.status(503).json({
      error: "ffmpeg is required to build the episode audio but was not found on PATH",
      detail:
        "Install ffmpeg (which bundles ffprobe) and ensure both are available on PATH, e.g. via https://ffmpeg.org/download.html or `winget install ffmpeg`.",
    });
    return;
  }

  const totalBlocks = getEditingScriptLength();
  if (totalBlocks === 0) {
    res.status(400).json({ error: "No editing script found — run the overnight brain pipeline first" });
    return;
  }

  const dayDir = getTodayDir();
  const takeFiles: string[] = [];
  const missing: number[] = [];

  for (let i = 0; i < totalBlocks; i++) {
    const blockDir = getBlockDir(dayDir, i);
    const selPath = path.join(blockDir, "selected-take.json");
    if (!fs.existsSync(selPath)) {
      missing.push(i);
      continue;
    }
    try {
      const takeId = JSON.parse(fs.readFileSync(selPath, "utf-8")).id;
      const takePath = path.join(blockDir, `${takeId}.webm`);
      if (!fs.existsSync(takePath)) {
        missing.push(i);
        continue;
      }
      takeFiles.push(takePath);
    } catch {
      missing.push(i);
    }
  }

  if (missing.length > 0) {
    res.status(400).json({
      error: "Not all blocks have a selected take yet",
      missingBlocks: missing,
      totalBlocks,
    });
    return;
  }

  try {
    const durations: number[] = [];
    for (const file of takeFiles) {
      const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
        { timeout: 30_000 }
      );
      durations.push(parseFloat(stdout.trim()) || 0);
    }

    const outputPath = path.join(dayDir, "episode-final.mp3");
    const ffmpegArgs: string[] = [];
    for (const file of takeFiles) {
      ffmpegArgs.push("-i", file);
    }
    const filterInputs = takeFiles.map((_, i) => `[${i}:a]`).join("");
    ffmpegArgs.push(
      "-filter_complex",
      `${filterInputs}concat=n=${takeFiles.length}:v=0:a=1[outa]`,
      "-map",
      "[outa]",
      "-y",
      outputPath
    );

    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 300_000 });

    let cumulative = 0;
    const boundaries = durations.map((d, i) => {
      const start = cumulative;
      cumulative += d;
      return { blockIndex: i, start, end: cumulative };
    });

    res.json({
      ok: true,
      path: outputPath,
      totalDuration: cumulative,
      boundaries,
    });
  } catch (err) {
    console.error("[episode-audio] ffmpeg concat failed:", err);
    res.status(500).json({ error: "Failed to build episode audio", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/transcribe", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  const selPath = path.join(dir, "selected-take.json");

  if (!fs.existsSync(selPath)) {
    res.status(400).json({ error: "No take selected. Select a take first." });
    return;
  }

  let takeId: string;
  try {
    takeId = JSON.parse(fs.readFileSync(selPath, "utf-8")).id;
  } catch {
    res.status(500).json({ error: "Failed to read selected take" });
    return;
  }

  const audioPath = path.join(dir, `${takeId}.webm`);
  if (!fs.existsSync(audioPath)) {
    res.status(404).json({ error: "Selected take file not found" });
    return;
  }

  // TODO(transcription-swap): whisper.cpp requires a hardcoded native binary + model
  // download, which is brittle to set up per-machine. The planned swap is to a JS/WASM
  // Whisper implementation via `@xenova/transformers` (runs in-process, no external binary,
  // downloads its own model on first use). As of this writing that package is NOT installed
  // in apps/server — installing it requires running `bun add @xenova/transformers` in
  // apps/server, which needs approval before running. Until then this endpoint keeps the
  // existing whisper.cpp-or-mock behavior unchanged below.

  // Try whisper.cpp first
  const whisperPaths = [
    "C:\\whisper.cpp\\main.exe",
    "C:\\whisper.cpp\\build\\bin\\Release\\main.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "whisper.cpp", "main.exe"),
  ];
  const modelPaths = [
    "C:\\whisper.cpp\\models\\ggml-base.en.bin",
    "C:\\whisper.cpp\\models\\ggml-base.bin",
    "C:\\whisper.cpp\\models\\ggml-small.en.bin",
  ];

  const whisperBin = whisperPaths.find((p) => fs.existsSync(p));
  const modelFile = modelPaths.find((p) => fs.existsSync(p));

  if (!whisperBin || !modelFile) {
    res.json({
      text: "[Whisper not installed — showing mock transcript]",
      segments: [
        { start: 0, end: 5, text: "This is a mock transcript." },
        { start: 5, end: 10, text: "Install whisper.cpp to get real transcription." },
      ],
      mock: true,
      installGuide:
        "Install whisper.cpp: git clone https://github.com/ggerganov/whisper.cpp C:\\whisper.cpp && cd C:\\whisper.cpp && cmake -B build && cmake --build build --config Release && .\\models\\download-ggml-model.cmd base.en",
    });
    return;
  }

  const outputPath = path.join(dir, `${takeId}-transcript`);
  execFile(
    whisperBin,
    ["-m", modelFile, "-f", audioPath, "-otxt", "-of", outputPath],
    { timeout: 120_000 },
    (err) => {
      if (err) {
        console.error("[Whisper] Error:", err);
        res.status(500).json({ error: "Whisper transcription failed", detail: err.message });
        return;
      }

      const txtPath = `${outputPath}.txt`;
      if (!fs.existsSync(txtPath)) {
        res.status(500).json({ error: "Whisper produced no output" });
        return;
      }

      const text = fs.readFileSync(txtPath, "utf-8").trim();
      res.json({ text, segments: [], mock: false });
    }
  );
});

router.get("/transcript", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  const selPath = path.join(dir, "selected-take.json");

  if (!fs.existsSync(selPath)) {
    res.status(404).json({ error: "No take selected" });
    return;
  }

  let takeId: string;
  try {
    takeId = JSON.parse(fs.readFileSync(selPath, "utf-8")).id;
  } catch {
    res.status(500).json({ error: "Failed to read selected take" });
    return;
  }

  const txtPath = path.join(dir, `${takeId}-transcript.txt`);
  const jsonPath = path.join(dir, `${takeId}-transcript.json`);

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      res.json(data);
      return;
    } catch {}
  }

  if (fs.existsSync(txtPath)) {
    const text = fs.readFileSync(txtPath, "utf-8").trim();
    res.json({ text, segments: [], mock: false });
    return;
  }

  res.json({
    text: "",
    segments: [
      { start: 0, end: 3, text: "Sample caption line one." },
      { start: 3, end: 6, text: "Sample caption line two." },
      { start: 6, end: 9, text: "Sample caption line three." },
    ],
    mock: true,
  });
});

router.get("/audio/:filename", (req: Request, res: Response) => {
  const blockIndex = parseBlockIndex(req.query.blockIndex);
  const dir = getBlockDir(getTodayDir(), blockIndex);
  const filename = String(req.params.filename);
  const fp = path.join(dir, filename);
  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(fp);
});

export default router;
