---
schema_version: 3
template_version: 7
kind: component
id: component:MediaPlayer
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    theming,
    accessibility,
    interaction,
    testing,
    visual,
  ]
verified_by:
  [
    packages/lab/src/MediaPlayer/MediaPlayer.test.tsx,
    apps/storybook/stories/MediaPlayer.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:bidirectionality]
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:public-component-api,
    architecture:theme-tokens,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-082, spec:AST-086]
---

# MediaPlayer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `@astryxdesign/lab` exports two presets (`VideoPlayer`, `AudioPlayer`), a root (`MediaPlayer`), one media part (`MediaPlayerElement`, a video or audio element by `kind`), eight control parts, the `useMediaPlayer` and `useMediaPlaybackTime` hooks, and their types.                                              |
| Behavior                | The browser's native media element plays the media with its own controls off. The root owns playback state, scopes keyboard shortcuts, announces the changes they make, and decides when video controls show. The timeline runs left to right in every direction. Controls a platform cannot honor are not rendered. |
| End-user impact         | People get themed controls that work with a mouse, touch, keyboard, and screen reader, captions styled by their own system preferences, and the same shortcuts as common web players.                                                                                                                                |
| Builder impact          | Callers pass a source and a label to a preset, or compose the root, one media part, and the control parts they need. Streaming formats the browser cannot play need an engine the product brings.                                                                                                                    |
| Compatibility/readiness | Additive experimental Lab family. Its API, names, and visual treatment remain draft until owner review, rendered visual review, and real-browser evidence settle them.                                                                                                                                               |
| Review checks           | Reject browser controls turned on under Astryx controls, controlled playing or volume props, shortcuts that fire while a person types, a timeline that mirrors under RTL, announcements of routine time updates, controls rendered for unavailable capabilities, or a third-party runtime dependency in the family.  |
| Governing rules         | `architecture:public-component-api`, `architecture:interaction-modality`, `architecture:internationalization`, `architecture:component-theming-surface`, `design:bidirectionality`, `spec:AST-082`, and `spec:AST-086`.                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

MediaPlayer gives Astryx products video and audio playback with controls that
follow the product's theme, while the browser's own media element keeps doing
the decoding, buffering, caption rendering, and platform integration it already
does well. The family owns the control surface and its accessibility; the
platform owns playback.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive experimental Lab family
- Controlled/uncontrolled behavior: playback state is uncontrolled; callbacks
  report it and `useMediaPlayer` actions change it
- Migration decision: none; `component:MediaPlayer/DEC-1` sets the destination

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Playback state read from one native media element, and the actions that
  drive it.
- The control surface: play, skip, mute, volume, timeline, time, captions,
  fullscreen, and playback rate parts, and the two preset layouts.
- Keyboard shortcuts inside the player, their announcements, and when video
  controls show.
- Capability detection for volume, fullscreen, and caption tracks.

**Does not own / non-goals**

- Decoding, buffering, adaptive streaming, DRM, and casting — owned by the
  browser or by an engine the product brings.
- Caption rendering and caption appearance — owned by the browser and the
  person's system preferences.
- Queues, playlists, shuffle, and repeat — owned by the product callsite or a
  template.
- Native platform players — `spec:AST-082` owns platform scope; this family
  declares the web only.

## Public concepts

