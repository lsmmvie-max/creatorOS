import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/shared/ui/cn'

const API = 'http://localhost:3737'

interface KeySummary {
  configured: boolean
  count: number
}

interface ChannelProfile {
  channelName?: string
  mainCharacterName?: string
  contentStyle?: string
  targetAudienceAge?: string
  language?: string
  storyStylePrompt?: string
  [key: string]: unknown
}

interface ImageProviderStatus {
  pollinations?: { configured: boolean }
  huggingface?: { configured: boolean }
  cloudflare?: { configured: boolean }
}

interface SettingsAll {
  keys: Record<string, KeySummary>
  channelProfile: ChannelProfile
  imageProvider: ImageProviderStatus
  systemPrompt: string
}

interface MaskedKeys {
  openrouter?: string[]
  groq?: string[]
  fal?: string[]
  stability?: string[]
  cloudflare?: { accountId: string; tokens: string[] }
  youtube?: string
}

const KEY_PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'groq', label: 'Groq' },
  { id: 'fal', label: 'FAL' },
  { id: 'stability', label: 'Stability AI' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'youtube', label: 'YouTube' },
] as const

type ProviderId = (typeof KEY_PROVIDERS)[number]['id']

const PROFILE_FIELDS: { id: keyof ChannelProfile; label: string }[] = [
  { id: 'channelName', label: 'Channel Name' },
  { id: 'mainCharacterName', label: 'Main Character Name' },
  { id: 'contentStyle', label: 'Content Style' },
  { id: 'targetAudienceAge', label: 'Target Audience Age' },
  { id: 'language', label: 'Language' },
]

function offlineMessage(e: Error): string {
  return e.message.includes('Failed to fetch') || e.message.includes('ECONNREFUSED')
    ? 'Server offline — start the automation server'
    : 'Failed to load settings'
}

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full',
        configured ? 'bg-emerald-500' : 'bg-muted-foreground/40',
      )}
    />
  )
}

function KeyRow({
  provider,
  summary,
  onAdd,
}: {
  provider: (typeof KEY_PROVIDERS)[number]
  summary: KeySummary | undefined
  onAdd: (providerId: ProviderId, value: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!value.trim()) return
    setAdding(true)
    try {
      await onAdd(provider.id, value.trim())
      setValue('')
    } finally {
      setAdding(false)
    }
  }

  const count = summary?.count ?? 0

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 border border-border bg-secondary/20 text-[11px]">
      <StatusDot configured={summary?.configured ?? false} />
      <span className="w-24 flex-shrink-0 font-medium text-foreground/80">{provider.label}</span>
      <span className="text-muted-foreground/60 w-28 flex-shrink-0">
        {count} {count === 1 ? 'key' : 'keys'} configured
      </span>
      <Input
        type="password"
        placeholder="New key…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-6 text-[11px] flex-1"
      />
      <Button
        size="sm"
        className="h-6 px-2 text-[10px] flex-shrink-0"
        onClick={() => void handleAdd()}
        disabled={adding || !value.trim()}
      >
        {adding ? '…' : 'Add key'}
      </Button>
    </div>
  )
}

