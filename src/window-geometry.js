// Bounds are in Electron's screen DIP coordinates. Only the central column is
// visible; the transparent gutters leave room for the transcript sidebar.
const SIDE_WIDTH = 300;
const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 360;
const MIN_VISIBLE_HEIGHT = 80;
const MIN_VISIBLE_WIDTH = 100;
const RESIZE_EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(value) ? Math.round(value) : fallback;

function visibleBounds(bounds) {
  return { x: bounds.x + SIDE_WIDTH, y: bounds.y, width: bounds.width - 2 * SIDE_WIDTH, height: bounds.height };
}

function nativeBounds(bounds) {
  return { x: Math.round(bounds.x - SIDE_WIDTH), y: Math.round(bounds.y), width: Math.round(bounds.width + 2 * SIDE_WIDTH), height: Math.round(bounds.height) };
}

function sizeLimits(area) {
  return {
    minWidth: Math.min(MIN_WIDTH, area.width), maxWidth: area.width,
    minHeight: Math.min(MIN_HEIGHT, area.height), maxHeight: area.height
  };
}

function visibleHeight(height, areaHeight = height) {
  return Math.min(height, areaHeight, Math.max(MIN_VISIBLE_HEIGHT, Math.ceil(height * 0.2)));
}

function visibleWidth(width, areaWidth = width) {
  return Math.min(width, areaWidth, Math.max(MIN_VISIBLE_WIDTH, Math.ceil(width * 0.2)));
}

function fitBounds(bounds, area, { allowPartialBottom = false, allowPartialSides = false, screenBounds = area } = {}) {
  const b = visibleBounds(bounds);
  const limits = sizeLimits(area);
  const width = clamp(finite(b.width, DEFAULT_WIDTH), limits.minWidth, limits.maxWidth);
  const height = clamp(finite(b.height, DEFAULT_HEIGHT), limits.minHeight, limits.maxHeight);
  return nativeBounds({
    width, height,
    x: clamp(finite(b.x, area.x),
      allowPartialSides ? screenBounds.x - width + visibleWidth(width, screenBounds.width) : area.x,
      allowPartialSides ? screenBounds.x + screenBounds.width - visibleWidth(width, screenBounds.width) : area.x + area.width - width),
    y: clamp(finite(b.y, area.y), area.y,
      allowPartialBottom ? screenBounds.y + screenBounds.height - visibleHeight(height, screenBounds.height) : area.y + area.height - height)
  });
}

function restoreBounds(settings, area, { screenBounds = area } = {}) {
  const width = finite(settings.windowWidth, DEFAULT_WIDTH);
  const requested = {
    x: finite(settings.windowX, Math.round(area.x + (area.width - width) / 2)),
    y: finite(settings.windowY, area.y + 6),
    width,
    height: finite(settings.windowHeight, DEFAULT_HEIGHT)
  };
  const intersects = requested.x < screenBounds.x + screenBounds.width && requested.x + requested.width > screenBounds.x &&
    requested.y < screenBounds.y + screenBounds.height && requested.y + requested.height > screenBounds.y;
  const allowPartial = intersects && requested.width <= area.width && requested.height <= area.height;
  return fitBounds(nativeBounds(requested), area, { allowPartialBottom: allowPartial, allowPartialSides: allowPartial, screenBounds });
}

function dragBounds(bounds, origin, cursor, area, { screenBounds = area } = {}) {
  const b = visibleBounds(bounds);
  return {
    ...bounds,
    x: clamp(b.x + Math.round(cursor.x - origin.x),
      screenBounds.x - b.width + visibleWidth(b.width, screenBounds.width),
      screenBounds.x + screenBounds.width - visibleWidth(b.width, screenBounds.width)) - SIDE_WIDTH,
    y: clamp(bounds.y + Math.round(cursor.y - origin.y), area.y, screenBounds.y + screenBounds.height - visibleHeight(bounds.height, screenBounds.height))
  };
}

function resizeBounds(bounds, origin, cursor, edge, area, { screenBounds = area } = {}) {
  if (!RESIZE_EDGES.has(edge)) return { ...bounds };
  const b = visibleBounds(bounds);
  const limits = sizeLimits(area);
  const dx = Math.round(cursor.x - origin.x), dy = Math.round(cursor.y - origin.y);
  let left = b.x, right = b.x + b.width, top = b.y, bottom = b.y + b.height;
  const bottomLimit = Math.max(area.y + area.height, bottom);
  if (edge.includes('w')) left = clamp(b.x + dx, Math.max(Math.min(area.x, left), right - limits.maxWidth), right - limits.minWidth);
  if (edge.includes('e')) right = clamp(right + dx, left + limits.minWidth, Math.min(Math.max(area.x + area.width, right), left + limits.maxWidth));
  if (edge.includes('n')) top = clamp(b.y + dy, Math.max(area.y, bottom - limits.maxHeight), Math.min(bottom - limits.minHeight, screenBounds.y + screenBounds.height - MIN_VISIBLE_HEIGHT));
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + limits.minHeight, Math.min(bottomLimit, top + limits.maxHeight));
  const next = nativeBounds({ x: left, y: top, width: right - left, height: bottom - top });
  return fitBounds(next, area, { allowPartialBottom: true, allowPartialSides: true, screenBounds });
}

function savedBounds(bounds) {
  const b = visibleBounds(bounds);
  return { windowX: b.x, windowY: b.y, windowWidth: b.width, windowHeight: b.height };
}

module.exports = { SIDE_WIDTH, DEFAULT_WIDTH, MIN_WIDTH, MIN_HEIGHT, MIN_VISIBLE_HEIGHT, MIN_VISIBLE_WIDTH, RESIZE_EDGES, visibleBounds, visibleHeight, visibleWidth, dragBounds, sizeLimits, fitBounds, restoreBounds, resizeBounds, savedBounds };
