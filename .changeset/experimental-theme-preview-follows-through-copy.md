---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a change no longer deletes a copy of a picture (such as `preview-before.png`): only pictures the editor recorded taking, unchanged since, are removed. Every browser the editor starts for a picture, Playwright included, runs as its own process with a temp folder of its own (removed however the run ends), one 60-second bound and the same stop; a browser that does not start keeps its real cause in the message, and Chrome is named only when there is one. A theme folder that cannot be written is a write failure naming the folder; pictures asked for but not taken are said; `preview add` finds a preview renamed by hand instead of starting a second one, through the one list of previews `see`, a change's refresh and the preview commands share; a theme the route imports from outside the project folder (a workspace app run from its own folder) is never dropped from the preview; the no-template refusal offers only pages the app can show; a page remove over a theme that does not load names the whole-preview remove; the `add --template <default page>` note says what was added; from a subfolder, the wiring's paths work from there; and the `preview remove` help says what happens to a path outside the folder.

@josephfarina
