const test = require('node:test');
const assert = require('node:assert/strict');
const { restoreBounds, resizeBounds, savedBounds, visibleBounds, fitBounds, dragBounds, visibleHeight } = require('../src/window-geometry');

const area = { x: 0, y: 25, width: 1440, height: 875 };
const start = { x: 0, y: 150, width: 1300, height: 600 }; // visible x=300, width=700
const origin = { x: 800, y: 600 };

test('all eight handles resize the intended axes while keeping opposite edges fixed', () => {
  const expected = {
    n: { x: 0, y: 180, width: 1300, height: 570 },
    s: { x: 0, y: 150, width: 1300, height: 630 },
    e: { x: 0, y: 150, width: 1340, height: 600 },
    w: { x: 40, y: 150, width: 1260, height: 600 },
    ne: { x: 0, y: 180, width: 1340, height: 570 },
    nw: { x: 40, y: 180, width: 1260, height: 570 },
    se: { x: 0, y: 150, width: 1340, height: 630 },
    sw: { x: 40, y: 150, width: 1260, height: 630 }
  };
  for (const [edge, bounds] of Object.entries(expected)) {
    assert.deepEqual(resizeBounds(start, origin, { x: 840, y: 630 }, edge, area), bounds, edge);
  }
});

test('shrinking from the northwest respects minimum size and anchors the southeast', () => {
  const resized = visibleBounds(resizeBounds(start, origin, { x: 4000, y: 4000 }, 'nw', area));
  assert.deepEqual(resized, { x: 480, y: 390, width: 520, height: 360 });
  assert.equal(resized.x + resized.width, 1000);
  assert.equal(resized.y + resized.height, 750);
});

test('growing from every corner stays within the usable display', () => {
  for (const edge of ['nw', 'ne', 'sw', 'se']) {
    const cursor = { x: edge.includes('w') ? -10000 : 10000, y: edge.includes('n') ? -10000 : 10000 };
    const b = visibleBounds(resizeBounds(start, origin, cursor, edge, area));
    assert.ok(b.x >= area.x && b.y >= area.y, edge);
    assert.ok(b.x + b.width <= area.width && b.y + b.height <= area.y + area.height, edge);
  }
});

test('visible bounds round-trip through settings without accumulating the sidebar gutters', () => {
  const settings = savedBounds(start);
  assert.deepEqual(settings, { windowX: 300, windowY: 150, windowWidth: 700, windowHeight: 600 });
  for (let i = 0; i < 4; i++) assert.deepEqual(restoreBounds(settings, area), start);
});

test('restoring a removed monitor or oversized window keeps all visible controls reachable', () => {
  const b = visibleBounds(restoreBounds({ windowX: 3000, windowY: 1500, windowWidth: 2000, windowHeight: 1500 }, area));
  assert.deepEqual(b, area);
});

test('negative monitor coordinates and small work areas are supported', () => {
  const smallArea = { x: -600, y: -300, width: 480, height: 320 };
  const b = visibleBounds(fitBounds(start, smallArea));
  assert.deepEqual(b, smallArea);
  assert.deepEqual(visibleBounds(restoreBounds({}, smallArea)), smallArea);
});

test('legacy position-only settings and malformed sizes restore to sensible bounds', () => {
  assert.deepEqual(visibleBounds(restoreBounds({ windowX: 100, windowY: 60 }, area)), { x: 100, y: 60, width: 700, height: 600 });
  const b = visibleBounds(restoreBounds({ windowX: NaN, windowY: Infinity, windowWidth: -40, windowHeight: 'bad' }, area));
  assert.equal(b.width, 520);
  assert.equal(b.height, 600);
  assert.ok(Object.values(b).every(Number.isFinite));
  assert.deepEqual(resizeBounds(start, origin, { x: 1000, y: 1000 }, 'invalid', area), start);
});

test('dragging below the screen keeps about 20 percent visible and never changes size', () => {
  const dragged = dragBounds(start, origin, { x: 840, y: 10000 }, area);
  assert.deepEqual(dragged, { ...start, x: 40, y: 780 });
  assert.equal(area.y + area.height - dragged.y, 120);
  assert.deepEqual(fitBounds(dragged, area, { allowPartialBottom: true }), dragged);
  assert.equal(visibleHeight(360), 80);
});

