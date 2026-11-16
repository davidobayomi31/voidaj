// ── Is ID verification real yet? ─────────────────────────────────────
// It is not. `POST /api/auth/verify-id` sets a flag and checks nothing, so
// the badge is self-assigned. Until a real KYC provider is wired up, the
// badge must not look like a verified identity or unlock anything that
// depends on one — see server/verification.js for the matching server flag.
//
// To switch verification on for real: make this true, make the server flag
// true, and put a real check behind the endpoint. Nothing else changes.
export const VERIFICATION_IS_REAL = false

// What to call the badge in the interface.
export const verifiedLabel = () => (VERIFICATION_IS_REAL ? 'Verified' : 'Demo badge')
export const verifiedLongLabel = () => (VERIFICATION_IS_REAL ? 'ID verified' : 'Demo badge — not a real ID check')

// Whether to paint the trust tick at all. While the badge is self-assigned
// it would be a lie next to someone's name, so it stays off.
export const showVerifiedTick = () => VERIFICATION_IS_REAL
