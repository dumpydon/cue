// Raised Hand's original 280-ray rounded-square construction, exported as local SVG assets.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const stops = {
  cool: [[0,'#ffffff',1],[.2,'#dff6ff',.95],[.45,'#7fd6ff',.92],[.7,'#38a6f2',.9],[1,'#2f5fcc',.85]],
  deep: [[0,'#ffffff',1],[.2,'#dbe7ff',.95],[.42,'#9dbcff',.92],[.64,'#6f8cff',.9],[.84,'#6a6cf0',.88],[1,'#4f5fd0',.85]],
};
const radius = 148, corner = 40;
const straight = 2 * (radius - corner);
const sideLength = straight + Math.PI / 2 * corner;
const perimeter = Array.from({ length: 280 }, (_, index) => {
  let distance = index / 280 * 4 * sideLength;
  const side = Math.floor(distance / sideLength);
  distance -= side * sideLength;
  let x, y;
  if (distance < straight) { x = radius; y = -(radius - corner) + distance; }
  else {
    const angle = (distance - straight) / corner;
    x = radius - corner + corner * Math.cos(angle);
    y = radius - corner + corner * Math.sin(angle);
  }
  for (let turn = 0; turn < side; turn++) [x, y] = [-y, x];
  return { x: 150 + x, y: 150 + y };
});
const rgb = hex => [1,3,5].map(index => parseInt(hex.slice(index, index + 2), 16));
function colourAt(palette, position) {
  let index = 0;
  while (index < palette.length - 2 && position > palette[index + 1][0]) index++;
  const [start, first, firstOpacity] = palette[index];
  const [end, last, lastOpacity] = palette[index + 1];
  const fraction = Math.min(1, Math.max(0, (position - start) / (end - start)));
  const from = rgb(first), to = rgb(last);
  return { colour: `rgb(${from.map((value, channel) => Math.round(value + (to[channel] - value) * fraction)).join(' ')})`, opacity: firstOpacity + (lastOpacity - firstOpacity) * fraction };
}
for (const tone of ['cool', 'deep']) {
  const paths = Array.from({ length: 16 }, (_, band) => {
    const start = .14 + .86 * band / 16, end = .14 + .86 * (band + 1) / 16;
    const { colour, opacity } = colourAt(stops[tone], (start + end) / 2);
    const d = perimeter.map(point => `M${(150 + (point.x - 150) * start).toFixed(1)} ${(150 + (point.y - 150) * start).toFixed(1)}L${(150 + (point.x - 150) * end).toFixed(1)} ${(150 + (point.y - 150) * end).toFixed(1)}`).join('');
    return `<path d="${d}" stroke="${colour}" stroke-opacity="${opacity}" stroke-width=".7" fill="none"/>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${tone === 'cool' ? '#9fe3ff' : '#dbe7ff'}" stop-opacity=".9"/><stop offset=".35" stop-color="${tone === 'cool' ? '#5cc8ff' : '#7aa2ff'}" stop-opacity=".35"/><stop offset="1" stop-color="${tone === 'cool' ? '#5cc8ff' : '#6f8cff'}" stop-opacity="0"/></radialGradient></defs><circle cx="150" cy="150" r="135" fill="url(#glow)"/>${paths}</svg>\n`;
  await writeFile(fileURLToPath(new URL(`../public/assets/pricing-rays-${tone}.svg`, import.meta.url)), svg);
}
