import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { motion, AnimatePresence } from 'framer-motion'
import { FiX, FiLoader, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { fetchReadingFile } from '../lib/companion'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

const LS_KEY = 'vt-pdf-page-'

export default function PdfReader({ file, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  const [doc, setDoc]     = useState(null)
  const [page, setPage]   = useState(() => parseInt(localStorage.getItem(LS_KEY + file.path)) || 1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchReadingFile(file.path)
      .then(buf => pdfjsLib.getDocument({ data: buf }).promise)
      .then(pdf => {
        if (cancelled) return
        setDoc(pdf)
        setTotal(pdf.numPages)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [file.path])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setRendering(true)
    doc.getPage(page).then(async p => {
      if (cancelled) return
      const viewport = p.getViewport({ scale: Math.min(2, window.devicePixelRatio || 1) * 1.3 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await p.render({ canvasContext: ctx, viewport }).promise
      if (!cancelled) setRendering(false)
    })
    localStorage.setItem(LS_KEY + file.path, String(page))
    return () => { cancelled = true }
  }, [doc, page, file.path])

  function goTo(n) { setPage(p => Math.min(total, Math.max(1, typeof n === 'function' ? n(p) : n))) }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') goTo(p => p + 1)
      if (e.key === 'ArrowLeft')  goTo(p => p - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, onClose])

  return (
    <div role="dialog" aria-label={file?.name || 'PDF Reader'} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {total > 0 && <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{page} / {total}</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}><FiX size={20} /></button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'auto' }}>
        {error && <p style={{ color: '#f87171', fontSize: '0.9rem' }}>{error}</p>}
        {!error && !doc && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            <FiLoader size={28} style={{ animation: 'vt-pdf-spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>Opening PDF…</span>
          </div>
        )}
        {doc && (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <canvas ref={canvasRef} style={{ maxWidth: '90vw', maxHeight: '85vh', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', opacity: rendering ? 0.5 : 1 }} />
            </motion.div>
          </AnimatePresence>
        )}

        {doc && (
          <>
            <button onClick={() => goTo(p => p - 1)} disabled={page <= 1} title="Previous page" style={navBtn('left', page <= 1)}><FiChevronLeft size={22} /></button>
            <button onClick={() => goTo(p => p + 1)} disabled={page >= total} title="Next page" style={navBtn('right', page >= total)}><FiChevronRight size={22} /></button>
          </>
        )}
      </div>

      <style>{`
        @keyframes vt-pdf-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

function navBtn(side, disabled) {
  return {
    position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
  }
}
