import { useState } from 'react'
import { GiGameConsole, GiGamepad } from 'react-icons/gi'

/**
 * Stylized per-platform badge/tile art for the Games library. Deliberately
 * original flat shapes/colors/icons rather than photos of real console
 * hardware — actual console photography is trademarked, and bundling or
 * hotlinking it would be a real copyright risk for a self-hosted personal
 * app that may eventually be shared publicly.
 */
const PLATFORM_STYLE = {
  'NES':              { bg: '#c9302c', bg2: '#7a1613', label: 'NES',  handheld: false },
  'SNES':              { bg: '#7c5cbf', bg2: '#4a3878', label: 'SNES', handheld: false },
  'N64':              { bg: '#1b9e63', bg2: '#0d5c39', label: 'N64',  handheld: false },
  'Game Boy':         { bg: '#9ca01f', bg2: '#5c5e10', label: 'GB',   handheld: true },
  'Game Boy Color':   { bg: '#a239cc', bg2: '#5c1f78', label: 'GBC',  handheld: true },
  'Game Boy Advance': { bg: '#6a1fbf', bg2: '#3a0f70', label: 'GBA',  handheld: true },
  'Genesis':          { bg: '#3a3a3a', bg2: '#141414', label: 'GEN',  handheld: false },
  'PlayStation':      { bg: '#1a4fc7', bg2: '#0a2260', label: 'PS1',  handheld: false },
  'Atari 2600':       { bg: '#a8785c', bg2: '#5c3f2c', label: '2600', handheld: false },
}

function styleFor(platform) {
  return PLATFORM_STYLE[platform] || { bg: 'var(--accent)', bg2: 'var(--accent)', label: platform?.slice(0, 4)?.toUpperCase() || '?', handheld: false }
}

/** Small badge — used in headers/lists where space is tight. */
export default function ConsoleIcon({ platform, size = 40 }) {
  const style = styleFor(platform)
  const Icon = style.handheld ? GiGamepad : GiGameConsole
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
        background: `linear-gradient(155deg, ${style.bg}, ${style.bg2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
      }}
      title={platform}
    >
      <Icon size={size * 0.52} style={{ color: 'rgba(255,255,255,0.92)' }} />
    </div>
  )
}

/**
 * Large "hero" selector tile — ES-DE / CrossMix style: a big glowing gradient
 * card with a console-shaped icon and the platform name, used as the entry
 * point into a console's game grid instead of dumping every platform's
 * games into one long scrolling wall.
 */
export function ConsoleTile({ platform, count, onClick }) {
  const [hover, setHover] = useState(false)
  const style = styleFor(platform)
  const Icon = style.handheld ? GiGamepad : GiGameConsole

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: 210, height: 250, padding: 0,
        border: 'none', borderRadius: 18, cursor: 'pointer', overflow: 'hidden',
        background: `linear-gradient(155deg, ${style.bg} 0%, ${style.bg2} 100%)`,
        boxShadow: hover
          ? `0 18px 50px -10px ${style.bg}99, 0 0 0 2px rgba(255,255,255,0.18)`
          : '0 8px 24px rgba(0,0,0,0.4)',
        transform: hover ? 'translateY(-6px) scale(1.03)' : 'translateY(0) scale(1)',
        transition: 'transform 0.22s cubic-bezier(.2,.8,.3,1.2), box-shadow 0.22s ease',
      }}
    >
      {/* Soft radial glow behind the icon */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.16), transparent 60%)',
      }} />

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.9rem', padding: '1.5rem 1rem' }}>
        <Icon size={82} style={{ color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.4))', transition: 'transform 0.22s ease', transform: hover ? 'scale(1.08)' : 'scale(1)' }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{platform}</p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
            {count} game{count === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </button>
  )
}