| Concept            | Closed values or states                                | Meaning                                                                                        | Availability by variant/orientation/state   | Default                          | Owner                   | Stability    | Invalid-value behavior            |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------- | ----------------------- | ------------ | --------------------------------- |
| Control visibility | `visible`, `hidden`                                    | Whether video controls show over the media                                                     | Root `data-controls`; VideoPlayer bar       | `visible`                        | `component:MediaPlayer` | experimental | Not caller-settable               |
| Playback state     | `MediaPlayerState` fields                              | Read-only state the media element reports                                                      | `useMediaPlayer().state`                    | Initial paused state             | `component:MediaPlayer` | experimental | Not caller-settable               |
| Time display       | `current`, `duration`, `remaining`, `current-duration` | Which time `MediaTime` shows                                                                   | Every `MediaTime`; live streams show "Live" | `current-duration`               | `component:MediaPlayer` | experimental | TypeScript rejects other values   |
| Seek offset        | Signed number of seconds                               | Direction and distance of `MediaSeekButton`                                                    | Every `MediaSeekButton`                     | Required                         | `component:MediaPlayer` | experimental | Clamped to the media at seek time |
| Playback rates     | Ordered list of positive numbers                       | The speeds `MediaPlaybackRate` offers; the `<` and `>` shortcuts step through the default list | Every `MediaPlaybackRate`                   | 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2 | `component:MediaPlayer` | experimental | A non-positive rate is ignored    |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                                                                                                                                        | Draft review state                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| FR1  | The media parts MUST render the native `video` or `audio` element with the browser's controls off, and the family MUST NOT add a third-party runtime dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:MediaPlayer/DEC-1`, `component:MediaPlayer/DEC-2`                                                                                                                                 | decided; pending owner approval                      |
| FR2  | `MediaPlayer` MUST own the playback state of the one media part inside it. Every part MUST read the nearest root, and the family MUST NOT offer controlled playing, time, or volume props; callbacks report changes and `useMediaPlayer` actions make them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:MediaPlayer/DEC-4`                                                                                                                                                                | decided; pending owner approval                      |
| FR3  | While focus is inside the root, Space and K MUST toggle playback, M mute, F fullscreen, C captions, Left and Right skip 5 seconds, J and L skip 10 seconds, Up and Down change the volume by 5 percent, 0 to 9 seek to that tenth, and < and > step through the default speed list. Shortcuts MUST NOT fire with a modifier key, in an editable field, or for Space on a button or slider.                                                                                                                                                                                                                                                                                                                                         | common web-player conventions                                                                                                                                                                | candidate implementation                             |
| FR4  | The timeline, the time readouts, and the row of playback controls MUST keep left-to-right order in every direction. Its arrow keys MUST skip 5 seconds and its Page keys 10 seconds; a pointer drag MUST preview the time and seek on release. Its value text MUST speak the position and the duration in words where the browser can.                                                                                                                                                                                                                                                                                                                                                                                             | `component:MediaPlayer/DEC-3`, `design:bidirectionality` DR5                                                                                                                                 | decided; DR6 relationship open (OQ5)                 |
| FR5  | Video controls MUST show on hover, pointer movement, and keyboard focus, and MUST hide two seconds after the last activity while the media plays. They MUST stay visible while the media is paused or ended, while a pointer drags the timeline, while a menu is open, and while keyboard focus is inside the player. A mouse leaving the player MUST hide them. Before playback, while the large play control shows, the bar MUST stay hidden except while keyboard focus is inside it. After the end, the bar MUST stay available beside the replay control. After touch input there MUST be no idle timer: a tap on the video MUST show the controls, and only the next tap MUST hide them. A mouse click MUST toggle playback. | `component:MediaPlayer/DEC-5`, `component:MediaPlayer/DEC-8`                                                                                                                                 | candidate implementation; rendered review pending    |
| FR6  | The VideoPlayer control bar MUST float one spacing step 2 inset from the player's edges with the theme's container radius, and MUST paint the surface color at 80 percent over a 12px backdrop blur in the dark media context, with no shadow. It MUST paint solid under reduced transparency and at 95 percent under increased contrast, and its show and hide transition MUST not move under reduced motion. The player MUST take the theme's element radius and the bar the theme's container radius. The volume slider MUST appear through the shared container reveal: while the volume control is hovered or holds focus, and always on a coarse pointer.                                                                    | `component:MediaPlayer/DD1`, `component:MediaPlayer/DEC-11`                                                                                                                                  | candidate implementation; frost ownership open (OQ2) |
| FR7  | The volume slider MUST NOT render where script cannot set the volume. The fullscreen control MUST NOT render where neither the root nor the video can go fullscreen, and the captions control MUST NOT render without a caption or subtitle track. Where element fullscreen is missing, the video's own fullscreen presentation MUST be used.                                                                                                                                                                                                                                                                                                                                                                                      | platform capability constraints                                                                                                                                                              | candidate implementation                             |
| FR8  | VideoPlayer MUST show a large play control before playback and after the end, a spinner while started playback waits for data, and an error message with a retry action when the media fails; the root announces the failure once, assertively. The large play control and the spinner MUST stay out of the accessibility tree, and the large play control out of the tab order, because the bar's play control does the same job. When the large play control or the retry action leaves while it holds focus, focus MUST move to the player root.                                                                                                                                                                                | video playback states; `architecture:interaction-modality`                                                                                                                                   | candidate implementation                             |
| FR9  | AudioPlayer MUST sit in a Section container instead of a card of its own, show artwork in front of the title (square by default, with a generic audio file icon when there is none), offer previous-track and next-track controls only when the product handles them, skip back 15 and forward 30 seconds by default, offer a speed button and volume button whose sliders open through the shared container reveal, and hand its title, subtitle, artwork, and transport actions to the system media controls on its first playback. It MUST release the system media controls on unmount only while it still owns them.                                                                                                          | `component:MediaPlayer/DEC-6`, `component:MediaPlayer/DEC-9`, `component:MediaPlayer/DEC-10`, `component:MediaPlayer/DEC-11`, `component:MediaPlayer/DEC-14`, `component:MediaPlayer/DEC-15` | candidate implementation                             |
| FR10 | The root MUST combine `xstyle`, `className`, and `style`, forward neutral DOM props and its ref, compose its own handlers after the caller's, and keep its role, label, tab stop, and reflected state authoritative. Every part MUST extend the base props and forward neutral DOM props to the element that carries its theme target. VideoPlayer MUST fill the width of its container.                                                                                                                                                                                                                                                                                                                                           | `architecture:public-component-api`                                                                                                                                                          | candidate implementation                             |
| FR11 | Every media glyph MUST resolve through the icon registry under a `media:*` key, then fall back to a bundled glyph drawn from Lucide. The skip controls MUST use the rewind and fast-forward glyphs, and their names and tooltips MUST state the number of seconds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:MediaPlayer/DEC-12`                                                                                                                                                               | decided; pending owner approval                      |
| FR12 | The timeline MUST show the buffered range, chapters as segments with a small gap, and markers as dots, on its own track. A pointer over it MUST preview the time, the chapter title, and the nearest marker label, and its spoken value MUST add the chapter title and the label of a marker it reaches. A marker with content MUST be a button that jumps to its time and opens the content in a popover in the page's theme. A marker MUST NOT catch a pointer while the control bar around it is hidden, and keys typed in its popover MUST NOT seek.                                                                                                                                                                           | `component:MediaPlayer/DEC-13`                                                                                                                                                               | decided; pending owner approval                      |

