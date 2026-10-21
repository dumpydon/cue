# Compatibility logo assets

The product marks identify the third-party tools named in the compatibility row. Trademarks remain with their respective owners.

- `google-meet.svg`, `microsoft-teams.svg`, `slack.svg`, `discord.svg`: [SVGL](https://github.com/pheralb/svgl/tree/main/static/library), MIT license (notice below).
- `zoom.svg`: [gilbarbara/logos](https://github.com/gilbarbara/logos/blob/main/logos/zoom-icon.svg).
- `webex.svg`: [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/webex.svg), [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). The path is unchanged; a cyan fill is set for the dark page.

## Launch film logo

- `film-src/assets/leetcode.png`: LeetCode's [original reversed logo](https://leetcode.com/static/images/LeetCode_logo_rvs.png), used in the illustrated browser tab and LeetCode page header. Only transparent padding is cropped before resizing. The mark remains the property of LeetCode.

## Interactive desktop visuals

The site owner explicitly requested reuse of Cluely's public demo visuals and stated that they have permission to use them. The interactive Cue interface and its drag behavior are implemented locally for this site.

- `public/media/desktop-demo/meeting.mp4` and `meeting-poster.jpg`: derived from Cluely's [public hero clip](https://cluely.com/videos/home/hero-v2/pro-res-vp9-chrome.webm). The meeting window is cropped from its transparent outer padding, converted to H.264 at 1424 × 920 / 30 fps, and the audio track is removed entirely. The poster is a still from that clip. The footage is a demonstration, not a recording of a Cue customer meeting or a testimonial.
- `public/assets/desktop/{launchpad,safari,settings,zoom,trash}.png`: the corresponding product icons from `https://cluely.com/images/pages/home/<name>-icon.png`, used for the illustrated macOS Dock. Apple and Zoom retain their respective marks.
- Cue's own existing app icon and the existing Google Meet compatibility mark complete the Dock. The wallpaper is this repository's original `macos-sunrise.svg`.

## SVGL license notice

MIT License

Copyright (c) 2022 Pablo Hdez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Website typography

- `public/assets/fonts/geist-latin.woff2`: Geist, the same Latin font asset used for the reference website’s section headings. Typeface by the Geist Project Authors; licensed under the SIL Open Font License 1.1. The complete notice is included in `public/assets/fonts/OFL-Geist.txt`. Reference asset: `https://cluely.com/_next/static/media/22a5144ee8d83bca-s.p.woff2`; license: [vercel/geist-font](https://github.com/vercel/geist-font/blob/main/OFL.txt).

## Particle background

- `public/js/vendor/raisedhand-grain-engine.js`: Raised Hand's public grain engine, adapted under the permission stated by the user. Source: <https://raisedhand.ai/landing/grain-engine.js>, retrieved 21 October 2026. Geometry, particle paths, and timing are retained. Cue-specific compositing and same-origin worker changes are documented in `PARTICLE_BACKGROUND.md`.
