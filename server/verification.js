// ── Is ID verification real yet? ─────────────────────────────────────
// It is not. /api/auth/verify-id sets id_verified after checking nothing,
// so any signed-in member can award themselves the badge. While that is
// true the flag must not gate anything: a check that a user can satisfy by
// asking for it is worse than no check, because the rest of the product
// treats it as proof.
//
// So verified-only jobs stay open and the badge is worth no points. The
// column, the routes and the job flag all stay exactly where they are; flip
// this (and the matching flag in src/verification.js) once a real provider
// is behind the endpoint, and the gates come back on their own.
export const VERIFICATION_IS_REAL = false
