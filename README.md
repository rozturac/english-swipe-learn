# English Swipe Learn

Mobile-first EN→TR sentence matching with swipe gestures. Dark Reels layout, cosmic glow, neon card border.

**Live:** https://rozturac.github.io/english-swipe-learn/

## Gestures

- **Swipe left / right** — move among 3 Turkish sentence options (selected stays centered)
- **Swipe up** — lock answer (green = correct, red = wrong + brief reveal)
- No down swipe
- Keyboard: ← → select, ↑ / Enter / Space lock

## Timer & score

- Selectable countdown: **Off / 3s / 5s / 8s / 10s** (chips under the top bar). Preference is remembered.
- If time runs out before you swipe **up** to lock, the card is marked wrong (red flash) and **auto-swipes up** like Reels — it never freezes at 0.0.
- The countdown number and thin bar reset on every new card.
- Compact session score in the top bar: **✓ correct · ✗ wrong**.

## Stack

Vite + React + TypeScript · GitHub Pages (`base: /english-swipe-learn/`)

## Dev

```bash
npm install
npm run dev
npm run build
npm run check:distractors
```
