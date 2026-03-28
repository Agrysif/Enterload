"""
Enterload Mod Scanner for The Sims 4
=====================================
Scans your Mods folder for broken, incompatible, or outdated mods
and opens a beautiful HTML report in your browser.

Installation:
  Place this .py file in:
    Documents/Electronic Arts/The Sims 4/Mods/

Usage (in-game):
  Open the cheat console (Ctrl+Shift+C) and type:
    enterload

Author : Enterload
Version: 1.0.0
"""

import os
import re
import sys
import json
import datetime
import tempfile
import webbrowser
import zipfile
import traceback

# ---------------------------------------------------------------------------
# Sims 4 API imports – only available when running inside the game.
# We fall back gracefully so the module can also be tested standalone.
# ---------------------------------------------------------------------------
try:
    import sims4
    import sims4.commands
    _IN_GAME = True
except ImportError:
    _IN_GAME = False

VERSION = "1.0.0"
MOD_NAME = "Enterload Mod Scanner"

# ---------------------------------------------------------------------------
# Tunable thresholds (change these to adjust detection sensitivity)
# ---------------------------------------------------------------------------
MAX_FOLDER_DEPTH = 5           # The game ignores mod files deeper than this
LARGE_FILE_MB = 50             # .package files larger than this (MB) are flagged
LARGE_FILE_BYTES = LARGE_FILE_MB * 1024 * 1024
TOTAL_SIZE_WARN_GB = 5        # Total Mods folder size warning threshold (GB)
TOTAL_SIZE_WARN_BYTES = TOTAL_SIZE_WARN_GB * 1024 ** 3
TOTAL_SIZE_CRIT_GB = 10       # Total Mods folder size critical threshold (GB)
TOTAL_SIZE_CRIT_BYTES = TOTAL_SIZE_CRIT_GB * 1024 ** 3
MOD_COUNT_WARN = 300           # Warn when total mod count exceeds this
MOD_COUNT_CRIT = 500           # Critical warning when total mod count exceeds this


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _get_sims4_user_dir():
    """Return the path to the Sims 4 user-data directory."""
    home = os.path.expanduser("~")
    if sys.platform == "darwin":
        return os.path.join(home, "Documents", "Electronic Arts", "The Sims 4")
    # Windows (and Linux fallback)
    return os.path.join(home, "Documents", "Electronic Arts", "The Sims 4")


def _get_mods_path():
    return os.path.join(_get_sims4_user_dir(), "Mods")


# ---------------------------------------------------------------------------
# lastException.txt parser
# ---------------------------------------------------------------------------

def _parse_last_exception():
    """
    Read lastException.txt and extract references to mod files.
    Returns a list of dicts describing broken mods.
    """
    broken = []
    exception_file = os.path.join(_get_sims4_user_dir(), "lastException.txt")
    if not os.path.exists(exception_file):
        return broken

    try:
        with open(exception_file, "r", encoding="utf-8", errors="ignore") as fh:
            content = fh.read()

        # Extract file references inside the Mods folder
        mod_pattern = re.compile(
            r'File "([^"]*[/\\][Mm]ods[/\\][^"]+\.(?:py|pyc))"',
            re.IGNORECASE,
        )
        seen = set()
        for match in mod_pattern.finditer(content):
            path = match.group(1)
            key = os.path.normcase(path)
            if key in seen:
                continue
            seen.add(key)

            # Try to get a human-readable mod name from the path
            parts = re.split(r'[/\\]', path)
            try:
                mods_idx = next(
                    i for i, p in enumerate(parts) if p.lower() == "mods"
                )
                mod_display = "/".join(parts[mods_idx + 1:])
            except StopIteration:
                mod_display = os.path.basename(path)

            # Grab nearby error lines for context
            context_lines = []
            for error_type in (
                "AttributeError", "ImportError", "ModuleNotFoundError",
                "TypeError", "ValueError", "RuntimeError", "NameError",
                "KeyError", "IndexError",
            ):
                pattern = re.compile(
                    r"(" + error_type + r"[:\s][^\n]{0,200})", re.IGNORECASE
                )
                for m in pattern.finditer(content):
                    line = m.group(1).strip()
                    if line and line not in context_lines:
                        context_lines.append(line)

            broken.append({
                "name": mod_display,
                "path": path,
                "type": "broken",
                "reason": "Вызвал исключение в игре (lastException.txt)",
                "errors": context_lines[:3],
                "severity": "critical",
            })

        # Check exception date/time if available
        date_match = re.search(
            r"(?:Date|Time)[:\s]+([^\n]{5,40})", content, re.IGNORECASE
        )
        if date_match and broken:
            for item in broken:
                item["exception_time"] = date_match.group(1).strip()

    except Exception:
        pass

    return broken


