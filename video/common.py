"""Shared by render.py, subtitles.py, voicetrack.py and the recorders: paths, ffmpeg and the stage."""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VIDEOS = os.path.join(ROOT, "public", "videos")
W, H = 720, 1280


def ffmpeg(tool="ffmpeg"):
    # the Apple Silicon build; /usr/local's is Intel on this machine
    for path in (f"/opt/homebrew/bin/{tool}", shutil.which(tool)):
        if path and os.path.exists(path):
            return path
    sys.exit(f"{tool} not found: brew install ffmpeg")


def run(*args):
    subprocess.run([ffmpeg(), "-v", "error", "-y", *args], check=True)


def open_stage(p, need_captures=True):
    """The stage in headless Chromium, ready to seek. Stops if captures are missing."""
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    page.goto(f"file://{HERE}/stage.html?render")
    page.wait_for_function("window.READY !== undefined")
    page.evaluate("window.READY")
    missing = page.evaluate("window.MISSING")
    if missing and need_captures:
        browser.close()
        sys.exit("Missing captures (run `npm run video:capture`):\n  " + "\n  ".join(missing))
    # only the frame, no page around it
    page.add_style_tag(content="body{display:block;min-height:0}#stage{position:fixed;left:0;top:0}")
    return browser, page


def scenes():
    """Every scene: label, kind (title / ui), start, end; and the video's length."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser, page = open_stage(p, need_captures=False)
        out = page.evaluate("window.SCENE_LIST"), page.evaluate("window.DURATION")
        browser.close()
    return out


def beat_grid():
    """The beat the stage snaps its cuts to (stage.js BEAT_GRID)."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser, page = open_stage(p, need_captures=False)
        grid = page.evaluate("window.BEAT_GRID")
        browser.close()
    return grid


def timecode(t):
    """0:13.3"""
    return f"{int(t // 60)}:{t % 60:04.1f}"