### Allowed variation

- **AV1 — Narrow players.** Below a 480px container width the VideoPlayer bar
  may drop the volume slider, and below 360px the time readout; play, the
  timeline, and fullscreen stay.
- **AV2 — Intervals and rates.** Skip intervals and playback rates are props;
  the defaults may change without changing the contract.

### Representative states

| State              | Required invariant                                             | Allowed variation          |
| ------------------ | -------------------------------------------------------------- | -------------------------- |
| Before playback    | Large play control and poster; bar hidden until keyboard focus | Poster absent              |
| Playing, active    | Bar visible; Pause offered                                     | —                          |
| Playing, idle      | Bar hidden; pointer cursor hidden over the player              | —                          |
| Paused or ended    | Bar visible; Replay offered after the end                      | —                          |
| Waiting for data   | Spinner over the video                                         | —                          |
| Error              | Alert with retry; other status layers absent                   | —                          |
| Live stream        | Time readout shows "Live"; timeline disabled                   | —                          |
| Right-to-left page | Timeline and playback buttons keep left-to-right order         | Surrounding layout mirrors |

### Performance and resources

- **PR1 — Scoped updates.** Each part subscribes to the state values it
  renders, so a time update re-renders only the parts that show time.
- **PR2 — One element, clean teardown.** The store listens to one media
  element, its track list, and the document's fullscreen events, and removes
  every listener when the media part unmounts.

## Accessibility contract

- **AR1 — Player group.** The root is a focusable `group` named by `label`
  with the shared focus-visible outline.
- **AR2 — Control names.** Every control has a translated name that follows its
  state: Play, Pause, Replay; Mute, Unmute; Full screen, Exit full screen. The
  captions control is a toggle that exposes `aria-pressed`. The speed button,
  the speed slider's value, and the speed menu button name the current speed,
  and the speed menu marks the current speed checked.
