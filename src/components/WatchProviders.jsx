/**
 * Where to watch
 *
 * Shows which services carry a title, from TMDB's watch provider data. This is
 * deliberately presented as a separate thing from the user's own sources: the
 * stream panel above it lists what VaultTV can play right now, while this is
 * where the title exists elsewhere, most of which VaultTV cannot play at all.
 * Blurring those two would make the page lie about what a tap will do.
 *
 * The data is JustWatch's, supplied through TMDB, and both require credit. The
 * API returns only which services carry a title, never a deep link into them,
 * so the only route onward is TMDB's own page, which is also the link-back
 * TMDB asks for. Every tile therefore opens that page rather than pretending
 * it can launch the service.
 *
 * Free and ad-supported entries are shown first and marked, since a title
 * being watchable at no cost is the most useful thing this panel can tell
 * someone.
 */

import { useEffect, useState } from 'react'
import { getWatchProviders } from '../lib/tmdb'

const LOGO = path => (path ? `https://image.tmdb.org/t/p/w92${path}` : null)

// Order matters: cheapest first. Free and ads are merged because the
// distinction (adverts or not) is less useful to a viewer than "costs nothing".
const GROUPS = [
  { keys: ['free', 'ads'], label: 'Free',          tone: '#4ade80' },
  { keys: ['flatrate'],    label: 'Subscription',  tone: '#60a5fa' },
  { keys: ['rent'],        label: 'Rent',          tone: 'rgba(255,255,255,0.55)' },
  { keys: ['buy'],         label: 'Buy',           tone: 'rgba(255,255,255,0.55)' },
]

export default function WatchProviders({ type, id, region = 'US' }) {
  // The fetched providers are stored alongside the title they belong to, so a
  // navigation to another title renders nothing rather than briefly showing the
  // previous title's services while the new request is still in flight.
  const [result, setResult] = useState({ key: null, data: null })
  const key = `${type}/${id}/${region}`

  useEffect(() => {
    let cancelled = false
    getWatchProviders(type, id)
      .then(r => { if (!cancelled) setResult({ key, data: r?.results?.[region] || null }) })
      // A failure here is not worth surfacing: this panel is supplementary, and
      // an error message about a service directory would only add noise to a
      // page whose own sources loaded fine.
      .catch(() => { if (!cancelled) setResult({ key, data: null }) })
    return () => { cancelled = true }
  }, [type, id, region, key])

  if (result.key !== key) return null
  const data = result.data
  if (!data) return null

  // De-duplicated per group: a service often appears in several categories, and
  // listing it three times says nothing extra.
  const groups = GROUPS.map(g => {
    const seen = new Set()
    const items = g.keys
      .flatMap(k => data[k] || [])
      .filter(p => !seen.has(p.provider_id) && seen.add(p.provider_id))
      .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    return { ...g, items }
  }).filter(g => g.items.length)

  if (!groups.length) return null

  return (
    <div style={{ padding: '0 2rem 2rem' }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1.1rem 1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Where to watch</h3>
          {/* Not decoration: TMDB's terms require JustWatch to be credited. */}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            elsewhere · data by JustWatch
          </span>
        </div>

        {groups.map(g => (
          <div key={g.label} style={{ marginBottom: '0.85rem' }}>
            <p style={{
              margin: '0 0 0.45rem', fontSize: '0.76rem', fontWeight: 800,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: g.tone,
            }}>
              {g.label}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {g.items.map(p => (
                <a
                  key={p.provider_id}
                  href={data.link}
                  target="_blank"
                  rel="noreferrer"
                  data-card
                  title={`${p.provider_name} — opens TMDB's watch page`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.7rem 0.4rem 0.4rem',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 999, textDecoration: 'none',
                    color: 'var(--text-primary)', fontSize: '0.85rem',
                  }}
                >
                  {LOGO(p.logo_path) && (
                    <img
                      src={LOGO(p.logo_path)}
                      alt=""
                      loading="lazy"
                      style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  {p.provider_name}
                </a>
              ))}
            </div>
          </div>
        ))}

        <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          VaultTV cannot play these directly. Opens the listing so you can continue in that service.
        </p>
      </div>
    </div>
  )
}
