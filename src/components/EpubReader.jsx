import { useEffect, useState, useRef } from 'react'
import { ReactReader } from 'react-reader'
import { motion, AnimatePresence } from 'framer-motion'
import { FiX, FiLoader } from 'react-icons/fi'
import { fetchReadingFile } from '../lib/companion'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

const LS_KEY = 'vt-epub-location-'

export default function EpubReader({ file, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  const [data, setData]   = useState(null) // ArrayBuffer
  const [error, setError] = useState('')
  const [location, setLocation] = useState(() => localStorage.getItem(LS_KEY + file.path) || null)
  const [flashKey, setFlashKey] = useState(0)
  const firstLoad = useRef(true)

  useEffect(() => {
    let cancelled = false
    fetchReadingFile(file.path)
      .then(buf => { if (!cancelled) setData(buf) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [file.path])

  function onLocationChanged(epubcfi) {
    setLocation(epubcfi)
    localStorage.setItem(LS_KEY + file.path, epubcfi)
    // Skip the flash on the very first location event (initial load/restore,
    // not an actual page turn the user triggered).
    if (firstLoad.current) { firstLoad.current = false; return }
    setFlashKey(k => k + 1)
  }

  return (
    <div role="dialog" aria-label={file?.name || 'EPUB Reader'} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: '#1a1a24', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}><FiX size={20} /></button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p style={{ color: '#f87171', fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}
        {!error && !data && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            <FiLoader size={28} style={{ animation: 'vt-epub-spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>Opening book…</span>
          </div>
        )}
        {data && (
          <ReactReader
            url={data}
            location={location}
            locationChanged={onLocationChanged}
            epubOptions={{ flow: 'paginated', manager: 'default' }}
          />
        )}

        {/* Brief animated sweep on each page turn — a light "modern, slightly
            animated" cue layered on top of epub.js's own pagination, rather
            than a full 3D page-curl which doesn't suit reflowable text well. */}
        <AnimatePresence>
          <motion.div
            key={flashKey}
            initial={{ opacity: 0.35, x: '-100%' }}
            animate={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(100deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
            }}
          />
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes vt-epub-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
