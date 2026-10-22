# Pricing preview

The pricing section follows the review cards. Monthly Pro is $19.99 against a
$69 standard price. Annual Pro is $149 total against a $249 standard price,
shown as a rounded $12.42/month equivalent. Annual billing costs 38% less than
twelve payments of the discounted monthly price. Savings are computed from
integer cents in `public/js/pricing-data.js`.

Both billing options renew 10 × 30-minute interviews each month (five hours of
live conversation). The proposed plan includes OpenAI and Claude API credits,
Whisper voice support, and unlimited screen assist, screenshots, and search.
The user confirmed the monthly allowance renewal and chose a launch-film demo
for the second card. Pro is explicitly coming soon; its button opens a plan
preview, not a checkout. This work does not add managed credits or billing to
the native application.

The card's rounded-square ray geometry and material/glare CSS, and the
910-millisecond text-to-particles transition, are adapted from Raised Hand's
public pricing component, under the permission stated by the user:

- JavaScript: <https://raisedhand.ai/_next/static/chunks/0jjaj9zpfgcln.js>
- CSS: <https://raisedhand.ai/_next/static/chunks/22rxmqfij1ggu.css>
- Retrieved 22 October 2026.

The original 280 rays, 16 color bands, 42-degree card rotation, 36-degree
perspective tilt, and 1.1-second glare sweep are retained. Run
`node site/scripts/generate-pricing-rays.mjs` to regenerate the two local SVG
materials. The metal emblem uses Cue's existing bezel, four studs, and curved
hourglass geometry with silver gradients, an extruded edge, and specular
highlights. It is a transparent vector asset, not a replacement application icon.

All assets are local. No Raised Hand checkout, account, telemetry, or APIs are
included. Reduced motion bypasses the number animation and card movement.
