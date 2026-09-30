"""
Record the voice-over with ElevenLabs, and time the subtitles to it.

Each line of video/voiceover.json is spoken on its own through ElevenLabs'
"with timestamps" API, which says when every character is spoken. That
gives each word its real time, so the subtitles (subtitles.py) follow the
voice exactly. The lines are then laid at their timecodes into one track,
one soundtrack with the music (voicetrack.py), which render.py puts under the
video. (The voice-over is now recorded with speechify.py; this is the
alternative.)

    export ELEVENLABS_API_KEY=…      # elevenlabs.io → Profile → API keys
    export ELEVENLABS_VOICE_ID=…     # the voice to use (Voices → ID)
    python3 video/elevenlabs.py            # records new or changed lines only
    python3 video/elevenlabs.py --again    # records every line again

Recordings are kept in video/voiceover/ (by line and voice), so editing one
line re-records only that line. See video/README.md.
"""

import argparse
import base64
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import subtitles  # noqa: E402
import voicetrack  # noqa: E402

DIR = voicetrack.DIR
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128"


def speak(text, voice_id, settings, key):
    """One line: its audio, and when each character is spoken."""
    body = {
        "text": text,
        "model_id": settings["model"],
        "voice_settings": {k: settings[k] for k in ("stability", "similarity_boost", "style")},
    }
    req = urllib.request.Request(
        API.format(voice=voice_id),
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
    return base64.b64decode(res["audio_base64"]), res["alignment"]


def words_from(alignment, text):
    """Characters with times → words with times, matching the script's words."""
    words, cur, start, end = [], "", None, None
    for ch, s, e in zip(alignment["characters"], alignment["character_start_times_seconds"],
                        alignment["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                words.append({"w": cur, "start": round(start, 3), "end": round(end, 3)})
            cur, start = "", None
            continue
        if start is None:
            start = s
        cur += ch
        end = e
    if cur:
        words.append({"w": cur, "start": round(start, 3), "end": round(end, 3)})
    script = text.split()
    if len(words) != len(script):
        return None
    # keep the script's spelling (and its punctuation) for the subtitles
    return [{**w, "w": s} for w, s in zip(words, script)]


def record(again=False):
    key = os.environ.get("ELEVENLABS_API_KEY")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID")
    if not key or not voice_id:
        sys.exit("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID first (see the top of this file).")
    src = subtitles.load()
    settings = src["voice"]["elevenlabs"]
    voice = {**src["voice"], "id": voice_id}
    os.makedirs(DIR, exist_ok=True)
    timing = json.load(open(subtitles.TIMING)) if os.path.exists(subtitles.TIMING) else {}
    for n, line in enumerate(src["lines"], 1):
        k = subtitles.line_key(line["text"], src["voice"])
        mp3 = os.path.join(DIR, f"{k}.mp3")
        if not again and k in timing and os.path.exists(mp3) and timing[k].get("voice") == voice_id:
            print(f"  {n:2d} kept      {line['text'][:60]}")
            continue
        audio, alignment = speak(line["text"], voice_id, settings, key)
        words = words_from(alignment, line["text"])
        if not words:
            print(f"  {n:2d} ! word timing didn't match the script; the subtitles estimate this line")
        with open(mp3, "wb") as f:
            f.write(audio)
        if words:
            timing[k] = {"voice": voice_id, "text": line["text"], "words": words, "length": words[-1]["end"]}
        print(f"  {n:2d} recorded  {line['text'][:60]}")
    with open(subtitles.TIMING, "w") as f:
        json.dump(timing, f, indent=1)
    lines = subtitles.build()
    voicetrack.assemble(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--again", action="store_true", help="record every line again")
    record(ap.parse_args().again)
