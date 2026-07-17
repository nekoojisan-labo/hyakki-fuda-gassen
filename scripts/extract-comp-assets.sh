#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
source_image="$project_root/docs/mock/assets/design-comp-v2.png"

mkdir -p "$project_root/assets/characters" "$project_root/assets/cards/comp-art"

sips -c 108 108 --cropOffset 16 1138 "$source_image" --out "$project_root/assets/characters/cpu-onmyoji.png" >/dev/null
sips -c 124 124 --cropOffset 640 16 "$source_image" --out "$project_root/assets/characters/player-onmyoji.png" >/dev/null
sips -c 124 104 --cropOffset 766 282 "$source_image" --out "$project_root/assets/cards/comp-art/great-tengu.png" >/dev/null
sips -c 124 104 --cropOffset 766 401 "$source_image" --out "$project_root/assets/cards/comp-art/kamaitachi.png" >/dev/null
sips -c 124 104 --cropOffset 766 570 "$source_image" --out "$project_root/assets/cards/comp-art/chochin.png" >/dev/null
sips -c 124 104 --cropOffset 766 755 "$source_image" --out "$project_root/assets/cards/comp-art/white-serpent.png" >/dev/null
sips -c 124 104 --cropOffset 766 870 "$source_image" --out "$project_root/assets/cards/comp-art/pipe-fox.png" >/dev/null

echo "extracted approved comp portraits and featured card art"
