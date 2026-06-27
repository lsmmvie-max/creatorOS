import { useState } from 'react'
import { cn } from '@/shared/ui/cn'
import { MorningBrief } from './tabs/MorningBrief'
import { AssetForge } from './tabs/AssetForge'
import { ScriptStudio } from './tabs/ScriptStudio'
import { VoiceBooth } from './tabs/VoiceBooth'
import { Packaging } from './tabs/Packaging'

type Tab = 'brief' | 'script' | 'voice' | 'forge' | 'package'

const TABS: { id: Tab; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'script', label: 'Script' },
  { id: 'voice', label: 'Voice' },
  { id: 'forge', label: 'Forge' },
  { id: 'package', label: 'Package' },
]

export function LeeAnimationsPanel() {
  const [tab, setTab] = useState<Tab>('brief')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar — matches FreeCut's panel header height and underline-indicator style */}
      <div className="flex border-b border-border flex-shrink-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors duration-150 flex-shrink-0 relative',
              tab === id
                ? 'text-foreground after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'brief' && <MorningBrief />}
        {tab === 'script' && <ScriptStudio />}
        {tab === 'voice' && <VoiceBooth />}
        {tab === 'forge' && <AssetForge />}
        {tab === 'package' && <Packaging />}
      </div>
    </div>
  )
}
