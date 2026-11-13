---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` says why a page ended without an answer: the stage it reached (such as importing the page or rendering on the server), how long it ran, the memory left, and the page's last error output. A page process that loses its channel or reaches its own time limit is reported as that, never as a clean exit.

@cixzhang
