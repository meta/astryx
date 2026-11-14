---
'@astryxdesign/richtext': patch
---

[fix] A link typed without a scheme, whose host has a dot or is `localhost`, followed by a port, such as `example.com:8080`, `www.example.com:8080/docs` or `localhost:3000`, now gets the default `https://` like `example.com` does, instead of being read as an unknown scheme and turned into `about:blank`
@kevin9327
