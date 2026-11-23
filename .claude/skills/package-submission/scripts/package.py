#!/usr/bin/env python3
"""Build a CSC13114 submission zip and check it against the course rules.

Usage:
  python package.py <folder> --ids 23120018 [--ids 23120042 ...] [--files a.md b.md ...] [--dry-run]

- Reads the claimed total from <folder>/SELF_ASSESSMENT_REPORT.md.
- Zip name: <ID>_<total>.zip, or <ID1>-<ID2>-<ID3>_<total>.zip with IDs ascending.
- Files go at the zip root (flat) when --files is given; otherwise the whole folder is zipped,
  skipping junk (node_modules, .git, .env*, old zips, build output).
- Fails on: missing report, table total != claimed total, unfilled claims, secrets found.
"""
import argparse
import re
import sys
import zipfile
from pathlib import Path

SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo",
             ".cache", "__pycache__", ".venv", "venv", ".claude", "playwright-report", "test-results"}
SKIP_FILE_RE = re.compile(r"^(\.env(\..*)?|.*\.zip|\.DS_Store|Thumbs\.db)$", re.I)
ALLOWED_ENV = {".env.example", ".env.sample", ".env.template"}
SECRET_RES = [
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"mongodb(\+srv)?://[^\s:/]+:[^\s@]+@"),
    re.compile(r"postgres(ql)?://[^\s:/]+:[^\s@]+@"),
]
TEXT_EXT = {".md", ".txt", ".js", ".jsx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".html",
            ".css", ".env", ".sql", ".py", ".mjs", ".cjs", ".example"}


def _num(cell):
    m = re.fullmatch(r"\**\s*(\d{1,3})\s*\**", cell)
    return int(m.group(1)) if m else None


def claimed_total(report: Path):
    """Return (stated_total, sum_of_row_claims, criteria_left_blank, errors)."""
    text = report.read_text(encoding="utf-8")
    errors, blanks = [], []
    rows_sum, table_total, claim_col, name_col = 0, None, None, 0
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        low = [c.lower() for c in cells]
        if claim_col is None:
            # header row: the claim column is the one mentioning "claim" (template: "I claim")
            hits = [i for i, c in enumerate(low) if "claim" in c]
            if hits:
                claim_col = hits[0]
                name_col = next((i for i, c in enumerate(low) if "criterion" in c), 0)
            continue
        if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
            continue
        val = _num(cells[claim_col]) if claim_col < len(cells) else None
        if any("total" in c for c in low):
            table_total = val
            continue
        if val is None:
            blanks.append(cells[name_col] if name_col < len(cells) else line.strip())
        else:
            rows_sum += val
    stated = re.search(r"Total[^\n]*?(\d{1,3})\s*/\s*100", text)
    total = int(stated.group(1)) if stated else table_total
    if total is None:
        total = rows_sum or None
    if total is None:
        errors.append("Could not find the claimed total (e.g. 'Total I claim: 82 / 100' or a Total row).")
    if table_total is not None and total is not None and table_total != total:
        errors.append(f"Header says {total} but the table's Total row says {table_total}.")
    if total is not None and rows_sum != total:
        errors.append(f"Row claims add up to {rows_sum} but the stated total is {total}.")
    return total, rows_sum, blanks, errors


def collect(folder: Path, files):
    if files:
        out = []
        for f in files:
            p = (folder / f) if not Path(f).is_absolute() else Path(f)
            if not p.exists():
                sys.exit(f"ERROR: listed file not found: {p}")
            out.append((p, p.name))
        return out
    out = []
    for p in sorted(folder.rglob("*")):
        rel = p.relative_to(folder)
        if any(part in SKIP_DIRS for part in rel.parts) or p.is_dir():
            continue
        if SKIP_FILE_RE.match(p.name) and p.name not in ALLOWED_ENV:
            continue
        out.append((p, rel.as_posix()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--ids", action="append", required=True, help="student ID (repeat for group)")
    ap.add_argument("--files", nargs="*", help="exact files to include at the zip root")
    ap.add_argument("--out", help="output directory (default: the folder itself)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    folder = Path(a.folder).resolve()
    report = folder / "SELF_ASSESSMENT_REPORT.md"
    problems, warnings = [], []
    if not report.exists():
        sys.exit("ERROR: SELF_ASSESSMENT_REPORT.md missing (costs -10 and the file-name total is ignored).")
    total, rows_sum, blanks, errs = claimed_total(report)
    problems += errs
    if blanks:
        warnings.append(f"Criteria with no claimed score: {blanks} - fill them or explain why in the report.")
    if not (folder / "AI-LOG.md").exists():
        warnings.append("AI-LOG.md not found - every submission in this course should include it.")

    entries = collect(folder, a.files)
    names = {arc.split("/")[-1] for _, arc in entries}
    for required in ("SELF_ASSESSMENT_REPORT.md",):
        if required not in names:
            problems.append(f"{required} is not in the file list.")
    for p, arc in entries:
        if p.suffix.lower() in TEXT_EXT or p.name.startswith(".env"):
            try:
                t = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for r in SECRET_RES:
                if r.search(t):
                    problems.append(f"Possible secret in {arc} (pattern {r.pattern[:25]}...)")
                    break

    ids = sorted(a.ids)
    for i in ids:
        if not re.fullmatch(r"\d{8}", i):
            warnings.append(f"Student ID '{i}' is not 8 digits.")
    zip_name = f"{'-'.join(ids)}_{total}.zip" if total is not None else None

    print(f"Folder      : {folder}")
    print(f"Claimed     : {total} (rows sum {rows_sum})")
    print(f"Zip name    : {zip_name}")
    print(f"Files ({len(entries)}):")
    for _, arc in entries:
        print(f"  - {arc}")
    for w in warnings:
        print(f"WARN : {w}")
    for pr in problems:
        print(f"ERROR: {pr}")
    if problems:
        sys.exit(1)
    if a.dry_run:
        print("Dry run - no zip written.")
        return
    out_dir = Path(a.out).resolve() if a.out else folder
    dest = out_dir / zip_name
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for p, arc in entries:
            z.write(p, arc)
    print(f"Wrote {dest}")


if __name__ == "__main__":
    main()
