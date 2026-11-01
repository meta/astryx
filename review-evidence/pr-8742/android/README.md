# Astryx PR #8742: native Android Chrome/Gboard recovery evidence

**The requested nonzero-scroll recovery sequence passed on a genuine Mac-local Android emulator: the Tall sheet's body returned to its opening scroll position, the lower field stayed focused with its text retained, and it was visible after the keyboard hid. This receipt supports reviewer judgment; it does not itself assert that the PR is approved or every AST-099 claim passes.**

## Exact build and device

- PR: https://github.com/meta/astryx/pull/8742
- Captured head: `b6ef992e156c5552a9a42ff59d84990bc5339c50`.
- The PR Analysis Report identifies that head and this deployment: https://github.com/meta/astryx/pull/8742#issuecomment-6453890623 .
- Direct top-level page: https://astryx-2hyjqbd7c-fbopensource.vercel.app/storybook/iframe.html?id=core-bottomsheet--mobile-keyboard&viewMode=story . It was not inside the Storybook manager or Docs iframe.
- Native Android Emulator 37.1.11.0, build `15917651`; existing Medium Phone API 36 Google Play ARM64 image, running locally on macOS with Hypervisor.Framework. Hardware reports `ranchu`.
- Android 16 / API 36; display 1080 × 2400 pixels at 420 dpi; portrait. No browser mobile-viewport emulation was used.
- Native Google Chrome package `com.android.chrome`, version `133.0.6943.137`.
- Native Gboard package `com.google.android.inputmethod.latin`, version `15.1.08.726012951-preload-arm64-v8a`. The secure default input method was verified as Gboard, not AOSP LatinIME.
- Settled captures and measurements were collected on November 1, 2026, at 00:11:40–00:11:54 UTC.

This addresses the Android-emulator-with-Gboard evidence requested under AST-099 DEC-3. It does not replace the physical-device release gate.

## Reproducible sequence

1. Open the direct URL in native Chrome and tap **Add a comment**. Keep the Tall sheet fully expanded.
2. Drag upward inside the body's right margin, from approximately native screen pixel `(1020,1600)` to `(1020,1200)` over 600 ms. Wait for settling; the body is at `scrollTop=160` CSS pixels.
3. Tap the lower **Related task** input at approximately native pixel `(541,1781)` and wait for genuine Gboard QWERTY to appear.
4. Enter `QA` through native Android text-input events. Confirm the field keeps focus and the text appears while Gboard is visible.
5. Press Android's native **Back** key once to hide the software keyboard. Do not blur the HTML field programmatically.
6. Wait for recovery and compare the sheet-body position and field geometry with step 2. The field remains focused, retains `QA`, and is fully visible.

Actual touch gestures, text entry, and Back were sent through ADB. The screenshots are unaltered `adb exec-out screencap -p` output. Video came from Android's on-device `screenrecord`. Read-only CDP evaluation measured the existing native Chrome page; it did not change viewport size, scroll position, focus, keyboard geometry, or source.

## Measured and observed outcomes

All geometry below is logical CSS geometry from the native Chrome renderer. Every stage's full geometry and state are retained in the numbered JSON files.

- Before focus: body `scrollTop=160`; visual viewport height `811.047607` CSS pixels; temporary inset `0px`. Related task's rectangle spans y=`586.648804`–`610.648804`.
- Gboard shown: body `scrollTop=367.619049`; visual viewport height `451.047607`; temporary inset `408.000008px`. Related task remains focused. Its logical rectangle spans y=`379.029755`–`403.029755`, leaving about 48 CSS pixels before the visual viewport's bottom.
- Typing: `QA` appears without losing focus; the measured scroller and viewport remain unchanged.
- After native Back: body returns to **exactly `160`**; viewport returns to `811.047607`; inset returns to `0px`. Related task is still focused, retains `QA`, and returns to its original y=`586.648804`–`610.648804` rectangle. Its bottom is about 200 CSS pixels above the recovered viewport bottom.
- At every measured stage: layout `innerHeight=811`, visual viewport scale `1`, visual viewport `offsetTop=0`, and document `scrollX=0`, `scrollY=0`.
- Native screenshots visibly confirm Gboard, the entered text, keyboard disappearance, and restored opening content. The before/recovered screenshots differ in the expected field text and focus treatment, not the opening body position.

**Framebuffer caveat:** while Gboard is visible, the native framebuffer places the field near the top and clips the sheet header, even though the renderer's logical rectangles remain as reported above. Both views are retained rather than silently equated. This run does not prove that the outer sheet stays stationary, explain that native positioning, or establish frame-synchronous keyboard riding. No zero-pan or one-frame performance claim is made from these captures. The verified result is the requested body-scroll restoration and safely visible field after keyboard hide.

## Retained evidence

- `01-tall-open.png` through `06-recovered.png`: genuine native screenshots.
- Matching numbered `.json` files: full logical body/sheet/field rectangles, scroll positions, visual viewport height/width/scale/offset, document scroll, focus, text, and observation times.
- `outcome.json`: exact-head recovery assertions.
- `android-native-video-stream.mp4`: the original native recording's video stream, losslessly remuxed to remove opaque Android metadata tracks. Its encoded video-packet SHA-256 is unchanged from the original: `670cf31eac721d64086d6417d2340eab9df08f02fbe18d9a5ed5b0e0df0e4194`.
- `android-keyboard-recovery.webm`: browser-playable VP9 copy at 1080 × 2400, YUV 4:2:0, TV/limited range. Its 30 fps is a re-encoding sample rate, not a native refresh-rate measurement; no animation frames were generated by interpolation.
- `ffprobe.json` and `SHA256SUMS`: format/full-decode verification and file integrity.

The original on-device recording is retained separately outside the repository. The emulator was launched without saving a snapshot. Temporary emulator-only keyboard-display and network settings were restored to their recorded originals (`show_ime_with_hard_keyboard=0`, no HTTP proxy), the added port bridges were removed, and the emulator was shut down. No global Xcode, repository, PR, or review-thread changes were made by the evidence work.
