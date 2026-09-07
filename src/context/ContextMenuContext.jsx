/**
 * ContextMenuContext
 *
 * Tracks which right click menu is open and where it should be drawn. Kept
 * global so only one menu can be open at a time and a click anywhere else
 * closes it, rather than every card managing its own.
 */

import { createContext, useContext, useState, useEffect } from 'react'

const ContextMenuContext = createContext(null)

export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState({ visible: false, item: null, x: 0, y: 0 })

  function show(item, x, y) { setMenu({ visible: true, item, x, y }) }
  function hide() { setMenu(m => ({ ...m, visible: false })) }

  // Dismiss on scroll or Escape
  useEffect(() => {
    if (!menu.visible) return
    const dismiss = () => hide()
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('keydown', e => e.key === 'Escape' && dismiss())
    return () => {
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [menu.visible])

  return (
    <ContextMenuContext.Provider value={{ menu, show, hide }}>
      {children}
    </ContextMenuContext.Provider>
  )
}

export function useContextMenu() { return useContext(ContextMenuContext) }
