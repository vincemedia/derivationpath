"""
Capture the app screens the explainer video uses.

Drives the running app (npm run dev, http://localhost:5173) on a phone-sized
screen through each flow the script shows, and saves a 3x screenshot of
every step to video/captures/<shot>.png. A flow is a few clicks and keys;
after each one `snap` takes a picture and notes where the things the video
taps or zooms in on sit (as fractions of the screen) in captures/marks.js.
So taps and close-ups follow the UI when its layout changes.

The blockchain is played by the demo wallet (video/demo.ts → demo.json):
every WhatsOnChain and GorillaPool call is answered from it, so the scan
finds the demo coins and the sweep signs and "sends" without touching the
network. The page's clock is held, so the scan's rate limiter runs as fast
as the video needs; `burst` films the scan frame by frame.

    python3 video/capture.py             # every flow
    python3 video/capture.py scan move   # just these flows
    python3 video/capture.py --check     # as a test: fails if a flow breaks

With --check it's an end-to-end test of the recovery flow: pictures go to
video/check-captures/ instead, and it exits with an error listing every
step or mark that failed.

See video/README.md.
"""

import hashlib
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:5173")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "captures")
DEMO = json.load(open(os.path.join(HERE, "demo.json")))
# what went wrong, in --check mode
PROBLEMS: list[str] = []
W, H, DPR = 393, 852, 3
BURST_FPS = 15

# the Agentation toolbar (dev only), Vite's error overlay and scrollbars;
# scrolling is instant, since smooth scrolling runs on the held clock
HIDE = (
    "agentation-toolbar,vite-error-overlay{display:none!important}"
    "html{scrollbar-width:none;scroll-behavior:auto!important}"
)


# ------------------------------------------------------------------ helpers

def text(t):
    return lambda pg: pg.get_by_text(t, exact=False).first


def button(name):
    return lambda pg: pg.get_by_role("button", name=name).first


def label(name):
    return lambda pg: pg.get_by_label(name, exact=False).first


def css(selector):
    return lambda pg: pg.locator(selector).first


class Session:
    def __init__(self, pg, marks, bursts):
        self.pg = pg
        self.marks = marks
        self.bursts = bursts

    def wait(self, ms):
        # the page's clock is held: move it along, and let real work (fetches) settle
        self.pg.clock.run_for(ms)
        self.pg.wait_for_timeout(min(ms, 250))

    def click(self, find, wait=600):
        find(self.pg).click()
        self.wait(wait)

    def type(self, keys, wait=300):
        self.pg.keyboard.type(keys)
        self.wait(wait)

    def show(self, find, block="center"):
        """Scroll so this sits in view (not hidden under the sticky top bar or the tab bar)."""
        find(self.pg).evaluate(f"e => e.scrollIntoView({{block: '{block}', behavior: 'instant'}})")
        self.pg.wait_for_timeout(120)

    def scroll_by(self, dy):
        self.pg.evaluate(f"window.scrollBy({{top: {dy}, behavior: 'instant'}})")
        self.pg.wait_for_timeout(120)

    def _marks(self, name, marks):
        found = {}
        for key, find in (marks or {}).items():
            box = find(self.pg).bounding_box()
            if box:
                found[key] = {"u": (box["x"] + box["width"] / 2) / W, "v": (box["y"] + box["height"] / 2) / H}
            else:
                print(f"  ! {name}.{key} not found")
                PROBLEMS.append(f"{name}: couldn't find what \"{key}\" points at")
        self.marks[name] = found

    def snap(self, name, marks=None):
        """A picture of this step, and where its marks are."""
        self.pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
        self._marks(name, marks)
        print("  ", name)

    def burst(self, name, seconds, marks=None, step_ms=None, after=None):
        """
        Film what the app does next, frame by frame (name_00, name_01, …):
        the clock moves `step_ms` between pictures (1/15 s unless given, so a
        slow scan can be filmed faster than it runs). `after` runs first.
        """
        if after:
            after()
        frames = int(round(seconds * BURST_FPS))
        for i in range(frames):
            self.pg.screenshot(path=os.path.join(OUT, f"{name}_{i:02d}.png"))
            self.pg.clock.run_for(step_ms or int(1000 / BURST_FPS))
            self.pg.wait_for_timeout(40)
        self.bursts[name] = frames
        self._marks(f"{name}_{frames - 1:02d}", marks)
        print(f"   {name} ×{frames}")


# ---------------------------------------------------------- the blockchain

def txid_of(hexstr):
    raw = bytes.fromhex(hexstr)
    return hashlib.sha256(hashlib.sha256(raw).digest()).digest()[::-1].hex()


