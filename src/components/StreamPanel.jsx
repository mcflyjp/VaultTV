/**
 * Stream picker
 *
 * The list of playable sources an add-on returned for a title or episode:
 * sorting, language and compatibility filtering, and the rows themselves.
 *
 * Lived inside the detail page until it became clear that mounting it there
 * was the cause of every D-pad problem on the television. Inserting a subtree
 * this large mid-page resets focus, so the remote jumped to the top of the
 * screen, skipped the episode list, and scrolled the page away when the row
 * reached its end. It is now its own screen, and this file is what that screen
 * and the desktop's inline panel share.
 */

import { useState } from 'react'
import { FiPlay } from 'react-icons/fi'
import { Component } from 'react'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { sortAndFilterStreams, streamCompat, compatBadge, parseStreamLanguages, parseStreamMeta, parseStreamCodecs, LANG_LABELS } from '../lib/streamCompat'
import { transcodeUrl } from '../lib/companion'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

export class StreamErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,80,80,0.8)' }}>
        Stream list error: {this.state.err.message}
      </p>
    )
    return this.props.children
  }
}

function StreamSortBar({ streams, sortBy, setSortBy, filterLang, setFilterLang, compatOnly, setCompatOnly }) {
  const langOptions = streamLangOptions(streams)
  const selectStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: '#fff', padding: '0.25rem 0.5rem',
    fontSize: '0.72rem', cursor: 'pointer',
  }
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
      {/* Sort */}
      <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Sort</span>
      {[
        { value: 'default',   label: 'Best Match' },
        { value: 'seeds',     label: '👤 Seeds'   },
        { value: 'size-desc', label: '💾 Largest'  },
        { value: 'size-asc',  label: '💾 Smallest' },
        { value: 'quality',   label: '✨ Quality'  },
        { value: 'language',  label: '🌐 Language' },
      ].map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setSortBy(value)}
          style={{
            background: sortBy === value ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${sortBy === value ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 6, color: sortBy === value ? '#fff' : 'rgba(255,255,255,0.65)',
            padding: '0.25rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: sortBy === value ? 700 : 400,
            transition: 'all 0.12s',
          }}
        >
          {label}
        </button>
      ))}

      {/* Language filter */}
      {langOptions.length > 1 && (
        <>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginLeft: 4 }}>Lang</span>
          <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={selectStyle}>
            <option value=''>All</option>
            {langOptions.map(code => (
              <option key={code} value={code}>{LANG_LABELS[code] || code.toUpperCase()}</option>
            ))}
          </select>
        </>
      )}

      {/* Compat-only toggle */}
      <button
        onClick={() => setCompatOnly(v => !v)}
        style={{
          marginLeft: 'auto',
          background: compatOnly ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${compatOnly ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 6, color: compatOnly ? '#4ade80' : 'rgba(255,255,255,0.45)',
          padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: compatOnly ? 700 : 400,
          transition: 'all 0.12s', flexShrink: 0,
        }}
      >
        ✓ Compatible only
      </button>
    </div>
  )
}

