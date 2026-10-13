/**
 * WebDAV endpoint for RetroArch cloud saves
 *
 * Exposes a small WebDAV share that RetroArch's own Cloud Sync writes to, so
 * game saves follow the user between their PC, phone and TV.
 *
 * Deliberately a sync target rather than a live filesystem. RetroArch copies a
 * save down before play and pushes it back afterwards, so the file the emulator
 * reads and writes is always local: playing does not depend on this server
 * being reachable, and a dropped connection cannot corrupt a save mid write.
 *
 * Letting RetroArch own the syncing is also what makes this work on Android at
 * all. Scoped storage blocks one app from reading another's files, so VaultTV
 * could never copy RetroArch's saves itself, but RetroArch reading its own is
 * unrestricted.
 *
 * Only the verbs RetroArch uses are implemented: OPTIONS, PROPFIND, GET, HEAD,
 * PUT, MKCOL, DELETE and MOVE. This is not a general purpose WebDAV server.
 */

const fs   = require('fs')
const path = require('path')

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a request path to a real path inside `root`, or null if it escapes.
 *
 * This share is reachable through the public tunnel, so a traversal here would
 * expose the whole disk. Resolving first and then checking containment catches
 * encoded and relative forms alike, which string matching on the raw URL does
 * not.
 */
function safeResolve(root, urlPath) {
  let decoded
  try { decoded = decodeURIComponent(urlPath) } catch { return null }
  const resolved = path.resolve(root, '.' + path.posix.normalize('/' + decoded))
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return resolved
}

/** XML-escape text destined for a PROPFIND response body. */
function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

/** Percent-encode a path for an href, leaving the separators intact. */
function encodeHref(p) {
  return p.split('/').map(encodeURIComponent).join('/')
}

function propfindEntry(href, stat, isDir) {
  return `<D:response>
  <D:href>${xmlEscape(href)}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${xmlEscape(decodeURIComponent(href.split('/').filter(Boolean).pop() || ''))}</D:displayname>
      <D:getlastmodified>${stat.mtime.toUTCString()}</D:getlastmodified>
      ${isDir
        ? '<D:resourcetype><D:collection/></D:resourcetype>'
        : `<D:resourcetype/><D:getcontentlength>${stat.size}</D:getcontentlength>`}
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`
}

module.exports = { safeResolve, xmlEscape, encodeHref, propfindEntry }
