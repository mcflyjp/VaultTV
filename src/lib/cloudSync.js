/**
 * VaultTV Cloud Sync — Supabase watch_progress table
 *
 * Mirrors the companion's progress format so WatchHistoryContext can treat
 * both sources identically. When a user is signed in, history is synced here
 * so any device they log into picks it up automatically.
 *
 * Schema columns map to WatchHistoryContext fields:
 *   tmdb_id       ↔  id
 *   item_type     ↔  type
 *   progress_sec  ↔  progressSec
 *   duration_sec  ↔  durationSec
 *   last_stream   ↔  lastStream
 */

import { supabase } from './supabase'

/** Convert a DB row → WatchHistoryContext entry */
function rowToEntry(row) {
  return {
    id:          row.tmdb_id,
    type:        row.item_type,
    title:       row.title       || '',
    poster:      row.poster      || null,
    progressSec: Number(row.progress_sec),
    durationSec: Number(row.duration_sec),
    progress:    Number(row.progress),
    lastStream:  row.last_stream || null,
    timestamp:   Number(row.timestamp),
  }
}

/** Convert a WatchHistoryContext entry → DB upsert payload */
function entryToRow(entry, userId) {
  return {
    user_id:      userId,
    item_type:    entry.type,
    tmdb_id:      String(entry.id),
    title:        entry.title        || null,
    poster:       entry.poster       || null,
    progress_sec: entry.progressSec  || 0,
    duration_sec: entry.durationSec  || 0,
    progress:     entry.progress     || 0,
    last_stream:  entry.lastStream   || null,
    timestamp:    entry.timestamp    || Date.now(),
    updated_at:   new Date().toISOString(),
  }
}

/**
 * Pull all progress rows for the current user.
 * Returns an array of WatchHistoryContext-shaped entries, or [] on error.
 */
export async function cloudFetchProgress() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('watch_progress')
    .select('*')
    .eq('user_id', user.id)
    .order('timestamp', { ascending: false })
    .limit(100)

  if (error) {
    console.warn('[cloudSync] fetch error:', error.message)
    return []
  }
  return (data || []).map(rowToEntry)
}

/**
 * Upsert an array of WatchHistoryContext entries to the cloud.
 * Skips silently if not signed in. Fire-and-forget safe.
 * @param {Array} entries
 */
export async function cloudPushProgress(entries) {
  if (!entries?.length) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const rows = entries.map(e => entryToRow(e, user.id))
  const { error } = await supabase
    .from('watch_progress')
    .upsert(rows, { onConflict: 'user_id,item_type,tmdb_id' })

  if (error) console.warn('[cloudSync] push error:', error.message)
}

/**
 * Delete a single progress entry from the cloud.
 * @param {string|number} id  TMDB id
 * @param {string} type       'movie' | 'tv'
 */
export async function cloudDeleteProgress(id, type) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('watch_progress')
    .delete()
    .eq('user_id', user.id)
    .eq('item_type', type)
    .eq('tmdb_id', String(id))

  if (error) console.warn('[cloudSync] delete error:', error.message)
}
