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
  narration?: string
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

function blockPreview(block: EditingBlock, index: number): string {
  const text = block.narration ?? block.description ?? block.imagePrompt ?? `Block ${index + 1}`
  return text.length > 60 ? text.slice(0, 57) + '…' : text
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

    console.log('[Lee] Auto-Place: starting, blocks =', manifest.editingScript.length)

    try {
      // Re-read fps once — it doesn't change during placement
      const fps = useTimelineStore.getState().fps

      for (const [i, block] of manifest.editingScript.entries()) {
        // Re-read tracks+items on every iteration so overlap detection sees previously added items
        const { tracks, items, addItem } = useTimelineStore.getState()

        const from = block.timestamp != null ? Math.round(block.timestamp * fps) : 0
        const durationInFrames = block.durationInFrames ?? Math.round(5 * fps)

        const targetTrack = findCompatibleTrackForItemType({
          tracks,
          items,
          itemType: 'image',
          preferredTrackId: undefined,
        })

        if (!targetTrack) {
          console.warn('[Lee] Auto-Place: no compatible track for block', i)
          continue
        }

        const finalPos =
          findNearestAvailableSpace(from, durationInFrames, targetTrack.id, items) ?? from

        const label = block.description ?? block.imagePrompt ?? `Block ${i + 1}`
        const item: ImageItem = {
          id: newId(),
          type: 'image',
          trackId: targetTrack.id,
          from: finalPos,
          durationInFrames,
          label,
          mediaId: undefined as unknown as string,
          src: '',
        }

        console.log('[Lee] Auto-Place: adding item', { label, from: finalPos, track: targetTrack.id })
        addItem(item)
      }

      console.log('[Lee] Auto-Place: done')
    } catch (e) {
      console.error('[Lee] Auto-Place error:', e)
    } finally {
      setPlacing(false)
    }
  }

  function handleBlockClick(block: EditingBlock) {
    if (block.timestamp == null) return
    const fps = useTimelineStore.getState().fps
    usePlaybackStore.getState().setCurrentFrame(Math.round(block.timestamp * fps))
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
      {/* Episode header */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Episode
        </div>
        <div className="text-sm font-semibold text-foreground leading-snug">
          {manifest.episodeTitle}
        </div>
        {manifest.concept && (
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{manifest.concept}</div>
        )}
      </div>

      {/* Editing blocks */}
      {manifest.editingScript && manifest.editingScript.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Editing Blocks ({manifest.editingScript.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {manifest.editingScript.map((block, i) => (
              <button
                key={i}
                onClick={() => handleBlockClick(block)}
                className="w-full text-left text-[11px] text-foreground/80 bg-secondary/30 hover:bg-secondary/60 rounded px-2 py-1.5 border border-border hover:border-primary/40 transition-colors"
              >
                {block.timestamp != null && (
                  <span className="text-primary font-medium mr-1.5 tabular-nums">
                    {block.timestamp}s
                  </span>
                )}
                <span className="text-foreground/70">{blockPreview(block, i)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
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
