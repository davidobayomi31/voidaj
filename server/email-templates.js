// ── Email layout ─────────────────────────────────────────────────────
// One plain, professional layout for the emails VOIDAJ sends. It is built
// the way email clients need: tables, inline styles, no images or scripts
// (many clients block those), a wordmark in text instead of a logo file,
// and a light card that stays readable if a client forces dark mode.
// Every email also goes out as plain text, for clients that show only that.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// The page around every email. `preheader` is the grey preview line a
// mail app shows next to the subject.
function layout({ preheader, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>VOIDAJ</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f6;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="padding:0 4px 20px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:0.18em;color:#111114;">VOIDAJ</td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e6e6ea;border-radius:14px;padding:32px 28px;font-family:${FONT};color:#111114;">
${body}
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#7a7a85;">
        You got this email because someone used this address on VOIDAJ.<br>
        Questions? Write to <a href="mailto:hello@voidaj.com" style="color:#7a7a85;">hello@voidaj.com</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

// The 6-digit confirmation code. `minutes` is how long it stays good.
export function codeEmail({ name, code, minutes = 30 }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there'
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  const body = `        <p style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:700;">Confirm your email</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#44444d;">Hi ${esc(first)}, enter this code in VOIDAJ to finish confirming your email address.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="center" style="background:#f4f4f6;border-radius:10px;padding:20px 12px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:0.28em;color:#111114;">${esc(spaced)}</td>
        </tr></table>
        <p style="margin:20px 0 0;font-size:14px;line-height:21px;color:#44444d;">This code works for ${minutes} minutes and can be used once.</p>
        <p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e6e6ea;font-size:13px;line-height:20px;color:#7a7a85;">Didn’t make a VOIDAJ account? You can ignore this email. Nobody can use your address without this code. And never share the code: VOIDAJ staff will never ask you for it.</p>`
  const text = `Hi ${first},\n\nYour VOIDAJ confirmation code is ${code}. It works for ${minutes} minutes and can be used once.\n\nDidn’t make a VOIDAJ account? You can ignore this email. Never share this code: VOIDAJ staff will never ask you for it.\n\nVOIDAJ · hello@voidaj.com`
  return { subject: `${code} is your VOIDAJ code`, text, html: layout({ preheader: `Your code is ${code}. It works for ${minutes} minutes.`, body }) }
}

// A plain notice: a heading, a few paragraphs, and an optional highlighted
// box (a reason, a name). Used for the advert emails.
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there'

export function noticeEmail({ subject, name, heading, paragraphs, callout, preheader }) {
  const first = firstName(name)
  const p = (t, extra = '') => `        <p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#44444d;${extra}">${esc(t)}</p>`
  const box = callout
    ? `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td style="background:#f4f4f6;border-radius:10px;padding:14px 16px;font-size:14px;line-height:21px;color:#111114;"><span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7a7a85;margin-bottom:4px;">${esc(callout.label)}</span>${esc(callout.text)}</td></tr></table>`
    : ''
  const body = `        <p style="margin:0 0 12px;font-size:22px;line-height:28px;font-weight:700;">${esc(heading)}</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#44444d;">Hi ${esc(first)},</p>
${paragraphs.map((t) => p(t)).join('\n')}
${box}
        <p style="margin:8px 0 0;font-size:15px;line-height:23px;color:#44444d;">The VOIDAJ team</p>`
  const text = `Hi ${first},\n\n${paragraphs.join('\n\n')}${callout ? `\n\n${callout.label}: ${callout.text}` : ''}\n\nThe VOIDAJ team · hello@voidaj.com`
  return { subject, text, html: layout({ preheader: preheader || heading, body }) }
}

// Sent to the advertiser when their request comes in.
export function adReceivedEmail({ name, business }) {
  return noticeEmail({
    subject: 'We got your VOIDAJ advert request',
    name,
    heading: 'We got your advert request',
    preheader: `We’ve received your request to advertise ${business}.`,
    paragraphs: [
      `Thanks. We’ve received your request to advertise “${business}” on VOIDAJ. Someone on the team will look at it and reply here, usually within a day.`,
      'Nothing is charged until you’ve agreed the details with us.',
    ],
  })
}

// Sent when an admin approves or rejects the request.
export function adDecisionEmail({ name, business, approved, note }) {
  return approved
    ? noticeEmail({
        subject: 'Your VOIDAJ advert is live',
        name,
        heading: 'Your advert is live',
        preheader: `Your advert for ${business} has been approved.`,
        paragraphs: [`Good news: your advert for “${business}” has been approved and is live on VOIDAJ.`],
      })
    : noticeEmail({
        subject: 'About your VOIDAJ advert request',
        name,
        heading: 'We couldn’t approve your advert yet',
        preheader: `About your advert request for ${business}.`,
        paragraphs: [`We couldn’t approve your advert for “${business}” yet.`, 'You’re welcome to send a new request with that changed.'],
        callout: { label: 'Reason', text: note },
      })
}