- **AR3 — Sliders.** The timeline and volume are sliders with value text in
  words.
- **AR4 — Announcements.** The root owns every announcement. Shortcut changes
  are announced once through the shared announcement channel (`spec:AST-086`),
  a playback failure once through its assertive channel, and routine time
  updates and buffering never.
- **AR5 — Hidden controls stay operable.** Hidden controls keep their tab stops,
  and keyboard focus inside the player shows them.
- **AR6 — Captions.** Captions render through the browser, so a person's system
  caption preferences apply.
- **AR7 — Moving media.** Autoplay is muted, and a pause control stays
  reachable for media that moves longer than five seconds.

## Design relationships

| Anatomy or state        | Design requirement            | Representation authority                     | Hierarchy role | Component contract |
| ----------------------- | ----------------------------- | -------------------------------------------- | -------------- | ------------------ |
| Timeline direction      | `design:bidirectionality/DR5` | prescribed by `component:MediaPlayer/DEC-3`  | prominent      | FR4                |
| Controls over video     | `design:bidirectionality/DR7` | prescribed                                   | supporting     | FR5, FR6           |
| Frosted control surface | none current                  | human-selected (`component:MediaPlayer/DD1`) | supporting     | FR6                |

The component implements design requirements without copying their rationale.
An `unsettled` representation remains a human decision; principles do not let an
agent invent the answer.

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                                 | Intent or reason                                                                         | Applies to         | Allowed variation                            |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| DD1 | Video controls float in a rounded, frosted bar inset from the edges and appear on hover. | The video stays the subject; the controls read as one light layer that leaves when idle. | VideoPlayer bar    | Blur strength and surface mix may be retuned |
| DD2 | The timeline and playback buttons keep left-to-right order under RTL.                    | Media plays in one direction; the timeline shows the media, not reading order.           | Timeline, play row | None                                         |

## Family and system relationships

- `spec:AST-082` declares platforms per component; this family declares the web
  only.
- `spec:AST-086` owns announcement delivery; the root names itself the one
  owner of shortcut announcements.
- `design:bidirectionality` DR5 keeps media direction stable; the timeline
  follows it.

## Verification map

| Contract      | Verification                                                                  | Representative states                                         | Mutation or failure expectation                                                               | Audit section                    |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR2, AR1 | `MediaPlayer.test.tsx`                                                        | named group, native element attributes, outside-root hook use | browser controls, a missing group name, or a hook outside a root fails focused assertions     | `audit:MediaPlayer/behavior`     |
| FR3, AR4      | `MediaPlayer.test.tsx` shortcut and editable-field tests                      | play, mute, skip, digit seek, rate step, typing in a field    | a shortcut firing in a field or a missing announcement fails focused assertions               | `audit:MediaPlayer/interaction`  |
| FR4, AR3      | `MediaPlayer.test.tsx` timeline tests plus the Storybook RTL story            | RTL page, arrow and page keys, value text                     | a mirrored timeline, wrong skip distance, or value text without the duration fails            | `audit:MediaPlayer/timeline`     |
| FR5, FR6, AR5 | idle-timer and touch-tap tests plus Storybook rendered review                 | playing idle and active, paused, pointer movement             | controls that hide while paused or stay after idle playback fail; frost needs rendered review | `audit:MediaPlayer/visibility`   |
| FR7, FR8      | captions-toggle, spinner, and focus-after-play tests plus real-browser review | no tracks, one track, error, waiting                          | a control for an absent capability fails; status layers need real-browser review              | `audit:MediaPlayer/capabilities` |
| FR9, FR11     | AudioPlayer Section, speed menu, skip, and system media control tests         | default intervals, rate cycle, first playback, unmount        | wrong intervals, a stuck rate, or system metadata kept after unmount fails                    | `audit:MediaPlayer/audio`        |
| Documentation | component docs, root export, Storybook, and knowledge check                   | public examples and discovery                                 | stale or missing discoverability fails repository checks                                      | `audit:MediaPlayer/docs`         |

## Decision log

### DEC-1 — The family has no runtime dependency and is bound for Core

