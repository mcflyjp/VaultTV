import { useEffect, useRef, useState, forwardRef } from 'react'
import JSZip from 'jszip'
import { createExtractorFromData } from 'node-unrar-js'
import HTMLFlipBook from 'react-pageflip'
import { FiX, FiLoader, FiChevronLeft, FiChevronRight, FiZoomIn } from 'react-icons/fi'
import { fetchReadingFile } from '../lib/companion'
import { useModalBackTrap } from '../hooks/useModalBackTrap'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i

// node-unrar-js needs its ~600KB WASM binary fetched separately — done lazily
// (only when a CBR is actually opened) and cached so re-opening another CBR
// in the same session doesn't refetch it.
const UNRAR_WASM_URL = new URL('node-unrar-js/dist/js/unrar.wasm', import.meta.url).href
let unrarWasmPromise = null
function getUnrarWasm() {
  if (!unrarWasmPromise) unrarWasmPromise = fetch(UNRAR_WASM_URL).then(r => r.arrayBuffer())
  return unrarWasmPromise
}

// Natural sort so "page2.jpg" comes before "page10.jpg" (plain string sort
// would put page10 first) — comic archives are almost always numbered pages.
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

async function extractCbz(buf) {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)
    .filter(n => IMAGE_EXT.test(n) && !zip.files[n].dir)
    .sort(naturalCompare)
  if (!names.length) throw new Error('No image pages found in this archive')
  const blobs = await Promise.all(names.map(n => zip.files[n].async('blob')))
  return blobs.map(b => URL.createObjectURL(b))
}

async function extractCbr(buf) {
  const wasmBinary = await getUnrarWasm()
  const extractor = await createExtractorFromData({ data: buf, wasmBinary })
  const { fileHeaders } = extractor.getFileList()
  const imageNames = [...fileHeaders]
    .filter(h => !h.flags.directory && IMAGE_EXT.test(h.name))
    .map(h => h.name)
    .sort(naturalCompare)
  if (!imageNames.length) throw new Error('No image pages found in this archive')
  const { files } = extractor.extract({ files: imageNames })
  // extract() returns a generator in file-processing order, not necessarily
  // matching imageNames' sorted order — key results by name, then rebuild
  // in the natural-sorted order we already computed.
  const byName = new Map()
  for (const f of files) byName.set(f.fileHeader.name, f.extraction)
  return imageNames.map(name => {
    const bytes = byName.get(name)
    if (!bytes) throw new Error(`Failed to extract page: ${name}`)
    return URL.createObjectURL(new Blob([bytes]))
  })
}

const Page = forwardRef(({ src }, ref) => (
  <div ref={ref} style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
    <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} />
  </div>
))
Page.displayName = 'Page'

// react-pageflip's size="stretch" mode stretches the book to fill the
// container's width AND height independently, distorting the page's actual
// aspect ratio — the container then clips whatever no longer fits, which is
// what was cutting off the tops/bottoms of pages. Instead we measure the
// available space ourselves and pass a fixed width/height that always
// preserves a comic page's ~2:3 aspect ratio and fits entirely on screen.
const PAGE_ASPECT = 2 / 3 // width / height
function fitBookSize(containerWidth, containerHeight) {
  const availW = Math.max(containerWidth - 120, 200)  // leave room for the side nav buttons
  const availH = Math.max(containerHeight - 24, 200)
  let width  = availW
  let height = width / PAGE_ASPECT
  if (height > availH) { height = availH; width = height * PAGE_ASPECT }
  return { width: Math.round(width), height: Math.round(height) }
}

