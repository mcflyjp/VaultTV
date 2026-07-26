/**
 * Stylized per-platform badge icons for the Games library. Deliberately
 * original flat shapes/colors rather than photos of real console hardware —
 * actual console photography is trademarked, and bundling or hotlinking it
 * would be a real copyright risk for a self-hosted personal app that may
 * eventually be shared publicly.
 */
const PLATFORM_STYLE = {
  'NES':              { bg: '#c9302c', label: 'NES' },
  'SNES':              { bg: '#5c4b8a', label: 'SNES' },
  'N64':              { bg: '#00693e', label: 'N64' },
  'Game Boy':         { bg: '#8b8b1a', label: 'GB' },
  'Game Boy Color':   { bg: '#7b1fa2', label: 'GBC' },
  'Game Boy Advance': { bg: '#4a148c', label: 'GBA' },
  'Genesis':          { bg: '#1a1a1a', label: 'GEN' },
  'PlayStation':      { bg: '#003791', label: 'PS1' },
  'Atari 2600':       { bg: '#8d6e63', label: '2600' },
}

export default function ConsoleIcon({ platform, size = 40 }) {
  const style = PLATFORM_STYLE[platform] || { bg: 'var(--accent)', label: platform?.slice(0, 4)?.toUpperCase() || '?' }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
        background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
      }}
      title={platform}
    >
      <span style={{ color: '#fff', fontWeight: 800, fontSize: size * 0.24, letterSpacing: '-0.02em' }}>
        {style.label}
      </span>
    </div>
  )
}
