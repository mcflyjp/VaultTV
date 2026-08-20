import { useEffect } from 'react'

/**
 * FireTV D-pad focus/back trap for any popup/modal/dropdown.
 *
 * Two things a modal needs to behave correctly with a TV remote, neither of
 * which happens automatically:
 *
 * 1. Focus scope — MainActivity.java's spatial-nav JS already looks for a
 *    visible `[role="dialog"]` element and, when found, confines Up/Down/
 *    Left/Right to elements inside it (see getScope() in MainActivity.java).
 *    Without that attribute on the modal's root, the D-pad keeps navigating
 *    the page underneath — which is exactly why a version picker (or any
 *    other popup) "doesn't highlight correctly": focus is jumping to
 *    background cards the user can't see are behind the open dropdown.
 * 2. Back button — window.__vaulttvBack is the hook MainActivity calls on
 *    KEYCODE_BACK. Without overriding it while open, Back falls through to
 *    whatever the page already had it set to (usually "leave this screen"),
 *    instead of just closing the popup that's actually on top.
 *
 * Usage: give the modal's outer element role="dialog", then call this with
 * the same close handler passed to onClose, and `active` tied to whatever
 * state controls the modal being open. Restores the previous Back handler
 * automatically when the modal closes/unmounts, so nesting works correctly.
 */
export function useModalBackTrap(onClose, active = true) {
  useEffect(() => {
    if (!active) return
    const prevBack = window.__vaulttvBack
    window.__vaulttvBack = onClose
    return () => { window.__vaulttvBack = prevBack }
  }, [active, onClose])
}
