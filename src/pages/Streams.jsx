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
import { StreamPanel, StreamErrorBoundary } from '../components/StreamPanel'
import { parseStreamLanguages, parseStreamCodecs } from '../lib/streamCompat'
import { transcodeUrl } from '../lib/companion'

export default function Streams() {
  const { type, id }   = useParams()
  const [params]       = useSearchParams()
  const { getStreams, getSubtitles } = useAddons()
  const { audioLang }  = useLanguage()
  const { play, closePlayer } = usePlayer()
  const { history, startWatching, saveLastStream } = useWatchHistory()

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

  return (
    <div style={{ padding: '1.5rem 2rem 3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        {/* No Back control here: the app shell renders one on every route
            that is not Home, and a second would be both redundant and an extra
            stop for the remote to pass through. */}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title || 'Streams'}
          </h1>
          {episode && (
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{heading}</p>
          )}
        </div>
      </div>

      <div ref={panelRef}>
        <StreamErrorBoundary>
          <StreamPanel
            loading={loading}
            streams={streams}
            preferredLang={audioLang}
            onSelect={handleSelect}
          />
        </StreamErrorBoundary>
      </div>
    </div>
  )
}
