// The original Raised Hand geometry builder, executed in a same-origin worker.
import { buildScenes } from './raisedhand-grain-engine.js';

self.onmessage = ({ data }) => {
  try {
    const result = buildScenes(data.args);
    result.id = data.id;
    self.postMessage(result, [result.H.buffer, ...(result.D ? [result.D.buffer] : [])]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
