"""
build.py — Packages EnterloadModScanner.py into EnterloadModScanner.ts4script

A .ts4script file is just a ZIP archive that the game decompresses and imports.
Run this script any time you change EnterloadModScanner.py:

    python build.py

The output file is EnterloadModScanner.ts4script in the current directory.
"""

import os
import zipfile

SOURCE_FILE = "EnterloadModScanner.py"
OUTPUT_FILE = "EnterloadModScanner.ts4script"


def build():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_path = os.path.join(script_dir, SOURCE_FILE)
    output_path = os.path.join(script_dir, OUTPUT_FILE)

    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source not found: {source_path}")

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_STORED) as zf:
        # Store the Python file at the root of the archive so the game can
        # find and import it as the 'EnterloadModScanner' module.
        zf.write(source_path, arcname=SOURCE_FILE)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"Built {OUTPUT_FILE}  ({size_kb:.1f} KB)")
    print(f"  ← {source_path}")
    print(f"  → {output_path}")


if __name__ == "__main__":
    build()
