// A community's Chat tab (Nuel's Communities note: Discussions, Chat,
// Events, Members). Discussions are posts with replies; Chat is the
// community's group chats, for talking in real time. Members can start one.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state.jsx'
import * as api from '../api.js'
import { Icon, IconTile } from './Icons.jsx'

export function CommunityChat({ community, isMember }) {
  const { user } = useApp()
  const navigate = useNavigate()
  const [chats, setChats] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user) return setChats([])
    api.listChats().then((all) => setChats(all.filter((c) => c.communityId === community.id))).catch(() => setChats([]))
  }, [community.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (chat) => {
    if (!chat.joined) await api.joinChat(chat.id)
    navigate(`/chats?tab=groups&chat=${chat.id}`)
  }
  const start = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try { const chat = await api.createChat({ name: name.trim(), communityId: community.id }); navigate(`/chats?tab=groups&chat=${chat.id}`) } catch (err) { alert(err.message) }
    setBusy(false)
  }

  if (!user) return <p className="meta-dim empty-note">Sign in to chat with this community.</p>
  if (chats === null) return <p className="meta-dim">Loading…</p>
  return (
    <div className="cm-chat">
      {chats.length === 0 && <p className="meta-dim empty-note">No chats here yet.{isMember ? ' Start the first one.' : ''}</p>}
      <ul className="cm-chat-list">
        {chats.map((c) => (
          <li key={c.id}>
            <button type="button" className="card card-link cm-chat-row" onClick={() => open(c)}>
              <IconTile name="chat" tone="violet" size={40} />
              <span><b>{c.name}</b><em>{c.lastMessage ? c.lastMessage.slice(0, 80) : c.description || 'No messages yet'} · {c.memberCount} in it</em></span>
              <span className="btn ghost small">{c.joined ? 'Open' : 'Join'}</span>
            </button>
          </li>
        ))}
      </ul>
      {isMember ? (
        <form className="cm-chat-new" onSubmit={start}>
          <input className="job-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Start a chat, e.g. Weekend meetups" maxLength={60} aria-label="Chat name" />
          <button className="btn primary small" disabled={!name.trim() || busy}><Icon name="plus" size={14} /> Start chat</button>
        </form>
      ) : <p className="meta-dim">Join the community to start a chat.</p>}
    </div>
  )
}
