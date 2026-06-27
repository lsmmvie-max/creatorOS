import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const API = 'http://localhost:3737'

interface YouTubePackage {
  title?: string
  description?: string
  tags?: string
}

export function Packaging() {
  const [concept, setConcept] = useState('')
  const [generating, setGenerating] = useState(false)
  const [pkg, setPkg] = useState<YouTubePackage | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/brief/today`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.episodeTitle) setConcept(data.episodeTitle)
      })
      .catch(() => {})
  }, [])

  async function handleGenerate() {
    if (!concept.trim()) return
    setGenerating(true)
    setError(null)
    setPkg(null)
    try {
      const r = await fetch(`${API}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Generate a YouTube package for this video concept: "${concept.trim()}".
Return JSON with these fields:
- title: catchy YouTube title (max 70 chars)
- description: 3-paragraph description with hooks and SEO keywords
- tags: comma-separated tags (15-20 tags)

Respond ONLY with valid JSON.`,
            },
          ],
        }),
      })
      const data = await r.json()
      const text =
        data.choices?.[0]?.message?.content ??
        data.content ??
        data.text ??
        ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          setPkg(JSON.parse(jsonMatch[0]) as YouTubePackage)
        } catch {
          setError('Could not parse AI response')
        }
      } else {
        setError('Unexpected response format')
      }
    } catch {
      setError('Server offline')
    } finally {
      setGenerating(false)
    }
  }

  async function handleExport() {
    if (!pkg) return
    setExporting(true)
    setExportStatus(null)
    try {
      const r = await fetch(`${API}/packaging/export-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg),
      })
      const data = await r.json()
      setExportStatus(r.ok ? `Exported to ${data.path}` : 'Export failed')
    } catch {
      setExportStatus('Server offline')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Video Concept
        </div>
        <Textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Episode title or concept…"
          rows={2}
          className="resize-none text-sm"
        />
        <Button
          size="sm"
          onClick={() => void handleGenerate()}
          disabled={generating || !concept.trim()}
        >
          {generating ? 'Generating…' : 'Generate YouTube Package'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {pkg && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Title
            </div>
            <div className="text-sm font-semibold text-foreground bg-secondary/30 rounded border border-border p-2">
              {pkg.title}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Description
            </div>
            <div className="text-xs text-foreground/80 bg-secondary/30 rounded border border-border p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {pkg.description}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Tags
            </div>
            <div className="text-xs text-foreground/80 bg-secondary/30 rounded border border-border p-2">
              {pkg.tags}
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export Files'}
          </Button>
          {exportStatus && (
            <p className="text-xs text-muted-foreground">{exportStatus}</p>
          )}
        </div>
      )}
    </div>
  )
}
