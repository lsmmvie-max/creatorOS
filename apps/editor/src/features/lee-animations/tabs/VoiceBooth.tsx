import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, ChevronLeft, ChevronRight, Check, Play, Pause } from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import WaveSurfer from 'wavesurfer.js'

const API = 'http://localhost:3737'

interface EditingBlock {
  timestamp: string
  narration: string
  style: 'LIGHT' | 'INTENSE'
  characterVariant: string
  background: string
}

interface ScriptData {
  readingScript: string
  editingScript: EditingBlock[]
  wordCount: number
}

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

interface BlockStatus {
  blockIndex: number
  hasSelectedTake: boolean
  takeCount: number
}

interface EpisodeBoundary {
  blockIndex: number
  start: number
  end: number
}

interface EpisodeAudioResult {
  path: string
  totalDuration: number
  boundaries: EpisodeBoundary[]
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

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function useEpisodeScript() {
  const [scriptLoading, setScriptLoading] = useState(true)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [editingScript, setEditingScript] = useState<EditingBlock[]>([])

  useEffect(() => {
    setScriptLoading(true)
    fetch(`${API}/brief/script`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status:${r.status}`))))
      .then((data: ScriptData) => {
        setEditingScript(data.editingScript ?? [])
        setScriptError(null)
      })
      .catch((e: Error) => {
        setScriptError(
          e.message.includes('Failed to fetch') || e.message.includes('ECONNREFUSED')
            ? 'Server offline — start the automation server'
            : 'No script available for today',
        )
      })
      .finally(() => setScriptLoading(false))
  }, [])

  return { scriptLoading, scriptError, editingScript }
}

function useBlocksStatus() {
  const [blocksStatus, setBlocksStatus] = useState<BlockStatus[]>([])

  const loadBlocksStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/voice/blocks/status`)
      if (!r.ok) return
      setBlocksStatus(await r.json())
    } catch {
      // silently ignore — the per-block takes error already surfaces server-offline state
    }
  }, [])

  return { blocksStatus, loadBlocksStatus }
}

function useBlockTakes(blockIndex: number) {
  const [takes, setTakes] = useState<Take[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [takesError, setTakesError] = useState<string | null>(null)
  const [selectError, setSelectError] = useState<string | null>(null)

  const loadTakes = useCallback(async () => {
    try {
      const r = await fetch(`${API}/voice/takes?blockIndex=${blockIndex}`)
      if (!r.ok) {
        setTakesError('Could not load takes from server')
        return
      }
      const data: TakesResponse = await r.json()
      setTakes(data.takes ?? [])
      setSelectedId(data.selected ?? null)
      setTakesError(null)
    } catch {
      setTakesError('Server offline — start the automation server')
    }
  }, [blockIndex])

  useEffect(() => {
    void loadTakes()
  }, [loadTakes])

  const selectTake = useCallback(
    async (take: Take) => {
      setSelectingId(take.id)
      setSelectError(null)
      try {
        const r = await fetch(`${API}/voice/takes/${take.id}/select?blockIndex=${blockIndex}`, {
          method: 'PUT',
        })
        if (!r.ok) {
          setSelectError('Could not mark take as best')
          return
        }
        setSelectedId(take.id)
      } catch {
        setSelectError('Server offline')
      } finally {
        setSelectingId(null)
      }
    },
    [blockIndex],
  )

  return { takes, selectedId, selectingId, takesError, selectError, loadTakes, selectTake }
}

function useRecorder(blockIndex: number, onSaved: () => void) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recordStatus, setRecordStatus] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const uploadRecording = useCallback(
    async (stream: MediaStream) => {
      setUploading(true)
      try {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const form = new FormData()
        // blockIndex must be appended before the audio file — multer only sees
        // fields that arrive earlier in the multipart stream than the file part.
        form.append('blockIndex', String(blockIndex))
        form.append('audio', blob, 'recording.webm')
        const r = await fetch(`${API}/voice/upload`, { method: 'POST', body: form })
        setRecordStatus(r.ok ? 'Take saved' : 'Upload failed')
        if (r.ok) onSaved()
      } catch {
        setRecordStatus('Server offline')
      } finally {
        stream.getTracks().forEach((t) => t.stop())
        setUploading(false)
      }
    },
    [blockIndex, onSaved],
  )

  const startRecording = useCallback(async () => {
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
  }, [uploadRecording])

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop()
    setRecording(false)
  }, [])

  const resetStatus = useCallback(() => setRecordStatus(null), [])

  return { recording, uploading, recordStatus, startRecording, stopRecording, resetStatus }
}

function useEpisodeBuilder() {
  const [buildingEpisode, setBuildingEpisode] = useState(false)
  const [episodeError, setEpisodeError] = useState<string | null>(null)
  const [episodeResult, setEpisodeResult] = useState<EpisodeAudioResult | null>(null)

  const buildEpisode = useCallback(async () => {
    setBuildingEpisode(true)
    setEpisodeError(null)
    setEpisodeResult(null)
    try {
      const r = await fetch(`${API}/voice/episode-audio`)
      const data = await r.json()
      if (!r.ok) {
        setEpisodeError(data.detail ?? data.error ?? 'Failed to build episode audio')
        return
      }
      setEpisodeResult({
        path: data.path,
        totalDuration: data.totalDuration,
        boundaries: data.boundaries ?? [],
      })
    } catch {
      setEpisodeError('Server offline')
    } finally {
      setBuildingEpisode(false)
    }
  }, [])

  return { buildingEpisode, episodeError, episodeResult, buildEpisode }
}

