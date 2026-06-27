import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Play, ExternalLink, Check } from 'lucide-react'
import { cn } from '@/shared/ui/cn'

const API = 'http://localhost:3737'

interface Take {
  id: string
  filename: string
  size: number
  duration: number | null
  createdAt: string
}

interface TakesResponse {
  takes: Take[]
  selected: string | null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function VoiceBooth() {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recordStatus, setRecordStatus] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [takes, setTakes] = useState<Take[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadTakes = useCallback(async () => {
    try {
      const r = await fetch(`${API}/voice/takes`)
      if (!r.ok) return
      const data: TakesResponse = await r.json()
      setTakes(data.takes ?? [])
      setSelectedId(data.selected ?? null)
    } catch {
      // server offline — silent
    }
  }, [])

  useEffect(() => {
    void loadTakes()
  }, [loadTakes])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => void uploadRecording(stream)
      mediaRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordStatus(null)
    } catch {
      setRecordStatus('Microphone access denied')
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    setRecording(false)
  }

  async function uploadRecording(stream: MediaStream) {
    setUploading(true)
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const r = await fetch(`${API}/voice/upload`, { method: 'POST', body: form })
      if (r.ok) {
        setRecordStatus('Take saved')
        void loadTakes()
      } else {
        setRecordStatus('Upload failed')
      }
    } catch {
      setRecordStatus('Server offline')
    } finally {
      stream.getTracks().forEach((t) => t.stop())
      setUploading(false)
    }
  }

  function handlePlay(take: Take) {
    // Stop any existing playback
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (playingId === take.id) {
      setPlayingId(null)
      return
    }

    const audio = new Audio(`${API}/voice/audio/${take.filename}`)
    audio.onended = () => setPlayingId(null)
    audio.onerror = () => setPlayingId(null)
    audioRef.current = audio
    void audio.play()
    setPlayingId(take.id)
  }

  async function handleSelect(take: Take) {
    setSelectingId(take.id)
    try {
      const r = await fetch(`${API}/voice/takes/${take.id}/select`, { method: 'PUT' })
      if (r.ok) {
        setSelectedId(take.id)
      }
    } catch {
      // silent
    } finally {
      setSelectingId(null)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Record section */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Record Take
        </div>
        <div className="flex gap-2 items-center">
          {recording ? (
            <Button size="sm" variant="destructive" onClick={stopRecording}>
              <Mic className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void startRecording()}
              disabled={uploading}
            >
              <Mic className="w-3.5 h-3.5 mr-1.5" />
              {uploading ? 'Saving…' : 'Record'}
            </Button>
          )}
          {recording && (
            <span className="text-xs text-destructive font-medium animate-pulse">
              ● REC
            </span>
          )}
        </div>
        {recordStatus && (
          <p className="text-xs mt-1.5 text-muted-foreground">{recordStatus}</p>
        )}
      </div>

      {/* Takes list */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Today's Takes
            {takes.length > 0 && (
              <span className="ml-1 normal-case text-muted-foreground/60">({takes.length})</span>
            )}
          </div>
          <button
            onClick={() => void loadTakes()}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Refresh
          </button>
        </div>

        {takes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No takes recorded today</p>
        ) : (
          <div className="space-y-1">
            {takes.map((take) => {
              const isBest = take.id === selectedId
              const isPlaying = take.id === playingId

              return (
                <div
                  key={take.id}
                  className={cn(
                    'flex items-center gap-2 rounded px-2 py-1.5 border text-[11px] transition-colors',
                    isBest
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-secondary/20 hover:bg-secondary/40',
                  )}
                >
                  {/* BEST badge */}
                  <div className="w-8 flex-shrink-0">
                    {isBest && (
                      <span className="text-[9px] font-bold text-primary uppercase tracking-wide">
                        BEST
                      </span>
                    )}
                  </div>

                  {/* Take info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground/80 truncate">{formatTime(take.createdAt)}</div>
                    <div className="text-muted-foreground/60 text-[9px]">
                      {formatSize(take.size)}
                    </div>
                  </div>

                  {/* Play button */}
                  <button
                    onClick={() => handlePlay(take)}
                    className={cn(
                      'w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors',
                      isPlaying
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
                    )}
                    title={isPlaying ? 'Stop' : 'Play'}
                  >
                    <Play className="w-3 h-3" />
                  </button>

                  {/* Use This button */}
                  {!isBest && (
                    <button
                      onClick={() => void handleSelect(take)}
                      disabled={selectingId === take.id}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex-shrink-0 font-medium"
                      title="Set as best take"
                    >
                      {selectingId === take.id ? '…' : 'Use'}
                    </button>
                  )}
                  {isBest && (
                    <Check className="w-3 h-3 text-primary flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* External voice booth */}
      <div className="border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => window.open('http://localhost:3737', '_blank')}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Full Voice Booth
        </Button>
      </div>
    </div>
  )
}
