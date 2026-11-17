---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` now fetches each image a page names by an `https` address, once while the page renders, and the file carries it, so the image shows in a viewer that blocks the network. The render sends no cookies or credentials, takes only an image (by its type and its bytes) up to 8 MB, and gives each image 5 seconds and all of them 15. Any failure (no network, no answer in time, not an image, too large, or an address that is not `https`) leaves the address as the page wrote it and warns, naming why. The text and JSON results list every address fetched and every one that was not (`remoteImages`). `--reverse` gives back the page with its addresses. A fetched image travels with the file, so anyone who has the file can see it.

@josephfarina