def woc(route):
    """WhatsOnChain, answered from the demo wallet."""
    url = route.request.url
    path = re.sub(r"^https://api\.whatsonchain\.com/v1/bsv/main", "", url).split("?")[0]
    addrs = DEMO["addresses"]
    m = re.match(r"^/address/([^/]+)/(balance|unspent/all|history)$", path)
    if m:
        entry = addrs.get(m.group(1), {"history": [], "unspent": []})
        kind = m.group(2)
        if kind == "balance":
            body = {"confirmed": sum(u["value"] for u in entry["unspent"]), "unconfirmed": 0}
        elif kind == "history":
            body = entry["history"]
        else:
            body = {"result": entry["unspent"]}
        return route.fulfill(json=body)
    if path == "/exchangerate":
        return route.fulfill(json={"rate": DEMO["price"], "currency": "USD"})
    m = re.match(r"^/tx/([0-9a-f]{64})/hex$", path)
    if m and m.group(1) in DEMO["txs"]:
        return route.fulfill(body=DEMO["txs"][m.group(1)], content_type="text/plain")
    if path == "/tx/raw" and route.request.method == "POST":
        hexstr = json.loads(route.request.post_data or "{}").get("txhex", "")
        return route.fulfill(body=json.dumps(txid_of(hexstr)), content_type="application/json")
    print(f"  ! unanswered: {url}")
    return route.fulfill(status=404, json={"error": "not in the demo wallet"})


def ordinals(route):
    """GorillaPool: no NFTs or tokens anywhere in the demo wallet."""
    return route.fulfill(json=[])


# ------------------------------------------------------------------- flows

def open_app(s):
    """The site, top of the page, no wallet loaded."""
    s.pg.goto(BASE)
    s.pg.add_style_tag(content=HIDE)
    s.pg.wait_for_selector("#walletPreset")
    s.wait(1500)
    # the tool stays locked until the rules are acknowledged
    s.pg.locator("#notice-ok").click()
    s.wait(400)
    # and typing a seed phrase is behind its own warning
    s.pg.locator("#phrase-accept").click()
    s.wait(300)


def to_tab(s, name):
    s.click(lambda pg: pg.locator("nav.tabbar").get_by_role("button", name=name, exact=True), 700)


def load_wallet(s, film=True):
    """Pick Centbee, type the phrase, load it."""
    snap = s.snap if film else (lambda *a, **k: None)
    s.show(css("#walletPreset"), "start")
    s.scroll_by(-230)
    snap("wallet_0", {"preset": css("#walletPreset"), "title": text("Wallet & derivation")})
    s.click(css("#walletPreset"), 500)
    snap("wallet_picker", {"centbee": css('[cmdk-item][data-value="centbee"]'), "list": css(".command-list")})
    s.click(css('[cmdk-item][data-value="centbee"]'), 500)
    s.show(css("#mnemonicInput"))
    snap("wallet_1", {"phrase": css("#mnemonicInput"), "path": css("#template")})
    s.click(css("#mnemonicInput"), 200)
    words = DEMO["phrase"].split()
    for i in range(0, 12, 3):
        s.type(" ".join(words[i:i + 3]) + (" " if i < 9 else ""), 150)
        snap(f"wallet_phrase_{i // 3}", {"phrase": css("#mnemonicInput")})
    s.show(css("#mnemonicInput"), "start")
    s.scroll_by(-80)
    snap("wallet_2", {"load": button("Load wallet"), "phrase": css("#mnemonicInput")})
    s.click(button("Load wallet"), 900)
    s.show(css(".key-grid"), "start")
    s.scroll_by(-160)
    snap("wallet_loaded", {"status": text("Wallet loaded"), "address": text(DEMO_ADDR0)})


def flow_wallet(s):
    open_app(s)
    load_wallet(s)


def flow_scan(s):
    open_app(s)
    load_wallet(s, film=False)
    to_tab(s, "Recover")
    s.show(css("#scanScope"), "start")
    s.scroll_by(-120)
    s.snap("recover_0", {"scope": css("#scanScope"), "scan": button("Scan for coins")})
    s.click(css("#scanScope"), 500)
    s.snap("recover_scope", {"all": text("Every wallet we know")})
    s.click(text("Every wallet we know"), 500)
    s.snap("recover_1", {"scope": css("#scanScope"), "scan": button("Scan for coins")})
    s.show(button("Scan for coins"), "start")
    s.scroll_by(-150)
    s.snap("recover_2", {"scan": button("Scan for coins")})
    # the scan: the limiter spaces calls 350 ms apart, so each frame moves the clock 2 s
    s.burst("scan", 2.4, step_ms=2000, after=lambda: button("Scan for coins")(s.pg).click())
    # let it finish (every path × both chains, twenty empty addresses each)
    for _ in range(400):
        if s.pg.get_by_text("Done. Checked").count():
            break
        s.pg.clock.run_for(2000)
        s.pg.wait_for_timeout(30)
    s.wait(400)
    s.show(text("Funded addresses"), "start")
    s.scroll_by(-230)
    s.snap("recover_done", {"status": text("Done. Checked"), "table": css(".utxo-table"), "total": css(".utxo-table tfoot")})


