# English Swipe Learn

Mobile-first EN→TR sentence matching with swipe gestures. Dark Reels layout, cosmic glow, neon card border.

**Live:** https://rozturac.github.io/english-swipe-learn/

Turkish speakers recognizing **work English** (meeting / Slack / 1:1) — not Duolingo. Goal: an EM recognizes 8 patterns in ~3 minutes; wrongs come back later.

## Gestures

- **Swipe left / right** — move among 3 Turkish sentence options (selected stays centered)
- **Swipe up** — lock the selected card (green = correct; wrong = brief × then “Doğru cevap” teach reveal); from review, return to the active card
- **Swipe down** — read-only review of the previous completed card (frozen outcome; no re-select / re-lock). Further ↓ walks older cards in the session stack; no history → soft rubber-band ignore
- Keyboard: ← → select, ↑ / Enter / Space lock, ↓ review previous

## Deck picker

Primary chips `Günlük konuşma` + `İş İngilizcesi` (default **Günlük konuşma**); `Genel` is a muted secondary **Genel · Deneysel** chip (allowed via `esl-deck`, never the new-user default); pool = selected `t`, 8 unique `en`; results show deck label; legacy prefs migrate.

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

## Gold set

Demo / regression pack: `src/data/gold-set.json` (64 Günlük + 16 İş). `npm run check:gold` asserts every gold `en` still matches live `vocab.json` (`ex`/`exTr`), no dashes, `en` in `ex`, sentence-case `exTr`.

## Stack

Vite + React + TypeScript · GitHub Pages (`base: /english-swipe-learn/`)

## Dev

```bash
npm install
npm run dev
npm run build
npm run check:distractors
npm run check:gold   # 80-card gold set regression
npm run check         # distractors + gold
```

2026-09-13 öğretmen yaması: 50 exTr.
