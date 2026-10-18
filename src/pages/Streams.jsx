/**
 * Stream picker screen
 *
 * A screen of its own for choosing which source to play, rather than a panel
 * that appears inside the detail page. Reached as
 * /streams/:type/:id with the season and episode in the query string.
 *
 * It exists because of the remote. Mounting a list this large inside the
 * detail page reset focus every time, so the D-pad jumped to the top of the
 * screen, skipped the episode list, and scrolled the page away when the row
 * reached its end. A separate route has none of those problems: focus starts
 * here, the first stream takes it, and Back goes back. It also reads at ten
 * feet, which a list below the fold never did.
 *
 * Desktop keeps the inline panel, where a mouse makes it faster and none of
 * the above applies.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDetail, getSeason, IMG } from '../lib/tmdb'
import { useAddons } from '../context/AddonsContext'
import { useLanguage } from '../context/LanguageContext'
import { usePlayer } from '../context/PlayerContext'
import { useWatchHistory } from '../context/WatchHistoryContext'
import { useArtwork } from '../context/ArtworkContext'
import { StreamPanel, StreamErrorBoundary } from '../components/StreamPanel'
import { parseStreamLanguages, parseStreamCodecs } from '../lib/streamCompat'

export default function Streams() {
  const { type, id }   = useParams()
  const [params]       = useSearchParams()
  const { getStreamsBySource, getSubtitles } = useAddons()
  const { audioLang }  = useLanguage()
  const { play, closePlayer } = usePlayer()
  const { history, startWatching, saveLastStream } = useWatchHistory()
  const { getBackdrop } = useArtwork()

  const season  = params.get('season')  ? Number(params.get('season'))  : undefined
  const episode = params.get('episode') ? Number(params.get('episode')) : undefined
  const imdbId  = params.get('imdb') || ''

  /**
   * Saved resume position, if it is worth resuming from.
   *
   * Mirrors the detail page's rule: skip the first 3% and the last 8%, so a
   * title barely started or all but finished begins from the top rather than
   * dropping the viewer into the credits.
   */
  function savedProgress() {
    const entry = history.find(h => h.id === Number(id) && h.type === type)
    if (!entry?.progressSec) return 0
    if (entry.durationSec > 0) {
      const pct = entry.progress ?? (entry.progressSec / entry.durationSec)
      if (pct < 0.03 || pct > 0.92) return 0
    } else if (entry.progressSec < 30) {
      return 0
    }
    return entry.progressSec
  }

  const panelRef = useRef(null)
  const [sources, setSources]     = useState([])
  const [subs,    setSubs]        = useState([])
  const [activeTab, setActiveTab] = useState('All')

  const { data: detail } = useQuery({
    queryKey: ['detail', type, id],
    queryFn: () => getDetail(type, id),
  })
  const { data: seasonData } = useQuery({
    queryKey: ['season', id, season],
    queryFn: () => getSeason(id, season),
    enabled: type === 'tv' && !!season,
  })

  const epMeta  = seasonData?.episodes?.find(e => e.episode_number === episode)
  const title   = detail?.title || detail?.name || ''
  const heading = episode ? `S${season}E${episode}${epMeta?.name ? ' · ' + epMeta.name : ''}` : title

  useEffect(() => {
    let cancelled = false
    setActiveTab('All')
    // Each source reports as it answers, so the list fills in rather than
    // appearing all at once when the slowest finishes.
    const cancel = getStreamsBySource(type, imdbId, season, episode, next => {
      if (!cancelled) setSources(next)
    })
    getSubtitles(type, imdbId, season, episode)
      .then(r => { if (!cancelled) setSubs(r || []) })
      .catch(() => { if (!cancelled) setSubs([]) })
    return () => { cancelled = true; cancel() }
  }, [type, id, imdbId, season, episode])

  const anyLoading = sources.some(s => s.status === 'loading')
  // Subtitles ride along on each stream, the shape the player expects.
  const withSubs   = list => list.map(s => ({ ...s, _subtitles: subs }))
  const allStreams = withSubs(sources.flatMap(s => s.streams))
  const shown      = activeTab === 'All'
    ? allStreams
    : withSubs(sources.find(s => s.name === activeTab)?.streams || [])
  // Nothing yet and still working is "loading"; nothing left to wait for is
  // genuinely empty, which the panel words differently.
  const loading    = anyLoading && allStreams.length === 0

  // Put the remote on the first stream as soon as there is one. Doing it here
  // rather than leaving it to the browser is what makes the screen usable from
  // a sofa: focus has somewhere obvious to start, and never falls to the body.
  // Only once per tab. Re-focusing every time a slow source answers would
  // snatch the highlight back while someone was already choosing.
  const focusedFor = useRef(null)
  useEffect(() => {
    if (!shown.length || focusedFor.current === activeTab) return
    focusedFor.current = activeTab
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector('[data-card]')
      if (first) {
        first.focus({ preventScroll: true })
        first.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
  }, [shown.length, activeTab])

  function handleSelect(url, stream) {
    const langs = stream ? parseStreamLanguages(stream) : []
    const { videoCodec, audioCodec } = stream ? parseStreamCodecs(stream) : {}
    const needsVideoTranscode = videoCodec && !['h264', 'avc', 'x264'].includes(String(videoCodec).toLowerCase())
    const poster = IMG(detail?.poster_path, 'w780')

    play({
      url,
      title: episode ? `${title} · ${heading}` : title,
      year: (detail?.release_date || detail?.first_air_date)?.slice(0, 4),
      poster,
      subtitleTracks: stream?._subtitles || [],
      imdbId,
      mediaType: type,
      streamLangs: langs,
      rawStreamUrl: stream?.url || null,
      // Lets the player layer swap in a transcode when it cannot decode this.
      audioCodec,
      transcodeVideo: !!needsVideoTranscode,
      startTime: savedProgress(),
      onPlaybackEnded: () => closePlayer(),
    })
    startWatching({ id: Number(id), type, title, poster })
    saveLastStream(Number(id), type, {
      url, streamLangs: langs, rawStreamUrl: stream?.url || null,
      transcodeVideo: !!needsVideoTranscode, subtitleTracks: stream?._subtitles || [],
      imdbId, mediaType: type, season, episode,
    })
  }

  // The backdrop, title and overview carry over from the detail page so moving
  // here reads as the same screen changing state rather than a navigation. It
  // is what Stremio does, and the difference is not decoration: on a television
  // a cut to a bare page loses the viewer's sense of where they are, and it was
  // the first thing noticed about this screen.
  //
  // Styling is deliberately identical to the detail page's hero, including the
  // gradient that keeps text readable over the artwork.
  const backdrop = getBackdrop(Number(id), type) || IMG(detail?.backdrop_path, 'original')
  const overview = episode ? (epMeta?.overview || detail?.overview) : detail?.overview
  const airDate  = epMeta?.air_date
    ? new Date(epMeta.air_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null
  const years = (detail?.first_air_date || detail?.release_date || '').slice(0, 4)

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Same background treatment as the detail page. Fixed, so the list
          scrolls over it exactly as the episode list does. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {backdrop && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${backdrop})`,
            backgroundSize: 'cover', backgroundPosition: 'center top',
            // Brighter and sharper than the detail page's treatment. There the
            // artwork is a background to a page of its own text; here it is the
            // only thing identifying what is being chosen for, since the rows
            // below carry no poster of their own.
            opacity: 0.6,
            filter: 'brightness(0.65)',
          }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          // Reaches a darkened wash rather than the page colour. The original
          // became fully opaque at 78%, which painted the artwork out exactly
          // where the stream list sits, leaving a flat panel on a blank field.
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.72) 100%)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '1.5rem 2rem 3rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
          {title}{years ? ` (${years})` : ''}
        </h1>

        {episode && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            S{String(season).padStart(2, '0')}E{String(episode).padStart(2, '0')}
            {airDate ? ` · ${airDate}` : ''}
            {epMeta?.name ? ` · ${epMeta.name}` : ''}
          </p>
        )}

        {overview && (
          <p style={{
            margin: '0.6rem 0 1.25rem', maxWidth: '70ch', lineHeight: 1.5,
            fontSize: '0.9rem', color: 'var(--text-secondary)',
          }}>
            {overview}
          </p>
        )}

        {/* Per-source tabs. Add-ons differ enormously in what they return and
            how fast: a cached debrid lookup answers instantly, a scraper can
            take the full timeout. Grouping by source lets a choice be made
            from whichever has answered rather than waiting for the slowest,
            and a count on each tab says what is behind it before it is opened. */}
        {sources.length > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.9rem' }}>
            {[{ name: 'All', count: allStreams.length, status: anyLoading ? 'loading' : 'done' },
              ...sources.map(s => ({ name: s.name, count: s.streams.length, status: s.status }))
            ].map(tab => {
              const active = tab.name === activeTab
              return (
                <button
                  key={tab.name}
                  data-card
                  onClick={() => setActiveTab(tab.name)}
                  style={{
                    padding: '0.5rem 0.9rem', borderRadius: 999, cursor: 'pointer',
                    fontSize: '0.88rem', fontWeight: active ? 700 : 500,
                    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.14)'}`,
                    color: active ? '#fff' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                  }}
                >
                  {tab.name}
                  {tab.status === 'loading'
                    ? <span style={{ opacity: 0.7, fontSize: '0.78rem' }}>…</span>
                    : tab.status === 'error'
                      ? <span title="This source failed or timed out" style={{ color: '#f87171', fontSize: '0.78rem' }}>!</span>
                      : <span style={{ opacity: 0.7, fontSize: '0.78rem' }}>{tab.count}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Named individually rather than as a count, because when a wanted
            source is the slow one, knowing which is still working is the
            difference between waiting and giving up. */}
        {anyLoading && (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {sources.filter(s => s.status === 'loading').map(s => s.name).join(', ')} still loading…
          </p>
        )}

        <div ref={panelRef}>
          <StreamErrorBoundary>
            <StreamPanel
              loading={loading}
              streams={shown}
              preferredLang={audioLang}
              onSelect={handleSelect}
              layout="list"
            />
          </StreamErrorBoundary>
        </div>
      </div>
    </div>
  )
}
