import { randomId, copyText } from './util.js';
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTable } from './game/useTable.js';

const CARDS = ['0', '1', '2', '3', '5', '8', '🃏', '☕'];
const SUITS = ['♠', '♥', '♦', '♣'];

const suitOf = (card) => SUITS[Math.max(0, CARDS.indexOf(card)) % SUITS.length];
const isRed = (suit) => suit === '♥' || suit === '♦';

function getPlayerId() {
  let id = sessionStorage.getItem('playerId');
  if (!id) {
    id = randomId();
    sessionStorage.setItem('playerId', id);
  }
  return id;
}

const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const votedCount = (s) => s.players.filter((p) => p.voted).length;

function seatPosition(index, total) {
  const angle = Math.PI / 2 + (index / total) * Math.PI * 2;
  return { left: `${50 + 50 * Math.cos(angle)}%`, top: `${50 + 50 * Math.sin(angle)}%` };
}

const PIPS = {
  2: [[50, 22], [50, 78]],
  3: [[50, 22], [50, 50], [50, 78]],
  5: [[32, 22], [68, 22], [50, 50], [32, 78], [68, 78]],
  8: [[32, 20], [68, 20], [32, 40], [68, 40], [32, 60], [68, 60], [32, 80], [68, 80]],
};

function JesterHat() {
  return (
    <svg className="jester" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M22 72 Q18 38 6 22 Q34 26 42 60 Z" fill="#c0262d" />
      <path d="M36 64 Q44 22 50 8 Q58 22 64 64 Z" fill="#6d28d9" />
      <path d="M58 60 Q66 26 94 22 Q82 38 78 72 Z" fill="#0e7a4a" />
      <rect x="18" y="62" width="64" height="16" rx="5" fill="#e8c26a" stroke="#8a6a1f" strokeWidth="2" />
      {[30, 50, 70].map((x) => (
        <path key={x} d={`M${x} 64 L${x + 5} 70 L${x} 76 L${x - 5} 70 Z`} fill="#c0262d" />
      ))}
      {[[6, 22], [50, 8], [94, 22]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="6" fill="#e8c26a" stroke="#8a6a1f" strokeWidth="2" />
      ))}
      <path d="M34 82 Q50 96 66 82" fill="none" stroke="#6d28d9" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const CONFETTI_COLORS = ['#e8c26a', '#c0262d', '#fffdf6', '#5eead4', '#a78bfa'];

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            '--x': `${Math.cos((i / 36) * Math.PI * 2) * (120 + (i % 5) * 30)}px`,
            '--y': `${Math.sin((i / 36) * Math.PI * 2) * (80 + (i % 4) * 25) - 40}px`,
            '--r': `${(i * 47) % 360}deg`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 6) * 20}ms`,
          }}
        />
      ))}
    </div>
  );
}

function Corners({ top, bottom }) {
  return (
    <>
      <span className="corner">{top}</span>
      <span className="corner bottom">{bottom ?? top}</span>
    </>
  );
}

function CardFace({ value, small }) {
  if (value === '🃏') {
    const letters = 'JOKER'.split('').map((l, i) => <i key={i}>{l}</i>);
    return (
      <div className={`face front joker ${small ? 'small' : ''}`}>
        {!small && <Corners top={letters} />}
        <div className="stars" />
        <JesterHat />
      </div>
    );
  }

  if (value === '☕') {
    return (
      <div className={`face front coffee ${small ? 'small' : ''}`}>
        {!small && <Corners top="☕" />}
        <span className="cup">☕</span>
        {!small && <span className="caption">BREAK</span>}
      </div>
    );
  }

  const suit = suitOf(value);
  const corner = (
    <>
      <b>{value}</b>
      {suit}
    </>
  );
  const n = Number(value);

  return (
    <div className={`face front ${isRed(suit) ? 'red' : ''} ${small ? 'small' : ''}`}>
      <Corners top={corner} />
      {small ? (
        <span className="value">{value}</span>
      ) : n === 0 ? (
        <>
          <span className="ghost-suit">{suit}</span>
          <span className="value">0</span>
        </>
      ) : n === 1 ? (
        <span className="ace">{suit}</span>
      ) : (
        <div className="pips">
          {PIPS[n].map(([x, y], i) => (
            <span key={i} style={{ left: `${x}%`, top: `${y}%` }} className={y > 50 ? 'flipped-pip' : ''}>
              {suit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { key: 'relays', label: 'Connecting to the relay servers' },
  { key: 'searching', label: 'Looking for the dealer at this table' },
];

function WaitingRoom({ tableId, status, relays }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <main className="center">
      <section className="panel waiting">
        <div className="shuffle" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ '--i': i }} />
          ))}
        </div>
        <div className="waiting-head">
          <h1>Waiting for the dealer</h1>
          <small>
            Table <code>{tableId.slice(0, 8)}</code> · {elapsed}s
          </small>
        </div>

        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.key} className={i < current ? 'done' : i === current ? 'active' : ''}>
              <span className="dot">{i < current ? '✓' : i + 1}</span>
              <span>
                {step.label}
                {step.key === 'relays' && relays > 0 && <em> · {relays} connected</em>}
              </span>
            </li>
          ))}
        </ol>

        {elapsed >= 20 && (
          <div className="tips">
            <strong>Still waiting? Check that:</strong>
            <ul>
              {status === 'relays' && (
                <li>Your network or VPN isn't blocking secure WebSockets to the public relay servers.</li>
              )}
              {status === 'searching' && (
                <li>The person who created the table still has that exact tab open (refreshing is fine).</li>
              )}
              <li>You opened the full invite link, including the part after #.</li>
              <li>Both of you are using a recent Chrome, Edge, Firefox or Safari.</li>
            </ul>
          </div>
        )}

        <Link to="/" className="back-link">
          ← Back to home
        </Link>
      </section>
    </main>
  );
}

export default function Game() {
  const { id } = useParams();
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [nameInput, setNameInput] = useState('');
  const [myVote, setMyVote] = useState(null);
  const [storyDraft, setStoryDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(null);
  const armTimer = useRef();
  const navigate = useNavigate();
  const { state, connected, status, relays, send } = useTable(id, getPlayerId(), playerName, (type) =>
    navigate('/', { state: { [type]: true } })
  );

  const mySeat = state?.players.find((p) => p.id === getPlayerId());
  useEffect(() => {
    if (mySeat && !mySeat.voted) setMyVote(null);
  }, [mySeat?.voted]);

  if (!playerName) {
    return (
      <main className="center">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            localStorage.setItem('playerName', nameInput.trim());
            setPlayerName(nameInput.trim());
          }}
        >
          <div className="brand">
            <span className="logo">♠</span>
            <div>
              <h1>Take a seat</h1>
              <small>Enter your name to join the table</small>
            </div>
          </div>
          <label>
            Your name
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} required autoFocus />
          </label>
          <button type="submit">Join table</button>
        </form>
      </main>
    );
  }

  if (!state) return <WaitingRoom tableId={id} status={status} relays={relays} />;

  const me = getPlayerId();
  const isHost = state.hostId === me;
  const host = state.players.find((p) => p.id === state.hostId);
  const myIndex = Math.max(0, state.players.findIndex((p) => p.id === me));
  const seated = [...state.players.slice(myIndex), ...state.players.slice(0, myIndex)];

  function pick(card) {
    setMyVote(myVote === card ? null : card);
    send({ type: 'vote', card });
  }

  function saveStory(e) {
    e?.preventDefault();
    send({ type: 'story', story: storyDraft.trim() });
  }

  // window.confirm is silently blocked in many in-app mobile browsers, so destructive actions need a second tap.
  function tapTwice(key, action) {
    clearTimeout(armTimer.current);
    if (armed === key) {
      setArmed(null);
      action();
    } else {
      setArmed(key);
      armTimer.current = setTimeout(() => setArmed(null), 3000);
    }
  }

  function copyLink() {
    copyText(`${location.origin}${location.pathname}#/game/${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="game">
      <header>
        <Link to="/" className="brand plain">
          <span className="logo">♠</span>
          <div>
            <small>Planning Poker</small>
            <h1>{state.name}</h1>
          </div>
        </Link>
        <div className="header-actions">
          {!connected && <span className="offline">Dealer disconnected, waiting…</span>}
          <span className="seats">
            {state.players.length} at the table
          </span>
          <button className="ghost" onClick={copyLink}>
            {copied ? 'Link copied!' : 'Invite players'}
          </button>
          {isHost && (
            <button className="ghost danger" onClick={() => tapTwice('end', () => send({ type: 'end' }))}>
              {armed === 'end' ? 'Tap again to end' : 'End game'}
            </button>
          )}
        </div>
      </header>

      <section className="room">
        <div className="table">
          <div className="rail">
            <div className="felt">
              <div className="spotlight" />
              <div className="center-pot">
                <small className="label">
                  Now estimating{state.round > 1 && ` · Round ${state.round}`}
                </small>
                {isHost && !state.revealed ? (
                  <form onSubmit={saveStory}>
                    <input
                      className="story-input"
                      placeholder="Type the story, e.g. PROJ-123"
                      value={storyDraft}
                      onChange={(e) => setStoryDraft(e.target.value)}
                      onBlur={saveStory}
                    />
                  </form>
                ) : (
                  <h2 className="story">{state.story || 'No story set'}</h2>
                )}

                {state.revealed ? (
                  <>
                    {state.consensus && <Confetti key={state.round} />}
                    <div className={`result ${state.consensus ? 'win' : 'split'}`}>
                      {state.consensus ? (
                        <>
                          🎉 Consensus <strong>{state.result}</strong>
                        </>
                      ) : (
                        <>Estimates differ, discuss and re-deal</>
                      )}
                    </div>
                    {isHost ? (
                      <div className="pot-actions">
                        {!state.consensus && (
                          <button onClick={() => send({ type: 'redeal' })}>Re-deal story</button>
                        )}
                        <button
                          className={state.consensus ? '' : 'ghost'}
                          onClick={() => {
                            setStoryDraft('');
                            send({ type: 'reset' });
                          }}
                        >
                          {state.consensus ? 'Next story' : 'Skip to next story'}
                        </button>
                      </div>
                    ) : (
                      <p className="hint">
                        Waiting for {host?.name ?? 'the host'} to {state.consensus ? 'deal the next story' : 're-deal'}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="hint">
                      {votedCount(state)} of {state.players.length} cards on the table
                    </p>
                    {isHost ? (
                      <button
                        className={`chip-btn ${votedCount(state) === state.players.length ? 'pulse' : ''}`}
                        onClick={() => send({ type: 'reveal' })}
                        disabled={!votedCount(state)}
                      >
                        Reveal cards
                      </button>
                    ) : (
                      <p className="hint">{host?.name ?? 'The host'} will reveal the cards</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {seated.map((p, i) => (
            <div key={p.id} className={`seat ${p.id === me ? 'me' : ''}`} style={seatPosition(i, seated.length)}>
              <div
                className={`flip ${p.voted ? 'voted' : 'empty'} ${state.revealed && p.voted ? 'flipped' : ''}`}
                style={{ '--i': i }}
              >
                <div className="face back" />
                {p.vote && <CardFace value={p.vote} small />}
              </div>
              <div className="nameplate">
                <div className="avatar">{initials(p.name)}</div>
                <span className="pname">{p.id === me ? 'You' : p.name}</span>
                {!p.voted && !state.revealed && (
                  <span className="thinking" aria-label="thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {p.id === state.hostId && <span className="dealer" title="Host">D</span>}
                {isHost && p.id !== me && (
                  <button className="crown" title={`Make ${p.name} host`} onClick={() => send({ type: 'transferHost', targetId: p.id })}>
                    👑
                  </button>
                )}
                {isHost && p.id !== me && p.id !== state.dealerId && (
                  <button
                    className={`crown remove ${armed === p.id ? 'armed' : ''}`}
                    title={`Remove ${p.name}`}
                    onClick={() => tapTwice(p.id, () => send({ type: 'kick', targetId: p.id }))}
                  >
                    {armed === p.id ? 'Remove?' : '✕'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="hand-wrap">
        <div className="hand">
          {CARDS.map((c, i) => {
            const offset = i - (CARDS.length - 1) / 2;
            return (
              <button
                key={c}
                className={`card ${myVote === c ? 'selected' : ''}`}
                style={{ '--rot': `${offset * 4}deg`, '--lift': `${Math.abs(offset) * 4}px` }}
                onClick={() => pick(c)}
                disabled={state.revealed}
              >
                <CardFace value={c} />
              </button>
            );
          })}
        </div>
      </footer>
    </main>
  );
}
