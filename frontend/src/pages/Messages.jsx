import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket } from '../realtime/SocketContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';
import { ReportSheet } from '../components/ReportButton.jsx';
import UserName from '../components/VerifiedBadge.jsx';
import { academicLine, firstName } from '../lib/profile.js';
import { chatTime, clock, dayLabel, fullDate } from '../lib/time.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { formatPrice } from '../lib/market.js';
import { groupMessages } from '../lib/messages.js';

export { MessageButton } from '../components/ConnectButton.jsx';

/** Avatar with a green dot when the student is online. */
function PresenceAvatar({ user, size, online }) {
  return (
    <span className="presence-avatar">
      <Avatar user={user} size={size} />
      {online && <span className="presence-dot" aria-label="Online" />}
    </span>
  );
}

function useOpenConversation() {
  const navigate = useNavigate();
  return useCallback(
    async (userId) => {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId } });
      navigate(`/messages/${conversation.id}`);
    },
    [navigate],
  );
}

/* ================================ Chat list ================================ */

function ConversationList({ activeId }) {
  const { user } = useAuth();
  const { socket, refreshUnread, online, trackPresence } = useSocket();
  const openConversation = useOpenConversation();
  const [conversations, setConversations] = useState(null);
  const [connections, setConnections] = useState([]);
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/conversations')
      .then((d) => setConversations(d.conversations))
      .catch((err) => setError(err.message));
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    load();
    api('/connections')
      .then((d) => setConnections(d.connections.map((c) => c.user)))
      .catch(() => {});
  }, [load]);

  // Ask who's online among the people on screen.
  useEffect(() => {
    trackPresence(connections.map((c) => c.id));
  }, [connections, trackPresence]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('message:new', load);
    return () => socket.off('message:new', load);
  }, [socket, load]);

  const q = query.trim().toLowerCase();
  const shown = (conversations ?? []).filter((c) => !q || c.otherUser.name.toLowerCase().includes(q));
  // Online connections first in the strip.
  const strip = [...connections].sort((a, b) => online.has(b.id) - online.has(a.id));

  return (
    <main className="chat-list">
      <header className="chat-list-bar">
        <h1>Messages</h1>
        <button type="button" className="icon-button" aria-label="New message" onClick={() => setComposeOpen(true)}>
          <Icon name="edit" />
        </button>
      </header>

      <div className="chat-search" role="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search" aria-label="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {strip.length > 0 && !q && (
        <section className="chat-strip" aria-label="Your connections">
          {strip.map((c) => (
            <button key={c.id} type="button" className="chat-strip-person" onClick={() => openConversation(c.id)}>
              <PresenceAvatar user={c} size={60} online={online.has(c.id)} />
              <span>{firstName(c.name)}</span>
            </button>
          ))}
        </section>
      )}

      {error && <p className="chat-error">{error}</p>}

      {!conversations ? (
        !error && <p className="chat-hint">Loading…</p>
      ) : shown.length === 0 ? (
        q ? (
          <p className="chat-hint">No conversations with “{query}”.</p>
        ) : connections.length > 0 ? (
          <div className="chat-empty">
            <h2>No messages yet</h2>
            <p>Tap one of your connections above to say hello.</p>
          </div>
        ) : (
          <div className="chat-empty">
            <h2>Connect first, then chat</h2>
            <p>You can message students once you’re connected. Your matches are a good place to start.</p>
            <Link to="/matches" className="btn btn-primary">
              See my matches
            </Link>
          </div>
        )
      ) : (
        <ul className="chat-rows">
          {shown.map((c) => {
            const unread = c.unreadCount > 0;
            const mine = c.lastMessage?.sender === user.id;
            return (
              <li key={c.id}>
                <Link to={`/messages/${c.id}`} className={`chat-row ${unread ? 'is-unread' : ''} ${c.id === activeId ? 'is-active' : ''}`}>
                  <PresenceAvatar user={c.otherUser} size={56} online={online.has(c.otherUser.id)} />
                  <span className="chat-row-text">
                    <span className="chat-row-top">
                      <span className="chat-row-name">
                        <UserName user={c.otherUser} size={15} />
                      </span>
                      {c.lastMessage && <time dateTime={c.lastMessage.createdAt}>{chatTime(c.lastMessage.createdAt)}</time>}
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-row-preview">
                        {c.lastMessage ? `${mine ? 'You: ' : ''}${c.lastMessage.content}` : 'Say hello'}
                      </span>
                      {unread && (
                        <span className="chat-row-badge" aria-label={`${c.unreadCount} unread`}>
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewMessageSheet open={composeOpen} onClose={() => setComposeOpen(false)} connections={connections} online={online} onPick={openConversation} />
    </main>
  );
}

function NewMessageSheet({ open, onClose, connections, online, onPick }) {
  const [q, setQ] = useState('');
  const list = connections.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="New message">
      <div className="chat-search chat-search-sheet">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search your connections" aria-label="Search your connections" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {connections.length === 0 ? (
        <p className="chat-hint">Connect with students to message them.</p>
      ) : (
        <ul className="pick-list">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className="pick-row" onClick={() => onPick(c.id)}>
                <PresenceAvatar user={c} size={44} online={online.has(c.id)} />
                <span className="pick-row-text">
                  <strong>
                    <UserName user={c} size={15} />
                  </strong>
                  <span>{online.has(c.id) ? 'Active now' : academicLine(c)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/* ================================ Chat thread ================================ */

function Thread({ conversationId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket, refreshUnread, online, trackPresence } = useSocket();
  const [conversation, setConversation] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const typingTimer = useRef(null);

  const markRead = useCallback(() => {
    api(`/conversations/${conversationId}/read`, { method: 'POST' })
      .then(refreshUnread)
      .catch(() => {});
  }, [conversationId, refreshUnread]);

  useEffect(() => {
    stickToBottom.current = true;
    api(`/conversations/${conversationId}/messages`)
      .then((d) => {
        setConversation(d.conversation);
        setMessages(d.messages);
        setHasMore(d.hasMore);
        if (d.conversation.unreadCount) markRead();
        trackPresence([d.conversation.otherUser.id]);
        // The full profile gives prompts for conversation starters.
        api(`/users/${d.conversation.otherUser.id}`)
          .then((p) => setProfile(p.user))
          .catch(() => {});
      })
      .catch((err) => setError(err.status === 404 ? 'Conversation not found.' : err.message));
  }, [conversationId, markRead, trackPresence]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (m) => {
      if (m.conversation !== conversationId) return;
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      if (m.sender !== user.id) {
        setOtherTyping(false);
        markRead();
      }
    };
    const onTyping = (e) => e.conversationId === conversationId && setOtherTyping(e.isTyping);
    const onRead = (e) => {
      if (e.conversationId !== conversationId || e.byMe) return;
      setMessages((list) => list.map((m) => (m.sender === user.id && !m.readAt ? { ...m, readAt: e.readAt } : m)));
    };
    socket.on('message:new', onMessage);
    socket.on('typing', onTyping);
    socket.on('conversation:read', onRead);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('typing', onTyping);
      socket.off('conversation:read', onRead);
    };
  }, [socket, conversationId, user.id, markRead]);

  // Keep the newest message in view unless the student has scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, otherTyping]);

  const days = useMemo(() => groupMessages(messages), [messages]);

  function onScroll() {
    const el = scrollRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    const el = scrollRef.current;
    const previousHeight = el.scrollHeight;
    const d = await api(`/conversations/${conversationId}/messages`, { query: { before: messages[0].id } });
    stickToBottom.current = false;
    setMessages((list) => [...d.messages, ...list]);
    setHasMore(d.hasMore);
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - previousHeight;
    });
  }

  function onDraftChange(e) {
    setDraft(e.target.value);
    if (!socket) return;
    socket.emit('typing', { conversationId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing', { conversationId, isTyping: false }), 2000);
  }

  async function send(text) {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      const { message } = await api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { content } });
      setMessages((list) => (list.some((x) => x.id === message.id) ? list : [...list, message]));
      setDraft('');
      stickToBottom.current = true;
      clearTimeout(typingTimer.current);
      socket?.emit('typing', { conversationId, isTyping: false });
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return (
      <main className="thread">
        <header className="thread-header">
          <Link to="/messages" className="icon-button" aria-label="Back to messages">
            <Icon name="back" />
          </Link>
        </header>
        <p className="chat-hint">{error || 'Loading conversation…'}</p>
      </main>
    );
  }

  const other = conversation.otherUser;
  const isOnline = online.has(other.id);
  const lastMine = [...messages].reverse().find((m) => m.sender === user.id);
  const item = conversation.listing;
  // Chats about a marketplace item get questions about the item, like Facebook Marketplace.
  const starters = item
    ? item.isMine
      ? [`Hi ${firstName(other.name)}! Yes, it’s still available.`, 'When would you like to see it?', 'I can meet you on campus.']
      : ['Hi! Is this still available?', 'Is the price negotiable?', 'Where can we meet on campus?', 'Can you send more photos?']
    : [
        `Hi ${firstName(other.name)}!`,
        'Want to study together sometime?',
        ...(profile?.prompts?.[0] ? [`I liked your answer to “${profile.prompts[0].question}”`] : []),
      ];

  return (
    <main className="thread">
      <header className="thread-header">
        <Link to="/messages" className="icon-button" aria-label="Back to messages">
          <Icon name="back" />
        </Link>
        <Link to={`/people/${other.id}`} className="thread-who">
          <PresenceAvatar user={other} size={40} online={isOnline} />
          <span className="thread-who-text">
            <span className="thread-name">
              <UserName user={other} size={15} />
            </span>
            <span className={`thread-sub ${otherTyping ? 'is-typing' : ''}`}>
              {otherTyping ? 'typing…' : isOnline ? 'Active now' : academicLine(other)}
            </span>
          </span>
        </Link>
        <button type="button" className="icon-button" aria-label="Conversation options" onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </header>

      {conversation.listing && (
        <Link to={`/market/${conversation.listing.id}`} className="thread-listing">
          {conversation.listing.photo ? <img src={conversation.listing.photo} alt="" /> : <span className="thread-listing-ph"><Icon name="bag" size={20} /></span>}
          <span className="thread-listing-text">
            <strong>{conversation.listing.title}</strong>
            <span>{conversation.listing.status === 'sold' ? 'Sold' : formatPrice(conversation.listing.price)}</span>
          </span>
          <Icon name="forward" size={18} />
        </Link>
      )}

      <div className="thread-messages" ref={scrollRef} onScroll={onScroll} aria-live="polite">
        {hasMore && (
          <button type="button" className="link-button load-older" onClick={loadOlder}>
            Load earlier messages
          </button>
        )}

        {messages.length === 0 && (
          <div className="thread-intro">
            <Avatar user={other} size={88} />
            <h2>
              <UserName user={other} size={18} />
            </h2>
            <p>{academicLine(other)}</p>
            {item && (
              <p className="thread-intro-item">
                {item.isMine ? 'Interested in your' : 'About'} <strong>{item.title}</strong>, {item.status === 'sold' ? 'sold' : formatPrice(item.price)}
              </p>
            )}
            <p className="thread-intro-note">{item ? 'Break the ice:' : 'You’re connected. Break the ice:'}</p>
            <div className="starter-chips">
              {starters.map((s) => (
                <button key={s} type="button" className="starter-chip" disabled={sending} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {days.map((day) => (
          <section key={day.date} className="thread-day">
            <p className="thread-day-label">{dayLabel(day.date)}</p>
            {day.groups.map((group) => {
              const mine = group.sender === user.id;
              const last = group.messages[group.messages.length - 1];
              return (
                <div key={group.messages[0].id} className={`msg-group ${mine ? 'is-mine' : ''}`}>
                  {!mine && <Avatar user={other} size={28} />}
                  <div className="msg-stack">
                    {group.messages.map((m) => (
                      <p key={m.id} className="msg" title={fullDate(m.createdAt)}>
                        {m.content}
                      </p>
                    ))}
                    <span className="msg-meta">
                      <time dateTime={last.createdAt}>{clock(last.createdAt)}</time>
                      {mine && last.id === lastMine?.id && <span className="msg-status">{last.readAt ? 'Seen' : 'Sent'}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        ))}

        {otherTyping && (
          <div className="msg-group">
            <Avatar user={other} size={28} />
            <div className="typing-bubble" aria-label={`${firstName(other.name)} is typing`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <form
        className="composer-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <label htmlFor="message-input" className="visually-hidden">
          Message {other.name}
        </label>
        <textarea
          id="message-input"
          ref={inputRef}
          rows={1}
          maxLength={2000}
          placeholder="Message…"
          value={draft}
          onChange={onDraftChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className={`send-button ${draft.trim() ? 'is-ready' : ''}`} disabled={sending || !draft.trim()} aria-label="Send">
          <Icon name="send" size={20} />
        </button>
      </form>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={other.name}>
        <div className="sheet-list">
          <button
            type="button"
            className="sheet-row"
            onClick={() => {
              setMenuOpen(false);
              navigate(`/people/${other.id}`);
            }}
          >
            <span className="sheet-row-icon">
              <Icon name="user" size={20} />
            </span>
            <span className="sheet-row-text">
              <strong>View profile</strong>
            </span>
          </button>
          <button
            type="button"
            className="sheet-row is-danger"
            onClick={() => {
              setMenuOpen(false);
              setReporting(true);
            }}
          >
            <span className="sheet-row-icon">
              <Icon name="flag" size={20} />
            </span>
            <span className="sheet-row-text">
              <strong>Report {firstName(other.name)}</strong>
              <span>Admins review every report</span>
            </span>
          </button>
        </div>
      </Sheet>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={other.id} />
    </main>
  );
}

export default function Messages() {
  const { id } = useParams();
  // Desktop: inbox and conversation side by side, like Instagram on the web.
  const split = useMediaQuery('(min-width: 1000px)');
  if (!split) return id ? <Thread key={id} conversationId={id} /> : <ConversationList />;
  return (
    <div className="dm-split">
      <ConversationList activeId={id} />
      <div className="dm-pane">
        {id ? (
          <Thread key={id} conversationId={id} />
        ) : (
          <div className="dm-empty">
            <span className="dm-empty-icon">
              <Icon name="chat" size={34} />
            </span>
            <h2>Your messages</h2>
            <p>Choose a conversation, or start one with a connection.</p>
          </div>
        )}
      </div>
    </div>
  );
}
