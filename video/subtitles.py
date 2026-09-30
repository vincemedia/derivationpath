"""
Subtitles and the timecoded voice-over script, from one source.

Reads video/voiceover.json (each line anchored to a scene in stage.js) and
writes, all with the same timecodes:

    public/videos/explainer-captions.json  the site's live subtitles (src/components/ExplainerSubtitles.tsx)
    public/videos/explainer.vtt            standard WebVTT with a timestamp per word
    video/captions.js                 the same, for the captioned copy render.py bakes
    docs/explainer/voiceover.md       the script to record, with those timecodes

Word timing comes from the recorded voice when there is one
(video/voiceover/timing.json, made by speechify.py) and is estimated from
the script's pace otherwise.

    python3 video/subtitles.py

Subtitles show at most two lines of one sentence, the second joining when
the voice reaches it; the word being spoken is highlighted. They pause
while a title card is on screen. See video/README.md.
"""

import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HERE, ROOT, VIDEOS, scenes, timecode  # noqa: E402

SOURCE = os.path.join(HERE, "voiceover.json")
TIMING = os.path.join(HERE, "voiceover", "timing.json")
MAX_CHARS = 30  # a line, at the player's size
HOLD = 0.9  # a page stays this long after its last word
PAUSE = {",": 0.2, ";": 0.25, ":": 0.25, "…": 0.45, ".": 0.35, "?": 0.35, "!": 0.35}


def load():
    return json.load(open(SOURCE))


def line_key(text, voice):
    """Changes when a line's words or its voice do, so old recordings aren't reused."""
    return hashlib.sha1(json.dumps([text, voice], sort_keys=True).encode()).hexdigest()[:12]


