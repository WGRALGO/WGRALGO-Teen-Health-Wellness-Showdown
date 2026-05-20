# Changelog

All notable changes to WGRALGO Teen Health & Wellness Showdown are documented here.

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
