import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const API = 'http://localhost:3737'

interface ScriptData {
  readingScript: string
  editingScript: unknown[]
  wordCount: number
}

export function ScriptStudio() {
  const [data, setData] = useState<ScriptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/brief/script`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError('No script available'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCopy() {
    if (!data?.readingScript) return
    await navigator.clipboard.writeText(data.readingScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading script…</div>
  }

  if (error || !data) {
    return <div className="p-4 text-sm text-muted-foreground">{error ?? 'No script'}</div>
  }

  return (
    <div className="p-4 flex flex-col h-full gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Reading Script · {data.wordCount} words
        </div>
        <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
          {copied ? 'Copied!' : 'Copy Script'}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-secondary/20 rounded border border-border p-3 min-h-0">
        {data.readingScript || 'No reading script in this episode.'}
      </div>
    </div>
  )
}