/** Horizontal stream tray that slides in below a clicked episode row */
export function InlineStreamTray({ loading, streams, onSelect, preferredLang }) {
  const [sortBy,      setSortBy]      = useState('default')
  const [filterLang,  setFilterLang]  = useState('')
  const [compatOnly,  setCompatOnly]  = useState(false)
  const { companionOnline } = useLocalLibrary()

  const sorted = streams
    ? sortAndFilterStreams(streams, { sortBy, filterLang, compatOnly, preferredLang })
    : null

  return (
    <div style={{
      margin: '0 0 0.25rem',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '0 0 var(--radius) var(--radius)',
      padding: '0.85rem 1rem',
      animation: 'slideDown 0.18s ease',
    }}>
      {loading && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Querying add-ons…</p>
      )}
      {!loading && streams?.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No streams found. Make sure your add-ons are installed.</p>
      )}
      {!loading && streams?.length > 0 && (
        <>
          <StreamSortBar
            streams={streams}
            sortBy={sortBy}       setSortBy={setSortBy}
            filterLang={filterLang} setFilterLang={setFilterLang}
            compatOnly={compatOnly} setCompatOnly={setCompatOnly}
          />
          {sorted.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No streams match the current filters.</p>
          ) : (
            <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.25rem' }} className="shelf-scroll">
              {sorted.map((s, i) => <StreamCard key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function StreamPanel({ loading, streams, onSelect, preferredLang }) {
  const [sortBy,      setSortBy]      = useState('default')
  const [filterLang,  setFilterLang]  = useState('')
  const [compatOnly,  setCompatOnly]  = useState(false)
  const { companionOnline } = useLocalLibrary()

  const sorted = streams
    ? sortAndFilterStreams(streams, { sortBy, filterLang, compatOnly, preferredLang })
    : null

  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Available Streams</h3>
        {streams?.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{streams.length} total</span>
        )}
      </div>
      {loading && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Querying add-ons…</p>}
      {!loading && streams?.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No streams found. Make sure your add-ons are installed.</p>
      )}
      {!loading && streams?.length > 0 && (
        <>
          <StreamSortBar
            streams={streams}
            sortBy={sortBy}         setSortBy={setSortBy}
            filterLang={filterLang} setFilterLang={setFilterLang}
            compatOnly={compatOnly} setCompatOnly={setCompatOnly}
          />
          {sorted.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No streams match the current filters.</p>
          ) : IS_FIRETV ? (
            /* overscrollBehavior: contain stops a horizontal scroll that has
               hit the end of the rail from chaining to the page and carrying
               the whole layout off screen — the same guard the sidebar nav
               uses. scrollPadding keeps the focused card off the very edge so
               the spatial-nav's 'nearest' scroll leaves it fully visible. */
            <div data-stream-row style={{
              display: 'flex', flexDirection: 'row', gap: '0.6rem',
              overflowX: 'auto', paddingBottom: '0.5rem',
              overscrollBehavior: 'contain', scrollPaddingLeft: '1rem', scrollPaddingRight: '1rem',
            }}>
              {sorted.map((s, i) => <StreamPanelRow key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} horizontal />)}
            </div>
          ) : sorted.map((s, i) => <StreamPanelRow key={i} stream={s} onSelect={onSelect} preferredLang={preferredLang} companionOnline={companionOnline} />)}
        </>
      )}
    </div>
  )
}

