# Diagram style guide

Every diagram on this site is a hand-authored SVG that follows these rules. The goal: any two diagrams, from any essay, look like they came from the same pen.

## Canvas

- viewBox width 1200. Height as needed (400-900 landscape preferred; taller only for matrices).
- First element is always the background: `<rect width="1200" height="H" fill="#FAF9F5"/>`.
- Diagrams must be self-contained: correct on any background, in any viewer.
- Margins: keep 40-80px of breathing room on all sides.

## Palette (no other colors)

| Use | Hex |
|---|---|
| Background (paper) | `#FAF9F5` |
| Primary text and strokes (ink) | `#1C1A17` |
| Secondary text, numbers, notes (soft) | `#6E675E` |
| Card fill | `#F1EFE7` |
| Dark block fill (the model, terminals) | `#161614` |
| Text on dark blocks | `#F2EFE9` primary, `#A8A39A` secondary |
| Accent green (one focal element only) | `#1D9E75` (deep) / `#5DCAA5` (light) / `#0F6E56` (text) |
| Negative or muted bars | `#8A8377` |

Green is the only accent. Use it for exactly one idea per diagram (the loop, the flush, the MCP connector, positive deltas). If everything is green, nothing is.

## Typography

- `font-family="Menlo, Consolas, monospace"` for everything by default.
- `Georgia, serif` only for era-name or title-style words, sparingly.
- Sizes: 15-26px. Nothing below 15px.
- Budget roughly 9.6px per character at 16px; check that every label fits its box.
- Sentence case. No em dashes anywhere, including alt text and captions.

## Shapes

- Rounded rects, `rx="8"` to `rx="16"`. Strokes 1-2.5px.
- Cards: `#F1EFE7` fill with `#6E675E` 1px stroke.
- Dashed strokes mean a boundary or something tentative.
- Arrows: simple lines with small triangle heads or `&#8594;` in text. Gray for flow, green for the focal motion.

## Charts

- Bar lengths must be mathematically proportional to their values. State the scale or check the ratios.
- Label every bar with its exact value.
- Diverging charts: positive right (green), negative left (ink/gray).

## Accuracy

- Every label, number, and name in a diagram must appear in the essay it accompanies, or in a verified source.
- Captions and alt text describe what the diagram actually shows.

## Files

- Live in `public/writing/<slug>/name.svg`, referenced with explicit `width`/`height` matching the viewBox.
- Referenced as `<figure><img .../><figcaption>...</figcaption></figure>`; figures are click-to-enlarge automatically.
