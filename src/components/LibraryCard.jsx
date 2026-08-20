import { FiTrash2, FiHardDrive, FiAlertCircle } from 'react-icons/fi'
import { useContextMenu } from '../context/ContextMenuContext'
import { useArtwork } from '../context/ArtworkContext'
import { useLocalLibrary } from '../context/LocalLibraryContext'
import { usePlayer } from '../context/PlayerContext'
import { IMG } from '../lib/tmdb'
import { sortableTitle } from '../lib/sortTitle'

const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

/**
 * Poster card used by My Movies/My TV Shows (Library.jsx) and Playlist detail
 * pages — kept as one shared component specifically so "add local highlight
 * to one, forget the other" can't happen again.
 *
 * item._source / item._matched are set by Library.jsx's own merge logic
 * (saved vs local vs both). Callers that don't have that merge (playlists)
 * can omit them entirely — hasLocal() below fills in local status either way,
 * so a playlist item that happens to also be on disk still gets the same
 * green accent without the caller needing to know that ahead of time.
 */
export default function LibraryCard({ item, onNavigate, onRemove }) {
  const { show: showMenu } = useContextMenu()
  const { getPoster } = useArtwork()
  const { getFileUrl, hasLocal } = useLocalLibrary()
  const { play } = usePlayer()
  const isLocal = item._source === 'local' || item._source === 'both'
    || (item._source === undefined && hasLocal(item.id, item.type))
  const isUnmatched = item._matched === false && item._source === 'local'
  const canNavigate = item.id && !String(item.id).startsWith('local_')
  // Custom artwork overrides apply to unmatched items too (keyed by local_ id)
  const poster = getPoster(item.id, item.type) || item.poster || IMG(item.poster_path, 'w780')

  // Left-click on unmatched: play the file directly
  async function playUnmatched() {
    if (!item._filename) return
    try {
      const url = await getFileUrl(item._filename)
      play({ url, title: item.title, poster, subtitleTracks: [] })
    } catch (e) { alert('Could not open file: ' + e.message) }
  }

  const handleClick = canNavigate ? onNavigate : (isUnmatched ? playUnmatched : undefined)
  const handleContextMenu = e => { e.preventDefault(); showMenu(item, e.clientX, e.clientY) }

  const firstLetterChar = sortableTitle(item.title)[0]?.toUpperCase()
  const firstLetter = firstLetterChar && /[A-Z]/.test(firstLetterChar) ? firstLetterChar : '#'

  return (
    <div style={{ width: 150, position: 'relative' }} data-first-letter={firstLetter}>
      <div
        data-card
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick?.() } }}
        style={{
          borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-card)',
          cursor: (canNavigate || isUnmatched) ? 'pointer' : 'default',
          transition: 'transform 0.2s', position: 'relative',
          opacity: isUnmatched ? 0.85 : 1,
        }}
        className={(canNavigate || isUnmatched) ? 'card-hover focusable-card' : undefined}
      >
        {poster
          ? <img src={poster} alt={item.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '0.5rem', textAlign: 'center' }}>
              <FiHardDrive size={24} style={{ opacity: 0.4 }} />
              <span style={{ opacity: 0.7, lineHeight: 1.3 }}>{item.title}</span>
            </div>
        }

        {/* Badges — only for things the info bar below doesn't already say.
            LOCAL and quality used to sit here too, but they just duplicated/
            cluttered over the artwork; local status now reads from the info
            bar's accent below instead, and quality only shows once you're
            on the detail page. NO MATCH stays — nothing else surfaces it. */}
        {isUnmatched && (
          <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ background: 'rgba(251,191,36,0.9)', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: '#000', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
              <FiAlertCircle size={8} /> NO MATCH
            </div>
          </div>
        )}

        <div style={{
          padding: '0.45rem 0.6rem 0.55rem',
          borderTop: isLocal ? '2px solid #16a34a' : undefined,
          background: isLocal ? 'rgba(22,163,74,0.1)' : undefined,
        }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {item.type === 'movie' ? 'Movie' : 'Series'}
            {item._source === 'both' ? ' · Saved + Local' : isLocal ? ' · Local' : ''}
          </p>
        </div>
      </div>

      {/* Remove button — hidden on FireTV (use context menu / long-press instead) */}
      {onRemove && !IS_FIRETV && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remove"
          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex', zIndex: 5 }}
        >
          <FiTrash2 size={12} />
        </button>
      )}
    </div>
  )
}