# ---------------------------------------------------------------------------
# Mods-folder scanner
# ---------------------------------------------------------------------------

def _scan_mods_folder():
    """
    Walk the Mods directory and collect metadata about every mod file.
    Returns a rich dict with counts, size, lists, warnings, and
    performance issues.
    """
    mods_path = _get_mods_path()
    result = {
        "mods_path": mods_path,
        "exists": os.path.exists(mods_path),
        "total_count": 0,
        "package_count": 0,
        "script_count": 0,
        "disabled_count": 0,
        "total_size": 0,
        "mods": [],
        "warnings": [],
        "performance_issues": [],
    }

    if not result["exists"]:
        result["warnings"].append({
            "type": "no_mods_folder",
            "severity": "info",
            "message": "Папка Mods не найдена по пути: " + mods_path,
            "suggestion": "Убедитесь, что путь к игре верный.",
        })
        return result

    package_files = []
    script_files = []
    disabled_files = []

    for root, dirs, files in os.walk(mods_path):
        # The game ignores files nested more than 5 sub-folders deep
        rel = os.path.relpath(root, mods_path)
        depth = 0 if rel == "." else rel.count(os.sep) + 1

        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for filename in files:
            filepath = os.path.join(root, filename)
            try:
                file_size = os.path.getsize(filepath)
            except OSError:
                file_size = 0

            folder_label = "." if rel == "." else rel
            low = filename.lower()

            if low.endswith(".package"):
                package_files.append({
                    "name": filename,
                    "path": filepath,
                    "size": file_size,
                    "folder": folder_label,
                    "depth": depth,
                })
                result["total_size"] += file_size

            elif low.endswith(".ts4script"):
                entry = {
                    "name": filename,
                    "path": filepath,
                    "size": file_size,
                    "folder": folder_label,
                    "depth": depth,
                    "status": "ok",
                    "error": None,
                    "py_files": [],
                }
                # Validate the zip archive
                try:
                    with zipfile.ZipFile(filepath, "r") as zf:
                        entry["py_files"] = [
                            n for n in zf.namelist() if n.endswith(".py")
                        ]
                        bad = zf.testzip()
                        if bad:
                            entry["status"] = "broken"
                            entry["error"] = (
                                f"Повреждённый файл внутри архива: {bad}"
                            )
                except zipfile.BadZipFile:
                    entry["status"] = "broken"
                    entry["error"] = "Файл .ts4script повреждён (неверный ZIP)"
                except Exception as exc:
                    entry["status"] = "warning"
                    entry["error"] = str(exc)
                script_files.append(entry)
                result["total_size"] += file_size

            elif low.endswith(".disabled"):
                disabled_files.append(filename)

    # Depth check for package files (game ignores files deeper than MAX_FOLDER_DEPTH)
    deep_packages = [p for p in package_files if p["depth"] > MAX_FOLDER_DEPTH]
    for pkg in deep_packages:
        result["warnings"].append({
            "type": "too_deep",
            "severity": "error",
            "message": (
                f"{pkg['name']} находится на глубине {pkg['depth']} "
                f"вложенных папок"
            ),
            "suggestion": (
                f"Игра читает моды только до {MAX_FOLDER_DEPTH} уровней вложенности. "
                "Переместите файл ближе к корню папки Mods."
            ),
        })

    # Broken script archives
    broken_scripts = [s for s in script_files if s["status"] == "broken"]
    for s in broken_scripts:
        result["warnings"].append({
            "type": "broken_script",
            "severity": "critical",
            "message": f"{s['name']}: {s['error']}",
            "suggestion": "Переустановите мод или удалите повреждённый файл.",
        })

    # Performance: total mod count
    total = len(package_files) + len(script_files)
    if total > MOD_COUNT_CRIT:
        result["performance_issues"].append({
            "type": "too_many_mods",
            "severity": "warning",
            "message": (
                f"У вас {total} модов. Слишком много модов замедляет загрузку."
            ),
            "suggestion": f"Рекомендуется держать менее {MOD_COUNT_CRIT} модов для оптимальной производительности.",
        })
    elif total > MOD_COUNT_WARN:
        result["performance_issues"].append({
            "type": "many_mods",
            "severity": "info",
            "message": f"У вас {total} модов — это довольно много.",
            "suggestion": f"Для лучшей производительности старайтесь держать менее {MOD_COUNT_WARN} модов.",
        })

    # Performance: large package files
    for pkg in package_files:
        if pkg["size"] > LARGE_FILE_BYTES:
            result["performance_issues"].append({
                "type": "large_file",
                "severity": "warning",
                "message": (
                    f"{pkg['name']} занимает "
                    f"{pkg['size'] / (1024 * 1024):.1f} МБ"
                ),
                "suggestion": (
                    "Очень большие .package файлы увеличивают время загрузки игры."
                ),
            })

    # Performance: total size
    size_gb = result["total_size"] / (1024 ** 3)
    if size_gb > TOTAL_SIZE_CRIT_GB:
        result["performance_issues"].append({
            "type": "total_size",
            "severity": "warning",
            "message": f"Общий размер папки Mods: {size_gb:.1f} ГБ",
            "suggestion": (
                "Очень большой объём папки Mods существенно замедляет загрузку игры."
            ),
        })
    elif size_gb > TOTAL_SIZE_WARN_GB:
        result["performance_issues"].append({
            "type": "total_size",
            "severity": "info",
            "message": f"Общий размер папки Mods: {size_gb:.1f} ГБ",
            "suggestion": "Следите за общим объёмом модов, чтобы игра грузилась быстрее.",
        })

    # Disabled mods info
    if disabled_files:
        result["warnings"].append({
            "type": "disabled_mods",
            "severity": "info",
            "message": f"{len(disabled_files)} файл(ов) отключены (.disabled)",
            "suggestion": "Отключённые моды не загружаются игрой.",
        })

    result["package_count"] = len(package_files)
    result["script_count"] = len(script_files)
    result["disabled_count"] = len(disabled_files)
    result["total_count"] = total

    # Build the combined mods list
    for pkg in package_files:
        result["mods"].append({
            "name": pkg["name"],
            "path": pkg["path"],
            "kind": "package",
            "size": pkg["size"],
            "folder": pkg["folder"],
            "depth": pkg["depth"],
            "status": "ok" if pkg["depth"] <= MAX_FOLDER_DEPTH else "error",
            "error": None,
        })
    for s in script_files:
        result["mods"].append({
            "name": s["name"],
            "path": s["path"],
            "kind": "script",
            "size": s["size"],
            "folder": s["folder"],
            "depth": s["depth"],
            "status": s["status"],
            "error": s["error"],
        })

    return result


