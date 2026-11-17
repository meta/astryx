"""Generate packages/lab/src/SVGIcon/weightedIcons.ts: filled five-weight demo icons.

Each lab starter icon (icons.ts, drawn as 2px strokes) is expanded into filled
outlines at five stroke widths, the way many icon libraries ship weights as
outline-to-fill drawings. Requires: pip install skia-pathops fonttools

  python3 packages/lab/scripts/generate-weighted-demo-icons.py
"""
import os, re, sys
import pathops
from fontTools.svgLib.path import parse_path
from fontTools.pens.basePen import BasePen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'src/SVGIcon/icons.ts')).read()
OUT = os.path.join(ROOT, 'src/SVGIcon/weightedIcons.ts')
STROKE_WIDTHS = {300: 1.25, 400: 1.5, 500: 1.75, 600: 2.0, 700: 2.25}


class SkPen(BasePen):
    def __init__(self, path):
        super().__init__(None)
        self.p = path
    def _moveTo(self, pt): self.p.moveTo(*pt)
    def _lineTo(self, pt): self.p.lineTo(*pt)
    def _curveToOne(self, a, b, c): self.p.cubicTo(*a, *b, *c)
    def _qCurveToOne(self, a, b): self.p.quadTo(*a, *b)
    def _closePath(self): self.p.close()
    def _endPath(self): pass


def shape_d(kind, a):
    f = lambda k: float(a.get(k, 0))
    if kind == 'path':
        return a['d']
    if kind == 'circle':
        cx, cy, r = f('cx'), f('cy'), f('r')
        return f'M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0'
    if kind == 'rect':
        x, y, w, h = f('x'), f('y'), f('width'), f('height')
        rx = float(a.get('rx', a.get('ry', 0)))
        if rx:
            return (f'M{x + rx} {y}h{w - 2 * rx}a{rx} {rx} 0 0 1 {rx} {rx}v{h - 2 * rx}'
                    f'a{rx} {rx} 0 0 1 {-rx} {rx}h{-(w - 2 * rx)}a{rx} {rx} 0 0 1 {-rx} {-rx}'
                    f'v{-(h - 2 * rx)}a{rx} {rx} 0 0 1 {rx} {-rx}z')
        return f'M{x} {y}h{w}v{h}h{-w}z'
    if kind == 'line':
        return f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}"
    if kind in ('polyline', 'polygon'):
        pts = re.findall(r'-?[\d.]+', a['points'])
        return 'M' + ' '.join(pts[:2]) + 'L' + ' '.join(pts[2:]) + ('z' if kind == 'polygon' else '')
    raise ValueError(kind)


def starter_icons():
    for m in re.finditer(r"export const (\w+)Icon: SVGIconDef = \{(.*?)\n\};", SRC, re.S):
        shapes = [(s[1], dict(re.findall(r"(\w+): '([^']*)'", s[2])))
                  for s in re.finditer(r"type: '(\w+)',\s*attrs: \{(.*?)\}", m[2], re.S)]
        yield m[1], shapes


def outline(shapes, width):
    acc = pathops.Path()
    for kind, attrs in shapes:
        p = pathops.Path()
        parse_path(shape_d(kind, attrs), SkPen(p))
        p.stroke(width, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        p.convertConicsToQuads()
        acc = pathops.op(acc, p, pathops.PathOp.UNION, fix_winding=True)
    acc.simplify(fix_winding=True)
    return acc


def fmt(n):
    """Integer hundredths -> shortest decimal string."""
    sign = '-' if n < 0 else ''
    i, f = divmod(abs(n), 100)
    frac = f'{f:02d}'.rstrip('0')
    return sign + (str(i) if i or not frac else '') + ('.' + frac if frac else '') if (i or frac) else '0'


def join(nums):
    out, prev = '', None
    for n in nums:
        if prev is not None and not n.startswith('-') and not (n.startswith('.') and '.' in prev):
            out += ' '
        out += n
        prev = n
    return out


def to_d(p):
    """Relative encoding of coordinates snapped to 0.01; exact, so no drift."""
    q = lambda v: round(v * 100)
    out, cx, cy, sx, sy = [], 0, 0, 0, 0
    for verb, pts in p:
        pts = [(q(x), q(y)) for x, y in pts]
        if verb == pathops.PathVerb.MOVE:
            (x, y), = pts
            out.append('M' + join([fmt(x), fmt(y)])); cx, cy, sx, sy = x, y, x, y
        elif verb == pathops.PathVerb.CLOSE:
            out.append('z'); cx, cy = sx, sy
        else:
            cmd = {pathops.PathVerb.LINE: 'l', pathops.PathVerb.QUAD: 'q', pathops.PathVerb.CUBIC: 'c'}[verb]
            out.append(cmd + join([fmt(v - (cx if k % 2 == 0 else cy)) for pt in pts for k, v in enumerate(pt)]))
            cx, cy = pts[-1]
    return ''.join(out)


def main():
    blocks, names = [], []
    for var, shapes in starter_icons():
        layers = []
        for weight, width in STROKE_WIDTHS.items():
            d = to_d(outline(shapes, width))
            if layers and layers[-1][2] == d:
                layers[-1][1] = weight
            else:
                layers.append([weight, weight, d])
        body = ',\n'.join(f"    {{from: {a}, to: {b}, paths: [{{d: '{d}'}}]}}" for a, b, d in layers)
        blocks.append(f"export const {var}WeightedIcon: WeightedIconDef = {{\n  name: '{var}',\n  layers: [\n{body},\n  ],\n}};")
        names.append(f'{var}WeightedIcon')
    head = ('// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n'
            '/**\n * @file weightedIcons.ts\n'
            ' * @input The lab starter icons (icons.ts), drawn as 2px strokes\n'
            ' * @output Five-weight filled demo icons for WeightedSVGIcon\n'
            ' * @position Generated by scripts/generate-weighted-demo-icons.py; do not edit by hand\n'
            ' *\n * Each starter icon is expanded into filled outlines at stroke widths\n'
            ' * 1.25 / 1.5 / 1.75 / 2 / 2.25 for weights 300-700.\n */\n\n'
            "import type {WeightedIconDef} from './buildWeightedIcon';\n\n")
    tail = f"\n\n/** Every weighted demo icon. */\nexport const weightedStarterIcons: readonly WeightedIconDef[] = [\n" + ''.join(f'  {n},\n' for n in names) + '];\n'
    open(OUT, 'w').write(head + '\n\n'.join(blocks) + tail)
    print(OUT, len(names), os.path.getsize(OUT))


main()
