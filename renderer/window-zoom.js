(function (root) {
  function install({ cue, document = root.document }) {
    function apply({ factor }) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      document.documentElement.style.setProperty('--native-zoom', String(factor));
    }
    cue.on('window:zoom-changed', apply);
    return { ready: cue.windowZoomGet().then(apply) };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueWindowZoom = { install };
})(typeof window === 'object' ? window : globalThis);