function StreamPanelRow({ stream: s, onSelect, preferredLang, companionOnline = false, horizontal = false }) {
  // On FireTV, ExoPlayer handles all codecs natively — treat everything as compatible
  const compat    = IS_FIRETV ? 'compatible' : streamCompat(s)
  const badge     = compatBadge(compat)
  const dimmed    = compat === 'both-issues' && !companionOnline
  const hasIssue  = compat === 'audio-issue' || compat === 'video-issue' || compat === 'both-issues'
  const langs     = parseStreamLanguages(s)
  const meta      = parseStreamMeta(s)
  const langMatch = preferredLang && langs.length > 0 && !['MULTI','DUAL'].includes(langs[0]) && langs.includes(preferredLang)
  const rawTooltip = [s.name, s.title, companionOnline && hasIssue ? '⚡ Auto-transcoding via companion' : badge?.title].filter(Boolean).join('\n─────\n')

  function handleClick() {
    if (!s.url) return
    if (hasIssue && companionOnline) {
      const { videoCodec } = parseStreamCodecs(s)
      const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
      // Use preferred language so ffmpeg picks the right audio track by default
      const al = preferredLang && langs.includes(preferredLang) ? preferredLang : ''
      onSelect(transcodeUrl(s.url, 0, needsVideoTranscode, al), s)
    } else {
      onSelect(s.url, s)
    }
  }

  // Effective compat badge — show ⚡ when companion will auto-fix it
  const effectiveBadge = hasIssue && companionOnline
    ? { label: '⚡ Auto', color: '#4ade80', title: 'Will be transcoded automatically via companion' }
    : badge

  if (horizontal) {
    return (
      <div
        tabIndex={s.url ? 0 : -1}
        data-card
        onClick={handleClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        style={{
          flexShrink: 0, width: 180, padding: '0.6rem 0.75rem',
          background: langMatch ? 'rgba(251,191,36,0.05)' : 'var(--bg-secondary)',
          borderRadius: 'var(--radius)', cursor: s.url ? 'pointer' : 'default',
          border: `1px solid ${langMatch ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.25)'}`,
          opacity: dimmed ? 0.5 : 1, display: 'flex', flexDirection: 'column', gap: '0.3rem',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.name || s.title || 'Stream'}
        </p>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.addonName}
        </span>
        {meta.resolution && (
          <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>{meta.resolution}</span>
        )}
      </div>
    )
  }

  return (
    <div
      tabIndex={s.url ? 0 : -1}
      data-card
      title={rawTooltip}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      style={{
        padding: '0.65rem 0.75rem', marginBottom: '0.4rem',
        background: langMatch ? 'rgba(251,191,36,0.05)' : 'var(--bg-secondary)',
        borderRadius: 'var(--radius)', cursor: s.url ? 'pointer' : 'default',
        border: `1px solid ${langMatch ? 'rgba(251,191,36,0.35)' : compat === 'compatible' || (hasIssue && companionOnline) ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>{s.name || s.title || 'Stream'}</p>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>via {s.addonName}</span>
              {meta.seeds != null && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>👤 {meta.seeds}</span>}
              {meta.sizeGb != null && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>💾 {meta.sizeGb >= 1 ? `${meta.sizeGb.toFixed(1)} GB` : `${(meta.sizeGb * 1024).toFixed(0)} MB`}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {langs.map(code => (
              <span key={code} style={{ fontSize: '0.6rem', borderRadius: 3, padding: '2px 5px', fontWeight: 700,
                background: code === 'MULTI' ? 'rgba(99,102,241,0.2)' : langMatch && code === preferredLang ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)',
                color: code === 'MULTI' ? '#818cf8' : langMatch && code === preferredLang ? '#fbbf24' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${code === 'MULTI' ? 'rgba(99,102,241,0.4)' : langMatch && code === preferredLang ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`,
              }}>{LANG_LABELS[code] || code.toUpperCase()}</span>
            ))}
            {effectiveBadge && <span title={effectiveBadge.title} style={{ fontSize: '0.62rem', background: effectiveBadge.color + '22', color: effectiveBadge.color, border: `1px solid ${effectiveBadge.color}55`, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{effectiveBadge.label}</span>}
            {s.url && <FiPlay size={16} style={{ color: 'var(--accent)' }} />}
          </div>
        </div>
      )}
    </div>
  )
}

function streamLangOptions(streams) {
  const seen = new Set()
  for (const s of streams) {
    for (const code of parseStreamLanguages(s)) {
      if (code !== 'MULTI' && code !== 'DUAL') seen.add(code)
    }
  }
  return [...seen].sort()
}

