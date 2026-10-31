// One bounded answer operation, including preparation. Deadlines cancel the
// underlying provider request instead of only abandoning its Promise.
const { randomUUID } = require('node:crypto');

function answerError(code, message) { return Object.assign(new Error(message), { code }); }
function waitWithSignal(work, signal) {
  if (signal.aborted) { Promise.resolve(work).catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(work).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function createAnswerRun({ totalMs = 180000, firstActivityMs = 60000, idleMs = 25000, maxChars = 100000 } = {}) {
  const controller = new AbortController();
  let idle = null, finished = false, visibleText = false, characters = 0;
  const cancel = (code = 'ANSWER_CANCELLED', message = 'Answer stopped. Your partial answer is saved.') => {
    if (!finished && !controller.signal.aborted) controller.abort(answerError(code, message));
  };
  const total = setTimeout(() => cancel('ANSWER_DEADLINE', 'This answer took too long. The partial answer is saved; try a smaller question.'), totalMs);
  function activity() {
    if (finished || controller.signal.aborted) return;
    clearTimeout(idle);
    idle = setTimeout(() => cancel('ANSWER_STALLED', 'The model stopped responding. Your partial answer is saved; try again.'), visibleText ? idleMs : firstActivityMs);
  }
  return {
    id: randomUUID(), signal: controller.signal,
    get characters() { return characters; },
    cancel, activity,
    wait(work) { return waitWithSignal(work, controller.signal); },
    async stage(work, milliseconds, message) {
      const timer = setTimeout(() => cancel('ANSWER_PREPARATION_TIMEOUT', message), milliseconds);
      try { return await waitWithSignal(work, controller.signal); } finally { clearTimeout(timer); }
    },
    token(text) {
      if (finished || controller.signal.aborted) return false;
      if (characters + text.length > maxChars) {
        cancel('ANSWER_TOO_LARGE', 'The answer exceeded the safe length limit. Your partial answer is saved; ask for the next section.');
        return false;
      }
      characters += text.length; visibleText ||= !!text.length; activity(); return true;
    },
    check() { if (controller.signal.aborted) throw controller.signal.reason; },
    finish() { finished = true; clearTimeout(total); clearTimeout(idle); },
  };
}

module.exports = { createAnswerRun, waitWithSignal, answerError };
