# The explainer video

The 9:16 video in the site's hero, just under two minutes, with subtitles and (once recorded) a voice-over. It tells the idea behind the tool as a story: your seed phrase is the password to a secret cave, and the derivation path is the torch-lit trail through its tunnels to the chambers where your coins are. Then it shows the app itself doing it. The cave is drawn in code and the app scenes are filmed from the running app, so the whole thing can be made again whenever either changes.

- `public/videos/explainer.webm`: VP9, two-pass (Chrome, Firefox, Android)
- `public/videos/explainer.mp4`: H.264 (Safari and older iPhones)
- `public/videos/explainer-poster.jpg`: the frame the player shows before it plays
- `public/videos/explainer-captions.json`: the subtitles the player draws over the video
- `public/videos/explainer.vtt`: the same subtitles as standard WebVTT, a timestamp per word (for YouTube and other platforms)
- `public/videos/explainer-captioned.mp4`: a copy with the subtitles baked in, for sharing where caption files aren't shown
- `public/videos/explainer-voiceover.mp3`, `explainer-soundtrack.mp3`: the voice on its own, and voice plus music, once recorded

The words go with it:

- `video/voiceover.json`: the voice-over, line by line. This is the one file to edit for anything spoken or subtitled.
- `docs/explainer/voiceover.md`: the script to record, with the subtitles' timecodes (made from `voiceover.json`).
- `docs/explainer/script.md`: what's on screen, scene by scene, with times.

## Make it again

You need Python 3 with Playwright, and ffmpeg (the Apple Silicon build in `/opt/homebrew`).

```sh
npm run dev              # in one terminal
npm run video:capture    # walks the app's flows → video/captures/   (~1 min)
npm run video:check      # one still per scene → video/stills/sheet.jpg
npm run video:render     # subtitles, then every video file above
```

One-time setup: `pip3 install playwright && python3 -m playwright install chromium`, and `brew install ffmpeg`.

More:

```sh
npm run video:subtitles                            # just the subtitles and voiceover.md, after editing voiceover.json
npm run video:demo                                 # remake the demo wallet (video/demo.json, demo.js)
python3 video/render.py --timings                  # when each scene starts
python3 video/render.py --stills 17 36 --captions  # these moments, with the baked subtitles
python3 video/render.py --audio track.m4a          # another track instead of the voice-over
python3 video/render.py --silent                   # no sound
```

Or open `video/stage.html` in a browser: it plays live, with the time and scene name in the corner (space pauses, ← and → step a second). Open it through a local server (`npx vite` serves the repo root, so `http://localhost:5173/video/stage.html`) if your browser blocks `file://` fonts.

## The demo wallet

The app scenes show a real recovery, against a blockchain that isn't there. `video/demo.ts` makes a valid 12-word phrase out of cave words (*secret cave door open torch light path tunnel echo hidden gold chest*), derives its Centbee addresses, and invents coins on three of them (#2 was used and emptied, so the scan has to walk past it). It writes:

- `video/demo.json`: `capture.py` answers every WhatsOnChain and GorillaPool call from this, so the scan finds the coins, the sweep signs against real-looking source transactions, and "Send now" gets a txid back. Nothing is sent to the network.
- `video/demo.js`: the same addresses and amounts for the cave's chambers, so what the torch finds is what the app finds.

Nothing in the demo wallet exists on the blockchain.

## The flows as tests

`capture.py` walks the recovery flow of the app (load a wallet, scan every path, prepare, confirm and send a sweep), so it doubles as an end-to-end test:

```sh
npm run test:flows    # python3 video/capture.py --check
```

It fails, listing every step or mark it couldn't find, if a flow breaks: a button renamed, a screen changed, a step gone. Pictures of each step go to `video/check-captures/` (with `FAILED-<flow>.png` where one broke), not to the video's captures.

## The voice-over and subtitles

`video/voiceover.json` has each line, the scene it belongs to (a label in `stage.js`), and how far into that scene it starts. Lines follow their scene when scenes change length. `subtitles.py` turns it into the subtitles, `explainer.vtt` and `docs/explainer/voiceover.md`, all with the same timecodes, and warns when a line runs into the next.

- **Look:** white bold text on dark rounded bars, one per line, near the bottom of the video; the word being spoken is highlighted **white with black text**.
- **Pacing:** at most two lines, always of one sentence, so the bars hold the sentence being spoken. Line 2 joins when the voice reaches it, then the pair clears. Lines break at phrases (after commas and the like).
- **Title cards:** the subtitles pause while a title is on screen, since the title says it. Lines spoken over a title are marked *title card* in `voiceover.md`.
- **The site's player** (`src/components/ExplainerSubtitles.tsx`) draws them live over the clean video. A CC button turns them on and off, and the choice is remembered. The baked copy mirrors that look in `stage.html` (`.captions`), so change both together.

