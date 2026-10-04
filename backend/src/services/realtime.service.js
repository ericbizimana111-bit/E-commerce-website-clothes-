const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Real-time push over Server-Sent Events.
 *
 * Channels:
 *   "admins"      every signed-in staff console
 *   "admin:<id>"  one staff member
 *   "user:<id>"   one customer (all their open tabs/devices)
 *
 * Browsers' EventSource cannot send Authorization headers, so clients first
 * exchange their normal bearer token for a short-lived, single-purpose stream
 * ticket (POST /api/realtime/ticket) and pass it as ?ticket=.
 *
 * Scaling note: subscribers live in this process. When running more than one
 * API instance, put a pub/sub (e.g. Redis) behind publish(); the REST
 * endpoints remain the source of truth and clients re-sync on reconnect.
 */

const TICKET_TTL_SECONDS = 60;
const HEARTBEAT_MS = 25000;
// Derived key: stream tickets can never be used as API tokens and vice versa.
const TICKET_SECRET = crypto.createHash('sha256').update(`realtime-ticket:${env.JWT_SECRET}:${env.ADMIN_JWT_SECRET}`).digest('hex');

const channels = new Map(); // channel -> Set<client>
let nextClientId = 1;

function issueTicket({ kind, id }) {
  return jwt.sign({ kind, sub: id }, TICKET_SECRET, { expiresIn: TICKET_TTL_SECONDS, audience: 'ugamarket-realtime' });
}

function verifyTicket(ticket) {
  return jwt.verify(ticket, TICKET_SECRET, { audience: 'ugamarket-realtime' });
}

function write(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    logger.warn('[realtime] write failed:', error.message);
  }
}

/** Attach an HTTP response as a subscriber of the given channels. */
function subscribe(req, res, channelNames) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  const client = { id: nextClientId++, res, channels: channelNames };
  for (const name of channelNames) {
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name).add(client);
  }
  write(client, 'ready', { at: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      /* closed */
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    for (const name of channelNames) {
      const set = channels.get(name);
      if (set) {
        set.delete(client);
        if (set.size === 0) channels.delete(name);
      }
    }
  });
}

/** Push an event to every subscriber of a channel. Never throws. */
function publish(channel, event, data) {
  const set = channels.get(channel);
  if (!set || set.size === 0) return 0;
  for (const client of set) write(client, event, data);
  return set.size;
}

function stats() {
  const out = {};
  for (const [name, set] of channels) out[name] = set.size;
  return out;
}

module.exports = { issueTicket, verifyTicket, subscribe, publish, stats, TICKET_TTL_SECONDS };
