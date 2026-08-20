// Strips a leading article ("The", "A", "An") before sorting/grouping titles
// alphabetically — so "The Guardians of the Galaxy" sorts under G, not T,
// matching how Plex/most media libraries alphabetize titles.
const LEADING_ARTICLE = /^(the|a|an)\s+/i

export function sortableTitle(title) {
  return (title || '').trim().replace(LEADING_ARTICLE, '')
}
