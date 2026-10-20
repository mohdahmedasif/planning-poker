import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';
import * as game from './rooms.js';

const APP_ID = 'planning-poker-mohdahmedasif-v2';

const CONFIGURED_BROKERS = (import.meta.env.VITE_MQTT_BROKERS ?? '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
const BROKER_URLS = CONFIGURED_BROKERS.length
  ? CONFIGURED_BROKERS
  : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];

const HEARTBEAT_MS = 5000;
// Hidden tabs only run timers about once a minute, so the timeout must exceed that.
const TIMEOUT_MS = 75000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const messageId = () => toHex(crypto.getRandomValues(new Uint8Array(8)));

// The table id never leaves the browser: brokers only see a hash of it and encrypted payloads.
async function tableChannel(tableId) {
  const secret = await crypto.subtle.digest('SHA-256', encoder.encode(`${APP_ID}:${tableId}`));
  const topic = `${APP_ID}/${toHex(await crypto.subtle.digest('SHA-256', secret)).slice(0, 32)}`;
  const key = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    topic,
    seal: async (data) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data))));
      return toBase64(iv) + '.' + toBase64(sealed);
    },
    open: async (text) => {
      try {
        const [iv, sealed] = text.split('.').map(fromBase64);
        return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed)));
      } catch {
        return null;
      }
    },
  };
}

const dealerKey = (tableId) => `dealer:${tableId}`;

export function createTable(tableId, name) {
  sessionStorage.setItem(dealerKey(tableId), JSON.stringify({ table: game.createRoom(name), kicked: [], seq: 0 }));
}

export function useTable(tableId, playerId, playerName, onExit) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [relays, setRelays] = useState(0);
  const sendRef = useRef(() => {});
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    if (!playerName) return;
    let done = false;
    const timers = [];
    const cleanups = [];

    tableChannel(tableId).then(({ topic, seal, open }) => {
      if (done) return;
      const topics = { state: `${topic}/state`, action: `${topic}/action`, notice: `${topic}/notice` };
      const clients = BROKER_URLS.map((url) =>
        mqtt.connect(url, { reconnectPeriod: 3000, connectTimeout: 8000, queueQoSZero: false })
      );
      const disconnect = () => clients.forEach((c) => c.end());
      timers.push(setInterval(() => setRelays(clients.filter((c) => c.connected).length), 1000));

      const publish = (name, data, retain = false) =>
        seal(data).then((payload) =>
          clients.forEach((c) => c.connected && c.publish(topics[name], payload, { retain }))
        );

      const seen = new Set();
      const isNew = (id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        return true;
      };

      const handlers = {};
      let queue = Promise.resolve();
      clients.forEach((client) => {
        client.on('message', (t, buf) => {
          const name = Object.keys(topics).find((k) => topics[k] === t);
          const text = buf.toString();
          if (!handlers[name] || !text) return;
          queue = queue
            .then(() => open(text))
            .then((data) => data && !done && handlers[name](data))
            .catch(console.error);
        });
      });
      const subscribe = (names, onConnect) =>
        clients.forEach((client) =>
          client.on('connect', () => {
            client.subscribe(names.map((n) => topics[n]));
            onConnect?.();
          })
        );
      const exit = (type) => {
        if (done) return;
        done = true;
        exitRef.current(type);
      };

      const saved = sessionStorage.getItem(dealerKey(tableId));
      if (saved) {
        const { table, kicked, seq: savedSeq = 0 } = JSON.parse(saved);
        let seq = savedSeq;
        const lastSeen = {};
        const snapshot = () => ({ ...game.publicState(table), dealerId: playerId });
        Object.keys(table.players).forEach((pid) => (lastSeen[pid] = Date.now()));

        const broadcast = () => {
          seq = Math.max(Date.now(), seq + 1);
          sessionStorage.setItem(dealerKey(tableId), JSON.stringify({ table, kicked, seq }));
          const s = snapshot();
          setState(s);
          publish('state', { seq, state: s }, true);
        };

        const apply = (pid, msg) => {
          switch (msg.type) {
            case 'ping':
              if (table.players[pid] || kicked.includes(pid)) return;
              game.join(table, pid, String(msg.playerName || 'Player').slice(0, 40));
              break;
            case 'join':
              if (kicked.includes(pid)) return;
              game.join(table, pid, String(msg.playerName || 'Player').slice(0, 40));
              break;
            case 'leave':
              if (pid === playerId) return;
              game.leave(table, pid);
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
            case 'kick':
              if (pid !== table.hostId || msg.targetId === pid || msg.targetId === playerId) return;
              game.leave(table, msg.targetId);
              kicked.push(msg.targetId);
              publish('notice', { id: messageId(), type: 'kicked', playerId: msg.targetId });
              break;
            case 'end':
              if (pid !== table.hostId) return;
              sessionStorage.removeItem(dealerKey(tableId));
              clients.forEach((c) => c.connected && c.publish(topics.state, '', { retain: true }));
              publish('notice', { id: messageId(), type: 'ended' }).finally(() => exit('ended'));
              return;
            default:
              return;
          }
          broadcast();
        };

        handlers.action = (msg) => {
          if (!isNew(msg.id) || !msg.from || msg.from === playerId) return;
          lastSeen[msg.from] = Date.now();
          apply(msg.from, msg);
        };
        subscribe(['action'], () => publish('state', { seq, state: snapshot() }, true));

        timers.push(
          setInterval(() => {
            const stale = Object.keys(table.players).filter(
              (pid) => pid !== playerId && Date.now() - (lastSeen[pid] ?? 0) > TIMEOUT_MS
            );
            stale.forEach((pid) => game.leave(table, pid));
            if (stale.length) broadcast();
            else publish('state', { seq, state: snapshot() }, true);
          }, HEARTBEAT_MS)
        );

        cleanups.push(disconnect);
        sendRef.current = (msg) => apply(playerId, msg);
        setConnected(true);
        apply(playerId, { type: 'join', playerName });
      } else {
        let lastSeq = 0;
        let lastStateAt = 0;
        const send = (msg) => publish('action', { ...msg, id: messageId(), from: playerId });
        const hello = () => send({ type: 'join', playerName });

        handlers.state = ({ seq, state: s }) => {
          if (!s || seq < lastSeq) return;
          lastStateAt = Date.now();
          setConnected(true);
          if (seq === lastSeq) return;
          if (lastSeq === 0 && !s.players.some((p) => p.id === playerId)) hello();
          lastSeq = seq;
          setState(s);
        };
        handlers.notice = (msg) => {
          if (!isNew(msg.id)) return;
          if (msg.type === 'ended' || (msg.type === 'kicked' && msg.playerId === playerId)) exit(msg.type);
        };
        subscribe(['state', 'notice'], hello);

        timers.push(
          setInterval(() => {
            send({ type: 'ping', playerName });
            if (lastStateAt && Date.now() - lastStateAt > TIMEOUT_MS) setConnected(false);
          }, HEARTBEAT_MS)
        );

        const leave = () => send({ type: 'leave' });
        window.addEventListener('pagehide', leave);
        cleanups.push(() => {
          window.removeEventListener('pagehide', leave);
          if (done) disconnect();
          else leave().finally(disconnect);
        });
        sendRef.current = send;
      }
    });

    return () => {
      timers.forEach(clearInterval);
      cleanups.forEach((fn) => fn());
      done = true;
    };
  }, [tableId, playerId, playerName]);

  const status = connected ? 'connected' : relays > 0 ? 'searching' : 'relays';
  return { state, connected, status, relays, send: (msg) => sendRef.current(msg) };
}
