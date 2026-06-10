/**
 * LanguageContext — preferred subtitle + audio language per user profile.
 *
 * Persisted to localStorage immediately; synced to Supabase user_settings
 * when signed in so the preference follows the user across devices.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const LS_KEY = 'vaulttv_lang_prefs'

export const LANGUAGES = [
  { code: 'en',    label: 'English'            },
  { code: 'es',    label: 'Spanish'            },
  { code: 'fr',    label: 'French'             },
  { code: 'de',    label: 'German'             },
  { code: 'it',    label: 'Italian'            },
  { code: 'pt',    label: 'Portuguese'         },
  { code: 'ja',    label: 'Japanese'           },
  { code: 'ko',    label: 'Korean'             },
  { code: 'zh',    label: 'Chinese'            },
  { code: 'ar',    label: 'Arabic'             },
  { code: 'ru',    label: 'Russian'            },
  { code: 'nl',    label: 'Dutch'              },
  { code: 'pl',    label: 'Polish'             },
  { code: 'sv',    label: 'Swedish'            },
  { code: 'tr',    label: 'Turkish'            },
  { code: 'hi',    label: 'Hindi'              },
]

const DEFAULT_PREFS = {
  subLang: 'en',       // ISO 639-1 code for subtitles
  audioLang: 'en',     // ISO 639-1 code for audio — default English
  autoFetchSubs: true, // Auto-download subs from OpenSubtitles when none found
}

const LanguageContext = createContext({ ...DEFAULT_PREFS, savePrefs: () => {} })

export function LanguageProvider({ children }) {
  const { user } = useAuth()

  const [prefs, setPrefs] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      return { ...DEFAULT_PREFS, ...stored }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  })

  // Load from Supabase on sign-in (cloud preferences win over local)
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('sub_lang, audio_lang, auto_fetch_subs')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        const cloud = {
          subLang:       data.sub_lang        ?? prefs.subLang,
          audioLang:     data.audio_lang      ?? prefs.audioLang,
          autoFetchSubs: data.auto_fetch_subs ?? prefs.autoFetchSubs,
        }
        setPrefs(cloud)
        localStorage.setItem(LS_KEY, JSON.stringify(cloud))
      })
      .catch(() => {}) // offline — keep local prefs
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePrefs(next) {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    localStorage.setItem(LS_KEY, JSON.stringify(merged))

    if (user) {
      await supabase.from('user_settings').upsert({
        user_id:         user.id,
        sub_lang:        merged.subLang,
        audio_lang:      merged.audioLang,
        auto_fetch_subs: merged.autoFetchSubs,
        updated_at:      new Date().toISOString(),
      }).catch(() => {})
    }
  }

  return (
    <LanguageContext.Provider value={{ ...prefs, savePrefs, LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
