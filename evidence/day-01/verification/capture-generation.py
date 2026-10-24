#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Capture immutable Day 1 evidence, excluding dependencies, databases and builds."""
from pathlib import Path
import difflib
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile

workspace = Path(sys.argv[1])
checkpoint = Path(sys.argv[2])
destination = Path(sys.argv[3])
destination.mkdir(parents=True, exist_ok=True)

baseline_paths = subprocess.check_output(
    ["git", "-C", str(workspace), "ls-tree", "-r", "--name-only", "HEAD"]
).decode().splitlines()
baseline_paths = [p for p in baseline_paths if p != "node_modules"]
public_roots = {"src", "server", "shared", "tests", "public"}
public_files = {
    ".env.example", ".gitignore", ".npmrc", ".prettierignore", "README.md",
    "AGENTS.md", "package.json", "pnpm-lock.yaml", "index.html", "server.mjs",
    "tsconfig.json", "vite.config.ts", "eslint.config.js",
    "scripts/dev.mjs", "scripts/pnpm.sh", "docs/architecture.md",
}


def publishable(path):
    return path in public_files or path.split("/", 1)[0] in public_roots


paths = {p for p in baseline_paths if publishable(p)}
paths.add("AGENTS.md")
for folder in ["src", "server", "shared", "tests", "public"]:
    paths.update(str(p.relative_to(workspace)) for p in (workspace / folder).rglob("*") if p.is_file())


def baseline(path):
    if path not in baseline_paths:
        return None
    return subprocess.check_output(["git", "-C", str(workspace), "show", "HEAD:" + path])


def capture(source, label):
    source_paths = set(paths)
    for folder in ["src", "server", "shared", "tests", "public"]:
        source_paths.update(str(p.relative_to(source)) for p in (source / folder).rglob("*") if p.is_file())
    patch = []
    hashes = {}
    with zipfile.ZipFile(destination / (label + "-source.zip"), "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_paths):
            item = source / path
            if not item.is_file() or item.is_symlink():
                continue
            content = item.read_bytes()
            archive.write(item, path)
            hashes[path] = hashlib.sha256(content).hexdigest()
            old = baseline(path)
            if old == content:
                continue
            if b"\0" in content or (old and b"\0" in old):
                raise RuntimeError("Unexpected changed binary product file: " + path)
            patch.append("diff --git a/" + path + " b/" + path + "\n")
            if old is None:
                patch.append("new file mode 100644\n")
            patch.extend(difflib.unified_diff(
                old.decode().splitlines(keepends=True) if old is not None else [],
                content.decode().splitlines(keepends=True),
                fromfile="a/" + path if old is not None else "/dev/null",
                tofile="b/" + path,
            ))
    (destination / (label + ".patch")).write_text("".join(patch))
    (destination / (label + "-sha256.json")).write_text(json.dumps(hashes, indent=2) + "\n")
    (destination / (label + "-archive-contents.json")).write_text(json.dumps({
        "scope": "Runnable application source and Day 1 project rules only; course assignments and operational documents excluded",
        "files": sorted(hashes),
    }, indent=2) + "\n")


capture(checkpoint / "source", "first-attempt")
capture(workspace, "final")
for name in ["GENERATION_REPORT.md", "FIRST_CHECK.log", "FINAL_CHECKS.log", "FINAL_SOURCE_SHA256.json"]:
    if (workspace / name).exists():
        shutil.copy2(workspace / name, destination / name)
with zipfile.ZipFile(destination / "supplementary-artifacts.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for item in sorted(workspace.iterdir()):
        if item.is_file() and (item.name.startswith("UI_") or item.suffix == ".log"):
            archive.write(item, item.name)
    for item in sorted((workspace / "test-results").rglob("*")):
        if item.is_file() and item.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            archive.write(item, str(item.relative_to(workspace)))
    for name in ["git.diff", "git-status.txt"]:
        if (checkpoint / name).exists():
            archive.write(checkpoint / name, "first-attempt-original/" + name)
print(json.dumps({"captured": str(destination), "product_files": len(paths)}))
