// What search engines see for each page: a real title and description, and
// "noindex" on pages that only show VOIDAJ's built-in sample content (the
// demo communities, events, posts and people), so Google stops listing those
// as if they were real (Nuel, Nov 26: "Why are these in google search").
import { useEffect } from 'react'
import { USERS, COMMUNITIES, EVENTS, POSTS, OPPORTUNITIES } from './data/seed.js'

const SITE = 'VOIDAJ'
const DEFAULT_TITLE = 'VOIDAJ — People, Communities & Opportunities'
const DEFAULT_DESCRIPTION = 'VOIDAJ connects people, communities and opportunities: find your people, local events and quick jobs near you.'

const SAMPLE_IDS = new Set([...USERS, ...COMMUNITIES, ...EVENTS, ...POSTS, ...OPPORTUNITIES].map((x) => x?.id).filter(Boolean))
export const isSampleId = (id) => !!id && SAMPLE_IDS.has(id)

function meta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`)
  if (content == null) { el?.remove(); return }
  if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

// useSeo({ title, description, noindex }). Pass nothing while a page is
// still loading; the defaults come back when the page goes away.
export function useSeo({ title, description, noindex } = {}) {
  useEffect(() => {
    document.title = title ? `${title} - ${SITE}` : DEFAULT_TITLE
    meta('description', description ? String(description).replace(/\s+/g, ' ').trim().slice(0, 160) : DEFAULT_DESCRIPTION)
    meta('robots', noindex ? 'noindex, follow' : null)
    return () => { document.title = DEFAULT_TITLE; meta('description', DEFAULT_DESCRIPTION); meta('robots', null) }
  }, [title, description, noindex])
}
