"""
The music bed under the voice-over. Which track, where it's cropped and how
loud are in music.json; until a track is chosen ("file": null) there is no
music and the soundtrack is the voice alone.

With a track: its drop (music.json "drop.track") lands at "drop.video"
seconds into the video, and it plays at a low level under the voice. On a
title card, while nobody is speaking, it comes up a little, and goes down
again before the voice starts. Under a line spoken over a title card it
dips only partway. stage.js snaps every cut to the same beat grid
(BEAT_GRID there must match bpm and drop.video here).

voicetrack.py calls bed() when it builds the soundtrack.
"""

import json
import os
import struct
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HERE, run  # noqa: E402

SOURCE = os.path.join(HERE, "music.json")
ENV_RATE = 1000  # envelope samples per second


def load():
    return json.load(open(SOURCE))


def envelope(lines, titles, duration, cfg):
    """
    Gain in dB every millisecond. The level each moment wants: under a line,
    low (mid for a line over a title card); on a title card with nobody
    speaking, high, but low again early enough to be down before the next
    line starts. Then it moves there at a steady rate: up once the voice
    has been quiet a moment, down in `ramps.down`.
    """
    lv, rp = cfg["levels"], cfg["ramps"]
    voice = [(l["start"], l["end"], l["titled"]) for l in lines]
    ahead = rp["beforeVoice"] + rp["down"]

    def target(t):
        for a, b, titled in voice:
            if a <= t < b:
                return lv["mid"] if titled else lv["low"]
        if not any(a <= t < b for a, b in titles):
            return lv["low"]
        # a line over a title card lets the moment land and dips as it begins
        if any(not titled and t < a <= t + ahead for a, _, titled in voice):
            return lv["low"]
        return lv["high"]

    span = lv["high"] - lv["low"]
    rise = span / (rp["up"] * ENV_RATE)
    fall = span / (rp["down"] * ENV_RATE)
    hold = int(rp["afterVoice"] * ENV_RATE)
    out, cur, waited = [], lv["low"], 0
    for i in range(int(duration * ENV_RATE) + 1):
        want = target(i / ENV_RATE)
        if want > cur:
            waited += 1
            if waited > hold:
                cur = min(want, cur + rise)
        else:
            waited = 0
            cur = max(want, cur - fall)
        out.append(cur)
    return out


def write_envelope(gains_db, duration, cfg, path):
    """The envelope as a 1 kHz mono WAV of linear gains, with the fades in and out."""
    n = len(gains_db)
    fin, fout = cfg["fadeIn"] * ENV_RATE, cfg["fadeOut"] * ENV_RATE
    frames = bytearray()
    for i, db in enumerate(gains_db):
        g = 10 ** (db / 20)
        g *= min(1.0, i / fin) if fin else 1.0
        g *= min(1.0, (n - 1 - i) / fout) if fout else 1.0
        frames += struct.pack("<h", int(max(0.0, min(1.0, g)) * 32767))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(ENV_RATE)
        w.writeframes(bytes(frames))


def enabled():
    return bool(load().get("file"))


def bed(lines, titles, duration, out, grid=None):
    """The cropped, levelled music, the length of the video, into `out`. Returns out."""
    cfg = load()
    if not grid:
        sys.exit("music.json names a track, but stage.js has no BEAT_GRID: set it to {bpm, at: drop.video}")
    if grid and (grid["bpm"] != cfg["bpm"] or abs(grid["at"] - cfg["drop"]["video"]) > 1e-6):
        sys.exit(f"stage.js BEAT_GRID {grid} doesn't match music.json (bpm {cfg['bpm']}, drop at {cfg['drop']['video']})")
    track = os.path.join(HERE, cfg["file"])
    offset = cfg["drop"]["track"] - cfg["drop"]["video"]
    env = os.path.join(os.path.dirname(out), "music-envelope.wav")
    write_envelope(envelope(lines, titles, duration, cfg), duration, cfg, env)
    run("-ss", f"{offset:.3f}", "-t", f"{duration:.3f}", "-i", track, "-i", env,
        "-filter_complex",
        "[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:" + f"{duration:.3f}" + "[m];"
        "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0[e];"
        "[m][e]amultiply[out]",
        "-map", "[out]", "-c:a", "pcm_s16le", out)
    os.remove(env)
    return out
