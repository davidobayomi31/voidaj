// The Privacy and Terms pages exist so Google and Apple can fetch them
// before allowing sign-in, and so a visitor can read them before joining.
// The thing that would quietly break that is a guard sneaking in, so these
// tests render each page with no user in context and check it still shows.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Privacy from './Privacy.jsx'
import Terms from './Terms.jsx'
import { CHARTER } from '../data/seed.js'
import { CONTACT_EMAIL } from '../contact.js'

const show = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Terms', () => {
  it('renders for a signed-out visitor', () => {
    show(<Terms />)
    expect(screen.getByRole('heading', { name: 'Terms and Conditions of Use', level: 1 })).toBeTruthy()
    // All of Nuel's 18 sections, plus User Acceptance.
    for (let n = 1; n <= 18; n++) expect(screen.getByRole('heading', { name: new RegExp(`^${n}\\. `), level: 2 })).toBeTruthy()
  })

  it('shows every line of the Charter, from the one source', () => {
    show(<Terms />)
    for (const line of CHARTER) expect(screen.getByText(line)).toBeTruthy()
  })

  it('says what the Verified badge does and does not mean', () => {
    show(<Terms />)
    expect(screen.getByText(/not a background check/i)).toBeTruthy()
  })

  it('gives a contact address', () => {
    show(<Terms />)
    expect(screen.getAllByText(CONTACT_EMAIL).length).toBeGreaterThan(0)
  })
})

describe('Privacy', () => {
  it('renders for a signed-out visitor', () => {
    show(<Privacy />)
    expect(screen.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeTruthy()
  })

  it('is honest that deletion leaves posts behind', () => {
    show(<Privacy />)
    expect(screen.getByText(/Former member/)).toBeTruthy()
  })

  it('says what visitor counting there is, and that there is no other tracking', () => {
    show(<Privacy />)
    expect(screen.getByText(/We count visits, and nothing more/i)).toBeTruthy()
    expect(screen.getByText(/no Google Analytics, no advertising pixels/i, { exact: false })).toBeTruthy()
  })

  it('warns that uploaded images stay reachable by link', () => {
    show(<Privacy />)
    expect(screen.getByText(/not password-protected/i)).toBeTruthy()
  })

  it('gives a contact address', () => {
    show(<Privacy />)
    expect(screen.getByText(CONTACT_EMAIL)).toBeTruthy()
  })
})
