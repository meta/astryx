---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: pictures taken with a Chrome or Chromium (no Playwright) are whole-page pictures, the same as Playwright's, through the browser's DevTools protocol, never the top 2400 pixels only. Every browser the editor starts runs under one runner: a temp folder of its own (a run with none is refused, never started on the person's own browser profile), one time bound per browser with the next browser tried when one hangs or fails (and not tried again for the next picture of the run), and a stop (Ctrl-C, SIGTERM, or the terminal closing) that closes the browser's whole process group and removes its temp folder and the unfinished picture. When a later browser took the picture, the result says why an earlier one did not, with its real error. A picture file of your own (`preview.png` of any size) is never taken over: only pictures the editor recorded or stamped are. `preview add` from a workspace app's folder keeps a theme the route imports from outside it, as `preview remove` does; two starter apps from `preview app` never share a package name; refusals name commands that work when followed (each app's own folder from a workspace root, a free folder for a starter app, a page this app can show); and the note that the app does not import Core's stylesheet reads the layouts' real import statements.

@josephfarina
