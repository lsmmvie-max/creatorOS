import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import {
  findCompatibleTrackForItemType,
  findNearestAvailableSpace,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'
import type { ImageItem } from '@/types/timeline'

const API = 'http://localhost:3737'

interface EditingBlock {
  timestamp?: number
  durationInFrames?: number
  description?: string
  imagePrompt?: string
}

interface Manifest {
  episodeTitle?: string
  concept?: string
  editingScript?: EditingBlock[]
  imagePrompts?: string[]
  readingScript?: string
}

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export function MorningBrief() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchBrief() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/brief/today`)
      if (!r.ok) {
        setManifest(null)
        setError('No episode prepared for today')
      } else {
        setManifest(await r.json())
      }
    } catch {
      setError('Server offline — start the automation server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchBrief()
  }, [])

  async function handleNewEpisode() {
    setRunning(true)
    setError(null)
    try {
      await fetch(`${API}/brief/today`, { method: 'DELETE' })
      const r = await fetch(`${API}/brief/run`, { method: 'POST' })
      if (!r.ok) throw new Error('Pipeline failed')
      setManifest(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRunning(false)
    }
  }

  function handleAutoPlace() {
    if (!manifest?.editingScript?.length) return
    setPlacing(true)
    try {
      const { tracks, items, fps, addItem } = useTimelineStore.getState()
      const currentFrame = usePlaybackStore.getState().currentFrame

      for (const block of manifest.editingScript) {
        const from = block.timestamp != null ? Math.round(block.timestamp * fps) : currentFrame
        const durationInFrames = block.durationInFrames ?? Math.round(5 * fps)

        const targetTrack = findCompatibleTrackForItemType({
          tracks,
          items,
          itemType: 'image',
          preferredTrackId: undefined,
        })
        if (!targetTrack) continue

        const finalPos =
          findNearestAvailableSpace(from, durationInFrames, targetTrack.id, items) ?? from

        const item: ImageItem = {
          id: newId(),
          type: 'image',
          trackId: targetTrack.id,
          from: finalPos,
          durationInFrames,
          label: block.description ?? block.imagePrompt ?? 'Asset',
          mediaId: undefined as unknown as string,
          src: '',
        }
        addItem(item)
      }
    } finally {
      setPlacing(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading brief…</div>
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void fetchBrief()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!manifest) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">No episode prepared.</p>
        <Button size="sm" onClick={() => void handleNewEpisode()} disabled={running}>
          {running ? 'Running…' : 'Generate New Episode'}
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Episode
        </div>
        <div className="text-sm font-semibold text-foreground">{manifest.episodeTitle}</div>
        {manifest.concept && (
          <div className="text-xs text-muted-foreground mt-1">{manifest.concept}</div>
        )}
      </div>

      {manifest.editingScript && manifest.editingScript.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Editing Blocks ({manifest.editingScript.length})
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {manifest.editingScript.map((block, i) => (
              <div
                key={i}
                className="text-[11px] text-foreground/80 bg-secondary/30 rounded px-2 py-1 border border-border"
              >
                {block.timestamp != null && (
                  <span className="text-muted-foreground mr-1.5">{block.timestamp}s</span>
                )}
                {block.description ?? block.imagePrompt ?? `Block ${i + 1}`}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleNewEpisode()}
          disabled={running}
        >
          {running ? 'Running…' : 'New Episode'}
        </Button>
        <Button size="sm" onClick={handleAutoPlace} disabled={placing}>
          {placing ? 'Placing…' : 'Auto-Place Assets'}
        </Button>
      </div>
    </div>
  )
}
