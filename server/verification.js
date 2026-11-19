// ── Is ID verification real? ─────────────────────────────────────────
// Yes: a member sends a photo of their ID and a selfie, and a person on the
// VOIDAJ team approves or rejects it on the Admin page (server/id-checks.js).
// Only an approved check sets users.id_verified, so the badge, the badge
// points and verified-only jobs are switched on. Set this back to false if
// reviews ever stop, and every gate switches off with it.
export const VERIFICATION_IS_REAL = true
