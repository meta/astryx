---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` no longer fails a page that rendered because its answer arrived just after the page's process exited. Under load, the CLI could notice the exit first and report "The page's process ended without an answer (exit 0)" for a page that had finished. It now waits until the channel to that process has closed, so an answer still in transit is read. When no answer arrives, the error says why: the answer was sent but not received, the process ended while it sent it, or the stage it ended in, after how many seconds and with how much memory free. When the page's process cannot send its answer, the error now says so.

@cixzhang
