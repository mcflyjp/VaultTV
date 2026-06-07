import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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
import { ContextMenuProvider } from './context/ContextMenuContext'
import { TraktProvider } from './context/TraktContext'
import { PlayerProvider } from './context/PlayerContext'
import { LocalLibraryProvider } from './context/LocalLibraryContext'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LayoutProvider>
          <DashboardProvider>
            <WatchHistoryProvider>
            <LibraryProvider>
            <QueueProvider>
            <RatingsProvider>
            <PlaylistProvider>
            <ArtworkProvider>
            <ContextMenuProvider>
            <ParentalProvider>
              <LocalLibraryProvider>
              <PlayerProvider>
              <TraktProvider>
              <AddonsProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </AddonsProvider>
              </TraktProvider>
              </PlayerProvider>
              </LocalLibraryProvider>
            </ParentalProvider>
            </ContextMenuProvider>
            </ArtworkProvider>
            </PlaylistProvider>
            </RatingsProvider>
            </QueueProvider>
            </LibraryProvider>
            </WatchHistoryProvider>
          </DashboardProvider>
        </LayoutProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
