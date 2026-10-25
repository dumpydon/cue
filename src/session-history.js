const text = value => typeof value === 'string' ? value : '';
const texts = value => [].concat(value || []).filter(item => typeof item === 'string');
const date = value => Number.isFinite(value) ? value : null;

function summary(meeting, activeId) {
  return {
    id: meeting.id, title: text(meeting.title) || 'Untitled session',
    startedAt: date(meeting.startedAt), endedAt: date(meeting.endedAt),
    summary: text(meeting.summary), turnCount: Array.isArray(meeting.transcript) ? meeting.transcript.length : 0,
    live: meeting.id === activeId
  };
}

function listSessions(store, activeId, { trash = false } = {}) {
  return (store ? store.all() : []).filter(m => !!m.deletedAt === !!trash).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).map(meeting => summary(meeting, activeId));
}

function getSession(store, id, activeId) {
  if (typeof id !== 'string' || id.length > 200) return null;
  const meeting = store?.get(id);
  if (!meeting || meeting.deletedAt) return null;
  return {
    ...summary(meeting, activeId), keyPoints: texts(meeting.keyPoints), decisions: texts(meeting.decisions),
    actionItems: texts(meeting.actionItems), followUp: texts(meeting.followUp),
    transcript: (Array.isArray(meeting.transcript) ? meeting.transcript : []).map(turn => ({
      channel: turn.channel === 'you' ? 'you' : 'them', text: text(turn.text), ts: date(turn.ts)
    }))
  };
}

module.exports = { listSessions, getSession };
