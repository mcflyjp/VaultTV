import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePlaylist } from '../context/PlaylistContext'
import { FiPlus, FiTrash2, FiEdit2, FiChevronLeft, FiPlay } from 'react-icons/fi'

export default function Playlists() {
  const { id } = useParams()
  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, removeFromPlaylist } = usePlaylist()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const active = id ? playlists.find(p => p.id === id) : null

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const pl = createPlaylist(newName.trim())
    setNewName(''); setCreating(false)
    navigate(`/playlists/${pl.id}`)
  }

  function startEdit(pl) { setEditingId(pl.id); setEditName(pl.name) }
  function saveEdit(e) {
    e.preventDefault()
    if (editName.trim()) renamePlaylist(editingId, editName.trim())
    setEditingId(null)
  }

  // Playlist detail view
  if (active) return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <button onClick={() => navigate('/playlists')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.25rem', padding: 0 }}>
        <FiChevronLeft size={14} /> All Playlists
      </button>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.6rem', fontWeight: 800 }}>{active.name}</h1>

      {active.items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No items yet — right-click any title and choose "Add to Playlist…"</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {active.items.map((item, idx) => (
            <div key={`${item.id}-${item.type}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.65rem 0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ width: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 700 }}>{idx + 1}</span>
              {item.poster && <img src={item.poster} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 4 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.type}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <SmBtn onClick={() => navigate(`/detail/${item.type}/${item.id}`)} accent title="Play"><FiPlay size={13} /></SmBtn>
                <SmBtn onClick={() => removeFromPlaylist(active.id, item.id, item.type)} title="Remove"><FiTrash2 size={13} /></SmBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Playlist list view
  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Playlists</h1>
        <button onClick={() => setCreating(true)} className="btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          <FiPlus size={14} /> New Playlist
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Playlist name…" style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.55rem 0.75rem', fontSize: '0.9rem' }} />
          <button type="submit" className="btn-accent" style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}>Create</button>
          <button type="button" onClick={() => setCreating(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
        </form>
      )}

      {playlists.length === 0 && !creating ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '0.5rem' }}>No playlists yet</p>
          <p style={{ fontSize: '0.85rem' }}>Create one and add titles via right-click</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {playlists.map(pl => (
            <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/playlists/${pl.id}`)}>
              {editingId === pl.id ? (
                <form onSubmit={saveEdit} style={{ flex: 1, display: 'flex', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--text-primary)', padding: '0.3rem 0.55rem', fontSize: '0.85rem' }} />
                  <button type="submit" className="btn-accent" style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}>Save</button>
                </form>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>{pl.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pl.items.length} {pl.items.length === 1 ? 'title' : 'titles'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                    <SmBtn onClick={() => startEdit(pl)} title="Rename"><FiEdit2 size={13} /></SmBtn>
                    <SmBtn onClick={() => deletePlaylist(pl.id)} title="Delete"><FiTrash2 size={13} /></SmBtn>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SmBtn({ onClick, title, accent, children }) {
  return (
    <button onClick={onClick} title={title} style={{ background: accent ? 'var(--accent)' : 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: accent ? '#fff' : 'var(--text-secondary)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
