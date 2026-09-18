import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "game.js").read_text(encoding="utf-8")
HTML = HTML.replace('<link rel="stylesheet" href="style.css">', f"<style>{CSS}</style>")
HTML = HTML.replace('<script src="game.js"></script>', "")

results = []

def check(name, ok, detail=""):
    results.append({"name": name, "ok": bool(ok), "detail": detail})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda msg: errors.append("console:" + msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append("pageerror:" + str(exc)))

    page.evaluate("""() => {
      const store = new Map();
      const ls = {
        getItem:k => store.has(String(k)) ? store.get(String(k)) : null,
        setItem:(k,v) => store.set(String(k), String(v)),
        removeItem:k => store.delete(String(k)),
        clear:() => store.clear(),
        key:i => Array.from(store.keys())[i] ?? null,
        get length(){ return store.size; }
      };
      Object.defineProperty(window, 'localStorage', {value: ls, configurable: true});
    }""")

    page.set_content(HTML, wait_until="load")
    page.add_script_tag(content=JS)

    check("launch-menu", "active" in page.locator("#menu").get_attribute("class"))
    check("no-runtime-errors-initial", not errors, "; ".join(errors))

    page.click("#newGame")
    check("creator-screen", "active" in page.locator("#creator").get_attribute("class"))
    page.fill("#stageName", "Tony Snow")
    page.select_option("#styleChoice", label="Rapper")
    page.click("#startGame")
    check("game-screen", "active" in page.locator("#game").get_attribute("class"))
    check("hud-name-refresh", page.locator("#hudName").inner_text() == "Tony Snow")

    saved = page.evaluate("JSON.parse(localStorage.getItem('tgg-game-v1'))")
    check("new-game-saved", saved and saved.get("name") == "Tony Snow" and saved.get("style") == "Rapper")

    before = page.locator("#player").evaluate("e=>e.style.left")
    page.keyboard.press("ArrowRight")
    after = page.locator("#player").evaluate("e=>e.style.left")
    check("keyboard-movement", before != after, f"{before}->{after}")

    page.click("#pauseBtn")
    paused_before = page.locator("#player").evaluate("e=>e.style.left")
    page.keyboard.press("ArrowRight")
    paused_after = page.locator("#player").evaluate("e=>e.style.left")
    check("pause-freezes-movement", paused_before == paused_after, f"{paused_before}->{paused_after}")
    page.click("#resumeBtn")

    page.click("#missionBtn")
    check("mission-offered", page.locator("#missionBtn").inner_text() == "TAKE MISSION")
    page.click("#missionBtn")
    check("mission-accepted", page.locator("#missionBtn").inner_text() == "COMPLETE MISSION")

    x = float(page.locator("#player").evaluate("e=>parseFloat(e.style.left)"))
    y = float(page.locator("#player").evaluate("e=>parseFloat(e.style.top)"))
    while x < 72:
        page.click('[data-key="ArrowRight"]')
        x += 2
    while y > 37:
        page.click('[data-key="ArrowUp"]')
        y -= 2

    check("mobile-controls", page.locator("#player").evaluate("e=>e.style.left") == "72%" and page.locator("#player").evaluate("e=>e.style.top") == "37%")
    page.click("#missionBtn")
    check("mission-reward-cash", page.locator("#hudCash").inner_text() == "250")
    check("mission-reward-xp", page.locator("#hudXp").inner_text() == "50")
    check("mission-complete-feedback", page.locator("#toast").inner_text().startswith("MISSION COMPLETE"))
    check("mission-button-reset", page.locator("#missionBtn").inner_text() == "TALK TO M")

    page.click("#saveBtn")
    page.click("#pauseBtn")
    page.click("#menuBtn")
    page.evaluate("document.getElementById('hudCash').textContent='9999'")
    page.click("#continueGame")
    check("continue-loads-save", page.locator("#hudName").inner_text() == "Tony Snow" and page.locator("#hudCash").inner_text() == "250")

    page.click("#pauseBtn")
    page.click("#menuBtn")
    page.evaluate("localStorage.removeItem('tgg-game-v1')")
    page.click("#continueGame")
    check("continue-requires-save", "active" not in page.locator("#game").get_attribute("class"))
    check("no-save-toast", page.locator("#toast").inner_text().startswith("NO SAVE FOUND"))
    check("no-runtime-errors-final", not errors, "; ".join(errors))

    browser.close()

passed = sum(r["ok"] for r in results)
failed = len(results) - passed
print(json.dumps({"passed": passed, "failed": failed, "results": results}, indent=2))
if failed:
    raise SystemExit(1)
