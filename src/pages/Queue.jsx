import { useNavigate } from 'react-router-dom'
import { useQueue } from '../context/QueueContext'
import { useContextMenu } from '../context/ContextMenuContext'
import { FiTrash2, FiArrowUp, FiPlay, FiX } from 'react-icons/fi'

export default function Queue() {
  const { queue, removeFromQueue, moveUp, clearQueue } = useQueue()
  const navigate = useNavigate()

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Up Next</h1>
        {queue.length > 0 && (
          <button onClick={clearQueue} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiTrash2 size={13} /> Clear Queue
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Your queue is empty</p>
          <p style={{ fontSize: '0.85rem' }}>Right-click any title and choose "Add to Queue"</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {queue.map((item, idx) => (
            <QueueRow
              key={`${item.id}-${item.type}`}
              item={item}
              idx={idx}
              isFirst={idx === 0}
              onPlay={() => navigate(`/detail/${item.type}/${item.id}`)}
              onMoveUp={() => moveUp(idx)}
              onRemove={() => removeFromQueue(item.id, item.type)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QueueRow({ item, idx, isFirst, onPlay, onMoveUp, onRemove }) {
  const { show: showMenu } = useContextMenu()
  return (
    <div
      onContextMenu={e => { e.preventDefault(); showMenu(item, e.clientX, e.clientY) }}
      style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.65rem 0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
    >
      <span style={{ width: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
      {item.poster && (
        <img src={item.poster} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.type}</p>
      </div>
      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
        {!isFirst && (
          <IconBtn onClick={onMoveUp} title="Move up"><FiArrowUp size={14} /></IconBtn>
        )}
        <IconBtn onClick={onPlay} title="Play now" accent><FiPlay size={14} /></IconBtn>
        <IconBtn onClick={onRemove} title="Remove"><FiX size={14} /></IconBtn>
      </div>
    </div>
  )
}

function IconBtn({ onClick, title, accent, children }) {
  return (
    <button onClick={onClick} title={title} style={{ background: accent ? 'var(--accent)' : 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: accent ? '#fff' : 'var(--text-secondary)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
