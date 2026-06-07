import { Routes, Route, Navigate } from 'react-router-dom'
import { useTheme } from './context/ThemeContext'
import { useLayout } from './context/LayoutContext'
import Sidebar from './components/Sidebar'
import ContextMenu from './components/ContextMenu'
import VideoPlayer from './components/VideoPlayer'
import Home from './pages/Home'
import Search from './pages/Search'
import Detail from './pages/Detail'
import Settings from './pages/Settings'
import Addons from './pages/Addons'
import Library from './pages/Library'
import Queue from './pages/Queue'
import Playlists from './pages/Playlists'

export default function App() {
  const { theme } = useTheme()
  const { density } = useLayout()

  return (
    <div data-theme={theme} data-density={density} style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/detail/:type/:id" element={<Detail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/addons" element={<Addons />} />
          <Route path="/library/:section" element={<Library />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:id" element={<Playlists />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ContextMenu />
      <VideoPlayer />
    </div>
  )
}
