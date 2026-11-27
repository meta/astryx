# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Regenerate the weight probe font embedded in src/SVGIcon/weightProbe.ts.

The font has no visible glyphs and one axis, wght 1-1000. The advance of its
"0" glyph is 1000 + weight in font units (1000 per em), so `1ch` is
(1000 + weight) / 1000 em and container queries can read the inherited font
weight. Requires: pip install fonttools brotli

  python3 packages/lab/scripts/generate-weight-probe-font.py   # prints the base64 WOFF2
"""
import base64, io
from fontTools import varLib
from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, SourceDescriptor
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen
FAMILY = 'AstryxWeightProbe'
def master(w):
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'zero'])
    fb.setupCharacterMap({0x30: 'zero'})
    sq = TTGlyphPen(None); sq.moveTo((0, 0)); sq.lineTo((0, 1)); sq.lineTo((1, 1)); sq.closePath()
    fb.setupGlyf({'.notdef': sq.glyph(), 'zero': TTGlyphPen(None).glyph()})
    fb.setupHorizontalMetrics({'.notdef': (0, 0), 'zero': (1000 + w, 0)})
    fb.setupHorizontalHeader(ascent=1000, descent=0)
    fb.setupNameTable({'familyName': FAMILY, 'styleName': f'w{w}'})
    fb.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0, usWeightClass=w)
    fb.setupPost()
    return fb.font
doc = DesignSpaceDocument()
a = AxisDescriptor(); a.tag, a.name, a.minimum, a.default, a.maximum = 'wght', 'Weight', 1, 400, 1000
doc.addAxis(a)
for w in (1, 400, 1000):
    s = SourceDescriptor(); s.font, s.location = master(w), {'Weight': w}; s.familyName, s.styleName = FAMILY, f'w{w}'
    doc.addSource(s)
font, _, _ = varLib.build(doc, exclude=['STAT'])
font.recalcTimestamp = False
font['head'].created = font['head'].modified = timestampFromString('Thu Jan  1 00:00:00 2026')
font.flavor = 'woff2'
b = io.BytesIO(); font.save(b)
print(base64.b64encode(b.getvalue()).decode())
