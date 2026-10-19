import { describe, it, expect } from 'vitest';
import { createRoom, join, vote, setStory, reveal, reset, redeal, transferHost, publicState } from './rooms.js';

describe('rooms', () => {
  it('makes the first player the host', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    expect(publicState(room).hostId).toBe('a');
  });

  it('hides votes until the host reveals', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    vote(room, 'a', '3');
    vote(room, 'b', '8');
    expect(publicState(room).players.every((p) => p.voted && p.vote === null)).toBe(true);

    reveal(room, 'b');
    expect(publicState(room).revealed).toBe(false);

    reveal(room, 'a');
    expect(publicState(room).players.map((p) => p.vote)).toEqual(['3', '8']);
  });

  it('blocks voting after reveal and only the host can reset', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    vote(room, 'a', '5');
    reveal(room, 'a');
    vote(room, 'b', '8');
    expect(publicState(room).players[1].voted).toBe(false);

    reset(room, 'b');
    expect(publicState(room).revealed).toBe(true);
    reset(room, 'a');
    const s = publicState(room);
    expect(s.revealed).toBe(false);
    expect(s.players[0].voted).toBe(false);
  });

  it('lets only the host set the story and shows the most common vote', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    join(room, 'c', 'Cat');
    setStory(room, 'b', 'ignored');
    setStory(room, 'a', 'PROJ-1');
    vote(room, 'a', '5');
    vote(room, 'b', '5');
    vote(room, 'c', '🃏');
    reveal(room, 'a');
    expect(publicState(room).story).toBe('PROJ-1');
    expect(publicState(room).result).toBe('5');
    reset(room, 'a');
    expect(publicState(room).story).toBe('');
  });

  it('lets only the host hand over the host role', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    transferHost(room, 'b', 'b');
    expect(room.hostId).toBe('a');
    transferHost(room, 'a', 'b');
    expect(room.hostId).toBe('b');
  });

  it('re-deals the same story when numeric votes differ, ignoring ? and coffee', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    join(room, 'b', 'Bob');
    join(room, 'c', 'Cat');
    setStory(room, 'a', 'PROJ-2');
    vote(room, 'a', '3');
    vote(room, 'b', '8');
    vote(room, 'c', '🃏');
    reveal(room, 'a');
    expect(publicState(room).consensus).toBe(false);

    redeal(room, 'b');
    expect(publicState(room).revealed).toBe(true);
    redeal(room, 'a');
    let s = publicState(room);
    expect(s.revealed).toBe(false);
    expect(s.story).toBe('PROJ-2');
    expect(s.round).toBe(2);
    expect(s.players.every((p) => !p.voted)).toBe(true);

    vote(room, 'a', '5');
    vote(room, 'b', '5');
    vote(room, 'c', '☕');
    reveal(room, 'a');
    expect(publicState(room).consensus).toBe(true);
    redeal(room, 'a');
    expect(publicState(room).revealed).toBe(true);

    reset(room, 'a');
    s = publicState(room);
    expect(s.round).toBe(1);
    expect(s.story).toBe('');
  });

  it('toggles a vote off', () => {
    const room = createRoom('x');
    join(room, 'a', 'Ann');
    vote(room, 'a', '5');
    vote(room, 'a', '5');
    expect(publicState(room).players[0].voted).toBe(false);
  });
});
