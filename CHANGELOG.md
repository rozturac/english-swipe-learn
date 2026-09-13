## Mechanics — wrong path: fuse dwell into gentle slide

- No separate static Doğru cevap wait after reveal: red flash (~280ms) → teach on card → immediate gentle Reels up
- Wrong slide duration = former dwell + slide: **4900ms** (`REEL_WRONG_MS`; CSS `.is-gentle` 4.9s); success stays 450ms
- Exiting page keeps Doğru cevap visible for the full slide
- prefers-reduced-motion wrong path: ~1s fade (not 4.9s transform); success fade still ~0.3s

## Mechanics — wrong Reels even slower + longer Doğru cevap

- Wrong/timeout Reels exit+enter: 800ms → **1700ms** (`--reel-soft`); success stays 450ms
- FEEDBACK_LEARN_GREEN_MS (Doğru cevap dwell): 2200 → **3200ms**
- JS reel-clear timeout stays in sync with CSS (REEL_WRONG_MS = 1700)
- prefers-reduced-motion: still short fade, not a forced slow slide

## Mechanics — slower Reels slide after wrong

- Wrong lock / timeout+reveal → next: Reels exit/enter 800ms with soft cubic-bezier (success stays 450ms)
- prefers-reduced-motion: still a short fade, not a forced slow slide
- Timers, scoring, L/R swipe, Doğru cevap dwell (2200ms) unchanged

## Translator committee — annoy deck + work-scene retag

- `annoy`: t Genel → İş İngilizcesi; pings → ping'ler (not bildirimleri); rahatsız eder kept
- Moved clear Slack/meeting/sprint/on-call/code-review work scenes Genel → İş: annoy, arrogant, betrayal, constantly, cruel, dull, hit me up, reveal, warmest, yawn, frighten, independence
- Kept academic/general in Genel but de-Slack'd: it can be argued that, What is it to me/you; fixed look up sense (dictionary, not stakeholders)
- frighten MT cleaned; reveal launch date + tr dedupe; journey-here career fix already on main
- No add/delete; d/en unchanged; 1221 count

## Translator committee — journey + Günlük sense pass

- Fixed `tell me about your journey here` (career journey, not physical arrival; said/asked ↔ sordu aligned)
- Günlük ÇEVİRMEN pass: tr↔exTr verb/person/sense align on clear drifts (face-to-name, settling-in how, feel free, into, based in, looking forward space, sorry/pardon, small talk, follow-up, bear-with sen, go ahead)
- False friend: `hit the ground running` (hit≠vur; retro≠Arkamızda)
- İş gold idiom locks spot-checked (skip/sunset/socialize/bandwidth/etc. still holding)
- gold-set.json synced for changed cards; no add/delete; d/t/en unchanged; 1221 count

## Gold set — 80 cards (committee day 13–14)

- Snapshot: `src/data/gold-set.json` = all 64 Günlük konuşma + 16 İş İngilizcesi (full objects)
- İş ens: my skip · pulse check · descope · sunset · socialize · influence without authority · manage sideways · forcing function · sandbagging · low-hanging fruit · skip-level · dry run · circle back · bandwidth · good catch · take it offline
- Polish: Günlük touched 28 (ellipsis/MT/sen align, curly quotes, thin exTr); İş touched 5 (bandwidth, good catch siz, take it offline, manage sideways, sunset apostrophe)
- Gate: `npm run check:gold` (+ `npm run check` runs distractors then gold)

# Changelog

## Vocab surgery — pass 2

- Touched: 182 (same 1221 order; no add/delete; `d`/`t`/`en` unchanged)
- Genel rewritten: 145 (nests/MT/time-glue/sense; home/road/food/city; no museum/bridge)
- İş polished: 10 idiom cards changed (+ P0 verifies still exact); skip-level fixed; leftover nests cleared
- sen/siz fixes: 11 (İş → siz/we; Günlük left sen)
- Staff sense: Staff mühendis retained on influence without authority / manage sideways; my skip → bir üst yönetici
- Hard bans held: no dashes; race=yarış; pad=bloknot; elder=büyükler

## Vocab surgery — all 1221 items

- Touched: 560 (label-cleaned `en` where needed; rewrote failing `tr`/`ex`/`exTr`)
- P0 locks applied (27): whale, hit me up, pregnant, my skip, descope, pulse check, sandbagging, pad, bran, seed, leadership forum, forcing function, IC track vs management track, dry run, low-hanging fruit, flat fee, gender identity, pros and cons, all manner of, spectacular, silk, race, lung, soil, elder, influence without authority, manage sideways
- Dash fixes: all em/en/minus clause dashes removed from ex/exTr
- Template nest rewrites: ~171 skeleton examples replaced with scene-based cards
- Sense locks: race=yarış, pad=bloknot, elder=büyükler; sunset(v)=kapatmak; socialize=öneriyi paylaşmak
- No add/delete; `d`/`t` unchanged; morph preserved (131)
- Schema order: d, t, en, tr, ex[, morph], exTr
