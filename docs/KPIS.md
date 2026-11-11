# KPIs and monitoring: Bric-à-Jeux

Firebase: deferred (user's choice on 2026-11-11), no data collected yet. No Firebase project exists; the release APK
is built without `google-services.json` (`--allow-no-firebase`). The consent screen and the telemetry module stay
in the app, so connecting Firebase later needs no code change: create the project (free Spark plan, never
upgraded to Blaze), drop `firebase/google-services.json` (git-ignored), run
`node factory/scripts/pipeline.mjs set mini-worlds firebase required`, then re-verify with `--telemetry`.

Firebase project: (none yet; project id = `mini-worlds` when created)
Android app: io.github.nhilaire.miniworlds
Data collection: opt-in only (consent screen). Analytics data retention: 2 months. Google signals: off. API key
restricted to this package and SHA-1, Firebase APIs only.

## Business KPIs

| KPI | Definition | Where to read it | Target |
|---|---|---|---|
| D1 retention | % of new users back on day 1 | Analytics > Reports > Retention | ≥ 35 % |
| D7 retention | % of new users back on day 7 | Analytics > Reports > Retention | ≥ 15 % |
| Daily active users | users with an engagement per day | Analytics > Engagement overview | tracked |
| Rounds per session | `round_start` count / `session_start` count | Analytics > Events | ≥ 3 |
| Rounds per game | `round_start` by `game` | Analytics > Events > round_start (dimension `game`) | no game < 20 % of rounds |
| World unlock rate | users with `world_unlock` by `world` / users | Analytics > Events > world_unlock (dimension `world`) | ≥ 60 % Puzzle, ≥ 30 % Bubbles |
| Daily reward rate | `daily_reward_collect` / DAU | Analytics > Events > daily_reward_collect | ≥ 50 % of DAU |
| Replay after upgrade | `upgrade_buy` followed by `round_start` in the same session | Analytics > Explore > Funnel (upgrade_buy → round_start) | ≥ 70 % |
| Challenge completion | `daily_challenge_complete` / DAU | Analytics > Events > daily_challenge_complete (dimension `challenge`) | ≥ 1 per DAU |
| Upgrade purchases | `upgrade_buy` per user in the first week | Analytics > Events > upgrade_buy (dimensions `game`, `upgrade`) | ≥ 2 |
| Tutorial completion | users with `tutorial_complete` for a game / users with `round_start` on it | Analytics > Explore > Funnel by `game` | ≥ 90 % |
| Level funnel | users with `level_up` at level 3 / 10 | Analytics > Events > level_up (dimension `level`) | ≥ 50 % level 3, ≥ 20 % level 10 |
| Score distribution | median `score` on `round_end` per game | custom metric `score`, dimension `game` | tracked (rebalances star thresholds) |
| Achievement progress | users with ≥ 3 `achievement_unlock` | Analytics > Events > achievement_unlock | tracked |
| Settings usage | share of users with `settings_change` for language or theme | Analytics > Events > settings_change (dimension `setting`) | tracked |
| Consent rate | users with events vs installs (refusals send nothing) | Analytics users vs Play Console installs | tracked |

## Technical KPIs

| KPI | Definition | Where to read it | Target |
|---|---|---|---|
| Crash-free users | % users without a fatal crash | Crashlytics > Dashboard | ≥ 99 % |
| ANR rate | app not responding events | Crashlytics > Dashboard (filter ANR) | ~0 |
| Non-fatal errors | `reportError()` calls | Crashlytics > Non-fatals | low and stable |
| APK size | arm64 release APK size | docs/evidence/v*/REPORT.md | < 55 MB (Skia) |
| Cold start | launch to first screen | evidence report (device check) | < 3 s |

## Telemetry events (from the PRD)

`src/telemetry/events.ts` declares exactly these events; nothing else may be sent, and only after consent.

| Event | Params |
|---|---|
| round_start | game |
| round_end | game, score, duration_s, stars_new, outcome |
| tutorial_complete | game |
| level_up | level |
| world_unlock | world |
| upgrade_buy | game, upgrade, level |
| daily_reward_collect | day |
| daily_challenge_complete | challenge |
| achievement_unlock | achievement |
| settings_change | setting, value |

## Custom definitions to register in Analytics (when Firebase is connected)

Analytics > Admin > Custom definitions (free, up to 50 dimensions / 50 metrics):

| Name | Scope | Param | Type |
|---|---|---|---|
| game | Event | game | dimension |
| world | Event | world | dimension |
| outcome | Event | outcome | dimension |
| upgrade | Event | upgrade | dimension |
| challenge | Event | challenge | dimension |
| achievement | Event | achievement | dimension |
| setting | Event | setting | dimension |
| level | Event | level | dimension |
| day | Event | day | dimension |
| score | Event | score | metric (standard) |
| duration_s | Event | duration_s | metric (seconds) |
| stars_new | Event | stars_new | metric (standard) |

## How to check that events arrive (once Firebase is connected)

1. Build with `firebase/google-services.json` present, accept the consent screen.
2. `adb shell setprop debug.firebase.analytics.app io.github.nhilaire.miniworlds` then open Analytics > DebugView.
3. The factory's `verify.mjs --telemetry` captures the `Logging event` lines from logcat as evidence.
Standard reports update within ~24 h; DebugView is real time.
