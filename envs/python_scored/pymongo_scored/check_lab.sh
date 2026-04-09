#!/bin/sh
set -eu

phrase="Lab Thingy, you're so cool."
found=0

for f in *; do
  [ -f "$f" ] || continue
  if grep -Fq "$phrase" "$f"; then
    echo "Success: Found target phrase in file: $f"
    found=1
    break
  fi
done

if [ "$found" -eq 1 ]; then
  exit 0
else
  echo "Failure: No file in current directory contains the exact phrase: $phrase"
  exit 1
fi
  exit 1
fi
