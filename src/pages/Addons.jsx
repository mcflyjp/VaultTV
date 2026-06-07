import { useState } from 'react'
import { useAddons } from '../context/AddonsContext'
import { FiPlus, FiTrash2, FiUpload, FiLink, FiRefreshCw } from 'react-icons/fi'

export default function Addons() {
  const { addons, importFromUrl, removeAddon, saveAddons } = useAddons()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSyncCatalogs() {
    setSyncing(true); setError(''); setSuccess('')
    let updated = 0, failed = 0
    const next = [...addons]
    await Promise.all(next.map(async (addon, idx) => {
      if (!addon.manifestUrl) return
      try {
        const res = await fetch(addon.manifestUrl)
        if (!res.ok) { failed++; return }
        const manifest = await res.json()
        const catalogs = (manifest.catalogs || []).map(c => ({ type: c.type, id: c.id, name: c.name || c.id }))
        if (catalogs.length) {
          next[idx] = { ...addon, catalogs }
          updated++
        }
      } catch { failed++ }
    }))
    saveAddons(next)
    setSyncing(false)
    const parts = [`${updated} add-on${updated !== 1 ? 's' : ''} synced`]
    if (failed) parts.push(`${failed} failed (offline or token expired)`)
    setSuccess(parts.join(' · '))
  }

  async function handleAddByUrl(e) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const manifest = await importFromUrl(url.trim())
      setSuccess(`Added: ${manifest.name}`)
      setUrl('')
    } catch {
      setError('Could not load that manifest URL. Make sure it ends with /manifest.json')
    } finally {
      setLoading(false)
    }
  }

  async function handleSettingsFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setSuccess('')
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // Stremio export nests addons under data.addons.addons[]
      // Each entry has transportUrl + manifest already embedded
      const addonList =
        data?.addons?.addons ||   // Stremio v5 export format
        data?.addons ||           // flat array fallback
        []

      if (!addonList.length) { setError('No add-ons found in that file.'); return }

      // Import directly from the embedded manifest — no network needed
      let imported = 0, updated = 0
      const toSave = [...addons]
      for (const entry of addonList) {
        const manifest = entry.manifest
        const url = entry.transportUrl
        if (!manifest || !url) continue
        if (url.includes('127.0.0.1') || url.includes('localhost')) continue
        const catalogs = (manifest.catalogs || []).map(c => ({ type: c.type, id: c.id, name: c.name || c.id }))
        const existingIdx = toSave.findIndex(a => a.id === manifest.id)
        if (existingIdx !== -1) {
          // Update catalogs if the existing entry is missing them
          if (catalogs.length && !toSave[existingIdx].catalogs?.length) {
            toSave[existingIdx] = { ...toSave[existingIdx], catalogs }
            updated++
          }
          continue
        }
        toSave.push({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version || '0.0.1',
          manifestUrl: url,
          types: manifest.types || [],
          resources: (manifest.resources || []).map(r => typeof r === 'string' ? r : r.name),
          catalogs,
        })
        imported++
      }
      saveAddons(toSave)
      const parts = []
      if (imported) parts.push(`${imported} new add-on${imported !== 1 ? 's' : ''} imported`)
      if (updated) parts.push(`${updated} updated with catalog info`)
      setSuccess(parts.length ? parts.join(', ') : 'Nothing new to import')
    } catch (err) {
      setError('Could not read that file. Make sure it\'s the JSON exported from Stremio → Settings → Export user data.')
    }
    // reset file input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 700 }}>Add-ons</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Connect your Stremio add-ons to pull streams into VaultTV.
      </p>

      {/* Add by URL */}
      <Section title="Add by Manifest URL" icon={<FiLink />}>
        <form onSubmit={handleAddByUrl} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-addon.com/manifest.json"
            style={{ flex: 1, minWidth: 260, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: '0.6rem 0.9rem', fontSize: '0.9rem' }}
          />
          <button type="submit" className="btn-accent" disabled={loading}>
            <FiPlus /> {loading ? 'Adding…' : 'Add'}
          </button>
        </form>
      </Section>

      {/* Import from Stremio settings file */}
      <Section title="Import from Stremio Settings File" icon={<FiUpload />}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 0.75rem' }}>
          In Stremio: Settings → General → Export user data. Drop the file here to sync all your add-ons instantly.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} className="btn-ghost">
          <FiUpload /> Choose settings file (.json)
          <input type="file" accept=".json" onChange={handleSettingsFile} style={{ display: 'none' }} />
        </label>
      </Section>

      {/* Feedback */}
      {error   && <p style={{ color: '#f87171', margin: '0 0 1rem', fontSize: '0.88rem' }}>{error}</p>}
      {success && <p style={{ color: '#4ade80', margin: '0 0 1rem', fontSize: '0.88rem' }}>{success}</p>}

      {/* Installed */}
      <Section
        title={`Installed (${addons.length})`}
        icon={null}
        action={
          <button onClick={handleSyncCatalogs} disabled={syncing} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiRefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync Catalogs'}
          </button>
        }
      >
        {addons.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No add-ons installed yet.</p>
        )}
        {addons.map(addon => (
          <div key={addon.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', marginBottom: '0.5rem', border: '1px solid var(--border)' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{addon.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {addon.version} · {addon.types?.join(', ')} · {addon.resources?.join(', ')}
              </p>
            </div>
            <button onClick={() => removeAddon(addon.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.4rem' }}>
              <FiTrash2 size={16} />
            </button>
          </div>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, icon, action, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon} {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}
