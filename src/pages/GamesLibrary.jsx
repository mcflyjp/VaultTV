import { FiPlay, FiSmartphone, FiFolder } from 'react-icons/fi'
import { useGamesLibrary, HAS_ANDROID_BRIDGE } from '../hooks/useGamesLibrary'

export default function GamesLibrary() {
  const {
    allGames, gamesByPlatform, platformCount, retroarchPath, raExists,
    androidFolderUri, loading, error, play,
  } = useGamesLibrary()

  return (
    <div style={{ padding: '2rem 1.75rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <FiPlay size={20} style={{ color: '#a78bfa' }} />
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Games</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({allGames.length})</span>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {!raExists && !androidFolderUri && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          No RetroArch source configured yet. Open the folder icon → Games to set a ROM folder + RetroArch path{HAS_ANDROID_BRIDGE ? ', or pick a folder on this device' : ''}.
        </div>
      )}

      {allGames.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🎮</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>No games found yet.</p>
          <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.88rem' }}>Add a ROM folder from the Libraries panel.</p>
        </div>
      )}

      {Object.entries(gamesByPlatform).map(([platform, list]) => (
        <div key={platform} style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 0.85rem', fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>
            {platform} <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.82rem' }}>({list.length})</span>
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {list.map(g => (
              <GameCard key={g._source === 'android' ? g.uri : g.path} game={g} raExists={raExists} onPlay={() => play(g)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GameCard({ game, raExists, onPlay }) {
  const disabled = game._source === 'server' && !raExists
  return (
    <button
      onClick={onPlay}
      disabled={disabled}
      title={disabled ? 'Set a valid RetroArch path first' : 'Play'}
      style={{
        width: 150, textAlign: 'left', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        overflow: 'hidden', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.15s',
      }}
      className={!disabled ? 'card-hover' : undefined}
    >
      <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
        <FiPlay size={28} style={{ color: 'var(--accent)', opacity: 0.7 }} />
      </div>
      <div style={{ padding: '0.5rem 0.6rem 0.6rem' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {game._source === 'android' ? <><FiSmartphone size={10} /> This device</> : <><FiFolder size={10} /> {game.platform}</>}
        </p>
      </div>
    </button>
  )
}
