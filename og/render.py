"""Renders og/og.html to public/og.png (1200x630). Needs: pip install playwright && playwright install chromium"""
from pathlib import Path
from playwright.sync_api import sync_playwright

here = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630})
    page.goto((here / "og.html").as_uri())
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(300)
    page.screenshot(path=str(here.parent / "public" / "og.png"))
    browser.close()
print("wrote public/og.png")