# ---------------------------------------------------------------------------
# HTML report generator
# ---------------------------------------------------------------------------

def _fmt_size(size_bytes):
    if size_bytes == 0:
        return "0 Б"
    value = float(size_bytes)
    for unit in ("Б", "КБ", "МБ", "ГБ", "ТБ"):
        if value < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} ПБ"


def _severity_class(severity):
    return {
        "critical": "sev-critical",
        "error": "sev-error",
        "warning": "sev-warning",
        "info": "sev-info",
    }.get(severity, "sev-info")


def _severity_label(severity):
    return {
        "critical": "Критично",
        "error": "Ошибка",
        "warning": "Предупреждение",
        "info": "Инфо",
    }.get(severity, severity)


def _escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _build_broken_cards(broken_mods):
    if not broken_mods:
        return '<p class="empty-state">🎉 Критических ошибок в lastException.txt не обнаружено</p>'

    cards = []
    for mod in broken_mods:
        errors_html = ""
        if mod.get("errors"):
            items = "".join(
                f"<li><code>{_escape(e)}</code></li>" for e in mod["errors"]
            )
            errors_html = f"<ul class='error-list'>{items}</ul>"

        time_html = ""
        if mod.get("exception_time"):
            time_html = (
                f'<span class="meta">Время исключения: '
                f'{_escape(mod["exception_time"])}</span>'
            )

        cards.append(
            f"""<div class="card card-critical">
  <div class="card-header">
    <span class="badge sev-critical">{_severity_label(mod['severity'])}</span>
    <span class="card-title">{_escape(mod['name'])}</span>
  </div>
  <p class="card-reason">{_escape(mod['reason'])}</p>
  {time_html}
  {errors_html}
</div>"""
        )
    return "\n".join(cards)


