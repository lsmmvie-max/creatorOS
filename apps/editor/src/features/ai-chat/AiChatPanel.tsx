import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  findCompatibleTrackForItemType,
  findNearestAvailableSpace,
  useTimelineStore,
} from './deps/timeline'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import type { ImageItem } from '@/types/timeline'

const API = 'http://localhost:3737'

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface TimelineCommand {
  command: 'add_clip' | 'remove_clip' | 'move_clip' | 'clear_timeline'
  clipId?: string
  src?: string
  label?: string
  from?: number
  durationInFrames?: number
  offsetFrames?: number
}

function coalesce(...vals: unknown[]): unknown {
  return vals.find((v) => v !== null && v !== undefined)
}

function normalizeCommand(raw: Record<string, unknown>): TimelineCommand {
  const p = (typeof raw.params === 'object' && raw.params !== null ? raw.params : {}) as Record<
    string,
    unknown
  >
  return {
    command: raw.command as TimelineCommand['command'],
    clipId: coalesce(raw.clipId, raw.id, p.id, p.clipId) as string | undefined,
    src: coalesce(raw.src, p.src) as string | undefined,
    label: coalesce(raw.label, raw.name, p.name, p.label) as string | undefined,
    from: coalesce(raw.from, raw.startTime, p.startTime, p.from) as number | undefined,
    durationInFrames: coalesce(
      raw.durationInFrames,
      raw.duration,
      p.duration,
      p.durationInFrames,
    ) as number | undefined,
    offsetFrames: coalesce(raw.offsetFrames, p.offsetFrames) as number | undefined,
  }
}

function applyTimelineCommand(cmd: TimelineCommand): string {
  const store = useTimelineStore.getState()

  if (cmd.command === 'add_clip') {
    const { tracks, items, fps, addItem } = store
    const currentFrame = usePlaybackStore.getState().currentFrame
    const from = cmd.from ?? currentFrame
    const durationInFrames = cmd.durationInFrames ?? Math.round(5 * fps)

    const targetTrack = findCompatibleTrackForItemType({
      tracks,
      items,
      itemType: 'image',
      preferredTrackId: undefined,
    })
    if (!targetTrack) return 'No compatible track available'

    const finalPos =
      findNearestAvailableSpace(from, durationInFrames, targetTrack.id, items) ?? from

    const item: ImageItem = {
      id: newId(),
      type: 'image',
      trackId: targetTrack.id,
      from: finalPos,
      durationInFrames,
      label: cmd.label ?? 'AI Clip',
      mediaId: undefined as unknown as string,
      src: cmd.src ?? '',
    }
    addItem(item)
    return `Added clip "${item.label}" at frame ${finalPos}`
  }

  if (cmd.command === 'remove_clip') {
    if (!cmd.clipId) return 'remove_clip requires clipId'
    store.removeItems([cmd.clipId])
    return `Removed clip ${cmd.clipId}`
  }

  if (cmd.command === 'move_clip') {
    if (!cmd.clipId || cmd.offsetFrames == null) return 'move_clip requires clipId and offsetFrames'
    const item = store.items.find((i) => i.id === cmd.clipId)
    if (!item) return `Clip ${cmd.clipId} not found`
    store.moveItem(cmd.clipId, item.from + cmd.offsetFrames)
    return `Moved clip ${cmd.clipId} by ${cmd.offsetFrames} frames`
  }

  if (cmd.command === 'clear_timeline') {
    store.clearTimeline()
    useSelectionStore.getState().clearSelection()
    return 'Cleared timeline'
  }

  return `Unknown command: ${cmd.command}`
}

export function AiChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    const history = [...messages, userMsg]

    try {
      const [chatRes, cmdRes] = await Promise.allSettled([
        fetch(`${API}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
        }),
        fetch(`${API}/ai/timeline-command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        }),
      ])

      const systemMessages: Message[] = []

      // Handle timeline command
      if (cmdRes.status === 'fulfilled' && cmdRes.value.ok) {
        try {
          const cmdData = (await cmdRes.value.json()) as Record<string, unknown>
          if (cmdData?.command && cmdData.command !== 'none') {
            const result = applyTimelineCommand(normalizeCommand(cmdData))
            systemMessages.push({ role: 'system', content: `Timeline: ${result}` })
          }
        } catch {
          // non-command response is fine
        }
      }

      // Handle chat response
      let assistantContent = ''
      if (chatRes.status === 'fulfilled' && chatRes.value.ok) {
        const chatData = await chatRes.value.json()
        assistantContent =
          chatData.choices?.[0]?.message?.content ?? chatData.content ?? chatData.text ?? ''
      } else {
        assistantContent = 'Server offline — start the automation server on port 3737'
      }

      setMessages((prev) => [
        ...prev,
        ...systemMessages,
        { role: 'assistant', content: assistantContent },
      ])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error connecting to server' }])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [input, messages, sending])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message history */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            Ask me anything or give a timeline command
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground ml-6'
                : msg.role === 'system'
                  ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-mono'
                  : 'bg-secondary/40 text-foreground mr-6'
            }`}
          >
            {msg.content}
          </div>
        ))}
        {sending && (
          <div className="bg-secondary/40 text-muted-foreground text-xs rounded-lg px-3 py-2 mr-6 animate-pulse">
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 flex gap-2 items-end flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message or timeline command…"
          rows={2}
          className="flex-1 resize-none text-xs bg-secondary/30 border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={sending}
        />
        <Button
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
