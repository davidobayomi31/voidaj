// The map behind Home's hero (Nuel, Nov 27: use the hero's background as a
// map, with a way to see it clear). A Google/Apple-style street map: OpenFreeMap's
// "liberty" style by day and its dark style at night. Both are free,
// with no key and no account. Loaded only on Home, after the page is up.
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' }
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function HeroMap({ lon, lat, zoom = 11.6, mode = 'light', label }) {
  const box = useRef(null)
  const map = useRef(null)

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current, style: STYLES[mode] || STYLES.light, center: [lon, lat], zoom: zoom - 1.2,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, maxPitch: 0,
      // The page keeps scrolling over the map until it is revealed (CSS turns pointer events on).
      cooperativeGestures: false,
    })
    map.current = m
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const dot = document.createElement('span')
    dot.className = 'hm-dot'
    new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(m)
    // Ease in to the city, so it arrives with a little life.
    m.once('load', () => m.easeTo({ center: [lon, lat], zoom, duration: reduced() ? 0 : 1800 }))
    return () => { m.remove(); map.current = null }
  }, [lon, lat, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="hero-map" role="region" aria-label={label || 'Map of your city'} />
}