def _build_warning_cards(warnings):
    if not warnings:
        return '<p class="empty-state">✅ Других предупреждений нет</p>'

    cards = []
    for w in warnings:
        cards.append(
            f"""<div class="card card-{w['severity']}">
  <div class="card-header">
    <span class="badge {_severity_class(w['severity'])}">{_severity_label(w['severity'])}</span>
    <span class="card-title">{_escape(w['message'])}</span>
  </div>
  <p class="card-suggestion">💡 {_escape(w['suggestion'])}</p>
</div>"""
        )
    return "\n".join(cards)


def _build_performance_cards(issues):
    if not issues:
        return '<p class="empty-state">⚡ Серьёзных проблем с производительностью не обнаружено</p>'

    cards = []
    for issue in issues:
        cards.append(
            f"""<div class="card card-{issue['severity']}">
  <div class="card-header">
    <span class="badge {_severity_class(issue['severity'])}">{_severity_label(issue['severity'])}</span>
    <span class="card-title">{_escape(issue['message'])}</span>
  </div>
  <p class="card-suggestion">💡 {_escape(issue['suggestion'])}</p>
</div>"""
        )
    return "\n".join(cards)


def _build_mods_table(mods):
    if not mods:
        return "<p class='empty-state'>Модов не найдено</p>"

    rows = []
    for mod in mods:
        status_icon = {"ok": "✅", "broken": "❌", "warning": "⚠️", "error": "🔴"}.get(
            mod["status"], "❓"
        )
        kind_icon = "📦" if mod["kind"] == "package" else "🐍"
        error_cell = (
            f'<span class="table-error">{_escape(mod["error"])}</span>'
            if mod.get("error")
            else ""
        )
        rows.append(
            f"<tr class='row-{mod['status']}'>"
            f"<td>{kind_icon} <code>{_escape(mod['name'])}</code></td>"
            f"<td>{_escape(mod['folder'])}</td>"
            f"<td>{_fmt_size(mod['size'])}</td>"
            f"<td>{status_icon} {_escape(mod['status'].upper())}{error_cell}</td>"
            f"</tr>"
        )
    return (
        "<table class='mods-table'>"
        "<thead><tr>"
        "<th>Файл</th><th>Папка</th><th>Размер</th><th>Статус</th>"
        "</tr></thead>"
        "<tbody>" + "\n".join(rows) + "</tbody>"
        "</table>"
    )


def generate_html_report(mods_info, broken_mods):
    """Return a complete, self-contained HTML document with the scan report."""

    scan_time = datetime.datetime.now().strftime("%d.%m.%Y в %H:%M:%S")
    total = mods_info["total_count"]
    critical_count = len(broken_mods)
    warning_count = len(mods_info["warnings"])
    perf_count = len(mods_info["performance_issues"])

    # Determine overall health
    if critical_count:
        health_label = "Требует внимания"
        health_class = "health-bad"
        health_icon = "🔴"
    elif warning_count or perf_count:
        health_label = "Есть замечания"
        health_class = "health-warn"
        health_icon = "🟡"
    else:
        health_label = "Всё в порядке"
        health_class = "health-good"
        health_icon = "🟢"

    broken_cards_html = _build_broken_cards(broken_mods)
    warning_cards_html = _build_warning_cards(mods_info["warnings"])
    perf_cards_html = _build_performance_cards(mods_info["performance_issues"])
    mods_table_html = _build_mods_table(mods_info["mods"])

    size_display = _fmt_size(mods_info["total_size"])

    # Serialize mods as JSON for the client-side filter
    mods_json = json.dumps(
        [
            {
                "name": m["name"],
                "folder": m["folder"],
                "kind": m["kind"],
                "size": m["size"],
                "status": m["status"],
                "error": m.get("error") or "",
            }
            for m in mods_info["mods"]
        ],
        ensure_ascii=False,
    )

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enterload — Отчёт по модам</title>
<style>
/* ===== CSS Reset & Variables ===== */
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --bg:#0f1117;
  --surface:#1a1d27;
  --surface2:#22263a;
  --border:#2e3248;
  --text:#e8eaf0;
  --text-muted:#8b90a8;
  --accent:#7c6bff;
  --accent-glow:rgba(124,107,255,.25);
  --critical:#ff4d6d;
  --critical-bg:rgba(255,77,109,.12);
  --error:#ff6b35;
  --error-bg:rgba(255,107,53,.12);
  --warning:#ffcc00;
  --warning-bg:rgba(255,204,0,.10);
  --info:#4ecdc4;
  --info-bg:rgba(78,205,196,.10);
  --ok:#06d6a0;
  --ok-bg:rgba(6,214,160,.10);
  --radius:12px;
  --radius-sm:8px;
  --shadow:0 4px 24px rgba(0,0,0,.4);
  --font:'Inter','Segoe UI',system-ui,sans-serif;
}}
body{{
  font-family:var(--font);
  background:var(--bg);
  color:var(--text);
  min-height:100vh;
  line-height:1.6;
}}

