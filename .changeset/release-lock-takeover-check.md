---
'@astryxdesign/cli': patch
---

The release cache's lock takeover checks that the lock it moved aside is still the one it judged stale. A lock another command took in the moment between the check and the move is put back, so two commands never both think they hold it.
