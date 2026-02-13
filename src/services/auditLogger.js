import AuditLog from "../models/auditLog.model.js";
import eventTemplates from "../constants/eventTemplates.js";

export const eventQueue = [];

export function logEvent({ user, userName, action, entity, entityId, metadata = {} }) {
  const md = Object.assign({}, metadata || {});
  const srcs = [md.body || {}, md.params || {}, md.query || {}];
  for (const s of srcs) {
    if (s && typeof s === 'object') {
      for (const k of Object.keys(s)) {
        if (md[k] === undefined) md[k] = s[k];
      }
    }
  }

  if (user) {
    if (!md.email && user.email) md.email = user.email;
    if (!md.userName && user.fullName) md.userName = user.fullName;
  }

  const description = eventTemplates[action]
    ? eventTemplates[action](md)
    : md.description || action;

  const log = {
    userId: user && user._id ? user._id : (md.userId || null),
    userName: userName || (user && user.fullName) || md.userName || null,
    action,
    entity: entity || md.entity || null,
    entityId: entityId || md.entityId || null,
    description,
    metadata: md,
    timestamp: new Date(),
  };

  eventQueue.push(log);
  return log;
}

// Flush function used by worker
export async function flushEvents() {
  if (!eventQueue.length) return 0;
  const batch = eventQueue.splice(0, eventQueue.length);
  try {
    await AuditLog.insertMany(batch);
    return batch.length;
  } catch (err) {
    // push back on failure
    eventQueue.unshift(...batch);
    console.error("Failed to flush audit logs:", err.message);
    return 0;
  }
}