def estimate(text, wps):
    """Word start/end times from the script's pace: longer words take longer; punctuation pauses."""
    words = text.split()
    raw = [0.13 + 0.058 * len(re.sub(r"[^\w']", "", w)) for w in words]
    k = (len(words) / wps) / sum(raw)
    out, t = [], 0.0
    for w, r in zip(words, raw):
        d = r * k
        out.append({"w": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d + PAUSE.get(w[-1], 0)
    return out


def _length(ws):
    return len(" ".join(w["w"] for w in ws))


def _split(ws):
    """An over-long phrase as two lines, as even as the words allow."""
    if _length(ws) <= MAX_CHARS or len(ws) < 2:
        return [ws]
    best = min(range(1, len(ws)), key=lambda k: max(_length(ws[:k]), _length(ws[k:])))
    return [ws[:best], ws[best:]]


def paginate(words):
    """
    Pages of at most two lines. Lines break at phrases (after commas and the
    like); a phrase too long for a line splits evenly in two and keeps both
    halves together; short neighbouring phrases share a line; a page never
    spans two sentences.
    """
    # phrases, and whether each ends a sentence
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if w["w"][-1] in ",;:….?!":
            phrases.append((cur, w["w"][-1] in ".?!"))
            cur = []
    if cur:
        phrases.append((cur, True))
    units = []  # [lines, ends sentence]
    for ws, end in phrases:
        lines = _split(ws)
        prev = units[-1] if units else None
        if prev and len(prev[0]) == 1 and len(lines) == 1 and not prev[1] and _length(prev[0][0] + ws) <= MAX_CHARS:
            prev[0][0] = prev[0][0] + ws
            prev[1] = end
        else:
            units.append([lines, end])
    pages, page = [], []
    for lines, end in units:
        if len(page) + len(lines) > 2:
            pages.append(page)
            page = []
        page += lines
        if end:
            pages.append(page)
            page = []
    if page:
        pages.append(page)
    return pages


def build(quiet=False):
    src = load()
    voice = src["voice"]
    scene_list, duration = scenes()
    starts = {s["label"]: s for s in scene_list}
    timing = json.load(open(TIMING)) if os.path.exists(TIMING) else {}
    hide = [[s["start"], s["end"]] for s in scene_list if s["kind"] == "title"]

    lines, warnings = [], []
    for n, l in enumerate(src["lines"]):
        scene = starts.get(l["scene"])
        if not scene:
            sys.exit(f'voiceover.json line {n + 1}: no scene called "{l["scene"]}" in stage.js')
        start = round(scene["start"] + l["at"], 2)
        rec = timing.get(line_key(l["text"], voice))
        words = rec["words"] if rec else estimate(l["text"], voice["wordsPerSecond"])
        words = [{"w": w["w"], "t": round(start + w["start"], 2), "end": round(start + w["end"], 2)} for w in words]
        lines.append({"n": n + 1, "scene": scene, "start": start, "end": words[-1]["end"], "words": words,
                      "text": l["text"], "recorded": bool(rec), "titled": scene["kind"] == "title"})

    for a, b in zip(lines, lines[1:]):
        if a["end"] > b["start"] - 0.15:
            warnings.append(f'line {a["n"]} ends at {timecode(a["end"])}, too close to line {b["n"]} at '
                            f'{timecode(b["start"])}: shorten it or lengthen "{a["scene"]["label"]}" in stage.js')
    if lines and lines[-1]["end"] > duration:
        warnings.append(f'line {lines[-1]["n"]} runs past the end of the video')

    # pages, each shown until the next begins (or a moment after its last word)
    pages = []
    for l in lines:
        for pg in paginate(l["words"]):
            pages.append({"line": l["n"], "titled": l["titled"],
                          "lines": [[{"w": w["w"], "t": w["t"], "e": w["end"]} for w in ln] for ln in pg],
                          "start": pg[0][0]["t"], "last": pg[-1][-1]["end"]})
    for a, b in zip(pages, pages[1:] + [None]):
        a["end"] = round(min(a["last"] + HOLD, b["start"] if b else duration), 2)

    shown = [p for p in pages if not p["titled"]]
    data = {"duration": duration, "hide": hide, "pages": [{k: p[k] for k in ("start", "end", "lines")} for p in shown]}

    os.makedirs(VIDEOS, exist_ok=True)
    with open(os.path.join(VIDEOS, "explainer-captions.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    with open(os.path.join(HERE, "captions.js"), "w") as f:
        f.write("window.CAPTIONS = " + json.dumps(data, separators=(",", ":")) + ";\n")
    with open(os.path.join(VIDEOS, "explainer.vtt"), "w") as f:
        f.write(vtt(pages))
    with open(os.path.join(ROOT, "docs", "explainer", "voiceover.md"), "w") as f:
        f.write(script(lines, pages, duration))

    if not quiet:
        rec = sum(l["recorded"] for l in lines)
        print(f"{len(lines)} lines, {len(shown)} subtitles ({rec}/{len(lines)} lines timed from the recording)")
        for w in warnings:
            print("  ! " + w)
    return lines


def vtt_time(t):
    h, rest = divmod(t, 3600)
    m, s = divmod(rest, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def vtt(pages):
    """WebVTT: one cue a page, a timestamp before each word so players can reveal them in turn."""
    out = ["WEBVTT", "", "NOTE Made by video/subtitles.py from video/voiceover.json.", ""]
    for i, p in enumerate(pages, 1):
        out += [str(i), f'{vtt_time(p["start"])} --> {vtt_time(p["end"])}']
        for ln in p["lines"]:
            parts = []
            for j, w in enumerate(ln):
                parts.append(w["w"] if (j == 0 and ln is p["lines"][0]) else f'<{vtt_time(w["t"])}>{w["w"]}')
            out.append(" ".join(parts))
        out.append("")
    return "\n".join(out)


def script(lines, pages, duration):
    """The voice-over to record, with the subtitles' timecodes."""
    out = [
        "# Derivation Path: voice-over",
        "",
        "<!-- Made by video/subtitles.py from video/voiceover.json. Edit that file, not this one. -->",
        "",
        f"About {sum(len(l['words']) for l in lines)} words over {timecode(duration)}: calm, warm, unhurried. "
        "Each line starts at its timecode, and the subtitles use exactly these times. Under each line are "
        "its subtitles: at most two lines on screen at once, the spoken word highlighted. Lines marked *title card* "
        "are spoken over a title and aren't subtitled; the title says it.",
        "",
        "To record it with ElevenLabs and lay it under the video, see `video/README.md`.",
        "",
        "| Start | End | Line |",
        "|---|---|---|",
    ]
    for l in lines:
        note = " *(title card)*" if l["titled"] else ""
        out.append(f'| {timecode(l["start"])} | {timecode(l["end"])} | {l["text"]}{note} |')
    out += ["", "## Subtitles, as they appear", ""]
    for l in lines:
        out.append(f'**{timecode(l["start"])}** {l["text"]}' + ("  \n*title card, not subtitled*" if l["titled"] else ""))
        if not l["titled"]:
            for p in [p for p in pages if p["line"] == l["n"]]:
                shown = " / ".join(" ".join(w["w"] for w in ln) for ln in p["lines"])
                out.append(f'- {timecode(p["start"])}–{timecode(p["end"])}  {shown}')
        out.append("")
    out += ["## Plain text, for a text-to-speech tool", ""]
    out += [l["text"].replace("…", "...") for l in lines]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    build()
