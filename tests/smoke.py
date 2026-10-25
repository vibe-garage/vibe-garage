#!/usr/bin/env python3
"""Browser smoke test for a locally running Vibe Garage worker."""

import os
import re
import sys
import traceback
import uuid

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8787"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smoke-shots")
IGNORED_DOMAINS = (
    "fonts.googleapis.com",
    "challenges.cloudflare.com",
    "static.cloudflareinsights.com",
    "giscus.app",
)

passes = 0
failures = []


def check(name, condition, detail=""):
    global passes
    if condition:
        passes += 1
        print(f"PASS {name}")
    else:
        failures.append(name)
        message = f"FAIL {name}"
        if detail:
            message += f" :: {detail}"
        print(message)
    return bool(condition)


def shot(page, name):
    try:
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)
    except Exception:
        pass


def body_text(page, selector):
    locator = page.locator(selector)
    try:
        locator.scroll_into_view_if_needed(timeout=5000)
    except Exception:
        pass
    return locator.inner_text()


def is_ignored(message):
    return any(domain in message for domain in IGNORED_DOMAINS)


def run(page, email):
    console_errors = []
    page_errors = []

    def on_console(message):
        if message.type != "error":
            return
        location = ""
        try:
            location = (message.location or {}).get("url", "")
        except Exception:
            location = ""
        combined = f"{message.text} {location}"
        if not is_ignored(combined):
            console_errors.append(combined)

    page.on("console", on_console)
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    project_url = ""

    page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
    page.wait_for_selector("#account-signup", timeout=15000)
    check(
        "home header shows Sign in",
        page.locator("#account-link").inner_text().strip() == "Sign in",
    )
    check(
        "home header shows Sign up",
        page.locator("#account-signup").inner_text().strip() == "Sign up",
    )
    shot(page, "01-home")

    page.goto(f"{BASE}/account.html?mode=signup", wait_until="domcontentloaded")
    page.wait_for_selector("#vgn-name", state="visible", timeout=15000)
    page.fill("#vgn-name", "Lexi Volt")
    page.fill("#vgn-email", email)
    page.fill("#vgn-password", "smoke-password-123")
    page.click("[data-vgn-submit]")
    page.wait_for_function(
        "() => (document.querySelector('#account-link')?.textContent || '').includes('Lexi Volt')",
        timeout=15000,
    )
    check(
        "signup shows display name in header",
        "Lexi Volt" in page.locator("#account-link").inner_text(),
    )
    shot(page, "02-signed-up")

    page.goto(f"{BASE}/submit.html", wait_until="domcontentloaded")
    page.wait_for_selector("#wizard", timeout=15000)
    page.click("#next")
    name_hint = page.locator(".hint", has_text="Give your project a name").first
    check(
        "empty project name shows the hint",
        name_hint.count() > 0 and name_hint.is_visible(),
    )

    pitch = "A tiny fighting game that freezes on impact."
    page.fill("#pname", "Hit Stop Demo")
    page.fill("#ppitch", pitch)
    check(
        "pitch counter updates",
        page.locator("#pitchcount").inner_text().strip() == f"{len(pitch)}/120",
    )
    page.fill("#plink", "https://example.com")
    page.click("#next")
    page.wait_for_selector('.wstep[data-step="2"].on', timeout=5000)

    page.fill("#prepo", "https://github.com/example/hit-stop")
    page.fill("#pcode", "func hit_stop(): pass")
    page.fill("#pprompts", "make it punchy sk-demo-not-a-real-key-0000")
    page.click("#next")
    page.wait_for_selector('.wstep[data-step="3"].on', timeout=5000)

    page.locator('#tags-opts input[value="game"]').check(force=True)
    page.locator('input[name="fb"][value="gentle"]').check(force=True)
    check(
        "review shows the project name",
        "Hit Stop Demo" in page.locator("#review").inner_text(),
    )

    page.click("#next")
    page.wait_for_selector("#secretAlert.show", timeout=5000)
    check(
        "client blocks the fake secret",
        "Hold up! This looks like a secret." in page.locator("#secretAlert").inner_text(),
    )
    shot(page, "03-secret-blocked")

    me = page.request.get(f"{BASE}/api/me").json()["user"]
    posts = page.request.get(f"{BASE}/api/posts?kind=project").json()["posts"]
    mine = [post for post in posts if post["author"]["id"] == me["id"]]
    check("blocked publish saved nothing", len(mine) == 0, f"found {len(mine)}")

    page.click("#back")
    page.wait_for_selector('.wstep[data-step="2"].on', timeout=5000)
    page.fill("#pprompts", "make it punchy")
    page.click("#next")
    page.wait_for_selector('.wstep[data-step="3"].on', timeout=5000)
    page.click("#next")
    page.wait_for_selector("#okAlert.show", timeout=10000)
    check(
        "clean project shows Looks clean",
        "Looks clean!" in page.locator("#okAlert").inner_text(),
    )

    page.wait_for_url(re.compile(r".*/project\.html\?id=vg-.*"), timeout=5000)
    project_url = page.url
    page.wait_for_selector("#pdetail h1", timeout=10000)

    detail = body_text(page, "#pdetail")
    check("project page shows the title", "Hit Stop Demo" in detail)
    check("project page shows the pitch", pitch in detail)
    check(
        "project page shows the code",
        "func hit_stop" in page.locator("#pdetail pre.code").inner_text(),
    )
    check("project page shows feedback wanted", "Feedback wanted: Gentle tips" in detail)
    check("project page shows the builder", "Lexi Volt" in detail)
    check(
        "project page has no giscus iframe",
        page.locator("iframe.giscus-frame").count() == 0,
    )
    check(
        "project page has no GitHub comments prompt",
        page.get_by_text("Sign in with GitHub", exact=False).count() == 0,
    )
    shot(page, "04-project")

    page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
    page.wait_for_function(
        "() => { const card = document.querySelector('#bento article.card');"
        " return Boolean(card && (card.innerText || '').includes('Hit Stop Demo')); }",
        timeout=15000,
    )
    check(
        "home first bento card is the new project",
        "Hit Stop Demo" in page.locator("#bento article.card").first.inner_text(),
    )
    shot(page, "05-home-with-project")

    page.goto(project_url, wait_until="domcontentloaded")
    page.wait_for_selector("#pdetail h1", timeout=10000)
    page.wait_for_function(
        "() => Boolean(document.querySelector('[data-owner-delete]'))",
        timeout=10000,
    )
    page.get_by_role("link", name="Edit", exact=True).click()
    page.wait_for_function(
        "() => document.querySelector('#pname')?.value === 'Hit Stop Demo'",
        timeout=15000,
    )

    new_pitch = "A rebuilt pitch after the edit."
    page.fill("#ppitch", new_pitch)
    page.click("#next")
    page.wait_for_selector('.wstep[data-step="2"].on', timeout=5000)
    page.click("#next")
    page.wait_for_selector('.wstep[data-step="3"].on', timeout=5000)
    check(
        "edit wizard offers Save changes",
        "Save changes" in page.locator("#next").inner_text(),
    )
    page.click("#next")
    page.wait_for_url(re.compile(r".*/project\.html\?id=vg-.*"), timeout=10000)
    page.wait_for_selector("#pdetail h1", timeout=10000)
    check(
        "edited pitch is visible",
        new_pitch in body_text(page, "#pdetail"),
    )
    shot(page, "06-project-edited")

    page.once("dialog", lambda dialog: dialog.accept())
    page.click("[data-owner-delete]")
    page.wait_for_url(re.compile(r".*/projects\.html.*"), timeout=10000)
    page.wait_for_function(
        "() => !(document.querySelector('#pgrid')?.innerText || '').includes('Hit Stop Demo')",
        timeout=15000,
    )
    check(
        "deleted project is gone from the list",
        "Hit Stop Demo" not in body_text(page, "#pgrid"),
    )

    page.goto(project_url, wait_until="domcontentloaded")
    page.wait_for_function(
        "() => (document.querySelector('#pdetail')?.innerText || '').toLowerCase().includes('not found')",
        timeout=15000,
    )
    check(
        "deleted project shows not found",
        "not found" in body_text(page, "#pdetail").lower(),
    )
    shot(page, "07-project-deleted")

    page.goto(f"{BASE}/submit.html?kind=guide", wait_until="domcontentloaded")
    page.wait_for_selector("#guide-form", state="visible", timeout=15000)
    page.fill("#gtitle", "Smoke Guide")
    page.fill(
        "#gbody",
        "## Heading\n\nThis guide body is definitely long enough to publish.",
    )
    page.click("#guidePublish")
    page.wait_for_url(re.compile(r".*/learn\.html\?p=.*"), timeout=5000)
    page.wait_for_selector("#learn-root article h2", timeout=10000)
    check(
        "guide renders the heading as h2",
        page.locator("#learn-root article h2").inner_text().strip() == "Heading",
    )
    check(
        "guide shows the author",
        "Lexi Volt" in body_text(page, "#learn-root"),
    )
    shot(page, "08-guide")

    page.wait_for_timeout(1000)
    check(
        "no console errors",
        len(console_errors) == 0,
        " | ".join(console_errors[:5]),
    )
    check(
        "no page errors",
        len(page_errors) == 0,
        " | ".join(page_errors[:5]),
    )


def main():
    os.makedirs(SHOTS, exist_ok=True)
    email = f"smoke-{uuid.uuid4().hex[:12]}@example.com"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox"],
            headless=True,
        )
        context = browser.new_context(viewport={"width": 1400, "height": 1000})
        page = context.new_page()
        try:
            run(page, email)
        except Exception:
            failures.append("unexpected exception")
            print("FAIL unexpected exception")
            traceback.print_exc()
            shot(page, "99-failure")
        finally:
            context.close()
            browser.close()

    print(f"\n{passes} checks passed, {len(failures)} failed")
    if failures:
        print("Failed: " + ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
