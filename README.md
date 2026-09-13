# English Swipe Learn

Mobile-first EN→TR sentence matching with swipe gestures. Dark Reels layout, cosmic glow, neon card border.

**Live:** https://rozturac.github.io/english-swipe-learn/

## Gestures

- **Swipe left / right** — move among 3 Turkish sentence options (selected stays centered)
- **Swipe up** — lock the selected card (green = correct; wrong = brief × then “Doğru cevap” teach reveal)
- No down swipe
- Keyboard: ← → select, ↑ / Enter / Space lock

## Timer & score

- Selectable countdown: **Off / Hızlı · 6s / 5s / 8s / 10s** (chips under the top bar). Default is **Off**. Preference is remembered.
- If time runs out, the **selected (centered) card is locked** and graded — correct → ✓ + brief green success; wrong → × + “Doğru cevap” reveal — then Reels advances. Off keeps swipe-up lock as primary.
- “Yanlışları tekrarla” forces timer **Off** for that run, then restores your prior preference.
- Compact session score in the top bar: **✓ correct · ✗ wrong**. Session size is `SESSION_SIZE` (8).

## Vocab contract (farewells)

- `catch you later` / `I'll catch you later` → **sonra görüşürüz** / **iyi günler**
- Do **not** use “seni sonra ararım” for this sense

## Stack

Vite + React + TypeScript · GitHub Pages (`base: /english-swipe-learn/`)

## Dev

```bash
npm install
npm run dev
npm run build
npm run check:distractors
```
