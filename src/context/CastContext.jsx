import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { IS_ELECTRON } from '../lib/platform'

// Chrome for Android DOES support the Cast Web Sender SDK, so this must not
// be gated on IS_BROWSER — that excludes all Android, which wrongly killed
// casting on phones/tablets. Only Electron (no Google Cast component ships
// with it) and FireTV (it IS the TV — nothing to cast to from there) are out.
const IS_FIRETV = /VaultTV-FireTV/i.test(navigator.userAgent)

// Inside our own Android WebView the browser Cast routes don't exist at all:
// WebView is Chromium-based but ships without Chrome's media-router
// integration, so window.chrome.cast and video.remote are both absent. The
// APK implements Cast natively instead (CastController.java) and exposes it
// here. When that bridge is present it wins outright — loading the web SDK
// alongside it would just be dead weight.
const NATIVE_CAST = typeof window !== 'undefined'
  && typeof window.vaulttvBridge?.isCastAvailable === 'function'
const CAST_SUPPORTED = !IS_ELECTRON && !IS_FIRETV && !NATIVE_CAST

const CastContext = createContext(null)

// Google's built-in "just play this URL" receiver — no custom Cast Receiver
// app needed for a first pass. Handles common containers (mp4/HLS) directly.
const RECEIVER_APP_ID_KEY = 'CC1AD845' // chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID

/**
 * Loads the Google Cast Web Sender SDK and exposes session/remote-playback
 * state + controls. Browsers only (see CAST_SUPPORTED) — Electron doesn't
 * ship Google's proprietary Cast component, and FireTV has no use for
 * casting from itself. Android phones/tablets DO get it.
 * See project memory for why the desktop app needs a different (castv2
 * protocol) approach entirely — this context intentionally does not attempt
 * that; it's inert outside a real Chrome/Edge browser tab.
 */
