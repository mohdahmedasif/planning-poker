import { useEffect, useRef, useState } from 'react';
import { joinRoom, getRelaySockets } from '@trystero-p2p/mqtt';
import * as game from './rooms.js';

const APP_ID = 'planning-poker.github.io/mohdahmedasif';

const listFromEnv = (value) => value?.split(',').map((u) => u.trim()).filter(Boolean);

const RELAY_URLS = listFromEnv(import.meta.env.VITE_MQTT_BROKERS) ?? [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const turnUrls = listFromEnv(import.meta.env.VITE_TURN_URLS);
const ROOM_CONFIG = {
  appId: APP_ID,
  relayConfig: { urls: RELAY_URLS },
  ...(turnUrls?.length && {
    turnConfig: [
      {
        urls: turnUrls,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      },
    ],
  }),
};

export const hasTurn = Boolean(turnUrls?.length);

const openRelayCount = () =>
  Object.values(getRelaySockets()).filter((socket) => socket?.readyState === WebSocket.OPEN).length;
const dealerKey = (tableId) => `dealer:${tableId}`;

export function createTable(tableId, name) {
  sessionStorage.setItem(dealerKey(tableId), JSON.stringify({ table: game.createRoom(name), kicked: [] }));
}

export function useTable(tableId, playerId, playerName, onExit) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [relays, setRelays] = useState(0);
  const [peerSeen, setPeerSeen] = useState(false);
  const sendRef = useRef(() => {});
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    if (!playerName) return;
    const room = joinRoom(ROOM_CONFIG, tableId);
    const relayTimer = setInterval(() => setRelays(openRelayCount()), 1000);
    const stateAction = room.makeAction('state');
    const actionAction = room.makeAction('action');
    const noticeAction = room.makeAction('notice');
    let done = false;
    const exit = (type) => {
      if (done) return;
      done = true;
      exitRef.current(type);
    };

    const saved = sessionStorage.getItem(dealerKey(tableId));
    if (saved) {
      const { table, kicked } = JSON.parse(saved);
      const peerPlayers = {};
      const peerOf = (pid) => Object.keys(peerPlayers).find((peer) => peerPlayers[peer] === pid);

      const publish = () => {
        sessionStorage.setItem(dealerKey(tableId), JSON.stringify({ table, kicked }));
        const s = game.publicState(table);
        setState(s);
        stateAction.send(s);
      };

      const apply = (pid, msg) => {
        switch (msg.type) {
          case 'join':
            if (kicked.includes(pid)) return;
            game.join(table, pid, String(msg.playerName || 'Player').slice(0, 40));
            break;
          case 'vote':
            game.vote(table, pid, msg.card);
            break;
          case 'story':
            game.setStory(table, pid, msg.story);
            break;
          case 'reveal':
            game.reveal(table, pid);
            break;
          case 'reset':
            game.reset(table, pid);
            break;
          case 'redeal':
            game.redeal(table, pid);
            break;
          case 'transferHost':
            game.transferHost(table, pid, msg.targetId);
            break;
          case 'kick': {
            if (pid !== table.hostId || msg.targetId === pid || msg.targetId === playerId) return;
            game.leave(table, msg.targetId);
            kicked.push(msg.targetId);
            const peer = peerOf(msg.targetId);
            if (peer) noticeAction.send('kicked', { target: peer });
            break;
          }
          case 'end':
            if (pid !== table.hostId) return;
            noticeAction.send('ended');
            sessionStorage.removeItem(dealerKey(tableId));
            exit('ended');
            return;
          default:
            return;
        }
        publish();
      };

      room.onPeerJoin = (peer) => stateAction.send(game.publicState(table), { target: peer });
      room.onPeerLeave = (peer) => {
        const pid = peerPlayers[peer];
        delete peerPlayers[peer];
        if (pid && !peerOf(pid)) {
          game.leave(table, pid);
          publish();
        }
      };
      actionAction.onMessage = (msg, { peerId }) => {
        if (msg?.type === 'join' && msg.playerId) peerPlayers[peerId] = msg.playerId;
        const pid = peerPlayers[peerId];
        if (pid && pid !== playerId) apply(pid, msg);
      };

      sendRef.current = (msg) => apply(playerId, msg);
      setConnected(true);
      apply(playerId, { type: 'join', playerName });
    } else {
      let dealerPeer = null;
      const hello = { type: 'join', playerId, playerName };

      room.onPeerJoin = (peer) => {
        setPeerSeen(true);
        actionAction.send(hello, { target: peer });
      };
      room.onPeerLeave = (peer) => {
        if (peer === dealerPeer) {
          dealerPeer = null;
          setConnected(false);
        }
      };
      stateAction.onMessage = (s, { peerId }) => {
        if (dealerPeer !== peerId) {
          dealerPeer = peerId;
          if (!s.players.some((p) => p.id === playerId)) actionAction.send(hello, { target: peerId });
        }
        setConnected(true);
        setState(s);
      };
      noticeAction.onMessage = (type, { peerId }) => {
        if (peerId === dealerPeer && (type === 'ended' || type === 'kicked')) exit(type);
      };

      sendRef.current = (msg) => dealerPeer && actionAction.send(msg, { target: dealerPeer });
    }

    return () => {
      done = true;
      clearInterval(relayTimer);
      room.leave();
    };
  }, [tableId, playerId, playerName]);

  const status = connected ? 'connected' : peerSeen ? 'handshake' : relays > 0 ? 'searching' : 'relays';
  return { state, connected, status, relays, send: (msg) => sendRef.current(msg) };
}