export default function ComicReader({ file, onClose }) {
  // FireTV: trap D-pad focus + make Back close this instead of leaving the page.
  useModalBackTrap(onClose)
  const [pages, setPages]   = useState(null) // array of blob: URLs
  const [error, setError]   = useState('')
  const [current, setCurrent] = useState(0)
  const [bookSize, setBookSize] = useState({ width: 520, height: 780 })
  const [zoom, setZoom] = useState(1) // 1 = fit-to-screen, up to 3x
  const [pan, setPan] = useState({ x: 0, y: 0 }) // drag offset, only meaningful when zoom > 1
  const [dragging, setDragging] = useState(false)
  const bookRef = useRef(null)
  const urlsRef = useRef([])
  const stageRef = useRef(null)
  const dragState = useRef(null) // { startX, startY, panX, panY, moved } while dragging
  const lastTap = useRef(null) // { time, x } of the last touchend, for double-tap detection
  const isZoomed = zoom > 1

  // Recompute on mount and whenever the window/reader area resizes, so it
  // stays fully on-screen at any window size or when resizing.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setBookSize(fitBookSize(el.clientWidth, el.clientHeight))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const buf = await fetchReadingFile(file.path)
        const urls = file.ext === '.cbr' ? await extractCbr(buf) : await extractCbz(buf)
        urlsRef.current = urls
        if (!cancelled) setPages(urls)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    load()
    return () => {
      cancelled = true
      urlsRef.current.forEach(u => URL.revokeObjectURL(u))
    }
  }, [file.path])

  // Keyboard paging — Left/Right, matching how the rest of the app treats
  // arrow keys as primary navigation (FireTV remote included). Always active,
  // zoomed or not — it's an explicit, unambiguous action unlike a touch
  // drag/tap, so there's no gesture conflict to avoid here.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') bookRef.current?.pageFlip()?.flipNext()
      if (e.key === 'ArrowLeft')  bookRef.current?.pageFlip()?.flipPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Reset the pan whenever zoom changes or the page flips — otherwise a pan
  // built up on one page would carry over and start the next page off-center
  // or clipped. Done directly in the triggering handlers (not an effect) so
  // it doesn't cause an extra render pass.
  function setZoomAndResetPan(z) { setZoom(z); setPan({ x: 0, y: 0 }) }
  function onFlipResetPan(e) { setCurrent(e.data); setPan({ x: 0, y: 0 }) }

  function onDragStart(e) {
    if (!isZoomed) return
    const p = e.touches ? e.touches[0] : e
    dragState.current = { startX: p.clientX, startY: p.clientY, panX: pan.x, panY: pan.y, moved: false }
    setDragging(true)
  }
  function onDragMove(e) {
    if (!dragState.current) return
    const p = e.touches ? e.touches[0] : e
    const dx = p.clientX - dragState.current.startX
    const dy = p.clientY - dragState.current.startY
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragState.current.moved = true
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy })
  }
  // A touch that ends without moving is a tap, not a pan — while zoomed, two
  // of those close together (in time and position) flip the page instead of
  // relying on react-pageflip's own single-tap gesture, which we deliberately
  // disable while zoomed (see useMouseEvents below) since a single tap/drag
  // there is meant to pan, not turn the page.
  function onDragEnd(e) {
    const wasTap = isZoomed && dragState.current && !dragState.current.moved
    dragState.current = null
    setDragging(false)
    if (!wasTap) return
    const p = e.changedTouches ? e.changedTouches[0] : e
    const now = Date.now()
    const last = lastTap.current
    if (last && now - last.time < 350 && Math.abs(p.clientX - last.x) < 40) {
      lastTap.current = null
      const stageWidth = stageRef.current?.clientWidth || 0
      if (p.clientX < stageWidth / 2) bookRef.current?.pageFlip()?.flipPrev()
      else bookRef.current?.pageFlip()?.flipNext()
    } else {
      lastTap.current = { time: now, x: p.clientX }
    }
  }

  const total = pages?.length || 0

  return (
    <div role="dialog" aria-label={file?.name || 'Comic Reader'} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FiZoomIn size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={e => setZoomAndResetPan(parseFloat(e.target.value))}
                title={`Zoom ${zoom.toFixed(1)}x`}
                style={{ width: 110, accentColor: '#38bdf8', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', width: 30 }}>{zoom.toFixed(1)}x</span>
            </div>
          )}
          {total > 0 && <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{current + 1} / {total}</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}><FiX size={20} /></button>
        </div>
      </div>

      <div
        ref={stageRef}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
          cursor: isZoomed ? (dragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {error && <p style={{ color: '#f87171', fontSize: '0.9rem' }}>{error}</p>}
        {!error && !pages && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            <FiLoader size={28} style={{ animation: 'vt-spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>Extracting pages…</span>
          </div>
        )}
        {pages && (
          <>
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: dragging ? 'none' : 'transform 0.15s ease-out',
                touchAction: isZoomed ? 'none' : 'auto', // let the browser's own touch scroll go when not zoomed, take over for drag-panning when zoomed
              }}
            >
              <HTMLFlipBook
                // react-pageflip runs its own imperative flip engine that
                // doesn't react to prop changes after mount — width/height
                // already needed a remount to take effect (see fitBookSize
                // above), and useMouseEvents is the same: toggling it without
                // remounting silently keeps the OLD value, which is exactly
                // why single-tap/drag kept turning the page even after
                // useMouseEvents={false} was passed once zoomed in.
                key={`${bookSize.width}x${bookSize.height}-${isZoomed}`}
                ref={bookRef}
                width={bookSize.width}
                height={bookSize.height}
                size="fixed"
                maxShadowOpacity={0.5}
                showCover={false}
                mobileScrollSupport
                useMouseEvents={!isZoomed}
                onFlip={onFlipResetPan}
                style={{ margin: '0 auto' }}
                className="vt-comic-flipbook"
              >
                {pages.map((src, i) => <Page key={i} src={src} />)}
              </HTMLFlipBook>
            </div>

            <button onClick={() => bookRef.current?.pageFlip()?.flipPrev()} title="Previous page" style={navBtn('left')}><FiChevronLeft size={22} /></button>
            <button onClick={() => bookRef.current?.pageFlip()?.flipNext()} title="Next page" style={navBtn('right')}><FiChevronRight size={22} /></button>
          </>
        )}
      </div>

      <style>{`
        @keyframes vt-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

function navBtn(side) {
  return {
    position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)', transition: 'background 0.15s',
  }
}
