import { Users, Zap } from 'lucide-react'

type Player = {
  initial: string
  name: string
  x: number // % of card width
  y: number // % of card height
  tone: 'violet' | 'lime'
}

const PLAYERS: Player[] = [
  { initial: 'A', name: 'Aarav', x: 22, y: 26, tone: 'violet' },
  { initial: 'S', name: 'Sana', x: 76, y: 28, tone: 'lime' },
  { initial: 'R', name: 'Riya', x: 26, y: 72, tone: 'lime' },
]
const YOU = { x: 74, y: 70 }

// SVG viewBox is 400 x 308 (≈ aspect 1.3), so % maps straight to units.
const px = (x: number) => (x / 100) * 400
const py = (y: number) => (y / 100) * 308

const TONES = {
  violet: 'bg-violet-300 text-violet-950',
  lime: 'bg-lime-200 text-lime-950',
}

export function MatchCourtCard() {
  return (
    <div
      className="relative aspect-[1.3] overflow-hidden rounded-3xl bg-gradient-to-br from-[#322a85] via-[#28216b] to-[#1a1550] shadow-2xl shadow-indigo-950/40 ring-1 ring-white/10"
      aria-hidden="true"
    >
      {/* ambient glows */}
      <div className="absolute -right-10 -top-14 size-56 rounded-full bg-violet-500/40 blur-3xl" />
      <div className="absolute -bottom-16 -left-10 size-48 rounded-full bg-lime-300/15 blur-3xl" />

      {/* court + connections + ball */}
      <svg viewBox="0 0 400 308" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="court-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".10" />
            <stop offset="1" stopColor="#fff" stopOpacity=".03" />
          </linearGradient>
        </defs>

        {/* surface */}
        <rect x="28" y="38" width="344" height="232" rx="10" fill="url(#court-fill)" />

        {/* lines */}
        <g fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2">
          <rect x="28" y="38" width="344" height="232" rx="10" />
          <line x1="28" y1="62" x2="372" y2="62" strokeOpacity=".28" />
          <line x1="28" y1="246" x2="372" y2="246" strokeOpacity=".28" />
          <line x1="132" y1="38" x2="132" y2="270" strokeOpacity=".28" />
          <line x1="268" y1="38" x2="268" y2="270" strokeOpacity=".28" />
          <line x1="28" y1="154" x2="132" y2="154" strokeOpacity=".28" />
          <line x1="268" y1="154" x2="372" y2="154" strokeOpacity=".28" />
        </g>

        {/* net */}
        <line x1="200" y1="32" x2="200" y2="276" stroke="#fff" strokeOpacity=".85" strokeWidth="2" strokeDasharray="3 5" />
        <circle cx="200" cy="32" r="3" fill="#fff" />
        <circle cx="200" cy="276" r="3" fill="#fff" />

        {/* "match" links from you to each player */}
        <g fill="none" strokeLinecap="round" strokeWidth="2" strokeDasharray="2 8">
          {PLAYERS.map((p) => (
            <line
              key={p.initial}
              x1={px(YOU.x)}
              y1={py(YOU.y)}
              x2={px(p.x)}
              y2={py(p.y)}
              stroke={p.tone === 'lime' ? '#d9f99d' : '#c4b5fd'}
              strokeOpacity=".65"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-40"
                dur="2s"
                repeatCount="indefinite"
                className="motion-reduce:hidden"
              />
            </line>
          ))}
        </g>

        {/* rally ball */}
        <g className="motion-reduce:hidden">
          <circle r="5" fill="#fef9c3">
            <animateMotion
              dur="1.8s"
              repeatCount="indefinite"
              path={`M${px(22)},${py(26)} Q${(px(22) + px(76)) / 2},${py(2)} ${px(76)},${py(28)}`}
              keyPoints="0;1;0"
              keyTimes="0;.5;1"
              calcMode="linear"
            />
          </circle>
        </g>
      </svg>

      {/* teammates */}
      {PLAYERS.map((p, i) => (
        <div
          key={p.initial}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <span
            className={`flex size-10 items-center justify-center rounded-full border-2 border-white/80 text-sm font-bold shadow-lg shadow-black/30 motion-safe:animate-bounce ${TONES[p.tone]}`}
            style={{ animationDuration: `${2.4 + i * 0.4}s` }}
          >
            {p.initial}
          </span>
          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {p.name}
          </span>
        </div>
      ))}

      {/* you */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
        style={{ left: `${YOU.x}%`, top: `${YOU.y}%` }}
      >
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-white/50 motion-safe:animate-ping" />
          <span className="relative flex size-12 items-center justify-center rounded-full border-2 border-white bg-white text-xs font-extrabold text-[#28216b] shadow-xl shadow-black/30">
            You
          </span>
        </span>
      </div>

      {/* chips */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-lime-300 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-lime-300" />
        </span>
        Live match
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-lime-200 px-2.5 py-1 text-[10px] font-bold text-lime-950">
        <Zap className="size-3" /> Same vibe
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
        <Users className="size-3.5" /> 4 players matched · Tonight 7 PM
      </div>
    </div>
  )
}