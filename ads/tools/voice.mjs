// Makes the voice-over and sound effects for the ads with ElevenLabs.
//
//   ELEVENLABS_API_KEY in ../../.env (or the environment), then:
//   node voice.mjs                     # every ad that has a voice script
//   node voice.mjs tm-1-voice-notes    # just one
//   node voice.mjs --list              # the voices in your ElevenLabs account
//
// Each ad page carries its script in <script type="application/json" id="voice">:
//   { "lines": [{ "t": 0.4, "who": "narrator", "text": "…" }], "sfx": [{ "t": 3.7, "name": "ping", "vol": 0.6 }] }
// Clips are cached by voice + text, so editing one line only re-makes that line.
// It writes ../voice/<ad>/manifest.json, which export.mjs mixes into the MP4
// and ad.js plays while you preview.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const here = path.dirname(fileURLToPath(import.meta.url))
const adsDir = path.resolve(here, '..')
const voiceDir = path.join(adsDir, 'voice')
const cfg = JSON.parse(fs.readFileSync(path.join(voiceDir, 'voices.json'), 'utf8'))

function keyFromEnv() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  for (const f of ['.env', '.env.local']) {
    const p = path.resolve(adsDir, '..', f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)
    if (m) return m[1].trim()
  }
  return ''
}
const KEY = keyFromEnv()
if (!KEY) { console.error('No ELEVENLABS_API_KEY. Add ELEVENLABS_API_KEY=... to the project .env and run again.'); process.exit(1) }
const api = (p, init = {}) => fetch('https://api.elevenlabs.io' + p, { ...init, headers: { 'xi-api-key': KEY, ...(init.headers || {}) } })

if (process.argv.includes('--list')) {
  const r = await api('/v1/voices')
  if (!r.ok) { console.error(r.status, await r.text()); process.exit(1) }
  for (const v of (await r.json()).voices) console.log(`${v.voice_id}  ${v.name}  ${Object.values(v.labels || {}).join(', ')}`)
  process.exit(0)
}

// Length of an audio file in seconds (ffmpeg prints it while reading).
function seconds(file) {
  const r = spawnSync(ffmpegPath, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' })
  const all = [...(r.stderr || '').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop()
  return all ? (+all[1]) * 3600 + (+all[2]) * 60 + (+all[3]) : 0
}

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)
const cacheDir = path.join(voiceDir, '_cache')
fs.mkdirSync(cacheDir, { recursive: true })

async function speak(who, text) {
  const v = cfg.voices[who]
  if (!v) throw new Error(`No voice called "${who}" in voices.json`)
  const file = path.join(cacheDir, `${who}-${hash(v.id + JSON.stringify(v.settings) + cfg.model + text)}.mp3`)
  if (!fs.existsSync(file)) {
    const r = await api(`/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: cfg.model, voice_settings: { use_speaker_boost: true, ...v.settings } }),
    })
    if (!r.ok) throw new Error(`ElevenLabs refused "${text}" (${who}): ${r.status} ${await r.text()}`)
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    console.log(`  voice  ${who}: ${text}`)
  }
  return file
}

async function sfx(name) {
  const prompt = cfg.sfx[name]
  if (!prompt) throw new Error(`No sound called "${name}" in voices.json`)
  const file = path.join(cacheDir, `sfx-${name}-${hash(prompt)}.mp3`)
  if (!fs.existsSync(file)) {
    const r = await api('/v1/sound-generation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, duration_seconds: 1.2, prompt_influence: 0.6 }),
    })
    if (!r.ok) throw new Error(`ElevenLabs refused sound "${name}": ${r.status} ${await r.text()}`)
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    console.log(`  sound  ${name}`)
  }
  return file
}

const pages = fs.readdirSync(adsDir).filter((f) => f.endsWith('.html') && f !== 'index.html')
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
for (const page of pages) {
  const name = page.replace(/\.html$/, '')
  if (wanted.length && !wanted.includes(name)) continue
  const html = fs.readFileSync(path.join(adsDir, page), 'utf8')
  const m = html.match(/<script type="application\/json" id="voice">([\s\S]*?)<\/script>/)
  if (!m) continue
  const script = JSON.parse(m[1])
  const dur = +(html.match(/data-dur="([\d.]+)"/) || [])[1]
  console.log(name)
  const outDir = path.join(voiceDir, name)
  fs.mkdirSync(outDir, { recursive: true })
  const clips = []
  for (const l of script.lines || []) {
    const src = await speak(l.who, l.text)
    const file = `${clips.length}-${l.who}.mp3`
    fs.copyFileSync(src, path.join(outDir, file))
    clips.push({ t: l.t, file, kind: 'voice', who: l.who, text: l.text, len: +seconds(src).toFixed(2), vol: l.vol ?? 1 })
  }
  for (const s of script.sfx || []) {
    const src = await sfx(s.name)
    const file = `sfx-${s.name}.mp3`
    fs.copyFileSync(src, path.join(outDir, file))
    clips.push({ t: s.t, file, kind: 'sfx', name: s.name, len: +seconds(src).toFixed(2), vol: s.vol ?? 0.5 })
  }
  // Warn when a line runs into the next one, or past the end.
  const voices = clips.filter((c) => c.kind === 'voice').sort((a, b) => a.t - b.t)
  voices.forEach((c, i) => {
    const next = voices[i + 1]?.t ?? dur
    const over = c.t + c.len - next
    if (over > 0.05) console.warn(`  ! "${c.text}" runs ${over.toFixed(2)}s into the next line. Move the next line later or shorten this one.`)
  })
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ ad: name, dur, clips }, null, 2))
  console.log(`  → voice/${name}/manifest.json (${clips.length} clips)`)
}
