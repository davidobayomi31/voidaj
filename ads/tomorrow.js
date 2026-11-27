// Shared pieces for the "Tomorrow" ads: 3D people, faces over time, the
// puddle that grows while Tunde waits, and voice-note bubbles whose waves
// light up as they "play". Needs ad.js first.
const TM = (() => {
  const faceHTML = '<i class="brow lf"></i><i class="brow rt"></i><i class="eye lf"></i><i class="eye rt"></i><i class="mouth"></i>'
  function person(wrap, { skin, hair, shirt, brim }) {
    const root = document.createElement('div')
    root.className = 'char'
    const place = (el, l, t, z = 0) => { el.style.left = l + 'px'; el.style.top = t + 'px'; if (z) el.style.transform = `translateZ(${z}px)`; root.appendChild(el) }
    place(Ad.cube(480, 400, 260, shirt), 0, 330)
    place(Ad.cube(340, 340, 340, skin, { front: faceHTML }), 70, 0)
    place(Ad.cube(354, 120, 354, hair), 63, -34)
    if (brim) place(Ad.cube(300, 26, 170, hair), 90, 52, 255)
    wrap.appendChild(root)
    return root
  }
  const tunde = (wrap) => person(wrap, { skin: '#c98a5b', hair: '#1b1b1f', shirt: '#e8643a' })
  const chidi = (wrap) => { const c = person(wrap, { skin: '#a8683f', hair: '#2b3a4a', shirt: '#17a2a2', brim: true }); c.classList.add('chidi', 'happy'); return c }

  // [[t, 'sad'|'mad'|'happy'|'dead'|''], ...]
  function faces(el, keys, base = 'char') {
    Ad.hook((t) => { let f = ''; for (const [at, c] of keys) if (t >= at) f = c; el.className = base + ' ' + f })
  }

  // Puddle size by time: [[t, scale], ...], eased between keys. `fixedAt` stops the drips.
  function puddle(el, keys, fixedAt, stage) {
    Ad.hook((t) => {
      let s = keys[0][1]
      for (let i = 0; i < keys.length; i++) {
        const [a, sa] = keys[i], [b, sb] = keys[i + 1] || keys[i]
        if (t >= a) s = b === a ? sa : sa + (sb - sa) * Ad.clamp((t - a) / (b - a), 0, 1)
      }
      el.style.transform = `scale(${s}, ${s * 0.9})`
      stage.classList.toggle('fixed', t >= fixedAt)
    })
  }

  // A tag over someone's head that pops in at t.
  function tag(wrap, html, at) {
    const el = document.createElement('div')
    el.className = 'tag r-pop'; el.innerHTML = html
    wrap.appendChild(el)
    Ad.hook((t) => el.classList.toggle('in', t >= at))
  }

  // Voice-note bubbles: <div class="vn" data-play="4.2" data-len="2.4"> gets a
  // waveform that fills while it plays.
  function voiceNotes() {
    document.querySelectorAll('.vn').forEach((vn, n) => {
      const wave = vn.querySelector('.wave')
      const bars = []
      for (let i = 0; i < 26; i++) { const b = document.createElement('i'); b.style.setProperty('--h', (25 + Math.abs(Math.sin(i * 1.7 + n)) * 70) + '%'); wave.appendChild(b); bars.push(b) }
      const at = +vn.dataset.play, len = +vn.dataset.len
      Ad.hook((t) => { const k = Ad.clamp((t - at) / len, 0, 1); bars.forEach((b, i) => b.classList.toggle('on', i / bars.length < k)) })
    })
  }
  return { person, tunde, chidi, faces, puddle, tag, voiceNotes }
})()