def flow_move(s):
    flow_scan_quiet(s)
    s.show(css(".sweep-box"), "start")
    s.scroll_by(-100)
    s.snap("move_0", {"total": css(".sweep-total"), "brc100": css(".sweep-box .segmented label:first-child"), "address": css(".sweep-box .segmented label:last-child")})
    s.click(css(".sweep-box .segmented label:last-child"), 400)
    s.click(css("#recoveryDestination"), 200)
    s.type(DEMO["destination"], 300)
    s.show(css(".sweep-box"), "start")
    s.scroll_by(-100)
    s.snap("move_1", {"dest": css("#recoveryDestination"), "prepare": button("Prepare transaction")})
    s.click(button("Prepare transaction"), 1200)
    s.show(button("Send now"), "center")
    s.snap("move_2", {"ready": css(".panel.active .status"), "send": button("Send now")})
    s.click(button("Send now"), 500)
    s.snap("move_confirm", {"confirm": lambda pg: pg.locator("dialog[open]").get_by_role("button", name="Confirm")})
    s.click(lambda pg: pg.locator("dialog[open]").get_by_role("button", name="Confirm"), 1000)
    s.show(text("Sent!"), "center")
    s.snap("move_done", {"sent": css(".panel.active .tx-result"), "link": text("View on WhatsOnChain")})


def flow_scan_quiet(s):
    """Loaded and scanned, without pictures: where the move flow starts."""
    open_app(s)
    load_wallet(s, film=False)
    to_tab(s, "Recover")
    s.click(css("#scanScope"), 400)
    s.click(text("Every wallet we know"), 400)
    button("Scan for coins")(s.pg).click()
    for _ in range(400):
        if s.pg.get_by_text("Done. Checked").count():
            break
        s.pg.clock.run_for(2000)
        s.pg.wait_for_timeout(30)
    s.wait(400)


DEMO_ADDR0 = next(iter(DEMO["addresses"]))

# name: (flow, theme); the cave is dark, so the app is too
FLOWS = {
    "wallet": (flow_wallet, "dark"),
    "scan": (flow_scan, "dark"),
    "move": (flow_move, "dark"),
}


def main(only, check):
    global OUT
    if check:
        OUT = os.path.join(HERE, "check-captures")
    os.makedirs(OUT, exist_ok=True)
    marks_path = os.path.join(OUT, "marks.js")
    marks, bursts = {}, {}
    if os.path.exists(marks_path) and not check:
        saved = json.loads(open(marks_path).read().split("=", 1)[1].split(";\n", 1)[0])
        marks, bursts = saved.get("marks", {}), saved.get("bursts", {})
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, (flow, theme) in FLOWS.items():
            if only and name not in only:
                continue
            print(name, f"({theme})")
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR,
                                      color_scheme=theme, has_touch=True, is_mobile=True)
            # the app's own theme choice, before it first renders
            ctx.add_init_script(f"try {{ localStorage.clear(); localStorage.setItem('mnemonic-brc100-theme', '{theme}') }} catch {{}}")
            # past the password gate (server/gate.ts)
            ctx.add_cookies([{"name": "dp_gate", "value": "open", "url": BASE}])
            ctx.route("https://api.whatsonchain.com/**", woc)
            ctx.route("https://ordinals.gorillapool.io/**", ordinals)
            pg = ctx.new_page()
            if check:
                pg.set_default_timeout(15_000)
            pg.clock.install()
            try:
                flow(Session(pg, marks, bursts))
            except Exception as e:  # noqa: BLE001 — every failure is reported
                if not check:
                    raise
                first = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
                PROBLEMS.append(f"{name}: {first}")
                pg.screenshot(path=os.path.join(OUT, f"FAILED-{name}.png"))
                print(f"  ✗ {first}")
            ctx.close()
        browser.close()
    with open(marks_path, "w") as f:
        f.write("window.CAPTURES = " + json.dumps({"marks": marks, "bursts": bursts}, indent=1) + ";\n")
        f.write("window.MARKS = window.CAPTURES.marks;\nwindow.BURSTS = window.CAPTURES.bursts;\n")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    main(set(args), check)
    if check:
        if PROBLEMS:
            print(f"\n{len(PROBLEMS)} problem{'s' if len(PROBLEMS) > 1 else ''}:")
            for p in PROBLEMS:
                print("  - " + p)
            print(f"Pictures of each step: {os.path.relpath(OUT)}")
            sys.exit(1)
        print("\nEvery flow works.")