**Reference:** `component:MediaPlayer/DEC-1`
**Decider:** ernestt, 2026-11-03

The native media element plays every format the browser supports, so the
family needs no library and belongs in Core once it graduates from Lab.
Streaming engines, casting SDKs, and third-party embeds stay outside the family
as optional adapters that present a media-element interface.

### DEC-2 — Astryx owns the playback state layer

**Reference:** `component:MediaPlayer/DEC-2`
**Decider:** ernestt, 2026-11-03

A small store over the media element carries the playback state. Its upkeep is
browser quirks that the controls carry in any case, which does not justify a
dependency.

Rejected: an external player store, which adds a fast-moving dependency to Core.

### DEC-3 — The timeline runs left to right in every direction

**Reference:** `component:MediaPlayer/DEC-3`
**Decider:** ernestt, 2026-11-03

Playback controls and the progress bar show the direction of the media, not
reading order, so they do not mirror under RTL.

### DEC-4 — The player owns playback state

**Reference:** `component:MediaPlayer/DEC-4`
**Decider:** ernestt, 2026-11-03

Products observe playback through callbacks and change it through
`useMediaPlayer` actions. Browsers refuse playback on their own terms, such as
autoplay policy, so a controlled `isPlaying` prop could not stay true.

### DEC-5 — Video controls float and appear on hover

**Reference:** `component:MediaPlayer/DEC-5`
**Decider:** ernestt, 2026-11-03

The VideoPlayer controls sit in a frosted bar inset from the edges that shows
on activity and leaves when playback is idle (`component:MediaPlayer/DD1`).

### DEC-6 — Audio scope stops at a podcast-grade player

**Reference:** `component:MediaPlayer/DEC-6`
**Decider:** ernestt, 2026-11-03

AudioPlayer plays one item at a time. Queues, shuffle, and repeat belong to
products and templates.

### DEC-7 — The family serves the web only

**Reference:** `component:MediaPlayer/DEC-7`
**Decider:** ernestt, 2026-11-03

The family declares the web platform only. A native platform plays media
through its own system player.

### DEC-8 — On touch, a tap shows the controls until the next tap

**Reference:** `component:MediaPlayer/DEC-8`
**Decider:** ernestt, 2026-11-04

After touch input the controls have no idle timer: a tap on the video shows
them, and only the next tap hides them. Mouse and keyboard keep the idle
timer of `component:MediaPlayer/DEC-5`.

### DEC-9 — AudioPlayer uses a Section container

**Reference:** `component:MediaPlayer/DEC-9`
**Decider:** ernestt, 2026-11-04

AudioPlayer paints no card of its own. A Section container gives it the
theme's section background and padding, and its style props style that
container.

### DEC-10 — The playback speed is one control with a slider or a menu

**Reference:** `component:MediaPlayer/DEC-10`
**Decider:** ernestt, 2026-11-05

The speed control has two variants. The slider variant, which AudioPlayer
uses, pairs a speed button with a speed slider, revealed like volume; the
button switches between normal speed and the last other speed, the way Mute
switches the sound. The menu variant opens a menu of speeds. Both variants
and the `<` and `>` shortcuts share one default list of speeds.

### DEC-11 — Volume sliders appear through the container reveal

**Reference:** `component:MediaPlayer/DEC-11`
**Decider:** ernestt, 2026-11-04

In both presets the volume slider appears while the volume control is hovered
or holds focus, and always on a coarse pointer, through the shared container
reveal. The slider opens beside Mute toward the center of the row, so Mute
stays under the pointer, and the slider shows the volume in a tooltip. Its
column opens and closes with a short width transition: the disclosure
exception to transform-only motion, applied on the inline axis to one small,
user-started change. It does not move under reduced motion.

### DEC-12 — Media glyphs come from the icon registry

**Reference:** `component:MediaPlayer/DEC-12`
**Decider:** ernestt, 2026-11-04

The parts ask the icon registry for `media:*` keys, so a theme can supply the
glyphs. Without a theme entry, the parts draw bundled glyphs drawn from
Lucide.

Rejected: copied glyphs without registry keys, which no theme can restyle.

### DEC-13 — The timeline carries buffering, chapters, and markers

