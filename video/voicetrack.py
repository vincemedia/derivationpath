"""
The soundtrack: each recorded line laid at its timecode into one voice
track the length of the video, and the music bed (music.py) under it once a track is chosen.
Shared by the recorders (speechify.py, elevenlabs.py) and render.py.

    video/voiceover/soundtrack.m4a     voice and music: what render.py puts under the videos
    public/videos/explainer-voiceover.mp3   the voice on its own
    public/videos/explainer-soundtrack.mp3  voice and music, on their own
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HERE, VIDEOS, beat_grid, run, scenes, timecode  # noqa: E402
import music  # noqa: E402
import subtitles  # noqa: E402

DIR = os.path.join(HERE, "voiceover")
TRACK = os.path.join(DIR, "soundtrack.m4a")
VOICE_MP3 = os.path.join(VIDEOS, "explainer-voiceover.mp3")
MIX_MP3 = os.path.join(VIDEOS, "explainer-soundtrack.mp3")


def recording(text, voice):
    """Where a line's recording is kept (by its words and the voice)."""
    return os.path.join(DIR, f"{subtitles.line_key(text, voice)}.mp3")


def assemble(lines=None):
    """Voice (each recorded line at its timecode) and music, the length of the video. Returns the track, or None."""
    src = subtitles.load()
    lines = lines or subtitles.build(quiet=True)
    scene_list, duration = scenes()
    parts = []
    for line, spec in zip(lines, src["lines"]):
        mp3 = recording(spec["text"], src["voice"])
        if os.path.exists(mp3):
            parts.append((line["start"], mp3))
    if not parts:
        return None
    if len(parts) < len(lines):
        print(f"  ! {len(lines) - len(parts)} lines aren't recorded yet (npm run video:voice)")
    voice = os.path.join(DIR, "voice.wav")
    args, mix = [], []
    for i, (start, mp3) in enumerate(parts):
        args += ["-i", mp3]
        ms = int(start * 1000)
        mix.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    graph = ";".join(mix) + ";" + "".join(f"[a{i}]" for i in range(len(parts)))
    # every line at the same level (lines are recorded separately), then the video's length
    graph += (f"amix=inputs={len(parts)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,"
              f"aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{duration}[out]")
    run(*args, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_s16le", voice)
    os.makedirs(VIDEOS, exist_ok=True)
    run("-i", voice, "-c:a", "libmp3lame", "-b:a", "160k", VOICE_MP3)

    if not music.enabled():
        # no track chosen yet (music.json "file": null): the voice alone
        run("-i", voice, "-c:a", "aac", "-b:a", "160k", TRACK)
        run("-i", TRACK, "-c:a", "libmp3lame", "-b:a", "192k", MIX_MP3)
        os.remove(voice)
        print(f"soundtrack: {os.path.relpath(TRACK)} ({len(parts)} lines, no music yet, {timecode(duration)}); "
              f"{os.path.relpath(VOICE_MP3)}")
        return TRACK

    # the music under it: its level follows the voice and the title cards
    titles = [(s["start"], s["end"]) for s in scene_list if s["kind"] == "title"]
    bed = music.bed(lines, titles, duration, os.path.join(DIR, "music.wav"), beat_grid())
    run("-i", voice, "-i", bed, "-filter_complex",
        "[0:a][1:a]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=disabled[out]",
        "-map", "[out]", "-c:a", "aac", "-b:a", "160k", TRACK)
    run("-i", TRACK, "-c:a", "libmp3lame", "-b:a", "192k", MIX_MP3)
    for f in (voice, bed):
        os.remove(f)
    cfg = music.load()
    print(f"soundtrack: {os.path.relpath(TRACK)} ({len(parts)} lines + {cfg['artist']} – {cfg['title']}, "
          f"{timecode(duration)}); {os.path.relpath(VOICE_MP3)}, {os.path.relpath(MIX_MP3)}")
    return TRACK