/* ===== Scrollbar ===== */
::-webkit-scrollbar{{width:6px;height:6px}}
::-webkit-scrollbar-track{{background:var(--bg)}}
::-webkit-scrollbar-thumb{{background:var(--border);border-radius:3px}}

/* ===== Layout ===== */
.page-wrapper{{max-width:1200px;margin:0 auto;padding:2rem 1.5rem 4rem}}

/* ===== Header ===== */
.header{{
  display:flex;align-items:center;gap:1rem;
  padding:2rem 2.5rem;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--radius);
  margin-bottom:1.5rem;
  position:relative;
  overflow:hidden;
}}
.header::before{{
  content:'';
  position:absolute;inset:0;
  background:radial-gradient(ellipse 60% 100% at 80% 50%,var(--accent-glow),transparent);
  pointer-events:none;
}}
.logo{{font-size:2.5rem;line-height:1}}
.header-text h1{{font-size:1.6rem;font-weight:700;letter-spacing:-.02em}}
.header-text p{{color:var(--text-muted);font-size:.875rem;margin-top:.25rem}}
.health-badge{{
  margin-left:auto;
  display:flex;align-items:center;gap:.5rem;
  padding:.5rem 1.25rem;
  border-radius:999px;
  font-weight:600;font-size:.9rem;
  backdrop-filter:blur(8px);
}}
.health-good{{background:var(--ok-bg);color:var(--ok);border:1px solid rgba(6,214,160,.3)}}
.health-warn{{background:var(--warning-bg);color:var(--warning);border:1px solid rgba(255,204,0,.3)}}
.health-bad{{background:var(--critical-bg);color:var(--critical);border:1px solid rgba(255,77,109,.3)}}

/* ===== Stats row ===== */
.stats{{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
  gap:1rem;
  margin-bottom:1.5rem;
}}
.stat{{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:1.25rem 1.5rem;
  text-align:center;
  transition:transform .2s,box-shadow .2s;
}}
.stat:hover{{transform:translateY(-2px);box-shadow:var(--shadow)}}
.stat-value{{font-size:2rem;font-weight:700;line-height:1}}
.stat-label{{font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:.4rem}}
.stat-critical .stat-value{{color:var(--critical)}}
.stat-warning .stat-value{{color:var(--warning)}}
.stat-info .stat-value{{color:var(--info)}}
.stat-ok .stat-value{{color:var(--ok)}}
.stat-accent .stat-value{{color:var(--accent)}}

