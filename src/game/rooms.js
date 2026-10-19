export const CARDS = ['0', '1', '2', '3', '5', '8', '🃏', '☕'];

export function createRoom(name) {
  return { name, revealed: false, hostId: null, story: '', round: 1, players: {} };
}

export function join(room, playerId, playerName) {
  room.players[playerId] = { name: playerName, vote: room.players[playerId]?.vote ?? null };
  if (!room.hostId) room.hostId = playerId;
}

export function leave(room, playerId) {
  delete room.players[playerId];
}

const isHost = (room, playerId) => playerId === room.hostId;

export function vote(room, playerId, card) {
  const player = room.players[playerId];
  if (!player || room.revealed || !CARDS.includes(card)) return;
  player.vote = player.vote === card ? null : card;
}

export function setStory(room, playerId, story) {
  if (isHost(room, playerId) && !room.revealed) room.story = String(story).slice(0, 200);
}

export function reveal(room, playerId) {
  if (isHost(room, playerId)) room.revealed = true;
}

export function mostCommon(room) {
  const counts = {};
  for (const p of Object.values(room.players)) {
    if (p.vote !== null && Number.isFinite(Number(p.vote))) counts[p.vote] = (counts[p.vote] || 0) + 1;
  }
  let best = null;
  for (const card of CARDS) if (counts[card] && (!best || counts[card] >= counts[best])) best = card;
  return best;
}

const numericVotes = (room) =>
  Object.values(room.players)
    .map((p) => p.vote)
    .filter((v) => v !== null && Number.isFinite(Number(v)));

export function hasConsensus(room) {
  const votes = numericVotes(room);
  return votes.length > 0 && votes.every((v) => v === votes[0]);
}

function clearVotes(room) {
  room.revealed = false;
  for (const p of Object.values(room.players)) p.vote = null;
}

export function reset(room, playerId) {
  if (!isHost(room, playerId)) return;
  clearVotes(room);
  room.story = '';
  room.round = 1;
}

export function redeal(room, playerId) {
  if (!isHost(room, playerId) || !room.revealed || hasConsensus(room)) return;
  clearVotes(room);
  room.round = (room.round || 1) + 1;
}

export function transferHost(room, playerId, targetId) {
  if (isHost(room, playerId) && room.players[targetId]) room.hostId = targetId;
}

export function publicState(room) {
  return {
    name: room.name,
    revealed: room.revealed,
    hostId: room.hostId,
    story: room.story,
    round: room.round,
    result: room.revealed ? mostCommon(room) : null,
    consensus: room.revealed ? hasConsensus(room) : null,
    players: Object.entries(room.players).map(([id, p]) => ({
      id,
      name: p.name,
      voted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
    })),
  };
}