function TakeRow({
  take,
  isBest,
  blockIndex,
  isActive,
  onPlay,
  onStop,
  onSelect,
  selecting,
}: {
  take: Take
  isBest: boolean
  blockIndex: number
  isActive: boolean
  onPlay: () => void
  onStop: () => void
  onSelect: () => void
  selecting: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const isActiveRef = useRef(isActive)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      wsRef.current?.pause()
    }
  }, [isActive])

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 28,
      waveColor: '#94a3b8',
      progressColor: '#6366f1',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      url: `${API}/voice/audio/${take.filename}?blockIndex=${blockIndex}`,
    })
    wsRef.current = ws
    ws.on('play', () => {
      setIsPlaying(true)
      onPlay()
    })
    ws.on('pause', () => {
      setIsPlaying(false)
      if (isActiveRef.current) onStop()
    })
    ws.on('finish', () => {
      setIsPlaying(false)
      onStop()
    })
    return () => {
      ws.destroy()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take.filename, blockIndex])

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 border text-[11px] transition-colors',
        isBest
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-secondary/20 hover:bg-secondary/40',
      )}
    >
      <div className="w-8 flex-shrink-0">
        {isBest && (
          <span className="text-[9px] font-bold text-primary uppercase tracking-wide">BEST</span>
        )}
      </div>

      <button
        onClick={() => wsRef.current?.playPause()}
        className={cn(
          'w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors',
          isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
        )}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>

      <div className="flex-1 min-w-0">
        <div ref={containerRef} className="w-full" />
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-muted-foreground/60 text-[9px]">{formatTime(take.createdAt)}</span>
          <span className="text-muted-foreground/60 text-[9px]">{formatSize(take.size)}</span>
        </div>
      </div>

      {!isBest && (
        <button
          onClick={onSelect}
          disabled={selecting}
          className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex-shrink-0 font-medium"
          title="Set as best take"
        >
          {selecting ? '…' : 'Use This'}
        </button>
      )}
      {isBest && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
    </div>
  )
}

function BlockProgress({
  currentBlockIndex,
  totalBlocks,
  completedBlocks,
}: {
  currentBlockIndex: number
  totalBlocks: number
  completedBlocks: number
}) {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
      <span>
        Block {currentBlockIndex + 1} of {totalBlocks}
      </span>
      <span>
        {completedBlocks}/{totalBlocks} blocks recorded
      </span>
    </div>
  )
}

function BlockNavigation({
  currentBlockIndex,
  totalBlocks,
  canGoNext,
  disabled,
  onPrevious,
  onNext,
}: {
  currentBlockIndex: number
  totalBlocks: number
  canGoNext: boolean
  disabled: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onPrevious}
        disabled={currentBlockIndex === 0 || disabled}
      >
        <ChevronLeft className="w-3.5 h-3.5 mr-1" />
        Previous Block
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onNext}
        disabled={currentBlockIndex >= totalBlocks - 1 || !canGoNext || disabled}
      >
        Next Block
        <ChevronRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </div>
  )
}

function RecordSection({
  recording,
  uploading,
  recordStatus,
  onStart,
  onStop,
}: {
  recording: boolean
  uploading: boolean
  recordStatus: string | null
  onStart: () => void
  onStop: () => void
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Record Take
      </div>
      <div className="flex gap-2 items-center">
        {recording ? (
          <Button size="sm" variant="destructive" onClick={onStop}>
            <Mic className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={onStart} disabled={uploading}>
            <Mic className="w-3.5 h-3.5 mr-1.5" />
            {uploading ? 'Saving…' : 'Record'}
          </Button>
        )}
        {recording && (
          <span className="text-xs text-destructive font-medium animate-pulse">● REC</span>
        )}
      </div>
      {recordStatus && <p className="text-xs mt-1.5 text-muted-foreground">{recordStatus}</p>}
    </div>
  )
}