function StreamCard({ stream: s, onSelect, preferredLang, companionOnline = false }) {
  // On FireTV, ExoPlayer handles all codecs natively — treat everything as compatible
  const compat    = IS_FIRETV ? 'compatible' : streamCompat(s)
  const badge     = compatBadge(compat)
  const hasIssue  = compat === 'audio-issue' || compat === 'video-issue' || compat === 'both-issues'
  const dimmed    = compat === 'both-issues' && !companionOnline
  const langs     = parseStreamLanguages(s)
  const meta      = parseStreamMeta(s)
  const langMatch = preferredLang && langs.length > 0 && !['MULTI','DUAL'].includes(langs[0]) && langs.includes(preferredLang)
  const qualMatch = (s.name || '').match(/4K|\d{3,4}p|HD|SD/i)
  const effectiveBadge = hasIssue && companionOnline
    ? { label: '⚡ Auto', color: '#4ade80', title: 'Will be transcoded automatically via companion' }
    : badge
  const baseBorder = langMatch ? 'rgba(251,191,36,0.45)'
                   : compat === 'compatible' || (hasIssue && companionOnline) ? 'rgba(74,222,128,0.35)'
                   : 'var(--border)'

  const rawTooltip = [s.name, s.title, companionOnline && hasIssue ? '⚡ Auto-transcoding via companion' : effectiveBadge?.title].filter(Boolean).join('\n─────\n')

  function handleClick() {
    if (!s.url) return
    if (hasIssue && companionOnline) {
      const { videoCodec } = parseStreamCodecs(s)
      const needsVideoTranscode = videoCodec && !['h264','avc','x264'].includes(videoCodec.toLowerCase())
      const al = preferredLang && langs.includes(preferredLang) ? preferredLang : ''
      onSelect(transcodeUrl(s.url, 0, needsVideoTranscode, al), s)
    } else {
      onSelect(s.url, s)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!s.url}
      title={rawTooltip}
      style={{
        flexShrink: 0, width: 176, opacity: dimmed ? 0.45 : 1,
        background: langMatch ? 'rgba(251,191,36,0.04)' : 'var(--bg-card)',
        border: `1px solid ${baseBorder}`,
        borderRadius: 'var(--radius)', padding: '0.65rem 0.75rem',
        cursor: s.url ? 'pointer' : 'default', textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { if (!dimmed) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)' }}}
      onMouseLeave={e => { e.currentTarget.style.borderColor = baseBorder; e.currentTarget.style.background = langMatch ? 'rgba(251,191,36,0.04)' : 'var(--bg-card)' }}
    >
      {/* Top row: play icon + quality/compat badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <FiPlay size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {qualMatch && (
            <span style={{ fontSize: '0.58rem', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>
              {qualMatch[0]}
            </span>
          )}
          {effectiveBadge && (
            <span style={{ fontSize: '0.58rem', background: effectiveBadge.color + '22', color: effectiveBadge.color, border: `1px solid ${effectiveBadge.color}55`, borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>
              {effectiveBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Stream name */}
      <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {s.name || s.title || 'Stream'}
      </p>

      {/* Torrent / file name */}
      {(() => {
        const nameLower = (s.name || '').toLowerCase()
        const addonLower = (s.addonName || '').toLowerCase()
        const firstLine = str => str?.split('\n').map(l => l.trim()).find(l => l.length > 3) || ''
        // looks like a real filename/torrent name: has a video extension, or has dots/dots+year pattern, or is long (>25 chars)
        const looksLikeFilename = str => /\.(mkv|mp4|avi|mov|ts|m2ts|webm)$/i.test(str) || str.length > 25
        // looksLikeSource: short string that's just a rehash of the addon/cache source
        const looksLikeSource = str => {
          const l = str.toLowerCase()
          return str.length < 20 && (
            l.includes(addonLower) || (addonLower && addonLower.includes(l.split(' ')[0]))
          )
        }

        // behaviorHints.filename is the most reliable — always use if present
        const hintFile = firstLine(s.behaviorHints?.filename)
        if (hintFile && !nameLower.includes(hintFile.toLowerCase())) {
          return <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{hintFile}</p>
        }

        // Fall back to first line of title/description only if it looks like a real filename
        const candidate = firstLine(s.title) || firstLine(s.description)
        if (!candidate) return null
        if (nameLower.includes(candidate.toLowerCase())) return null
        if (looksLikeSource(candidate)) return null
        if (!looksLikeFilename(candidate)) return null

        return <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{candidate}</p>
      })()}

      {/* Addon name + seeds + size */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '2px 0 4px', flexWrap: 'wrap' }}>
        {s.addonName && !(s.name || '').toLowerCase().includes(s.addonName.toLowerCase()) && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {s.addonName}
          </span>
        )}
        {meta.seeds != null && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>👤{meta.seeds}</span>
        )}
        {meta.sizeGb != null && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            💾{meta.sizeGb >= 1 ? `${meta.sizeGb.toFixed(1)}G` : `${(meta.sizeGb * 1024).toFixed(0)}M`}
          </span>
        )}
      </div>

      {/* Language badges row */}
      {langs.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {langs.map(code => (
            <span
              key={code}
              style={{
                fontSize: '0.58rem', borderRadius: 3, padding: '1px 5px', fontWeight: 700,
                background: code === 'MULTI' ? 'rgba(99,102,241,0.18)'
                           : langMatch && code === preferredLang ? 'rgba(251,191,36,0.2)'
                           : 'rgba(255,255,255,0.07)',
                color: code === 'MULTI' ? '#818cf8'
                     : langMatch && code === preferredLang ? '#fbbf24'
                     : 'rgba(255,255,255,0.5)',
                border: `1px solid ${code === 'MULTI' ? 'rgba(99,102,241,0.35)'
                          : langMatch && code === preferredLang ? 'rgba(251,191,36,0.45)'
                          : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {LANG_LABELS[code] || code.toUpperCase()}
            </span>
          ))}
        </div>
      )}

    </button>
  )
}
