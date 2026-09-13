# English Swipe Learn

Mobile-first EN→TR sentence matching with swipe gestures. Dark Reels layout, cosmic glow, neon card border.

**Live:** https://rozturac.github.io/english-swipe-learn/

Turkish speakers recognizing **work English** (meeting / Slack / 1:1) — not Duolingo. Goal: an EM recognizes 8 patterns in ~3 minutes; wrongs come back later.

## Gestures

- **Swipe left / right** — move among 3 Turkish sentence options (selected stays centered)
- **Swipe up** — lock the selected card (green = correct; wrong = brief × then “Doğru cevap” teach reveal)
- No down swipe
- Keyboard: ← → select, ↑ / Enter / Space lock

## Deck picker

Before each main session (and after **Tekrar oyna**): 3 chips — preference in `localStorage` key `esl-deck` (default **Tanışma ve sohbet**).

- Tanışma ve sohbet
- Slack / ekip yazışması
- 1o1 ve yeni rol

Session pool is **only** the selected `item.t` (8 cards, unique `en`). Okuma / Defter / Genel are not in the picker. Results show which deck. Picker sits after the coach overlay and does not block play gestures.

## Timer & score

- Selectable countdown: **Off / Hızlı · 6s / 12s / 18s** (chips under the top bar). Default is **Off**. Preference is remembered.
- If time runs out, the **selected (centered) card is locked** and graded — correct → ✓ + brief green success; wrong → × + “Doğru cevap” reveal — then Reels advances. Off keeps swipe-up lock as primary.
- “Yanlışları tekrarla” forces timer **Off** for that run, then restores your prior preference.
- Compact session score in the top bar: **✓ correct · ✗ wrong**. Session size is `SESSION_SIZE` (8).

## Distractors

3 options = 1 correct `exTr` + 2 distractors from the **same** `t` only (no other deck / notebook). Near-miss: same scene, wrong pattern. Readable Turkish (sentence case + end punctuation).

## Vocab contract (farewells)

- `catch you later` / `I'll catch you later` → **sonra görüşürüz** / **iyi günler**
- Do **not** use “seni sonra ararım” for this sense

Schema: `d` / `t` / `en` / `tr` / `ex` / `exTr` (+ optional `morph`).

## Stack

Vite + React + TypeScript · GitHub Pages (`base: /english-swipe-learn/`)

## Dev

```bash
npm install
npm run dev
npm run build
npm run check:distractors
```

2026-09-13 öğretmen yaması: 50 exTr.
