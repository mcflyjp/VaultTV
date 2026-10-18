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
  const { getStreams, getSubtitles } = useAddons()
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
  const [streams, setStreams] = useState(null)
  const [loading, setLoading] = useState(true)

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
    setLoading(true)
    Promise.all([
      getStreams(type, imdbId, season, episode),
      getSubtitles(type, imdbId, season, episode).catch(() => []),
    ])
      .then(([results, subs]) => {
        if (cancelled) return
        setStreams(results.map(s => ({ ...s, _subtitles: subs })))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [type, id, imdbId, season, episode])

  // Put the remote on the first stream as soon as there is one. Doing it here
  // rather than leaving it to the browser is what makes the screen usable from
  // a sofa: focus has somewhere obvious to start, and never falls to the body.
  useEffect(() => {
    if (loading || !streams?.length) return
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector('[data-card]')
      if (first) {
        first.focus({ preventScroll: true })
        first.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
  }, [loading, streams])

  function handleSelect(url, stream) {
    const langs = stream ? parseStreamLanguages(stream) : []
    const { videoCodec } = stream ? parseStreamCodecs(stream) : {}
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
            opacity: 0.35,
            filter: 'blur(1px) brightness(0.5)',
          }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, var(--bg-primary) 78%)',
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

        <div ref={panelRef}>
          <StreamErrorBoundary>
            <StreamPanel
              loading={loading}
              streams={streams}
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
