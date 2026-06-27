import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import {
  findCompatibleTrackForItemType,
  findNearestAvailableSpace,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'
import type { ImageItem } from '@/types/timeline'

const API = 'http://localhost:3737'

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

interface AssetFile {
  name: string
  url: string
}

export function AssetForge() {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<'LIGHT' | 'INTENSE'>('LIGHT')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ imageUrl?: string; error?: string } | null>(null)
  const [assets, setAssets] = useState<AssetFile[]>([])
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  async function loadAssets() {
    try {
      const r = await fetch(`${API}/forge/assets`)
      if (r.ok) {
        const data = await r.json()
        setAssets(Array.isArray(data) ? data : (data.assets ?? []))
      }
    } catch {
      setAssetsError('Could not load assets')
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
        setResult({ imageUrl: data.imageUrl ?? data.url })
        void loadAssets()
      }
    } catch {
      setResult({ error: 'Server offline' })
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

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <Textarea
          ref={promptRef}
          placeholder="Describe the image to generate…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="resize-none text-sm"
        />
        <div className="flex gap-2 items-center">
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            {(['LIGHT', 'INTENSE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`px-3 py-1 transition-colors ${
                  style === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => void handleGenerate()} disabled={generating || !prompt.trim()}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          {result.error && <p className="text-xs text-destructive">{result.error}</p>}
          {result.imageUrl && (
            <div className="space-y-2">
              <img
                src={result.imageUrl}
                alt="Generated"
                className="w-full rounded-md border border-border object-cover aspect-video"
              />
              <Button size="sm" className="w-full" onClick={() => addToTimeline(result.imageUrl!, 'Generated Image')}>
                Add to Timeline
              </Button>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Asset Library
        </div>
        {assetsError && <p className="text-xs text-muted-foreground">{assetsError}</p>}
        {assets.length === 0 && !assetsError && (
          <p className="text-xs text-muted-foreground">No assets yet</p>
        )}
        <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
          {assets.map((asset, i) => (
            <button
              key={i}
              onClick={() => addToTimeline(asset.url, asset.name)}
              className="relative group rounded overflow-hidden border border-border aspect-square bg-secondary/30 hover:border-primary/50 transition-colors"
              title={asset.name}
            >
              <img
                src={asset.url}
                alt={asset.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Add
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
