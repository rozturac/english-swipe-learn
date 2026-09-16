# LD-v1 — Session mix + due intervals (thin slice)

**Owner:** Learning Designer  
**Room lock (English Flow):** ~3 new / ~3 due-wrong / ~2 known  
**Implement in:** `src/lib/progress.ts` (`pickSession` + small helpers)  
**Constraint:** `SESSION_SIZE = 8`, localStorage only, no mid-session requeue, keep “Yanlışları tekrarla” CTA.

## Goal

Replace soft score-rank with **explicit buckets + fill order**. “Due” is a real interval from `streak` + `ease` + `lastSeen` (no new storage field in v1).

## Buckets (active deck)

| Bucket | Predicate |
|--------|-----------|
| **new** | no `progress[en]` |
| **wrong** | `en` in `esl-missed-ens` and in deck pool |
| **learning** | has progress AND `streak < 2` AND not wrong |
| **review** | `streak >= 2` AND due |
| **known** | `streak >= 2` AND not due |

**Due:**

```
BASE_HOURS = [4, 24, 72, 168, 336]  // streak 1..5+
intervalHours(streak, ease) =
  BASE_HOURS[min(max(streak, 1), 5) - 1] * (ease / 2.2)

due = hoursSince(lastSeen) >= intervalHours(streak, ease)
```

Review requires `streak >= 2`. Streak 0/1 → wrong / learning only.

## Session fill (size 8) — room target 3 / 3 / 2

Treat **due-wrong** = wrong ∪ review (fill wrong first, then most-overdue review).

1. **due-wrong** — target **3** (`min(3, available)`; wrong before review)
2. **new** — target **3** (lower `d` first); if short, pull **learning**
3. **known** — target **2** (least-recently-due / highest ease first — “seyrek”)
4. If still short: learning → known → new (whatever remains)

**Cold start** (no progress in this deck): **8 × new**. Skip due-wrong/known.

**Cap:** when new+learning non-empty, `due-wrong <= 6` so fresh/unstable items still appear.

## Within-session order

Round-robin: wrong → new → review → learning → known. No wrong clump at front.

## Unchanged

- `recordAnswer` (ease / streak / wrongs / missed)
- Retry CTA (`RETRY_SIZE`, timer Off)
- `requeueWrong` unused on main path
- Deck chips + Genel experimental

## Acceptance tests

1. Empty progress + Günlük → 8 unique new, all `t === 'Günlük konuşma'`.
2. ≥3 missed in deck pool → 3 wrong slots from those ens (due-wrong may be all wrong).
3. 1 missed → 1 wrong + fill review/new/known to hit ~3 due-wrong if review exists, else other buckets.
4. `streak=2`, `ease=2.2`, `lastSeen` 25h ago → **review**.
5. Same, `lastSeen` 1h ago → **known** (not review).
6. `streak=1` never **review**.
7. Length ≤ 8; unique `en` + `exTr`; not the same 8 every session when pool ≫ 8.
8. When ≥3 wrong, ≥3 new, ≥2 known available → **3 + 3 + 2**.

## Out of scope (v1.1+)

Persist `nextDue`, mid-session requeue, server sync, full SM-2.
