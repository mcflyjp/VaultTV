export default function LogoIcon({ size = 40, accent = 'var(--accent)' }) {
  const dark = accent === 'var(--accent)' ? 'var(--accent-hover)' : accent
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width={size} height={size} aria-label="VaultTV logo">
      {/* TV body */}
      <rect fill={accent} x="75" y="140" width="350" height="240" rx="28" ry="28"/>
      {/* Screen */}
      <rect fill="#1a0a2e" x="92" y="153" width="278" height="200" rx="22" ry="22"/>
      {/* Antenna left */}
      <line stroke={accent} strokeWidth="14" strokeLinecap="round" x1="155" y1="140" x2="100" y2="55"/>
      <circle fill={accent} cx="100" cy="52" r="10"/>
      {/* Antenna right */}
      <line stroke={accent} strokeWidth="14" strokeLinecap="round" x1="345" y1="140" x2="400" y2="55"/>
      <circle fill={accent} cx="400" cy="52" r="10"/>
      {/* Legs */}
      <rect fill={dark} x="140" y="378" width="52" height="24" rx="6"/>
      <rect fill={dark} x="308" y="378" width="52" height="24" rx="6"/>
      {/* Speaker */}
      <line stroke={dark} strokeWidth="6" strokeLinecap="round" x1="388" y1="218" x2="388" y2="242"/>
      <line stroke={dark} strokeWidth="6" strokeLinecap="round" x1="402" y1="210" x2="402" y2="250"/>
      <line stroke={dark} strokeWidth="6" strokeLinecap="round" x1="416" y1="218" x2="416" y2="242"/>
      {/* Knob */}
      <circle fill={dark} cx="402" cy="300" r="18"/>
      <circle fill="#4c1d95" cx="402" cy="300" r="9"/>
      {/* V accent */}
      <text x="100" y="296" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="130" fill={accent}>V</text>
      {/* TV white */}
      <text x="196" y="296" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="130" fill="#ffffff">TV</text>
    </svg>
  )
}
