import { useState } from 'react'
import { useRatings } from '../context/RatingsContext'
import { FiStar, FiX } from 'react-icons/fi'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

export default function RatingPicker({ item, type, onClose }) {
  const { getRating, setRating, clearRating } = useRatings()
  const current = getRating(item.id, type)
  const [hovered, setHovered] = useState(null)
  const display = hovered ?? current ?? 0

  function pick(score) {
    setRating(item.id, type, score)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Rate This</h3>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.title || item.name}</p>

      {/* 10-star row */}
      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', marginBottom: '1rem' }}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => pick(n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: n <= display ? '#fbbf24' : 'rgba(255,255,255,0.2)', transition: 'color 0.1s, transform 0.1s', transform: n <= display ? 'scale(1.2)' : 'scale(1)' }}
          >
            <FiStar size={22} fill={n <= display ? '#fbbf24' : 'none'} />
          </button>
        ))}
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', minHeight: '1.2em' }}>
        {display > 0 ? LABELS[display] : 'Hover to preview'}
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
        {current && (
          <button className="btn-ghost" onClick={() => { clearRating(item.id, type); onClose() }}>Clear Rating</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

const LABELS = { 1:'Terrible',2:'Bad',3:'Poor',4:'Below Average',5:'Average',6:'Fine',7:'Good',8:'Great',9:'Excellent',10:'Masterpiece' }

function Modal({ children, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  return (
    <div role="dialog" aria-label="Rate This" style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.75rem', width: '100%', maxWidth: 380, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}><FiX size={18} /></button>
        {children}
      </div>
    </div>
  )
}
