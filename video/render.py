"""
Render the explainer video from video/stage.html.

Brings the subtitles up to date (subtitles.py), opens the stage in headless
Chromium, draws every frame with seek(t), and encodes them with ffmpeg:

    public/videos/explainer.webm           VP9, two-pass (Chrome, Firefox, Android)
    public/videos/explainer.mp4            H.264 (Safari and older iPhones)
    public/videos/explainer-poster.jpg     the frame shown before it plays
    public/videos/explainer-captioned.mp4  with the subtitles baked in, for sharing

The app shows its own subtitles over the clean video (explainer-captions.json).
When the voice-over has been recorded (speechify.py) it goes under all
three videos automatically.

    python3 video/render.py                      # everything
    python3 video/render.py --audio music.m4a    # …with this track instead
    python3 video/render.py --silent             # …without sound
    python3 video/render.py --check              # one still per scene, on one sheet
    python3 video/render.py --stills 3 14 50     # just these moments, as PNGs
    python3 video/render.py --timings            # when each scene starts

It stops before rendering if a capture the stage needs is missing
(run capture.py). See video/README.md.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HERE, ROOT, VIDEOS, W, H, ffmpeg, open_stage, run  # noqa: E402
import voicetrack  # noqa: E402
import subtitles  # noqa: E402

STILLS = os.path.join(HERE, "stills")
FPS = 30
# VP9 target: sharp close-ups at about 4–5 MB for the whole video
VP9_BITRATE = "420k"


def frame(page, t, **kw):
    page.evaluate(f"window.seek({t})")
    return page.screenshot(clip={"x": 0, "y": 0, "width": W, "height": H}, **kw)


def timings():
    with sync_playwright() as p:
        browser, page = open_stage(p)
        for s in page.evaluate("window.SCENE_LIST"):
            print(f"{s['start']:6.2f}–{s['end']:6.2f}  {s['kind']:5s}  {s['label']}")
        print(f"{page.evaluate('window.DURATION'):6.2f}  end")
        browser.close()


def stills(times, captions):
    os.makedirs(STILLS, exist_ok=True)
    with sync_playwright() as p:
        browser, page = open_stage(p)
        page.evaluate(f"window.CAPTIONS_ON = {str(captions).lower()}")
        for t in times:
            path = os.path.join(STILLS, f"still-{t:05.2f}.png")
            frame(page, t, path=path)
            print(path)
        browser.close()


def check():
    """A contact sheet: each scene at its middle."""
    os.makedirs(STILLS, exist_ok=True)
    with sync_playwright() as p:
        browser, page = open_stage(p)
        scenes = page.evaluate("window.SCENE_LIST")
        for i, s in enumerate(scenes):
            frame(page, (s["start"] + s["end"]) / 2, path=os.path.join(STILLS, f"scene-{i:02d}.png"))
            print(f"{i:2d}  {s['start']:6.2f}  {s['label']}")
        browser.close()
    cols = 7
    rows = (len(scenes) + cols - 1) // cols
    sheet = os.path.join(STILLS, "sheet.jpg")
    run("-framerate", "1", "-pattern_type", "glob", "-i", os.path.join(STILLS, "scene-*.png"),
        "-vf", f"scale=240:-1,tile={cols}x{rows}:padding=6:color=0x222222", "-frames:v", "1", sheet)
    print(f"\n{sheet}")


def video(audio):
    os.makedirs(VIDEOS, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="explainer-")
    clean, captioned = os.path.join(tmp, "clean.mkv"), os.path.join(tmp, "captioned.mkv")

    def master(path):
        # every frame once, near-lossless, for the encodes to read from
        return subprocess.Popen(
            [ffmpeg(), "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg",
             "-i", "-", "-c:v", "copy", path],
            stdin=subprocess.PIPE,
        )

    with sync_playwright() as p:
        browser, page = open_stage(p)
        duration = page.evaluate("window.DURATION")
        has_captions = page.evaluate("!!window.CAPTIONS")
        frames = int(round(duration * FPS))
        a, b = master(clean), master(captioned) if has_captions else None
        for i in range(frames):
            page.evaluate("window.CAPTIONS_ON = false")
            a.stdin.write(frame(page, i / FPS, type="jpeg", quality=95))
            if b:
                page.evaluate("window.CAPTIONS_ON = true")
                b.stdin.write(frame(page, i / FPS, type="jpeg", quality=95))
            if i % FPS == 0:
                print(f"\rframes {i // FPS}s / {int(duration)}s", end="", flush=True)
        for enc in filter(None, (a, b)):
            enc.stdin.close()
            enc.wait()
        page.evaluate("window.CAPTIONS_ON = false")
        poster = os.path.join(VIDEOS, "explainer-poster.jpg")
        with open(poster, "wb") as f:
            f.write(frame(page, page.evaluate("window.POSTER_AT"), type="jpeg", quality=88))
        browser.close()
    print("\nencoding…")

    sound = ["-i", audio] if audio else []
    maps = ["-map", "0:v", "-map", "1:a", "-shortest"] if audio else ["-an"]
    aac = ["-c:a", "aac", "-b:a", "128k"] if audio else []
    webm = os.path.join(VIDEOS, "explainer.webm")
    mp4 = os.path.join(VIDEOS, "explainer.mp4")
    social = os.path.join(VIDEOS, "explainer-captioned.mp4")
    vp9 = ["-c:v", "libvpx-vp9", "-b:v", VP9_BITRATE, "-row-mt", "1", "-pix_fmt", "yuv420p",
           "-deadline", "good", "-cpu-used", "2", "-passlogfile", os.path.join(tmp, "vp9")]
    h264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    run("-i", clean, *vp9, "-pass", "1", "-an", "-f", "null", os.devnull)
    run("-i", clean, *sound, *maps, *vp9, "-pass", "2", *(["-c:a", "libopus", "-b:a", "96k"] if audio else []), webm)
    run("-i", clean, *sound, *maps, *h264, *aac, mp4)
    outputs = [webm, mp4, poster]
    if has_captions:
        run("-i", captioned, *sound, *maps, *h264, *aac, social)
        outputs.append(social)
    shutil.rmtree(tmp, ignore_errors=True)
    for path in outputs:
        print(f"{os.path.getsize(path) / 1e6:5.1f} MB  {os.path.relpath(path, ROOT)}")
    print("sound: " + (os.path.relpath(audio, ROOT) if audio else "none"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="*", type=float)
    ap.add_argument("--captions", action="store_true", help="with --stills: show the baked subtitles")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--timings", action="store_true")
    ap.add_argument("--audio", help="a track to lay under the video instead of the voice-over")
    ap.add_argument("--silent", action="store_true", help="no sound, even if the voice-over is recorded")
    args = ap.parse_args()
    if args.timings:
        timings()
    elif args.check:
        check()
    elif args.stills:
        stills(args.stills, args.captions)
    else:
        subtitles.build()
        track = None if args.silent else (args.audio or voicetrack.assemble())
        video(track)