export function Settings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState<SettingsAll | null>(null)
  const [maskedKeys, setMaskedKeys] = useState<MaskedKeys | null>(null)

  const [profile, setProfile] = useState<ChannelProfile>({})
  const [savingProfile, setSavingProfile] = useState(false)

  const [systemPrompt, setSystemPrompt] = useState('')
  const [defaultPrompt, setDefaultPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  async function loadAll() {
    try {
      const [allRes, keysRes, promptRes] = await Promise.all([
        fetch(`${API}/settings/all`),
        fetch(`${API}/settings/keys`),
        fetch(`${API}/settings/system-prompt`),
      ])
      if (!allRes.ok || !keysRes.ok || !promptRes.ok) {
        setError('Could not load settings')
        return
      }
      const allData: SettingsAll = await allRes.json()
      const keysData: MaskedKeys = await keysRes.json()
      const promptData: { value: string; default: string } = await promptRes.json()

      setAll(allData)
      setMaskedKeys(keysData)
      setProfile(allData.channelProfile ?? {})
      setSystemPrompt(promptData.value)
      setDefaultPrompt(promptData.default)
      setError(null)
    } catch (e) {
      setError(offlineMessage(e as Error))
    }
  }

  useEffect(() => {
    setLoading(true)
    void loadAll().finally(() => setLoading(false))
  }, [])

  async function handleAddKey(providerId: ProviderId, value: string) {
    const body: Record<string, unknown> = {}
    if (providerId === 'youtube') {
      body.youtube = value
    } else if (providerId === 'cloudflare') {
      body.cloudflare = { tokens: [...(maskedKeys?.cloudflare?.tokens ?? []), value] }
    } else {
      body[providerId] = [...((maskedKeys?.[providerId] as string[] | undefined) ?? []), value]
    }

    try {
      const r = await fetch(`${API}/settings/keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        toast.error('Could not save key')
        return
      }
      toast.success('Key added')
      await loadAll()
    } catch {
      toast.error('Server offline — start the automation server')
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    try {
      const r = await fetch(`${API}/settings/channel-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!r.ok) {
        toast.error('Could not save channel profile')
        return
      }
      toast.success('Channel profile saved')
    } catch {
      toast.error('Server offline — start the automation server')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSavePrompt() {
    setSavingPrompt(true)
    try {
      const r = await fetch(`${API}/settings/system-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: systemPrompt }),
      })
      if (!r.ok) {
        toast.error('Could not save content style')
        return
      }
      toast.success('Content style saved')
    } catch {
      toast.error('Server offline — start the automation server')
    } finally {
      setSavingPrompt(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading settings…</div>
  }

  if (error || !all) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{error ?? 'No settings available'}</div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* API Keys */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          API Keys
        </div>
        <div className="space-y-1">
          {KEY_PROVIDERS.map((provider) => (
            <KeyRow
              key={provider.id}
              provider={provider}
              summary={all.keys[provider.id]}
              onAdd={handleAddKey}
            />
          ))}
        </div>
      </div>

      {/* Channel Profile */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Channel Profile
        </div>
        <div className="space-y-1.5">
          {PROFILE_FIELDS.map((field) => (
            <div key={field.id} className="flex items-center gap-2">
              <span className="w-32 flex-shrink-0 text-[11px] text-muted-foreground">
                {field.label}
              </span>
              <Input
                value={(profile[field.id] as string) ?? ''}
                onChange={(e) => setProfile((p) => ({ ...p, [field.id]: e.target.value }))}
                className="h-7 text-xs flex-1"
              />
            </div>
          ))}
          <div>
            <span className="text-[11px] text-muted-foreground">Story Style Prompt</span>
            <Textarea
              value={profile.storyStylePrompt ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, storyStylePrompt: e.target.value }))}
              rows={3}
              className="resize-none text-xs mt-1"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => void handleSaveProfile()}
          disabled={savingProfile}
        >
          {savingProfile ? 'Saving…' : 'Save Channel Profile'}
        </Button>
      </div>

      {/* Content Style */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Content Style
        </div>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={10}
          className="resize-none text-xs font-mono"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setSystemPrompt(defaultPrompt)}
          >
            Reset to Default
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => void handleSavePrompt()}
            disabled={savingPrompt}
          >
            {savingPrompt ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Image Provider Status */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Image Provider Status
        </div>
        <div className="space-y-1">
          {(
            [
              ['pollinations', 'Pollinations'],
              ['huggingface', 'HuggingFace'],
              ['cloudflare', 'Cloudflare'],
            ] as const
          ).map(([id, label]) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded px-2 py-1.5 border border-border bg-secondary/20 text-[11px]"
            >
              <StatusDot configured={all.imageProvider[id]?.configured ?? false} />
              <span className="font-medium text-foreground/80">{label}</span>
              <span className="text-muted-foreground/60 ml-auto">
                {all.imageProvider[id]?.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
