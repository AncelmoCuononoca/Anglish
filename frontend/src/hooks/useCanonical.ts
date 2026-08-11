import { useEffect } from 'react'

// Point the page's <link rel="canonical"> at the non-www URL for THIS route.
// index.html ships a default canonical (the homepage); public sub-routes call
// this so Google indexes them under their own canonical URL instead of the
// homepage's. Restores the previous value on unmount (SPA navigation).
export function useCanonical(path: string) {
  useEffect(() => {
    const href = `https://anglishme.com${path}`
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    let created = false
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
      created = true
    }
    const prev = link.href
    link.href = href
    return () => {
      if (created) link!.remove()
      else link!.href = prev
    }
  }, [path])
}
