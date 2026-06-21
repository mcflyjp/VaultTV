import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter as BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './context/ThemeContext'
import { ParentalProvider } from './context/ParentalContext'
import { AddonsProvider } from './context/AddonsContext'
import { LayoutProvider } from './context/LayoutContext'
import { DashboardProvider } from './context/DashboardContext'
import { WatchHistoryProvider } from './context/WatchHistoryContext'
import { LibraryProvider } from './context/LibraryContext'
import { QueueProvider } from './context/QueueContext'
import { RatingsProvider } from './context/RatingsContext'
import { PlaylistProvider } from './context/PlaylistContext'
import { ArtworkProvider } from './context/ArtworkContext'
import { MetadataProvider } from './context/MetadataContext'
import { ContextMenuProvider } from './context/ContextMenuContext'
import { TraktProvider } from './context/TraktContext'
import { PlayerProvider } from './context/PlayerContext'
import { LocalLibraryProvider } from './context/LocalLibraryContext'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { useTrakt } from './context/TraktContext'
import { setTraktWatchlistSync } from './context/LibraryContext'
import { setTraktRatingSync } from './context/RatingsContext'
import { setTraktDashboardSync } from './context/TraktContext'
import { useDashboard } from './context/DashboardContext'
import { useEffect } from 'react'
import './index.css'
import App from './App.jsx'

/** Wires Trakt sync callbacks into LibraryContext and DashboardContext without circular imports */
function TraktBridge() {
  const { addToWatchlist, removeFromWatchlist, syncRating } = useTrakt()
  const { addAddonSection } = useDashboard()
  useEffect(() => {
    setTraktWatchlistSync(addToWatchlist, removeFromWatchlist)
    setTraktRatingSync(syncRating)
    setTraktDashboardSync(addAddonSection)
  }, [addToWatchlist, removeFromWatchlist, syncRating, addAddonSection])
  return null
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <LanguageProvider>
      <ThemeProvider>
        <LayoutProvider>
          <DashboardProvider>
            <WatchHistoryProvider>
            <LibraryProvider>
            <QueueProvider>
            <RatingsProvider>
            <PlaylistProvider>
            <ArtworkProvider>
            <MetadataProvider>
            <ContextMenuProvider>
            <ParentalProvider>
              <LocalLibraryProvider>
              <PlayerProvider>
              <TraktProvider>
              <AddonsProvider>
                <TraktBridge />
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </AddonsProvider>
              </TraktProvider>
              </PlayerProvider>
              </LocalLibraryProvider>
            </ParentalProvider>
            </ContextMenuProvider>
            </MetadataProvider>
            </ArtworkProvider>
            </PlaylistProvider>
            </RatingsProvider>
            </QueueProvider>
            </LibraryProvider>
            </WatchHistoryProvider>
          </DashboardProvider>
        </LayoutProvider>
      </ThemeProvider>
      </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
