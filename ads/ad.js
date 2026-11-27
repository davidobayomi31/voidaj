/* Tiny timeline engine for the Voidaj ads.
 *
 * Mark things up in HTML, no build step:
 *   data-s / data-e   a scene: gets class "on" between those seconds
 *   data-t / data-until   any element: gets class "in" from t until `until`
 *   data-type + data-t    text that types itself (data-cps = characters/second)
 * Plus Ad.cursor() for a pointer that follows keyframes and Ad.hook() for custom code.
 * Everything is a pure function of the clock, so scrubbing and restarting just work.
 *
 * URL options:  ?clean  hide the controls (for screen recording)
 *               ?loop   loop forever        ?t=6  start paused at 6 seconds
 */
(() => {
  const q = new URLSearchParams(location.search)
  const frame = document.querySelector('.frame')
  const W = +frame.dataset.w, H = +frame.dataset.h, DUR = +frame.dataset.dur
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

  frame.style.width = W + 'px'
  frame.style.height = H + 'px'

  const timed = [...frame.querySelectorAll('[data-t]')].map((el) => ({ el, t: +el.dataset.t, u: el.dataset.until ? +el.dataset.until : Infinity }))
  const scenes = [...frame.querySelectorAll('[data-s]')].map((el) => ({ el, s: +el.dataset.s, e: +el.dataset.e }))
  const typers = [...frame.querySelectorAll('[data-type]')].map((el) => ({ el, full: el.textContent, t: +el.dataset.t, cps: +(el.dataset.cps || 18) }))
  typers.forEach((x) => { x.el.textContent = '' })
  const hooks = []

  let t = 0
  let playing = true
  let last = performance.now()
  const loop = q.has('loop')

  // ── controls ──────────────────────────────────────────────
  const ctl = document.createElement('div')
  ctl.className = 'ctl'
  ctl.innerHTML = '<button data-a="play" aria-label="Play or pause">❚❚</button><button data-a="restart" aria-label="Restart">↺</button><input type="range" min="0" max="1000" value="0" aria-label="Timeline"><span class="time">0.0 / ' + DUR.toFixed(0) + 's</span>'
  document.body.appendChild(ctl)
  if (q.has('clean')) ctl.style.display = 'none'
  const range = ctl.querySelector('input')
  const timeLbl = ctl.querySelector('.time')
  const playBtn = ctl.querySelector('[data-a=play]')
  const setPlaying = (p) => { playing = p; last = performance.now(); playBtn.textContent = p ? '❚❚' : '▶' }
  ctl.addEventListener('click', (e) => {
    const a = e.target.dataset.a
    if (a === 'play') { if (t >= DUR) seek(0); setPlaying(!playing) }
    if (a === 'restart') { seek(0); setPlaying(true) }
  })
  range.addEventListener('input', () => { setPlaying(false); seek((range.value / 1000) * DUR) })
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); playBtn.click() }
    if (e.key === 'r' || e.key === 'R') ctl.querySelector('[data-a=restart]').click()
    if (e.key === 'ArrowRight') { setPlaying(false); seek(t + 0.5) }
    if (e.key === 'ArrowLeft') { setPlaying(false); seek(t - 0.5) }
  })

  // ── fit the fixed-size frame to the window ────────────────
  function fit() {
    const room = q.has('clean') ? 0 : 56
    const de = document.documentElement
    const s = Math.min(de.clientWidth / W, (de.clientHeight - room) / H)
    frame.style.transform = `translate(-50%, -50%) scale(${s})`
    frame.style.top = `calc(50% - ${room / 2}px)`
  }
  addEventListener('resize', fit)

  // ── apply the state for time t ────────────────────────────
  function apply() {
    for (const x of timed) x.el.classList.toggle('in', t >= x.t && t < x.u)
    for (const s of scenes) s.el.classList.toggle('on', t >= s.s && t < s.e)
    for (const x of typers) x.el.textContent = x.full.slice(0, clamp(Math.floor((t - x.t) * x.cps), 0, x.full.length))
    for (const h of hooks) h(t)
    range.value = (t / DUR) * 1000
    timeLbl.textContent = t.toFixed(1) + ' / ' + DUR.toFixed(0) + 's'
  }
  function seek(x) { t = clamp(x, 0, DUR); apply() }

  let fitW = 0, fitH = 0
  function tick(now) {
    const de = document.documentElement
    if (fitW !== de.clientWidth || fitH !== de.clientHeight) { fitW = de.clientWidth; fitH = de.clientHeight; fit() }
    if (playing) {
      t += (now - last) / 1000
      if (t >= DUR) { if (loop) t = 0; else { t = DUR; setPlaying(false) } }
      apply()
    }
    last = now
    requestAnimationFrame(tick)
  }

  // ── public helpers ────────────────────────────────────────
  // A pointer that glides between keyframes: [{t, x, y, click?}, ...].
  // Visible from the first key to the last key (+0.4s).
  function cursor(el, keys) {
    const h = (now) => {
      const first = keys[0], lastK = keys[keys.length - 1]
      const vis = now >= first.t && now <= lastK.t + 0.4
      el.style.opacity = vis ? 1 : 0
      let a = first, b = first
      for (let i = 0; i < keys.length; i++) {
        if (now >= keys[i].t) { a = keys[i]; b = keys[i + 1] || keys[i] }
      }
      const k = b === a ? 1 : ease(clamp((now - a.t) / (b.t - a.t), 0, 1))
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k
      el.style.transform = `translate(${x}px, ${y}px)`
      el.classList.toggle('click', keys.some((c) => c.click && now >= c.t && now < c.t + 0.3))
    }
    hooks.push(h)
    h(t)
  }

  // A cube made of six shaded faces, for the little 3D characters.
  // faces: optional { front: '<html>' } so you can drop eyes/mouth on a face.
  function cube(w, h, d, color, faces = {}) {
    const el = document.createElement('div')
    el.className = 'cube'
    el.style.cssText = `width:${w}px;height:${h}px;--c:${color}`
    const defs = [
      ['front', `translateZ(${d / 2}px)`, w, h, 1],
      ['back', `rotateY(180deg) translateZ(${d / 2}px)`, w, h, 0.62],
      ['right', `rotateY(90deg) translateZ(${w / 2}px)`, d, h, 0.8],
      ['left', `rotateY(-90deg) translateZ(${w / 2}px)`, d, h, 0.72],
      ['top', `rotateX(90deg) translateZ(${h / 2}px)`, w, d, 1.14],
      ['bottom', `rotateX(-90deg) translateZ(${h / 2}px)`, w, d, 0.5],
    ]
    for (const [name, tr, fw, fh, b] of defs) {
      const f = document.createElement('div')
      f.className = 'face ' + name
      f.style.cssText = `width:${fw}px;height:${fh}px;left:${(w - fw) / 2}px;top:${(h - fh) / 2}px;transform:${tr};background:${color};filter:brightness(${b})`
      if (faces[name]) {
        const inner = document.createElement('div')
        inner.className = 'inner'
        inner.innerHTML = faces[name]
        f.appendChild(inner)
      }
      el.appendChild(f)
    }
    return el
  }

  // ── sound while previewing ────────────────────────────────
  // voice/<ad>/manifest.json (made by tools/voice.mjs) lists the voice lines
  // and effects with their start times. Needs the page served over http
  // (python3 -m http.server in ads/), not opened as a file. Off in ?clean.
  const sounds = []
  if (!q.has('clean')) {
    const name = location.pathname.split('/').pop().replace(/\.html$/, '')
    fetch(`voice/${name}/manifest.json`).then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m) return
      for (const c of m.clips) { const a = new Audio(`voice/${name}/${c.file}`); a.volume = Math.min(1, c.vol); a.preload = 'auto'; sounds.push({ ...c, a }) }
    }).catch(() => {})
  }
  let heard = 0
  hooks.push((now) => {
    if (!sounds.length) return
    if (!playing || now < heard - 0.05) { for (const s of sounds) { if (!s.a.paused) s.a.pause() } }
    if (playing) for (const s of sounds) {
      if (s.t >= heard && s.t < now) { s.a.currentTime = 0; s.a.play().catch(() => {}) }
    }
    heard = now
  })

  window.Ad = { cursor, cube, hook: (fn) => { hooks.push(fn); fn(t) }, seek, ease, clamp, get t() { return t } }

  fit()
  if (q.has('t')) { setPlaying(false); seek(+q.get('t')) } else { apply() }
  requestAnimationFrame((n) => { last = n; tick(n) })
})()
