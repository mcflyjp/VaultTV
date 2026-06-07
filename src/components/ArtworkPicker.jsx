import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useArtwork } from '../context/ArtworkContext'
import { IMG } from '../lib/tmdb'
import { FiX, FiLink, FiCheck } from 'react-icons/fi'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || ''

async function fetchImages(type, id) {
  const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=en,null`)
  const data = await res.json()
  return data.posters || []
}

export default function ArtworkPicker({ item, type, onClose }) {
  const { setArtwork, getArtwork, clearArtwork } = useArtwork()
  const [customUrl, setCustomUrl] = useState('')
  const [tab, setTab] = useState('tmdb') // 'tmdb' | 'custom'
  const current = getArtwork(item.id, type)

  const { data: posters = [], isLoading } = useQuery({
    queryKey: ['images', type, item.id],
    queryFn: () => fetchImages(type, item.id),
  })

  function pick(url) { setArtwork(item.id, type, url); onClose() }
  function applyCustom() { if (customUrl.trim()) { setArtwork(item.id, type, customUrl.trim()); onClose() } }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Change Artwork</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.title || item.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}><FiX size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['tmdb','TMDB Posters'],['custom','Custom URL']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '0.65rem', border: 'none', background: 'transparent', color: tab === id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: tab === id ? 700 : 400, borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontSize: '0.85rem' }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>

          {tab === 'tmdb' && (
            <>
              {current && (
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--accent)' }}>
                  <img src={current} alt="" style={{ width: 40, borderRadius: 4, aspectRatio: '2/3', objectFit: 'cover' }} />
                  <p style={{ margin: 0, fontSize: '0.82rem', flex: 1 }}>Custom artwork active</p>
                  <button onClick={() => { clearArtwork(item.id, type); onClose() }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>Reset</button>
                </div>
              )}
              {isLoading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Loading posters…</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
                {posters.slice(0, 20).map((p, i) => {
                  const url = IMG(p.file_path, 'w342')
                  const isActive = current === url
                  return (
                    <div key={i} onClick={() => pick(url)} style={{ position: 'relative', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: isActive ? '2px solid var(--accent)' : '2px solid transparent', transition: 'border 0.15s' }}>
                      <img src={url} alt="" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                      {isActive && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(124,58,237,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FiCheck size={24} color="#fff" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {tab === 'custom' && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>Paste any direct image URL to use as the poster for this title.</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/poster.jpg"
                  style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}
                />
                <button className="btn-accent" onClick={applyCustom}>Apply</button>
              </div>
              {customUrl && <img src={customUrl} alt="" onError={e => e.target.style.display='none'} style={{ width: 120, borderRadius: 8, aspectRatio: '2/3', objectFit: 'cover', border: '1px solid var(--border)' }} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
