// Post actions (Nuel, Nov 22: "she don't have post actions like delete or
// hide"). A ⋯ menu on a post: the author can delete it; everyone else can
// hide it from their own view. Hiding can be undone straight away.
import { useState } from 'react'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon } from './Icons.jsx'

export function PostActions({ post, onDeleted, onHidden, size = 15 }) {
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!user) return null
  const mine = post.author?.id === user.id

  const close = () => { setOpen(false); setConfirm(false); setError('') }
  const del = async () => {
    setBusy(true); setError('')
    try { await api.deletePost(post.id); close(); onDeleted?.(post) } catch (e) { setError(e.message) }
    setBusy(false)
  }
  const hide = async () => {
    setBusy(true); setError('')
    try { await api.hidePost(post.id); close(); onHidden?.(post) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <span className="report-wrap post-actions">
      <button type="button" className="report-btn post-actions-btn" onClick={() => (open ? close() : setOpen(true))}
        aria-label="Post actions" aria-expanded={open}><Icon name="more" size={size} /></button>
      {open && (
        <div className="report-menu post-actions-menu" role="menu">
          {mine ? (confirm ? (
            <>
              <div className="report-menu-head">Delete this post for everyone? This can’t be undone.</div>
              <button type="button" className="report-reason danger" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete it'}</button>
              <button type="button" className="report-reason" onClick={() => setConfirm(false)}>Keep it</button>
            </>
          ) : (
            <button type="button" className="report-reason danger" onClick={() => setConfirm(true)}><Icon name="trash" size={14} /> Delete post</button>
          )) : (
            <button type="button" className="report-reason" onClick={hide} disabled={busy}><Icon name="eye" size={14} /> {busy ? 'Hiding…' : 'Hide this post'}</button>
          )}
          {error && <div className="report-menu-head" role="alert">{error}</div>}
        </div>
      )}
    </span>
  )
}
