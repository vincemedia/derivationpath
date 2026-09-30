"""
Record the voice-over with Speechify, and time the subtitles to it.

Each line of video/voiceover.json is spoken on its own through Speechify's
text-to-speech API, whose speech marks say when every word starts and ends
(https://docs.speechify.ai/build/guides/text-to-speech/speech-marks). That
gives each word its real time, so the subtitles (subtitles.py) follow the
voice exactly: every line starts at its timecode and each word lights up
as it's spoken. The lines are then laid at their timecodes into one track
(voicetrack.py), which render.py puts under the video.

    SPEECHIFY_API_KEY=…  in .env.local (or the environment)
    python3 video/speechify.py            # records new or changed lines only
    python3 video/speechify.py --again    # records every line again

The voice and model are in voiceover.json ("speechify"). Recordings are kept
in video/voiceover/ (by line and voice), so editing one line re-records only
that line. See video/README.md.
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT  # noqa: E402
import subtitles  # noqa: E402
import voicetrack  # noqa: E402

API = "https://api.speechify.ai/v1/audio/speech"


def api_key():
    key = os.environ.get("SPEECHIFY_API_KEY")
    env = os.path.join(ROOT, ".env.local")
    if not key and os.path.exists(env):
        for line in open(env):
            if line.startswith("SPEECHIFY_API_KEY="):
                key = line.split("=", 1)[1].strip()
    return key


def speak(text, settings, key):
    """One line: its audio, and the speech marks (when each word is spoken, in ms)."""
    body = {"input": text, "voice_id": settings["voice"], "model": settings["model"], "audio_format": "mp3"}
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Speechify: {e.code} {e.read().decode()[:300]}")
    return base64.b64decode(res["audio_data"]), res["speech_marks"]


def words_from(marks, text):
    """Speech marks → words with times in seconds, matching the script's words."""
    chunks = [c for c in marks.get("chunks", []) if c["value"].strip()]
    script = text.split()
    if len(chunks) != len(script):
        return None
    # keep the script's spelling (and its punctuation) for the subtitles
    return [{"w": s, "start": round(c["start_time"] / 1000, 3), "end": round(c["end_time"] / 1000, 3)}
            for c, s in zip(chunks, script)]


def record(again=False):
    key = api_key()
    if not key:
        sys.exit("Set SPEECHIFY_API_KEY (in .env.local or the environment) first.")
    src = subtitles.load()
    settings = src["voice"]["speechify"]
    voice_id = f"speechify:{settings['voice']}:{settings['model']}"
    os.makedirs(voicetrack.DIR, exist_ok=True)
    timing = json.load(open(subtitles.TIMING)) if os.path.exists(subtitles.TIMING) else {}
    for n, line in enumerate(src["lines"], 1):
        k = subtitles.line_key(line["text"], src["voice"])
        mp3 = voicetrack.recording(line["text"], src["voice"])
        if not again and k in timing and os.path.exists(mp3) and timing[k].get("voice") == voice_id:
            print(f"  {n:2d} kept      {line['text'][:60]}")
            continue
        audio, marks = speak(line["text"], settings, key)
        words = words_from(marks, line["text"])
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