Until the voice is recorded, word timing is estimated from the script's pace (`wordsPerSecond` in `voiceover.json`).

### Recording it

```sh
# SPEECHIFY_API_KEY=… in .env.local (git ignores it), or exported
npm run video:voice            # records new or changed lines, times the subtitles to them
npm run video:render           # the videos, with the voice under them
```

`speechify.py` speaks each line on its own through Speechify's text-to-speech API in the voice set in `voiceover.json`. Its speech marks give every word's start and end, so each line starts at its timecode and the subtitles light up each word as it's spoken. `voicetrack.py` lays the lines at their timecodes into one track the length of the video, at an even loudness. Recordings are kept in `video/voiceover/` by line and voice, so editing one line re-records only that line (`--again` redoes them all).

`elevenlabs.py` does the same with ElevenLabs (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and the `"elevenlabs"` settings in `voiceover.json`).

If a recorded line runs into the next, `subtitles.py` says so. Shorten the line, or lengthen its scene in `SCENES`.

## The music

Not chosen yet: `video/music.json` has `"file": null`, so the soundtrack is the voice alone. To add a track:

1. Put it in `video/music/` and set `file`, `artist` and `title` in `music.json`.
2. Set its `bpm`, and a strong downbeat as `drop.track` (seconds into the track) with where it should land in the video as `drop.video` (for example on "Introducing Derivation Path", 8.8 s).
3. Set `BEAT_GRID` in `stage.js` to `{ bpm, at: drop.video }`. Every cut then snaps to the nearest beat (scene lengths in `SCENES` become guides; they move by at most half a beat), and `music.py` checks the two agree.
4. Credit it on the end card if the licence asks for it (the close scene in `stage.js`).

The level (`music.py`): low under the voice (−26 dB), up on a title card while nobody speaks (−14 dB), and down again a quarter second before the next line.

## How it works

1. **`capture.py`** walks each flow the script shows, one function per flow in `FLOWS`, in the dark theme on a phone-sized screen, answering the blockchain calls from the demo wallet. The page's clock is held, so the scan's rate limiter runs as fast as the capture needs.
   - **`snap`:** after every click or key, it saves a 3× screenshot (`captures/wallet_0.png`…) and notes where the things the video taps or zooms in on sit, as fractions of the screen, in `captures/marks.js`.
   - **`burst`:** films the scan frame by frame, moving the page's clock 2 s a frame so the status line races through the paths.
2. **`stage.html` + `stage.js`** is the whole video as one timeline: `seek(t)` draws the frame at `t` seconds.
   - **Cave scenes** (`cave(label, length, build)`): drawn with plain DOM and SVG. A small kit makes them: `torch` (a flame of four tongues, a glow and embers), `darkness` (black with holes of torchlight, as many as there are lights), `rockTexture`/`grain` (value noise drawn once to a canvas, laid over flat shapes), `dust`, `glint` and `coinPile`.
   - **The tunnel map** (`tunnelMap`): the derivation tree as tunnels. The door is `m`, every fork a step of a path, the niches at the bottom addresses. Centbee's, RockWallet's and ElectrumSV's real templates are in it (`NODES`, `EDGES`, `LEAVES`, `TRAILS`), and `trail(name, colour)` lights one of them fork by fork.
   - **Titles** (`title(text, look)`): starred words blur into focus in gold, on curved ribbons of light (`LOOKS`); the introduction and close use an eclipse horizon.
   - **App scenes** (`ui(label, length, phones)`): phones in a torch-lit studio, each with `screens` (which capture shows from when; `burst(name, t)` adds the filmed scan), `cam` (keyframes; `focus(shot, mark, zoom)` aims at a mark, `WHOLE` shows the whole phone) and `taps` (a fingertip with a gold ripple).
   - **Cuts:** a band of torchlight sweeps across each one.
3. **`render.py`** brings the subtitles up to date, opens the stage in headless Chromium and stops if any capture is missing. It draws every frame (30 fps, 720×1280) twice, clean and with subtitles, into two master files, then encodes the WebM, the MP4, the captioned MP4 and the poster, with the soundtrack under them once there is one.

## When the app changes

- **A screen looks different:** run `video:capture`, check with `video:check`, then `video:render`. Close-ups and taps re-aim themselves using the marks.
- **A flow changed** (a button renamed, a step added): update that flow's function in `capture.py`. If a step's picture changes name or timing, update the phone's `screens` and `taps` in `stage.js`.
- **New scene, new title or new timing:** edit `SCENES` in `stage.js` (times inside a scene count from its start). If you rename a scene, rename it in `voiceover.json` too. Then `video:render`; `--timings` shows where each scene starts, for `docs/explainer/script.md`.
- **New words:** edit `video/voiceover.json`, then `video:voice` (if recorded) and `video:render`.

`video/captures/` and `video/stills/` are generated and not committed.
