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
    expect(screen.getByRole('heading', { name: 'Terms of use', level: 1 })).toBeTruthy()
  })

  it('shows every line of the Charter, from the one source', () => {
    show(<Terms />)
    for (const line of CHARTER) expect(screen.getByText(line)).toBeTruthy()
  })

  it('says the ID badge proves nothing while verification is a prototype', () => {
    show(<Terms />)
    expect(screen.getByText(/not a real identity\s+check/i)).toBeTruthy()
  })

  it('gives a contact address', () => {
    show(<Terms />)
    expect(screen.getByText(CONTACT_EMAIL)).toBeTruthy()
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

  it('states there is no tracking', () => {
    show(<Privacy />)
    expect(screen.getByText(/no analytics or tracking on VOIDAJ/i)).toBeTruthy()
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
