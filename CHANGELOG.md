# Changelog

All notable changes to WGRALGO Teen Health & Wellness Showdown are documented here.

## [2.0.0] — 2026-10-01

- Version 2.0.0 (versionCode 200).
- The APK file is now named `WGRALGO-TeenHealthWellnessShowdown-v2.0.0.apk`. All WGRALGO apps now use the same `WGRALGO-<AppName>-v<version>.apk` naming.
- The name under the app icon is now **Teen Health & Wellness Showdown** (no "WGRALGO" prefix), to match the other WGRALGO apps.
- **Optimized for tablets in landscape.** The game stays in landscape on every device. Phones work in landscape too, but the layout is tighter.
- No changes to the questions, scoring, privacy, or license.

## [1.1.0] — 2026-10-01

- New game from the website version (single `index.html` replaces
  `game.js`, `questions.js`, and `styles.css`):
  - setup screen: team names, topic picker, ages 10–12 or 13–18, game length,
    one game or best of 3, sound on/off
  - new 150-question bank for ages 10–12 alongside the 300-question teen bank
  - 20-second question timer (25 for ages 10–12), 5-second steal after a wrong
    answer, skipped questions come back later, no repeats until the topic pool
    is used up
  - each side sees the answers in a different order
  - pause / resume / restart, generated sound effects, best-of-3 match dots
  - answers count on first touch (`pointerdown`)
- App shell: the game fills the whole screen; website-only parts removed
  (social links, GoFundMe bar, page heading, full-screen buttons); tips for
  teachers and crisis lines moved into How to Play; Content-Security-Policy added
- Android back button: pauses / resumes the game, closes How to Play, returns
  from the winner screen; asks before exiting from the setup screen
- New logo: big on the launcher icon (adaptive and legacy, black background,
  no white box), the Android 12+ system splash, the Android 7–11 launch screen,
  an in-app splash, and the setup screen
- Window and WebView background changed from navy to black so splash → game
  has no colour flash
- **New release signing key** — uninstall older versions before installing
- Added GitHub Actions: debug build on every push and a signed release workflow
- Added `tools/validate-release.sh`
- Bumped `versionCode` to 7, `versionName` to "1.1.0"

## [1.0.5] — 2026-05-19

- Moved the "WGRALGO TEEN HEALTH & WELLNESS SHOWDOWN" title out of the
  canvas and into the top-left of the question card (opposite the
  "QUESTION X" progress label on the right) — title is now TEAM GOLD
  coloured
- Moved the tension meter ("status bar" that shows which side is winning)
  out of the canvas to its own HTML element directly under the question
  card, so it never overlaps the players' heads anymore
- Removed the canvas banner draw and the canvas tension-meter draw; the
  arena scene now only contains the platforms, water, rope and teens
- Compacted the scene further (LH 340 -> 280, GROUND_Y 250 -> 220, ROPE_Y
  190 -> 160, WATER_TOP 244 -> 214) so the stage fills the design width
  with almost no letterbox on tablets
- Bumped `versionCode` to 6, `versionName` to "1.0.5"

## [1.0.4] — 2026-05-19

- Restored larger question font (28px) and answer font (18px) from v1.0.2
- Question card grown to 180px and answer buttons grown to 155px so the
  longest question (298 chars) and longest answer (168 chars) in the bank
  both fit without clipping at the larger fonts
- Teen characters made smaller and raised higher on screen to make room
  for the larger text boxes: scene height shrunk (LH 460 -> 340) and the
  ground, rope and water lines all moved up to match
- Removed the polka-dot crowd band from the arena background — it was
  visual noise that competed with the players
- Kept the centered banner and the gold/teal/purple tension meter
  ("status bar") that shows which side is currently winning
- Bumped `versionCode` to 5, `versionName` to "1.0.4"

## [1.0.3] — 2026-05-19

- Universal tablet fit: game now uses a fixed 1280x900 design surface that
  scales uniformly to any tablet via CSS transform, so the layout proportions
  (characters, question card, answer boxes) stay identical from 7" tablets up
- Question card resized to fit the longest question in the bank without
  clipping (height 130px, 22px font, auto-shrinks for edge cases)
- Answer buttons resized to fit the longest answer option in the bank without
  clipping (height 110px, 15px font, auto-shrinks for edge cases)
- Teen characters no longer change size between questions; canvas render
  switched to contain-fit + bottom-anchored so heads / feet never clip
- Touch responsiveness: every answer box is now a single `pointerup` target
  with a debounce flag and `touch-action: manipulation`, so taps register on
  the first touch on every Android WebView
- Bumped `versionCode` to 4, `versionName` to "1.0.3"

## [1.0.0] — 2026-05-16

Initial public release.

- Initial Android APK release (native WebView, `versionCode 1`, `versionName "1.0.0"`)
- Offline WebView game package — no internet, no ads, no analytics, no accounts
- Touch-first tablet interface; visible keyboard instructions removed
  (hidden keyboard fallback kept for desktop testing only)
- Professional visual redesign: deep-navy arena, gold vs. purple teams,
  game-show question card, large touch-friendly answer buttons
- Improved tug-of-war graphics: fully illustrated teen characters
  (clothing, hair, faces, braced posture, shadows) — no more stick figures
- Improved water/fall animation: losing team tumbles into a water pit with
  splash particles and expanding ripples
- Start screen, How to Play panel, and a polished winner screen with confetti
  and a full-reset Play Again button
- 300-question bank preserved verbatim from the original game
- GPLv3-licensed, GitHub-ready project structure
