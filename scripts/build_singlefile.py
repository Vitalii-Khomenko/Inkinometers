import argparse
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
CSS_FILE = ROOT / "css" / "style.css"
JS_FILE = ROOT / "js" / "app.js"
OUTPUT_HTML = ROOT / "Inklinometers.html"

CSS_MARKER = '<link rel="stylesheet" href="css/style.css">'
JS_MARKER = '<script src="js/app.js"></script>'


def build_singlefile() -> str:
    html = INDEX_HTML.read_text(encoding="utf-8")
    css = CSS_FILE.read_text(encoding="utf-8").rstrip()
    js = JS_FILE.read_text(encoding="utf-8").rstrip()

    if CSS_MARKER not in html:
        raise RuntimeError("CSS link was not found in index.html")
    if JS_MARKER not in html:
        raise RuntimeError("JS script tag was not found in index.html")

    html = html.replace(CSS_MARKER, f"<style>\n{css}\n  </style>")
    html = html.replace(JS_MARKER, f"<script>\n{js}\n  </script>")
    return html


def validate_singlefile(html: str) -> None:
    checks = {
        "inline style block": "<style>" in html and "</style>" in html,
        "inline script block": "<script>" in html and "</script>" in html,
        "app title": "Sensor Location Finder" in html,
        "box sorting controls": "boxRowCount" in html and "boxRowSize" in html,
        "no external css": CSS_MARKER not in html,
        "no external js": JS_MARKER not in html,
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        raise RuntimeError("Single-file validation failed: " + ", ".join(failed))

    if re.search(r"<script[^>]+src=", html, flags=re.IGNORECASE):
        raise RuntimeError("Single-file validation failed: external script tag remains")
    if re.search(r"<link[^>]+rel=[\"']stylesheet[\"']", html, flags=re.IGNORECASE):
        raise RuntimeError("Single-file validation failed: external stylesheet link remains")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the browser-only production HTML file.")
    parser.add_argument("--check-only", action="store_true", help="validate the existing Inklinometers.html without rebuilding")
    args = parser.parse_args()

    if args.check_only:
        validate_singlefile(OUTPUT_HTML.read_text(encoding="utf-8"))
        print("Validated Inklinometers.html")
        return

    html = build_singlefile()
    validate_singlefile(html)
    OUTPUT_HTML.write_text(html, encoding="utf-8", newline="\n")
    print("Built and validated Inklinometers.html")


if __name__ == "__main__":
    main()
