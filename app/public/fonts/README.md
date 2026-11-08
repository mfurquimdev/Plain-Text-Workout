# public/fonts

The fonts the app bundles, because a phone does not have them. They are
subsets of the Nerd Fonts builds of GitHub's Monaspace, in WOFF2.

| File | Family | Used for |
|------|--------|----------|
| `MonaspiceArNFM-Regular.woff2`, `-Italic`, `-Bold`, `-BoldItalic` | `MonaspiceAr NFM` (Argon) | The editor and the whole UI. |
| `MonaspiceKrNFM-Regular.woff2`, `-Italic`, `-Bold`, `-BoldItalic` | `MonaspiceKr NFM` (Krypton) | Text in lint ranges, `invalid` tokens and diagnostic messages. |
| `MonaspiceRnNFM-Regular.woff2`, `-Italic` | `MonaspiceRn NFM` (Radon) | Lines that start with `;` (conflict lines too) and trailing `; comment`s. |
| `LICENSE` | | The SIL Open Font License 1.1, Copyright (c) 2023 GitHub, Reserved Font Name "Monaspace". |

## How the files relate

- [`scripts/fonts.sh`](../../scripts/README.md) writes every `.woff2` file
  here from the installed OTFs and copies `LICENSE`. The subset keeps Basic
  Latin, Latin-1, Latin Extended-A, general punctuation, superscripts,
  arrows, the minus sign and the replacement character.
- [`css/fonts.css`](../../css/README.md) declares the faces with
  `url("/fonts/...")` and `font-display: swap`.
- `scripts/build.js` copies this directory to `.dist/fonts/`. The service
  worker pre-caches it with the rest of `.dist`, so the fonts work offline.
  README files are left out of the copy.
- `test/ui/app.pw.js` checks that the faces load from `/fonts/` and that
  each kind of text uses the right family.
