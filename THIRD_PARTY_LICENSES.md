# Third-Party Licenses & Attributions

This project (Cyber Sakhi) is an open-source-style hackathon/demo build. The 3D
companion avatar feature relies on the following third-party components, used
under their respective licenses.

## TalkingHead runtime

- Package: `@met4citizen/talkinghead` (version installed: `1.7.0`)
- Author: Mika Suominen (met4citizen)
- License: **MIT** — https://github.com/met4citizen/TalkingHead/blob/main/LICENSE
- Used for: loading the GLB avatar, morph-target animation (blink, eyes,
  breathing, head movement, expressions), phoneme-level lip-sync from timed
  words (Oculus/ARKit visemes), and timed speech-queue playback.

## Three.js

- Package: `three` (version installed: `0.180.0`, pinned to match TalkingHead's
  `^0.180.0` peer range)
- License: **MIT** — https://github.com/mrdoob/three.js/blob/dev/LICENSE

## Avatar mesh — "brunette" (Ready Player Me)

- File: `public/assets/design/sakhi.glb`
- Origin: `met4citizen/TalkingHead` repository, `main` branch → `avatars/brunette.glb`
  (https://github.com/met4citizen/TalkingHead/tree/main/avatars)
- Author/model source: Ready Player Me (avatar creation service)
- License: **CC BY-NC 4.0** (Attribution-NonCommercial 4.0 International) —
  https://creativecommons.org/licenses/by-nc/4.0/
- The model carries ARKit (mouth/jaw/brow/eye) and Oculus (viseme) blend shapes,
  which is what the TalkingHead lip-sync runtime requires.

### Important usage note
The **CC BY-NC** license permits non-commercial use only. Cyber Sakhi is a
non-commercial hackathon/demo. **If this project ever ships commercially, the
avatar mesh must be replaced** with a commercially-licensed GLB that still ships
ARKit + Oculus viseme blend shapes (or a Creative Commons / public-domain rig,
e.g. MakeHuman + viseme add-on output).

## Lip-sync phoneme data

- The English G2P (grapheme-to-phoneme) word→viseme mapping ships inside the
  `talkinghead` package (`lipsync-en.mjs`) and is therefore covered by the same
  MIT license as the runtime.

---

Full license texts are available at the links above. Nothing in this document
changes the terms of the underlying licenses.