test('a parked window keeps its position across relaunch and horizontal resizing', () => {
  const parked = { ...start, y: 780 };
  assert.deepEqual(restoreBounds(savedBounds(parked), area), parked);
  const resized = resizeBounds(parked, origin, { x: 840, y: 600 }, 'e', area);
  assert.deepEqual(resized, { ...parked, width: 1340 });
});

test('parked windows remain reachable while resizing and can be dragged back up', () => {
  const parked = { ...start, y: 780 };
  for (const dy of [-1000, -50, 50, 1000]) {
    const resized = resizeBounds(parked, origin, { x: 800, y: origin.y + dy }, 'n', area);
    assert.ok(resized.y >= area.y);
    assert.ok(resized.height >= 360 && resized.height <= area.height);
    assert.ok(area.y + area.height - resized.y >= visibleHeight(resized.height, area.height));
  }
  assert.equal(dragBounds(parked, origin, { ...origin, y: origin.y - 300 }, area).y, 480);
});

test('parking works on displays with negative coordinates and small work areas', () => {
  const other = { x: -1440, y: -900, width: 1440, height: 875 };
  assert.equal(dragBounds(start, origin, { x: -1000, y: 3000 }, other).y, -145);
  const tiny = { x: 0, y: 0, width: 480, height: 60 };
  assert.equal(dragBounds(start, origin, { x: 0, y: 10000 }, tiny).y, 0);
});

test('left and right parking retain 20 percent of the visible column, excluding transparent gutters', () => {
  for (const direction of [-1, 1]) {
    const parked = dragBounds(start, origin, { x: direction * 10000, y: origin.y }, area);
    const b = visibleBounds(parked);
    assert.equal(b.x, direction < 0 ? -560 : 1300);
    assert.equal(b.width, 700);
    assert.equal(b.height, 600);
    assert.deepEqual(fitBounds(parked, area, { allowPartialSides: true, allowPartialBottom: true }), parked, 'release preserves side parking');
    assert.deepEqual(restoreBounds(savedBounds(parked), area), parked, 'relaunch preserves side parking');
    assert.deepEqual(resizeBounds(parked, origin, { x: origin.x, y: origin.y - 30 }, 's', area), { ...parked, height: 570 }, 'vertical resize preserves horizontal parking');
  }
});

test('side parking uses physical display edges even when the Dock reserves space', () => {
  const screenBounds = { x: -1440, y: -900, width: 1440, height: 900 };
  const workArea = { x: -1340, y: -875, width: 1240, height: 775 };
  const options = { screenBounds, allowPartialSides: true, allowPartialBottom: true };
  const left = dragBounds(start, origin, { x: -10000, y: 10000 }, workArea, options);
  assert.deepEqual(visibleBounds(left), { x: -2000, y: -120, width: 700, height: 600 });
  assert.deepEqual(fitBounds(left, workArea, options), left);
  assert.deepEqual(restoreBounds(savedBounds(left), workArea, options), left);
  const right = dragBounds(start, origin, { x: 10000, y: 10000 }, workArea, options);
  assert.deepEqual(visibleBounds(right), { x: -140, y: -120, width: 700, height: 600 });
  assert.deepEqual(restoreBounds(savedBounds(right), workArea, options), right);
  assert.deepEqual(visibleBounds(fitBounds(right, workArea)), { x: -800, y: -700, width: 700, height: 600 }, 'opening Settings can still bring the whole window into the work area');
});

test('horizontal resizing of a side-parked window preserves the opposite edge when it remains reachable', () => {
  const left = { ...start, x: -860 };
  const right = { ...start, x: 1000 };
  assert.deepEqual(resizeBounds(left, origin, { x: origin.x + 100, y: origin.y }, 'e', area), { ...left, width: 1400 });
  assert.deepEqual(resizeBounds(right, origin, { x: origin.x - 100, y: origin.y }, 'w', area), { ...right, x: 900, width: 1400 });
  for (const parked of [left, right]) for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const resized = visibleBounds(resizeBounds(parked, origin, { x: 10000, y: 10000 }, edge, area));
    const exposed = Math.min(resized.x + resized.width, area.x + area.width) - Math.max(resized.x, area.x);
    assert.ok(exposed >= Math.ceil(resized.width * .2), `${edge} keeps a draggable strip visible`);
    assert.ok(resized.width >= 520 && resized.width <= area.width);
  }
});
