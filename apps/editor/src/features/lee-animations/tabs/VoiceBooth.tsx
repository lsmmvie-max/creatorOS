import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, ExternalLink } from 'lucide-react'

const API = 'http://localhost:3737'

export function VoiceBooth() {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

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
      setStatus(null)
    } catch {
      setStatus('Microphone access denied')
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
        setStatus('Recording uploaded successfully')
      } else {
        setStatus('Upload failed')
      }
    } catch {
      setStatus('Server offline')
    } finally {
      stream.getTracks().forEach((t) => t.stop())
      setUploading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Record Voice
        </div>
        <div className="flex gap-2">
          {recording ? (
            <Button size="sm" variant="destructive" onClick={stopRecording}>
              <Mic className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
              Stop Recording
            </Button>
          ) : (
            <Button size="sm" onClick={() => void startRecording()} disabled={uploading}>
              <Mic className="w-3.5 h-3.5 mr-1.5" />
              {uploading ? 'Uploading…' : 'Start Recording'}
            </Button>
          )}
        </div>
        {status && (
          <p className="text-xs mt-2 text-muted-foreground">{status}</p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Full Voice Booth
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open('http://localhost:3737', '_blank')}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Open Voice Booth
        </Button>
      </div>
    </div>
  )
}
