import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FiX, FiUser, FiSettings, FiLogOut, FiMail, FiShield } from 'react-icons/fi'
import { PanelOverlay } from './LibraryPanel'

export default function ProfilePanel({ onClose }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const email = user?.email || 'Not signed in'
  const initials = email.slice(0, 2).toUpperCase()
  const avatarUrl = user?.user_metadata?.avatar_url

  function go(path) { navigate(path); onClose() }

  async function handleSignOut() {
    await signOut()
    onClose()
  }

  return (
    <PanelOverlay onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FiUser size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Profile</h2>
        </div>
        <button onClick={onClose} style={closeBtn}><FiX size={18} /></button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem' }}>
        {/* Avatar + identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : (
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{initials}</span>
              </div>
            )
          }
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.user_metadata?.full_name || user?.user_metadata?.name || 'VaultTV User'}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FiMail size={11} /> {email}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <MenuRow icon={<FiSettings size={16} />} label="Settings" onClick={() => go('/settings')} />
          <MenuRow icon={<FiShield size={16} />} label="Parental controls" onClick={() => go('/settings')} />
        </div>

        {user && (
          <button
            onClick={handleSignOut}
            style={{
              marginTop: '1.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.65rem', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: '#f87171', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <FiLogOut size={15} /> Sign out
          </button>
        )}
      </div>
    </PanelOverlay>
  )
}

function MenuRow({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.7rem 0.85rem', borderRadius: 8,
        background: 'transparent', border: 'none',
        color: 'var(--text-primary)', cursor: 'pointer',
        fontSize: '0.88rem', textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
      {label}
    </button>
  )
}

const closeBtn = {
  background: 'none', border: 'none', color: 'var(--text-secondary)',
  cursor: 'pointer', padding: '0.25rem', display: 'flex', borderRadius: 4,
}