function TakesList({
  takes,
  takesError,
  selectError,
  selectedId,
  selectingId,
  playingId,
  currentBlockIndex,
  onRefresh,
  onSelect,
  onPlay,
  onStop,
}: {
  takes: Take[]
  takesError: string | null
  selectError: string | null
  selectedId: string | null
  selectingId: string | null
  playingId: string | null
  currentBlockIndex: number
  onRefresh: () => void
  onSelect: (take: Take) => void
  onPlay: (id: string) => void
  onStop: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          This Block's Takes
          {takes.length > 0 && (
            <span className="ml-1 normal-case text-muted-foreground/60">({takes.length})</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {takesError && <p className="text-xs text-destructive/80 mb-1">{takesError}</p>}
      {selectError && <p className="text-xs text-destructive/80 mb-1">{selectError}</p>}
      {takes.length === 0 && !takesError ? (
        <p className="text-xs text-muted-foreground">No takes recorded for this block yet</p>
      ) : (
        <div className="space-y-1">
          {takes.map((take) => (
            <TakeRow
              key={take.id}
              take={take}
              isBest={take.id === selectedId}
              blockIndex={currentBlockIndex}
              isActive={playingId === take.id}
              onPlay={() => onPlay(take.id)}
              onStop={onStop}
              onSelect={() => onSelect(take)}
              selecting={selectingId === take.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EpisodeBuildSection({
  totalBlocks,
  allBlocksComplete,
  buildingEpisode,
  episodeError,
  episodeResult,
  onBuild,
}: {
  totalBlocks: number
  allBlocksComplete: boolean
  buildingEpisode: boolean
  episodeError: string | null
  episodeResult: EpisodeAudioResult | null
  onBuild: () => void
}) {
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <Button
        size="sm"
        className="w-full"
        onClick={onBuild}
        disabled={!allBlocksComplete || buildingEpisode}
      >
        {buildingEpisode ? 'Building…' : 'Build Episode Audio'}
      </Button>
      {!allBlocksComplete && (
        <p className="text-[10px] text-muted-foreground text-center">
          Finish recording all {totalBlocks} blocks to build the episode audio
        </p>
      )}
      {episodeError && <p className="text-xs text-destructive/80">{episodeError}</p>}
      {episodeResult && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="text-foreground/80">
            Episode audio built — {formatSeconds(episodeResult.totalDuration)} total
          </p>
          <p className="truncate">{episodeResult.path}</p>
          <div className="space-y-0.5">
            {episodeResult.boundaries.map((b) => (
              <div key={b.blockIndex} className="flex justify-between">
                <span>Block {b.blockIndex + 1}</span>
                <span>
                  {formatSeconds(b.start)} – {formatSeconds(b.end)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function VoiceBooth() {
  const { scriptLoading, scriptError, editingScript } = useEpisodeScript()
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const { takes, selectedId, selectingId, takesError, selectError, loadTakes, selectTake } =
    useBlockTakes(currentBlockIndex)
  const { blocksStatus, loadBlocksStatus } = useBlocksStatus()
  const { recording, uploading, recordStatus, startRecording, stopRecording, resetStatus } =
    useRecorder(currentBlockIndex, () => {
      void loadTakes()
      void loadBlocksStatus()
    })
  const { buildingEpisode, episodeError, episodeResult, buildEpisode } = useEpisodeBuilder()

  useEffect(() => {
    setPlayingId(null)
    resetStatus()
    void loadBlocksStatus()
  }, [currentBlockIndex, resetStatus, loadBlocksStatus])

  async function handleSelect(take: Take) {
    await selectTake(take)
    void loadBlocksStatus()
  }

  if (scriptLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading script…</div>
  }

  if (scriptError || editingScript.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {scriptError ?? 'No editing script available'}
      </div>
    )
  }

  const totalBlocks = editingScript.length
  const currentBlock = editingScript[currentBlockIndex]
  const completedBlocks = blocksStatus.filter((b) => b.hasSelectedTake).length
  const allBlocksComplete =
    totalBlocks > 0 &&
    blocksStatus.length >= totalBlocks &&
    blocksStatus.slice(0, totalBlocks).every((b) => b.hasSelectedTake)

  if (!currentBlock) {
    return <div className="p-4 text-sm text-muted-foreground">Invalid block index</div>
  }

  return (
    <div className="p-4 space-y-4">
      <BlockProgress
        currentBlockIndex={currentBlockIndex}
        totalBlocks={totalBlocks}
        completedBlocks={completedBlocks}
      />

      <div className="rounded border border-border bg-secondary/20 p-4 min-h-[120px] flex items-center justify-center text-center">
        <p className="text-base leading-relaxed text-foreground/90">{currentBlock.narration}</p>
      </div>

      <BlockNavigation
        currentBlockIndex={currentBlockIndex}
        totalBlocks={totalBlocks}
        canGoNext={Boolean(selectedId)}
        disabled={recording || uploading}
        onPrevious={() => setCurrentBlockIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentBlockIndex((i) => Math.min(totalBlocks - 1, i + 1))}
      />

      <RecordSection
        recording={recording}
        uploading={uploading}
        recordStatus={recordStatus}
        onStart={() => void startRecording()}
        onStop={stopRecording}
      />

      <TakesList
        takes={takes}
        takesError={takesError}
        selectError={selectError}
        selectedId={selectedId}
        selectingId={selectingId}
        playingId={playingId}
        currentBlockIndex={currentBlockIndex}
        onRefresh={() => void loadTakes()}
        onSelect={(take) => void handleSelect(take)}
        onPlay={setPlayingId}
        onStop={() => setPlayingId(null)}
      />

      <EpisodeBuildSection
        totalBlocks={totalBlocks}
        allBlocksComplete={allBlocksComplete}
        buildingEpisode={buildingEpisode}
        episodeError={episodeError}
        episodeResult={episodeResult}
        onBuild={() => void buildEpisode()}
      />
    </div>
  )
}
