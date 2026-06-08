import { useState } from 'react'
import { usePlaylist } from '../context/PlaylistContext'
import { FiX, FiPlus, FiCheck } from 'react-icons/fi'

export default function PlaylistModal({ item, onClose }) {
  const { playlists, createPlaylist, addToPlaylist } = usePlaylist()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [added, setAdded] = useState({})

  function handleAdd(playlistId) {
    addToPlaylist(playlistId, item)
    setAdded(a => ({ ...a, [playlistId]: true }))
  }

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const pl = createPlaylist(newName.trim())
    addToPlaylist(pl.id, item)
    setAdded(a => ({ ...a, [pl.id]: true }))
    setNewName('')
    setCreating(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 380, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', zIndex: 1 }}><FiX size={18} /></button>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Add to Playlist</h3>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.name}</p>
        </div>

        {/* Existing playlists */}
        <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0.4rem 0' }} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>
          {playlists.length === 0 && !creating && (
            <p style={{ padding: '1rem 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No playlists yet. Create one below.</p>
          )}
          {playlists.map(pl => {
            const isAdded = added[pl.id] || pl.items.some(i => i.id === item.id && i.type === item.type)
            return (
              <button
                key={pl.id}
                onClick={() => !isAdded && handleAdd(pl.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1.25rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: isAdded ? 'default' : 'pointer', fontSize: '0.88rem', transition: 'background 0.1s' }}
                onMouseEnter={e => !isAdded && (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{pl.name}</span>
                <span style={{ fontSize: '0.75rem', color: isAdded ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isAdded ? <><FiCheck size={13} /> Added</> : `${pl.items.length} items`}
                </span>
              </button>
            )
          })}
        </div>

        {/* Create new */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          {creating ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Playlist name…"
                style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
              />
              <button type="submit" className="btn-accent" style={{ padding: '0.5rem 0.9rem' }}>Create</button>
              <button type="button" className="btn-ghost" onClick={() => setCreating(false)} style={{ padding: '0.5rem 0.75rem' }}>✕</button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, padding: 0 }}
            >
              <FiPlus size={16} /> Create New Playlist
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