/* ===== Tabs ===== */
.tabs{{
  display:flex;gap:.5rem;
  border-bottom:1px solid var(--border);
  margin-bottom:1.5rem;
  overflow-x:auto;
}}
.tab-btn{{
  padding:.65rem 1.25rem;
  background:none;border:none;cursor:pointer;
  color:var(--text-muted);font-size:.9rem;font-family:var(--font);
  border-bottom:2px solid transparent;
  white-space:nowrap;
  transition:color .2s,border-color .2s;
}}
.tab-btn:hover{{color:var(--text)}}
.tab-btn.active{{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}}
.tab-btn .count{{
  display:inline-block;min-width:20px;height:20px;
  padding:0 6px;margin-left:.4rem;
  background:var(--surface2);border-radius:999px;
  font-size:.7rem;line-height:20px;text-align:center;
}}
.tab-btn.active .count{{background:var(--accent);color:#fff}}

/* ===== Tab panels ===== */
.tab-panel{{display:none}}
.tab-panel.active{{display:block}}

/* ===== Cards ===== */
.card{{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:1.25rem 1.5rem;
  margin-bottom:1rem;
  transition:transform .15s;
}}
.card:hover{{transform:translateX(3px)}}
.card-critical{{border-left:3px solid var(--critical);background:var(--critical-bg)}}
.card-error{{border-left:3px solid var(--error);background:var(--error-bg)}}
.card-warning{{border-left:3px solid var(--warning);background:var(--warning-bg)}}
.card-info{{border-left:3px solid var(--info);background:var(--info-bg)}}
.card-header{{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;flex-wrap:wrap}}
.card-title{{font-size:.95rem;font-weight:600;word-break:break-all}}
.card-reason{{font-size:.875rem;color:var(--text-muted)}}
.card-suggestion{{font-size:.85rem;color:var(--text-muted);margin-top:.5rem}}
.meta{{display:block;font-size:.8rem;color:var(--text-muted);margin-bottom:.4rem}}
.error-list{{margin-top:.5rem;padding-left:1.25rem}}
.error-list li{{font-size:.8rem;margin-bottom:.25rem;list-style-type:"› "}}
.error-list code{{
  background:rgba(0,0,0,.3);padding:.1em .35em;border-radius:4px;
  font-size:.8em;word-break:break-all;color:var(--critical);
}}
.table-error{{display:block;font-size:.75rem;color:var(--error);margin-top:.2rem}}

/* ===== Badges ===== */
.badge{{
  display:inline-block;padding:.25em .7em;border-radius:999px;
  font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  white-space:nowrap;
}}
.sev-critical{{background:var(--critical-bg);color:var(--critical);border:1px solid rgba(255,77,109,.4)}}
.sev-error{{background:var(--error-bg);color:var(--error);border:1px solid rgba(255,107,53,.4)}}
.sev-warning{{background:var(--warning-bg);color:var(--warning);border:1px solid rgba(255,204,0,.4)}}
.sev-info{{background:var(--info-bg);color:var(--info);border:1px solid rgba(78,205,196,.4)}}

/* ===== Mods table ===== */
.table-controls{{
  display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;
}}
.table-controls input,
.table-controls select{{
  background:var(--surface2);
  border:1px solid var(--border);
  border-radius:var(--radius-sm);
  color:var(--text);
  padding:.5rem 1rem;
  font-family:var(--font);font-size:.875rem;
  outline:none;
  transition:border-color .2s;
}}
.table-controls input{{flex:1;min-width:180px}}
.table-controls input:focus,
.table-controls select:focus{{border-color:var(--accent)}}
.table-controls select option{{background:var(--surface2)}}

.mods-table{{width:100%;border-collapse:collapse;font-size:.875rem}}
.mods-table thead tr{{background:var(--surface2)}}
.mods-table th{{
  text-align:left;padding:.75rem 1rem;
  color:var(--text-muted);font-size:.75rem;
  text-transform:uppercase;letter-spacing:.05em;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
}}
.mods-table td{{
  padding:.65rem 1rem;
  border-bottom:1px solid var(--border);
  vertical-align:top;
}}
.mods-table tr:hover td{{background:var(--surface2)}}
.mods-table code{{font-size:.8em;word-break:break-all}}
.row-broken td:first-child{{border-left:2px solid var(--critical)}}
.row-warning td:first-child{{border-left:2px solid var(--warning)}}
.row-error td:first-child{{border-left:2px solid var(--error)}}

/* ===== Empty state ===== */
.empty-state{{
  text-align:center;padding:2.5rem;color:var(--text-muted);
  font-size:.95rem;
}}

/* ===== Footer ===== */
.footer{{
  text-align:center;margin-top:3rem;
  color:var(--text-muted);font-size:.8rem;
}}
.footer a{{color:var(--accent);text-decoration:none}}
.footer a:hover{{text-decoration:underline}}

/* ===== Responsive ===== */
@media(max-width:640px){{
  .header{{flex-direction:column;text-align:center}}
  .health-badge{{margin-left:0;margin-top:.5rem}}
  .stats{{grid-template-columns:repeat(2,1fr)}}
}}
</style>
</head>
<body>
<div class="page-wrapper">

  <!-- Header -->
  <div class="header">
    <div class="logo">🔍</div>
    <div class="header-text">
      <h1>Enterload Mod Scanner</h1>
      <p>Сканирование завершено {_escape(scan_time)} &nbsp;·&nbsp; Mods: <code>{_escape(mods_info['mods_path'])}</code></p>
    </div>
    <div class="health-badge {health_class}">{health_icon} {health_label}</div>
  </div>

  <!-- Stats -->
  <div class="stats">
    <div class="stat stat-accent">
      <div class="stat-value">{total}</div>
      <div class="stat-label">Всего модов</div>
    </div>
    <div class="stat stat-ok">
      <div class="stat-value">{mods_info['package_count']}</div>
      <div class="stat-label">.package</div>
    </div>
    <div class="stat stat-info">
      <div class="stat-value">{mods_info['script_count']}</div>
      <div class="stat-label">.ts4script</div>
    </div>
    <div class="stat stat-critical">
      <div class="stat-value">{critical_count}</div>
      <div class="stat-label">Критических</div>
    </div>
    <div class="stat stat-warning">
      <div class="stat-value">{warning_count + perf_count}</div>
      <div class="stat-label">Предупреждений</div>
    </div>
    <div class="stat stat-info">
      <div class="stat-value">{_escape(size_display)}</div>
      <div class="stat-label">Общий размер</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab-btn active" data-tab="broken">
      💔 Сломанные моды
      <span class="count">{critical_count}</span>
    </button>
    <button class="tab-btn" data-tab="warnings">
      ⚠️ Предупреждения
      <span class="count">{warning_count}</span>
    </button>
    <button class="tab-btn" data-tab="performance">
      ⚡ Производительность
      <span class="count">{perf_count}</span>
    </button>
    <button class="tab-btn" data-tab="all-mods">
      📋 Все моды
      <span class="count">{total}</span>
    </button>
  </div>

  <!-- Tab: Broken mods -->
  <div class="tab-panel active" id="panel-broken">
    {broken_cards_html}
  </div>

  <!-- Tab: Warnings -->
  <div class="tab-panel" id="panel-warnings">
    {warning_cards_html}
  </div>

  <!-- Tab: Performance -->
  <div class="tab-panel" id="panel-performance">
    {perf_cards_html}
  </div>

  <!-- Tab: All mods -->
  <div class="tab-panel" id="panel-all-mods">
    <div class="table-controls">
      <input type="text" id="mod-search" placeholder="Поиск по названию или папке…">
      <select id="mod-filter-kind">
        <option value="">Все типы</option>
        <option value="package">📦 .package</option>
        <option value="script">🐍 .ts4script</option>
      </select>
      <select id="mod-filter-status">
        <option value="">Все статусы</option>
        <option value="ok">✅ OK</option>
        <option value="broken">❌ Сломан</option>
        <option value="warning">⚠️ Предупреждение</option>
        <option value="error">🔴 Ошибка</option>
      </select>
    </div>
    <div id="mods-table-container"></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Enterload Mod Scanner v{_escape(VERSION)} &nbsp;·&nbsp; Отчёт сформирован {_escape(scan_time)}</p>
    <p style="margin-top:.35rem">Установите мод в папку <code>Documents/Electronic Arts/The Sims 4/Mods/</code> и введите <code>enterload</code> в консоли читов</p>
  </div>

</div><!-- end page-wrapper -->

<script>
// ======= Tab switching =======
document.querySelectorAll('.tab-btn').forEach(function(btn) {{
  btn.addEventListener('click', function() {{
    document.querySelectorAll('.tab-btn').forEach(function(b) {{ b.classList.remove('active'); }});
    document.querySelectorAll('.tab-panel').forEach(function(p) {{ p.classList.remove('active'); }});
    btn.classList.add('active');
    var panelId = 'panel-' + btn.dataset.tab;
    var panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  }});
}});

// ======= Mods table (client-side filter) =======
var ALL_MODS = {mods_json};

function fmtSize(bytes) {{
  var units = ['Б','КБ','МБ','ГБ','ТБ'];
  var value = bytes;
  for (var i = 0; i < units.length; i++) {{
    if (value < 1024) return value.toFixed(1) + ' ' + units[i];
    value /= 1024;
  }}
  return value.toFixed(1) + ' ПБ';
}}

function renderTable(mods) {{
  var container = document.getElementById('mods-table-container');
  if (!mods.length) {{
    container.innerHTML = '<p class="empty-state">Ничего не найдено</p>';
    return;
  }}
  var icons = {{package:'📦', script:'🐍'}};
  var statusIcons = {{ok:'✅', broken:'❌', warning:'⚠️', error:'🔴'}};
  var rows = mods.map(function(m) {{
    var errCell = m.error ? '<span class="table-error">' + escHtml(m.error) + '</span>' : '';
    return '<tr class="row-' + escHtml(m.status) + '">'
      + '<td>' + (icons[m.kind]||'📁') + ' <code>' + escHtml(m.name) + '</code></td>'
      + '<td>' + escHtml(m.folder) + '</td>'
      + '<td>' + fmtSize(m.size) + '</td>'
      + '<td>' + (statusIcons[m.status]||'❓') + ' ' + escHtml(m.status.toUpperCase()) + errCell + '</td>'
      + '</tr>';
  }}).join('');
  container.innerHTML = '<table class="mods-table"><thead><tr>'
    + '<th>Файл</th><th>Папка</th><th>Размер</th><th>Статус</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}}

function escHtml(s) {{
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}}

function applyFilters() {{
  var search = document.getElementById('mod-search').value.toLowerCase();
  var kind   = document.getElementById('mod-filter-kind').value;
  var status = document.getElementById('mod-filter-status').value;
  var filtered = ALL_MODS.filter(function(m) {{
    if (search && m.name.toLowerCase().indexOf(search) === -1
                && m.folder.toLowerCase().indexOf(search) === -1) return false;
    if (kind && m.kind !== kind) return false;
    if (status && m.status !== status) return false;
    return true;
  }});
  renderTable(filtered);
}}

document.getElementById('mod-search').addEventListener('input', applyFilters);
document.getElementById('mod-filter-kind').addEventListener('change', applyFilters);
document.getElementById('mod-filter-status').addEventListener('change', applyFilters);

// Initial render
renderTable(ALL_MODS);
</script>
</body>
</html>"""
    return html


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_scan_and_open():
    """Run a full mod scan and open the HTML report in the default browser."""
    broken_mods = _parse_last_exception()
    mods_info = _scan_mods_folder()

    html_content = generate_html_report(mods_info, broken_mods)

    # Write to a predictable temp file so the browser can find it again
    report_path = os.path.join(tempfile.gettempdir(), "enterload_report.html")
    with open(report_path, "w", encoding="utf-8") as fh:
        fh.write(html_content)

    webbrowser.open("file:///" + report_path.replace("\\", "/"))
    return report_path


# ---------------------------------------------------------------------------
# Sims 4 command registration (only active inside the game)
# ---------------------------------------------------------------------------

if _IN_GAME:

    @sims4.commands.Command(
        "enterload",
        command_type=sims4.commands.CommandType.Live,
    )
    def _enterload_command(_connection=None):
        """Open the Enterload mod scan report in your browser."""
        output = sims4.commands.CheatOutput(_connection)
        output(f"[Enterload v{VERSION}] Сканирование модов…")
        try:
            report_path = run_scan_and_open()
            output(f"[Enterload] Отчёт открыт: {report_path}")
        except Exception:
            output("[Enterload] Ошибка при сканировании:")
            for line in traceback.format_exc().splitlines():
                output("  " + line)

    # Auto-scan once after the first zone loads so the player sees the report
    # immediately without typing a command.
    try:
        import zone as _zone

        _original_load_zone = _zone.Zone.load_zone

        def _patched_load_zone(self, *args, **kwargs):
            result = _original_load_zone(self, *args, **kwargs)
            try:
                import services as _services
                # Only run once per session
                client = _services.client_manager().get_first_client()
                if client is not None and not getattr(
                    _patched_load_zone, "_ran", False
                ):
                    _patched_load_zone._ran = True
                    run_scan_and_open()
            except Exception:
                pass
            return result

        _zone.Zone.load_zone = _patched_load_zone

    except Exception:
        # If zone patching fails, the cheat command alone is enough
        pass
