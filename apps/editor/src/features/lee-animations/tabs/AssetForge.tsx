import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import {
  findCompatibleTrackForItemType,
  findNearestAvailableSpace,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'
import { cn } from '@/shared/ui/cn'
import type { ImageItem } from '@/types/timeline'

const API = 'http://localhost:3737'

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

interface AssetFile {
  date: string
  filename: string
  url: string
  size: number
  createdAt: string
}

type BatchStatus = 'pending' | 'generating' | 'done' | 'error'
interface BatchItem {
  id: string
  prompt: string
  status: BatchStatus
  resultUrl?: string
}

function ImageThumbnail({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          'bg-secondary/50 flex items-center justify-center text-[9px] text-muted-foreground/60',
          className,
        )}
      >
        ?
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('object-cover', className)}
      onError={() => setFailed(true)}
    />
  )
}

export function AssetForge() {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<'LIGHT' | 'INTENSE'>('LIGHT')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{
    imageUrl?: string
    error?: string
    provider?: string
  } | null>(null)
  const [assets, setAssets] = useState<AssetFile[]>([])
  const [assetsError, setAssetsError] = useState<string | null>(null)

  // Batch queue (FIX 6)
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const batchAbortRef = useRef(false)

  async function loadAssets() {
    try {
      const r = await fetch(`${API}/forge/assets`)
      if (r.ok) {
        const data = await r.json()
        const list = Array.isArray(data) ? data : (data.assets ?? [])
        setAssets(list)
        setAssetsError(null)
      }
    } catch {
      setAssetsError('Could not load assets — server may be offline')
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [])

  async function handleGenerate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setResult(null)
    try {
      const r = await fetch(`${API}/forge/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style }),
      })
      const data = await r.json()
      if (!r.ok) {
        setResult({ error: data.error ?? 'Generation failed' })
      } else {
        // url from server is a relative path like /forge/image/2026-06-22/scene.png
        const relUrl: string = data.url ?? data.imageUrl ?? ''
        setResult({
          imageUrl: relUrl ? `${API}${relUrl}` : undefined,
          provider: data.provider as string | undefined,
        })
        void loadAssets()
      }
    } catch {
      setResult({ error: 'Server offline — start the automation server' })
    } finally {
      setGenerating(false)
    }
  }

  function addToTimeline(src: string, label: string) {
    const { tracks, items, fps, addItem } = useTimelineStore.getState()
    const currentFrame = usePlaybackStore.getState().currentFrame
    const durationInFrames = Math.round(5 * fps)

    const targetTrack = findCompatibleTrackForItemType({
      tracks,
      items,
      itemType: 'image',
      preferredTrackId: undefined,
    })
    if (!targetTrack) return

    const finalPos =
      findNearestAvailableSpace(currentFrame, durationInFrames, targetTrack.id, items) ??
      currentFrame

    const item: ImageItem = {
      id: newId(),
      type: 'image',
      trackId: targetTrack.id,
      from: finalPos,
      durationInFrames,
      label,
      mediaId: undefined as unknown as string,
      src,
    }
    addItem(item)
  }

  // Batch queue: load prompts from today's episode
  async function handleLoadFromEpisode() {
    try {
      const r = await fetch(`${API}/brief/today`)
      if (!r.ok) return
      const manifest = await r.json()
      const rawPrompts: Array<{ prompt?: string } | string> = manifest.imagePrompts ?? []
      const prompts: string[] = rawPrompts
        .map((p) => (typeof p === 'string' ? p : (p.prompt ?? '')))
        .filter(Boolean)
      if (prompts.length === 0) return
      setBatchItems(
        prompts.map((p, i) => ({
          id: `batch-${i}-${Date.now()}`,
          prompt: p,
          status: 'pending',
        })),
      )
    } catch {
      // server offline — silently skip
    }
  }

  async function handleGenerateAll() {
    if (batchItems.length === 0 || batchRunning) return
    setBatchRunning(true)
    batchAbortRef.current = false

    for (let i = 0; i < batchItems.length; i++) {
      if (batchAbortRef.current) break
      const item = batchItems[i]
      if (!item || item.status === 'done') continue

      setBatchItems((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, status: 'generating' } : b)),
      )

      try {
        const r = await fetch(`${API}/forge/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: item.prompt, style }),
        })
        const data = await r.json()
        if (r.ok) {
          const relUrl: string = data.url ?? data.imageUrl ?? ''
          const fullUrl = relUrl ? `${API}${relUrl}` : ''
          setBatchItems((prev) =>
            prev.map((b) => (b.id === item.id ? { ...b, status: 'done', resultUrl: fullUrl } : b)),
          )
        } else {
          setBatchItems((prev) =>
            prev.map((b) => (b.id === item.id ? { ...b, status: 'error' } : b)),
          )
        }
      } catch {
        setBatchItems((prev) => prev.map((b) => (b.id === item.id ? { ...b, status: 'error' } : b)))
      }

      // Reload asset library so newly generated images appear
      void loadAssets()

      // Polite 2s gap between requests
      if (i < batchItems.length - 1 && !batchAbortRef.current) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    setBatchRunning(false)
  }

  const statusDot: Record<BatchStatus, string> = {
    pending: 'bg-muted-foreground/40',
    generating: 'bg-primary animate-pulse',
    done: 'bg-emerald-500',
    error: 'bg-destructive',
  }

  return (
    <div className="p-4 space-y-4">
      {/* Generate single image */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Generate Image
        </div>
        <Textarea
          placeholder="Describe the image to generate…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="resize-none text-xs"
        />
        <div className="flex gap-2 items-center">
          {/* Style toggle */}
          <div className="flex rounded border border-border overflow-hidden text-[10px] flex-shrink-0">
            {(['LIGHT', 'INTENSE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={cn(
                  'px-2.5 py-1 transition-colors duration-100',
                  style === s
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => void handleGenerate()}
            disabled={generating || !prompt.trim()}
          >
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>

      {/* Result preview */}
      {result && (
        <div className="space-y-2">
          {result.error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
              {result.error}
            </p>
          )}
          {result.imageUrl && (
            <div className="space-y-1.5">
              <ImageThumbnail
                src={result.imageUrl}
                alt="Generated"
                className="w-full rounded border border-border aspect-video"
              />
              {result.provider && (
                <p className="text-[9px] text-muted-foreground/60 text-right">
                  via <span className="font-medium text-muted-foreground">{result.provider}</span>
                </p>
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => addToTimeline(result.imageUrl!, 'Generated Image')}
              >
                Add to Timeline
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Batch queue (FIX 6) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Batch Queue
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => void handleLoadFromEpisode()}
              disabled={batchRunning}
            >
              Load from Episode
            </Button>
            {batchItems.length > 0 && (
              <Button
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => void handleGenerateAll()}
                disabled={batchRunning}
              >
                {batchRunning ? 'Running…' : 'Generate All'}
              </Button>
            )}
          </div>
        </div>

        {batchItems.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1 mb-3">
            {batchItems.map((item, i) => (
              <div
                key={item.id}
                className="flex items-start gap-2 text-[10px] bg-secondary/20 rounded px-2 py-1.5 border border-border"
              >
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0 mt-0.5',
                    statusDot[item.status],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-muted-foreground mr-1 font-medium">#{i + 1}</span>
                  <span className="text-foreground/70 break-words">
                    {String(item.prompt).slice(0, 70)}
                  </span>
                </div>
                {item.resultUrl && (
                  <button
                    onClick={() => addToTimeline(item.resultUrl!, `Scene ${i + 1}`)}
                    className="text-primary hover:text-primary/80 flex-shrink-0 font-medium"
                    title="Add to timeline"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Asset library */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Asset Library
          {assets.length > 0 && (
            <span className="ml-1 normal-case text-muted-foreground/60">({assets.length})</span>
          )}
        </div>
        {assetsError && <p className="text-xs text-muted-foreground/60 mb-1">{assetsError}</p>}
        {assets.length === 0 && !assetsError && (
          <p className="text-xs text-muted-foreground">No assets yet</p>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {assets.map((asset, i) => {
            const fullUrl = `${API}${asset.url}`
            const name = asset.filename.replace(/\.[^.]+$/, '')
            return (
              <button
                key={i}
                onClick={() => addToTimeline(fullUrl, asset.filename)}
                className="group rounded overflow-hidden border border-border bg-secondary/30 hover:border-primary/50 transition-colors text-left"
                title={asset.filename}
              >
                <div className="relative aspect-video overflow-hidden">
                  <ImageThumbnail src={fullUrl} alt={asset.filename} className="w-full h-full" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Add
                    </span>
                  </div>
                </div>
                <div className="px-1 py-0.5 text-[9px] text-muted-foreground truncate leading-tight">
                  {name}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
