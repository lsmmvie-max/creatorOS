import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, ArrowDown, X } from 'lucide-react'

const API = 'http://localhost:3737'

function offlineMessage(e: Error): string {
  return e.message.includes('Failed to fetch') || e.message.includes('ECONNREFUSED')
    ? 'Server offline — start the automation server'
    : 'Failed to load story queue'
}

export function StoryQueue() {
  const [queue, setQueue] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newIdeas, setNewIdeas] = useState('')
  const [saving, setSaving] = useState(false)

  const loadQueue = useCallback(async () => {
    try {
      const r = await fetch(`${API}/brief/story-queue`)
      if (!r.ok) {
        setError('Could not load story queue')
        return
      }
      const data = await r.json()
      setQueue(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(offlineMessage(e as Error))
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void loadQueue().finally(() => setLoading(false))
  }, [loadQueue])

  async function saveQueue(next: string[]) {
    setSaving(true)
    try {
      const r = await fetch(`${API}/brief/story-queue`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!r.ok) {
        setError('Could not save story queue')
        return
      }
      setQueue(next)
      setError(null)
    } catch (e) {
      setError(offlineMessage(e as Error))
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const lines = newIdeas
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    await saveQueue([...queue, ...lines])
    setNewIdeas('')
  }

  async function handleDelete(index: number) {
    await saveQueue(queue.filter((_, i) => i !== index))
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= queue.length) return
    const next = [...queue]
    const tmp = next[index]!
    next[index] = next[target]!
    next[target] = tmp
    await saveQueue(next)
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading story queue…</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Queue
          </div>
          <span className="text-[10px] text-muted-foreground/60">{queue.length} ideas queued</span>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 mb-2">
            {error}
          </p>
        )}

        {queue.length === 0 && !error ? (
          <p className="text-xs text-muted-foreground">No story ideas queued yet</p>
        ) : (
          <div className="space-y-1">
            {queue.map((idea, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded px-2 py-1.5 border border-border bg-secondary/20 text-[11px]"
              >
                <span className="text-muted-foreground/60 font-medium flex-shrink-0 w-5">
                  {i + 1}.
                </span>
                <span className="flex-1 min-w-0 text-foreground/80 break-words">{idea}</span>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => void handleMove(i, -1)}
                    disabled={i === 0 || saving}
                    className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => void handleMove(i, 1)}
                    disabled={i === queue.length - 1 || saving}
                    className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => void handleDelete(i)}
                    disabled={saving}
                    className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Add Story Ideas
        </div>
        <Textarea
          placeholder={'One story idea per line…'}
          value={newIdeas}
          onChange={(e) => setNewIdeas(e.target.value)}
          rows={4}
          className="resize-none text-xs"
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => void handleAdd()}
          disabled={saving || !newIdeas.trim()}
        >
          {saving ? 'Saving…' : 'Add to Queue'}
        </Button>
      </div>
    </div>
  )
}
