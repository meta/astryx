---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --interactive` keeps the page's controls working in the file. The file also carries the page's own script, inline after the embedded source: the page's modules and the packages they use, bundled for the browser. It paints the rendered markup first, then the script draws the live page over it, so state, effects, click handlers, tabs and menus work. It is still one file that loads nothing from the network and runs no `eval`, so it works in a sandboxed frame with a strict content security policy; `--reverse` still gives the page back byte for byte, the note at the top says the file runs a script, and the commands it prints keep `--interactive`. esbuild builds the script: it is a new optional peer dependency (`>=0.25.0 <1.0.0`), loaded only by `--interactive`, so no other command needs it; without it the render writes nothing and names the install command in the project's package manager. A page whose script needs Node stops with the new `ERR_RENDER_INTERACTIVE`. The JSON adds `interactive`, `scriptBytes` and `scriptModules` to a render, and `interactive` to a reverse.

@josephfarina