export function CastProvider({ children }) {
  const [available, setAvailable] = useState(false)   // SDK loaded + a receiver exists on the network
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [remoteTime, setRemoteTime] = useState(0)
  const [remoteDuration, setRemoteDuration] = useState(0)
  const [remotePlaying, setRemotePlaying] = useState(false)

  const playerRef = useRef(null)        // cast.framework.RemotePlayer
  const controllerRef = useRef(null)    // cast.framework.RemotePlayerController

  useEffect(() => {
    if (!CAST_SUPPORTED) return
    if (window.cast?.framework) { initCastApi(); return }

    // __onGCastApiAvailable must exist before the script loads regardless —
    // safe to reassign every effect run (idempotent, no dedup needed there).
    window['__onGCastApiAvailable'] = function (isAvailable) {
      if (isAvailable) initCastApi()
    }
    // The script tag itself must NOT be injected twice — React StrictMode's
    // dev-mode double-invoke of effects reran this before the async script
    // load from the first run finished (so the window.cast?.framework guard
    // above hadn't caught it yet), which loaded the SDK twice and threw
    // "the name 'google-cast-button' has already been used with this registry"
    // from its second custom-element registration attempt.
    const CAST_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    if (!document.querySelector(`script[src="${CAST_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = CAST_SRC
      document.head.appendChild(script)
    }

    function initCastApi() {
      const ctx = window.cast.framework.CastContext.getInstance()
      ctx.setOptions({
        receiverApplicationId: RECEIVER_APP_ID_KEY,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      })

      ctx.addEventListener(
        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        e => {
          const CS = window.cast.framework.CastState
          setAvailable(e.castState !== CS.NO_DEVICES_AVAILABLE)
          if (e.castState === CS.NOT_CONNECTED) { setConnected(false); setConnecting(false) }
        }
      )

      const player = new window.cast.framework.RemotePlayer()
      const controller = new window.cast.framework.RemotePlayerController(player)
      playerRef.current = player
      controllerRef.current = controller

      controller.addEventListener(
        window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        () => {
          setConnected(player.isConnected)
          setConnecting(false)
          setDeviceName(ctx.getCurrentSession()?.getCastDevice()?.friendlyName || '')
          if (!player.isConnected) { setRemoteTime(0); setRemoteDuration(0); setRemotePlaying(false) }
        }
      )
      controller.addEventListener(
        window.cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
        () => setRemoteTime(player.currentTime || 0)
      )
      controller.addEventListener(
        window.cast.framework.RemotePlayerEventType.DURATION_CHANGED,
        () => setRemoteDuration(player.duration || 0)
      )
      controller.addEventListener(
        window.cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
        () => setRemotePlaying(!player.isPaused)
      )

      // Initial state — CAST_STATE_CHANGED only fires on transitions
      setAvailable(ctx.getCastState() !== window.cast.framework.CastState.NO_DEVICES_AVAILABLE)
    }

    return () => { delete window['__onGCastApiAvailable'] }
  }, [])

  // ── Native bridge (Android APK) ────────────────────────────────────────
  // CastController.java pushes state here rather than us polling it.
  useEffect(() => {
    if (!NATIVE_CAST) return
    setAvailable(!!window.vaulttvBridge.isCastAvailable())
    window.__castState = (isAvailable, isConnected, name) => {
      setAvailable(!!isAvailable)
      setConnected(!!isConnected)
      setConnecting(false)
      setDeviceName(name || '')
      if (!isConnected) { setRemoteTime(0); setRemoteDuration(0); setRemotePlaying(false) }
    }
    window.__castProgress = (pos, dur, playing) => {
      setRemoteTime(pos || 0)
      setRemoteDuration(dur || 0)
      setRemotePlaying(!!playing)
    }
    return () => { delete window.__castState; delete window.__castProgress }
  }, [])

  /** Opens the native device picker, resolves once a session is connected (or rejects if cancelled). */
  const requestSession = useCallback(async () => {
    setConnecting(true)
    try {
      await window.cast.framework.CastContext.getInstance().requestSession()
    } catch (e) {
      setConnecting(false)
      throw e
    }
  }, [])

  /** Loads a new media item onto the current (or freshly-requested) cast session. */
  const loadMedia = useCallback(async ({ url, title, poster, contentType = 'video/mp4' }) => {
    // Native path owns its own device picker, so there's no requestSession()
    // step here — CastController opens it when no session is live yet.
    if (NATIVE_CAST) {
      setConnecting(true)
      window.vaulttvBridge.castVideo(url, title || '', poster || '', contentType, 0)
      return
    }
    const ctx = window.cast.framework.CastContext.getInstance()
    if (!ctx.getCurrentSession()) await requestSession()
    const session = ctx.getCurrentSession()
    if (!session) return

    const mediaInfo = new window.chrome.cast.media.MediaInfo(url, contentType)
    mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata()
    mediaInfo.metadata.title = title || ''
    if (poster) mediaInfo.metadata.images = [new window.chrome.cast.Image(poster)]

    const request = new window.chrome.cast.media.LoadRequest(mediaInfo)
    await session.loadMedia(request)
  }, [requestSession])

  const play = useCallback(() => {
    if (NATIVE_CAST) return window.vaulttvBridge.castPlayPause()
    if (playerRef.current?.isPaused) controllerRef.current?.playOrPause()
  }, [])
  const pause = useCallback(() => {
    if (NATIVE_CAST) return window.vaulttvBridge.castPlayPause()
    if (!playerRef.current?.isPaused) controllerRef.current?.playOrPause()
  }, [])
  const seek = useCallback(sec => {
    if (NATIVE_CAST) return window.vaulttvBridge.castSeek(sec)
    if (playerRef.current) { playerRef.current.currentTime = sec; controllerRef.current?.seek() }
  }, [])
  const stopCasting = useCallback(() => {
    if (NATIVE_CAST) return window.vaulttvBridge.castStop()
    window.cast?.framework?.CastContext.getInstance().endCurrentSession(true)
  }, [])

  return (
    <CastContext.Provider value={{
      available, connected, connecting, deviceName,
      remoteTime, remoteDuration, remotePlaying,
      requestSession, loadMedia, play, pause, seek, stopCasting,
    }}>
      {children}
    </CastContext.Provider>
  )
}

export function useCast() {
  const ctx = useContext(CastContext)
  // Never crash for callers on platforms where CastProvider isn't mounted deep
  // enough / SDK never loaded — every field just reads as "not available".
  return ctx || {
    available: false, connected: false, connecting: false, deviceName: '',
    remoteTime: 0, remoteDuration: 0, remotePlaying: false,
    requestSession: async () => {}, loadMedia: async () => {},
    play: () => {}, pause: () => {}, seek: () => {}, stopCasting: () => {},
  }
}
