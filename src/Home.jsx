import { randomId } from './util.js';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createTable } from './game/useTable.js';

export default function Home() {
  const [gameName, setGameName] = useState('Sprint Planning');
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const navigate = useNavigate();
  const location = useLocation();

  function create(e) {
    e.preventDefault();
    localStorage.setItem('playerName', playerName.trim());
    const id = randomId().replace(/-/g, '').slice(0, 26).toUpperCase();
    createTable(id, gameName.trim());
    navigate(`/game/${id}`);
  }

  return (
    <main className="center">
      <div className="floating-suits" aria-hidden="true">
        {['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣'].map((s, i) => (
          <span key={i} style={{ '--i': i }} className={s === '♥' || s === '♦' ? 'red' : ''}>
            {s}
          </span>
        ))}
      </div>
      <form onSubmit={create} className="panel">
        <div className="brand">
          <span className="logo">♠</span>
          <div>
            <h1>Planning Poker</h1>
            <small>Estimate together, in real time</small>
          </div>
        </div>
        {location.state?.ended && <p className="notice">The host ended the game.</p>}
        {location.state?.kicked && <p className="notice">The host removed you from the game.</p>}
        <label>
          Game name
          <input value={gameName} onChange={(e) => setGameName(e.target.value)} required />
        </label>
        <label>
          Your name
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} required />
        </label>
        <button type="submit">Create game</button>
      </form>
    </main>
  );
}
