// Renders ads to MP4, one frame at a time, so the result is smooth no matter how slow
// the computer is. Needs Google Chrome installed.
//
//   cd ads/tools && npm install
//   node export.mjs                       # every ad
//   (run voice.mjs first to give an ad its voice-over; without it the MP4 is silent)
//   node export.mjs qj-1-text-to-map      # just one (name without .html)
//   OUT=~/Desktop/clips FPS=30 node export.mjs
//
// How it stays exact: for each frame it jumps the ad's clock to t (Ad.seek) and then
// pins every CSS animation/transition to the matching moment, then takes a screenshot.
import puppeteer from 'puppeteer-core'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const adsDir = path.resolve(here, '..')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FPS = Number(process.env.FPS || 30)
const OUT = (process.env.OUT || path.join(os.homedir(), 'Desktop', 'voidaj-ads')).replace(/^~/, os.homedir())
const LIMIT = process.env.SECONDS ? Number(process.env.SECONDS) : null // render only the first N seconds (for tests)

const ALL = fs.readdirSync(adsDir).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, ''))
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL

fs.mkdirSync(OUT, { recursive: true })

// The ad's sound: the voice-over and effects from voice.mjs, each placed at its
// moment, or silence when an ad has none yet.
function audioArgs(name, seconds) {
  const mf = path.join(adsDir, 'voice', name, 'manifest.json')
  const silent = ['-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-map', '0:v', '-map', '1:a']
  if (!fs.existsSync(mf)) { console.log(`${name}: no voice yet (run tools/voice.mjs), exporting silent`); return silent }
  const clips = JSON.parse(fs.readFileSync(mf, 'utf8')).clips.filter((c) => c.t < seconds)
  if (!clips.length) return silent
  const inputs = clips.flatMap((c) => ['-i', path.join(adsDir, 'voice', name, c.file)])
  const parts = clips.map((c, i) => {
    const ms = Math.round(c.t * 1000)
    return `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${c.vol},adelay=${ms}|${ms}[a${i}]`
  })
  const mix = clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,apad,atrim=0:${seconds}[aout]`
  return [...inputs, '-filter_complex', [...parts, mix].join(';'), '-map', '0:v', '-map', '[aout]']
}

async function render(name) {
  const url = pathToFileURL(path.join(adsDir, name + '.html')).href + '?clean&t=0'
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    const { w, h, dur } = await page.evaluate(() => {
      const f = document.querySelector('.frame')
      return { w: +f.dataset.w, h: +f.dataset.h, dur: +f.dataset.dur }
    })
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => { window.__t0 = new Map() })

    const seconds = LIMIT ? Math.min(LIMIT, dur) : dur
    const total = Math.round(seconds * FPS)
    const outFile = path.join(OUT, name + (LIMIT ? '-test' : '') + '.mp4')
    const ff = spawn(ffmpegPath, [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      ...audioArgs(name, seconds),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] })
    const done = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))) })

    const started = Date.now()
    for (let i = 0; i < total; i++) {
      const t = i / FPS
      await page.evaluate((t) => {
        window.Ad.seek(t)
        for (const a of document.getAnimations()) {
          if (!window.__t0.has(a)) window.__t0.set(a, t)
          a.pause()
          a.currentTime = (t - window.__t0.get(a)) * 1000
        }
      }, t)
      const buf = await page.screenshot({ type: 'jpeg', quality: 95, captureBeyondViewport: false })
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
      if (i % 60 === 0) console.log(`${name}: ${i}/${total} frames (${Math.round((Date.now() - started) / 1000)}s)`)
    }
    ff.stdin.end()
    await done
    console.log(`${name}: done → ${outFile}`)
  } finally {
    await browser.close()
  }
}

for (const n of names) await render(n)
process.exit(0) // some Node versions keep a handle open after Chrome closes
