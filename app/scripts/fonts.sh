#!/usr/bin/env bash
# Regenerates the bundled fonts in app/public/fonts/ from the installed
# Monaspace Nerd Font Mono OTFs (Arch: otf-monaspace-nerd), subset to the
# glyphs the app needs and converted to WOFF2 with fontTools.
#
#   Argon   (MonaspiceAr NFM)  normal text and UI       Regular Italic Bold BoldItalic
#   Krypton (MonaspiceKr NFM)  warnings and errors      Regular Italic Bold BoldItalic
#   Radon   (MonaspiceRn NFM)  comments (; lines)       Regular Italic
#
# Usage: bash scripts/fonts.sh [source dir]   (default /usr/share/fonts/OTF)
# Needs pyftsubset (pip install fonttools brotli) on PATH, or uv: without
# pyftsubset it runs `uvx --from fonttools --with brotli pyftsubset`.
set -euo pipefail

SRC=${1:-/usr/share/fonts/OTF}
OUT=$(cd "$(dirname "$0")/../public/fonts" && pwd)
LICENSE=${MONASPACE_LICENSE:-/usr/share/licenses/otf-monaspace-nerd/LICENSE}

if command -v pyftsubset >/dev/null; then SUBSET=(pyftsubset)
else SUBSET=(uvx --from fonttools --with brotli pyftsubset); fi

# Basic Latin, Latin-1 Supplement (º ° × and accented letters), Latin
# Extended-A (Portuguese and friends), general punctuation (– — ' " …),
# superscripts (⁰), arrows, the minus sign and the replacement character.
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2000-206F,U+2070-209F,U+2190-21FF,U+2212,U+FFFD"

faces=(
  Ar:Regular Ar:Italic Ar:Bold Ar:BoldItalic
  Kr:Regular Kr:Italic Kr:Bold Kr:BoldItalic
  Rn:Regular Rn:Italic
)

for face in "${faces[@]}"; do
  family=${face%%:*} style=${face#*:}
  in="$SRC/Monaspice${family}NerdFontMono-${style}.otf"
  out="$OUT/Monaspice${family}NFM-${style}.woff2"
  # default layout features (calt keeps texture healing, kern, liga...)
  "${SUBSET[@]}" "$in" --unicodes="$UNICODES" --flavor=woff2 \
    --layout-features+=calt --drop-tables+=PfEd --name-IDs='*' --name-languages='*' \
    --output-file="$out"
  printf '%-36s %6d bytes\n' "$(basename "$out")" "$(stat -c %s "$out")"
done

cp "$LICENSE" "$OUT/LICENSE"
echo "copied the licence (SIL Open Font License 1.1) to $OUT/LICENSE"
