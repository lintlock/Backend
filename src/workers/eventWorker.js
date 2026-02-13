import { flushEvents } from '../services/auditLogger.js';

let intervalId = null;

export function startEventWorker(intervalMs = 5000) {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      const flushed = await flushEvents();
      if (flushed) console.debug(`Flushed ${flushed} audit logs`);
    } catch (err) {
      console.error('Event worker error', err.message);
    }
  }, intervalMs);
}

export function stopEventWorker() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}
