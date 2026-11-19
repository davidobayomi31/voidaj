// VOIDAJ ID — Digital ID and Digital Card as one feature: a card with the
// member's photo, name, @username and verification, and a QR code that
// opens their VOIDAJ profile. Share it, show it from your phone, or save
// the QR as an image. Anyone who scans it lands back in VOIDAJ.
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { useApp } from '../state.jsx'
import { Avatar } from '../components/bits.jsx'
import { Icon } from '../components/Icons.jsx'
import { VoidajMark } from '../components/VoidajMark.jsx'
import { showVerifiedTick } from '../verification.js'

// A stable 12-digit number from the account id, printed like a card number.
const memberNo = (id) => {
  let h = 2166136261
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const n = String(h).padStart(10, '0') + String(h % 97).padStart(2, '0')
  return n.match(/.{4}/g).join(' ')
}
const profileUrl = (u) => `${window.location.origin}${u.handle ? `/u/${u.handle.replace(/^@/, '')}` : `/profile/${u.id}`}`

export default function IdCard() {
  const { user, profile, loading } = useApp()
  const [qr, setQr] = useState('')
  const [png, setPng] = useState('')
  const [copied, setCopied] = useState(false)
  const url = user ? profileUrl(user) : ''

  useEffect(() => {
    if (!url) return
    // Ink on white keeps it scannable in any light; high error correction
    // so a scuffed screen or print still reads.
    const opts = { errorCorrectionLevel: 'H', margin: 1, color: { dark: '#0b0b0bff', light: '#ffffffff' } }
    QRCode.toString(url, { ...opts, type: 'svg' }).then(setQr).catch(() => {})
    QRCode.toDataURL(url, { ...opts, width: 1024 }).then(setPng).catch(() => {})
  }, [url])

  if (loading) return <div className="page"><p className="meta-dim" style={{ marginTop: 40 }}>Loading…</p></div>
  if (!user) return <Navigate to="/auth?mode=login" replace />

  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: `${profile.name} on VOIDAJ`, text: 'Find me on VOIDAJ', url }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { window.prompt('Copy this link:', url) }
  }

  return (
    <div className="page id-page">
      <section className="page-head">
        <div>
          <h1><Icon name="badge-check" size={22} /> VOIDAJ ID</h1>
          <p className="meta-dim">Your digital card. Anyone who scans it goes straight to your profile.</p>
        </div>
      </section>

      {/* Shaped and finished like a real card (Nuel, Nov 13: "more card
          looking"): card proportions, a chip, a member number, a sheen. */}
      <div className="id-card-stage">
      <article className="id-card id-card-physical" aria-label="Your VOIDAJ ID card">
        <span className="id-sheen" aria-hidden="true" />
        <header className="id-card-top">
          <VoidajMark size={18} light />
          <span className="id-card-kind">MEMBER ID</span>
        </header>
        <div className="id-card-mid">
          <span className="id-chip" aria-hidden="true"><i /><i /><i /><i /></span>
          <div className="id-qr" aria-label="QR code to your profile" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
        <div className="id-card-person">
          <span className="id-photo"><Avatar user={profile} size={58} /></span>
          <div>
            <strong className="id-card-name">{profile.name}</strong>
            <span className="id-card-handle">{profile.handle}{profile.title ? ` · ${profile.title}` : ''}</span>
          </div>
        </div>
        <footer className="id-card-foot">
          <span><em>No.</em> {memberNo(user.id)}</span>
          <span><em>City</em> {profile.city || 'Lagos'}</span>
          <span><em>Since</em> {new Date(user.createdAt || Date.now()).getFullYear()}</span>
          {showVerifiedTick() && profile.idVerified
            ? <span className="id-verified"><Icon name="badge-check" size={13} /> Verified</span>
            : <span className="id-unverified">Not verified</span>}
        </footer>
      </article>
      </div>
      <p className="meta-dim id-url">{url.replace(/^https?:\/\//, '')}</p>

      <div className="id-actions">
        <button type="button" className="btn primary" onClick={share}><Icon name={copied ? 'check' : 'send'} size={15} /> {copied ? 'Link copied' : 'Share my ID'}</button>
        {png && <a className="btn ghost" href={png} download={`voidaj-${(profile.handle || 'id').replace(/^@/, '')}-qr.png`}><Icon name="arrow-down" size={15} /> Save QR code</a>}
        <Link to="/profile/me" className="btn ghost"><Icon name="user" size={15} /> View my profile</Link>
      </div>

      {showVerifiedTick() && !profile.idVerified && (
        <p className="meta-dim id-note">
          Want the <strong>Verified</strong> tick on your card? <Link to="/settings/verification">Verify your ID</Link>.
        </p>
      )}
    </div>
  )
}
