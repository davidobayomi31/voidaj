// ── Is ID verification real? ─────────────────────────────────────────
// Yes: members send a photo of their ID and a selfie, and the VOIDAJ team
// approves it on the Admin page (server/id-checks.js). Matches the server
// flag in server/verification.js.
export const VERIFICATION_IS_REAL = true

// What to call the badge in the interface.
export const verifiedLabel = () => (VERIFICATION_IS_REAL ? 'Verified' : 'Demo badge')
export const verifiedLongLabel = () => (VERIFICATION_IS_REAL ? 'ID verified' : 'Demo badge — not a real ID check')

// Whether to paint the trust tick at all. While the badge is self-assigned
// it would be a lie next to someone's name, so it stays off.
export const showVerifiedTick = () => VERIFICATION_IS_REAL
