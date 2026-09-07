/**
 * Sortable titles
 *
 * Strips a leading article, meaning "The", "A" or "An", before titles are
 * sorted or grouped alphabetically, so "The Guardians of the Galaxy" files
 * under G rather than T. Matches how Plex and most media libraries alphabetise,
 * and is what the A to Z rail groups on.
 */

const LEADING_ARTICLE = /^(the|a|an)\s+/i

export function sortableTitle(title) {
  return (title || '').trim().replace(LEADING_ARTICLE, '')
}