**Reference:** `component:MediaPlayer/DEC-13`
**Decider:** ernestt, 2026-11-04

The buffered range, chapter segments, and markers such as timestamped
comments draw on the timeline itself, not on a separate progress bar. The
core Slider keeps the interaction, the focus ring, and the hover and pressed
tints; the media part paints the track, the ranges, the markers, and the
thumb under it.

### DEC-14 — AudioPlayer shows artwork in front of the title

**Reference:** `component:MediaPlayer/DEC-14`
**Decider:** ernestt, 2026-11-04

The artwork slot is square by default and takes another aspect ratio. It
shows the artwork image, any media the product passes, or a generic audio
file icon.

### DEC-15 — Previous and next track belong to the product's queue

**Reference:** `component:MediaPlayer/DEC-15`
**Decider:** ernestt, 2026-11-04

AudioPlayer shows previous-track and next-track controls beside rewind and
fast-forward when the product passes handlers for them, and hands the same
actions to the system media controls. The player keeps no queue, so
`component:MediaPlayer/DEC-6` stands.

### DEC-16 — Paired controls are one part each

**Reference:** `component:MediaPlayer/DEC-16`
**Decider:** ernestt, 2026-11-05

Mute and the volume slider are one part, `MediaVolume`. The speed button,
slider, and menu are one part, `MediaPlaybackRate`, with a slider or menu
variant. The video and audio elements are one part, `MediaPlayerElement`,
chosen by `kind`. Play, seek, the timeline, time, captions, and fullscreen
stay separate parts, because each does one job.

Rejected: a root that renders its own media element, which moves the
element's ref, style, and children onto the root.

## Open questions

- **OQ1 — How does the media timeline share Slider's behavior?** The
  timeline is its own part, with a buffered range, chapters, markers, a time
  preview at the pointer, and arrow keys whose step differs from the drag
  resolution. It keeps the core Slider for drag, keys, focus, and value text,
  clears the Slider's paint through its theme tokens, and draws its own track
  under it. A shared headless slider hook in core would let Slider and the
  timeline draw their own visuals on one engine; adding ranges and markers to
  Slider grows a shared component; keeping the token approach couples the
  timeline to Slider's internals. (`human-api`)
- **OQ2 — Does a theme token own the frosted surface?** The frosted recipe
  appears in more than one surface. A theme-owned material token lets a flat
  theme turn frost off everywhere; a component-owned recipe keeps the theme
  contract smaller. (`human-api`)
- **OQ3 — Do the media keys become core icon names?** The glyphs resolve
  through namespaced `media:*` registry keys, with bundled Lucide drawings
  when a theme maps none. Core icon names would make every icon set define
  them and would let component icon slots map them; namespaced keys keep them
  optional for themes. (`human-api`)
- **OQ4 — Are the public names and the part set right?** The family exports
  `VideoPlayer`, `AudioPlayer`, `MediaPlayer`, `MediaPlayerElement`, eight
  `Media*` control parts (play, seek, volume, timeline, time, captions,
  fullscreen, and playback speed), and the `useMediaPlayer` and
  `useMediaPlaybackTime` hooks. (`human-api`)
- **OQ5 — Where does the timeline's direction rule live?** It can stay a
  component exception to `design:bidirectionality` DR6, or the design record can
  state the media rule for every component. (`human-design`)
- **OQ6 — Does Lightbox adopt these controls for video items?** Lightbox video
  items use the browser's controls. (`human-api`)
- **OQ7 — What evidence gates graduation?** Real-browser runs including WebKit,
  screen reader passes, and rendered review over light, dark, and mixed
  footage. (`checkable`)
- **OQ8 — Is the video control bar a Toolbar?** The bar is a plain row of
  controls, so every control is its own tab stop. The Toolbar component gives
  one tab stop with arrow keys between controls, but the timeline and volume
  sliders and the player's seek and volume shortcuts also use the arrow keys.
  Adopting Toolbar means arrow keys move focus while a control has focus;
  keeping the row keeps the shortcuts and the extra tab stops. (`human-api`)
- **OQ9 — Which speed variant is the default?** AudioPlayer uses the slider
  variant. The menu shows every speed at once and costs one more press; the
  slider changes speed in one gesture but hides its stops until it opens.
  (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
