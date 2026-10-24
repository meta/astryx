// Copyright (c) Meta Platforms, Inc. and affiliates.

/// The SF Symbol each of Astryx's built-in icon names draws by default on
/// Apple platforms (AST-082 FR17). A test keeps this map equal to
/// `NATIVE_ICON_DEFAULTS` in `@astryxdesign/native`; a theme replaces any
/// entry through `Theme(icons:)`.
let astryxDefaultIcons: [String: String] = [
  "close": "xmark",
  "chevronDown": "chevron.down",
  "chevronLeft": "chevron.left",
  "chevronRight": "chevron.right",
  "chevronsLeft": "chevron.left.2",
  "chevronsRight": "chevron.right.2",
  "check": "checkmark",
  "success": "checkmark.circle.fill",
  "error": "exclamationmark.circle.fill",
  "warning": "exclamationmark.triangle.fill",
  "info": "info.circle.fill",
  "calendar": "calendar",
  "clock": "clock",
  "externalLink": "arrow.up.right.square",
  "menu": "line.3.horizontal",
  "moreHorizontal": "ellipsis",
  "search": "magnifyingglass",
  "upload": "square.and.arrow.up",
  "arrowUp": "arrow.up",
  "arrowDown": "arrow.down",
  "arrowsUpDown": "arrow.up.arrow.down",
  "funnel": "line.3.horizontal.decrease",
  "eyeSlash": "eye.slash",
  "viewColumns": "rectangle.split.3x1",
  "copy": "doc.on.doc",
  "checkDouble": "checkmark.message",
  "wrench": "wrench.adjustable",
  "stop": "stop.fill",
  "microphone": "mic",
]
