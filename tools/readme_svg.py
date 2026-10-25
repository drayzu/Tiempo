"""The README's vector pieces: the header, the "scroll through all of time" link and the ENTER bar.

    python tools/readme_svg.py   ->  docs/media/{header,scroll,enter}-{dark,light}.svg

Fonts are subset and embedded, so the SVGs look the same on GitHub as here. The header's time axis
follows the journey (each era where it falls along the scroll), coloured by the temperature of the
universe: white-hot, then the orange of the first light, then dark for almost all of time.
"""
import base64, io, os, random
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'media')
NM = os.path.join(ROOT, 'node_modules')
FONTS = {
    'S': NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
    'I': NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
    'M': NM + '/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
}
UNICODES = list(range(0x20, 0x7f)) + list(range(0xa0, 0x100)) + [0x2014, 0x2019, 0x2212]

THEMES = {
    'dark': dict(ink='#ece7db', page='#0d1117', acc='#8fb4ff', key='#0d0b0a'),
    'light': dict(ink='#1f1d1a', page='#ffffff', acc='#3a64c8', key='#ffffff'),
}

def font_b64(path):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga']
    opts.name_IDs = []
    f = TTFont(path)
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(f)
    buf = io.BytesIO()
    f.flavor = 'woff2'
    f.save(buf)
    return base64.b64encode(buf.getvalue()).decode()

FONT_CSS = ''.join(
    "@font-face{font-family:%s;src:url(data:font/woff2;base64,%s) format('woff2')%s}" % (k, font_b64(p), ';font-weight:100 900' if k == 'M' else '')
    for k, p in FONTS.items())

def svg(w, h, label, style, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{label}">'
            f'<title>{label}</title><style>{FONT_CSS}{style}</style>{body}</svg>')

def write(name, data):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(data)
    print(f'  {name:<22} {len(data.encode()) / 1024:6.1f} KB')

def pow10(exp, unit, size):
    r = round(size * .42)
    e = str(exp).replace('-', '−')
    return f'10<tspan dy="-{r}" font-size="{round(size * .7)}">{e}</tspan><tspan dy="{r}">{unit}</tspan>'

def arrow(x, y, s, color, w=1.6):
    """A right arrow drawn as a path (the subset fonts have no arrow glyphs)."""
    return (f'<path d="M{x},{y} h{s} m{-s * .38:.1f},{-s * .34:.1f} l{s * .38:.1f},{s * .34:.1f} l{-s * .38:.1f},{s * .34:.1f}" '
            f'fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')

# ------------------------------------------------------------------ the header
LEN = 271.0  # the journey, in beats
# (beat, label above the axis, tick below it)
STOPS = [
    (6.6, 'the Planck epoch', pow10(-43, ' s', 15)),
    (27, 'the quarks are caught', None),
    (66, 'let there be light', '380 000 yr'),
    (96, 'the first star', None),
    (157, 'now', 'now'),
    (184, 'the Sun goes out', None),
    (207, 'the last star', None),
    (247, 'the last light', pow10(100, ' yr', 15)),
]
# (beat, colour): the temperature of the universe along the way
HEAT = [(0, '#d9d4ff'), (8, '#ffffff'), (40, '#f4f1ff'), (58, '#ffe2b0'), (66, '#ffb35c'), (72, '#ff7a3d'),
        (78, '#a8341f'), (86, '#2a1612'), (100, '#141210')]

def header(t):
    W, H = 1200, 470
    ink, acc = t['ink'], t['acc']
    dark = t is THEMES['dark']
    x0, x1, ay = 110, 1010, 352
    X = lambda b: x0 + (x1 - x0) * b / LEN
    D = 18.0  # seconds for the proton to cross
    rng = random.Random(7)
    style = ('.s{animation:tw 6s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.12}50%{opacity:.7}}'
             '.rise{animation:rise 1.4s cubic-bezier(.2,.7,.2,1) both}'
             '@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'
             '.run{animation:run 5s linear infinite}@keyframes run{to{stroke-dashoffset:-60}}')
    b = []
    if dark:
        b.append('<defs><radialGradient id="v" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#10141c"/>'
                 '<stop offset="1" stop-color="#0d1117"/></radialGradient></defs>'
                 f'<rect width="{W}" height="{H}" fill="url(#v)"/>')
    # stars, only where it is dark (after the light has cooled)
    for _ in range(150):
        x, y = rng.uniform(12, W - 12), rng.uniform(12, H - 12)
        if abs(y - ay) < 30:
            continue
        b.append(f'<circle class="s" cx="{x:.0f}" cy="{y:.0f}" r="{rng.uniform(.4, 1.2):.2f}" fill="{ink}" '
                 f'style="animation-delay:-{rng.uniform(0, 6):.1f}s"/>')
    # the kicker, title and phrase
    b.append(f'<text class="rise" x="600" y="96" text-anchor="middle" font-family="M,monospace" font-size="13" '
             f'letter-spacing="5.5" fill="{ink}" fill-opacity=".5">DRAYZU · ESCALAS · TIME</text>')
    b.append(f'<text class="rise" x="600" y="214" text-anchor="middle" font-family="S,serif" font-size="128" fill="{ink}" '
             f'style="animation-delay:.15s">Tiempo</text>')
    b.append(f'<text class="rise" x="600" y="268" text-anchor="middle" font-family="I,serif" font-style="italic" font-size="31" '
             f'fill="{ink}" fill-opacity=".75" style="animation-delay:.3s">From before the Big Bang to the last light.</text>')
    # the axis: a band in the colour of the universe, then dark; certainty in its dashes
    # (on a white page the dark of almost all of time is drawn faint, as ink)
    fade = lambda bt: '' if dark or bt < 80 else ' stop-opacity=".25"'
    stops = ''.join(f'<stop offset="{(X(bt) - x0) / (x1 - x0):.4f}" stop-color="{c}"{fade(bt)}/>' for bt, c in HEAT)
    tail = ink if not dark else '#ece7db'
    b.append(f'<defs><linearGradient id="heat" gradientUnits="userSpaceOnUse" x1="{x0}" x2="{x1}" y1="0" y2="0">{stops}'
             f'<stop offset="1" stop-color="#141210"{fade(LEN)}/></linearGradient>'
             f'<filter id="glow" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="6"/></filter></defs>')
    b.append(f'<rect x="{x0}" y="{ay - 5}" width="{X(100) - x0:.0f}" height="10" rx="5" fill="url(#heat)" filter="url(#glow)" opacity=".75"/>')
    b.append(f'<rect x="{x0}" y="{ay - 2.5}" width="{x1 - x0}" height="5" rx="2.5" fill="url(#heat)"/>')
    # the dark part of time, drawn faintly so it reads on both themes
    b.append(f'<line x1="{X(86):.0f}" x2="{x1}" y1="{ay}" y2="{ay}" stroke="{tail}" stroke-opacity=".28" stroke-width="5" stroke-linecap="round"/>')
    seg = lambda a, z, dash, op: (f'<line x1="{X(a):.1f}" x2="{X(z):.1f}" y1="{ay + 10}" y2="{ay + 10}" stroke="{ink}" '
                                  f'stroke-opacity="{op}" stroke-width="1.4" {dash} stroke-linecap="round"/>')
    b.append(seg(0, 6.6, 'stroke-dasharray="1 5"', .5))
    b.append(seg(6.6, 40, 'stroke-dasharray="5 4"', .45))
    b.append(seg(40, 157, '', .5))
    b.append(seg(157, LEN, 'stroke-dasharray="5 4"', .45))
    # the fork: from Andromeda on, physics is not sure
    xf = X(202)
    for dy, lab in ((-46, 'rip?'), (46, 'crunch?'), (-82, 'decay?')):
        b.append(f'<path class="run" d="M{xf:.0f},{ay} C{xf + 70:.0f},{ay} {x1 - 60},{ay + dy} {x1 + 20},{ay + dy}" fill="none" stroke="{acc}" '
                 f'stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="1 6" stroke-linecap="round"/>'
                 f'<text x="{x1 + 30}" y="{ay + dy + 6}" font-family="I,serif" font-style="italic" font-size="19" fill="{ink}" fill-opacity=".6">{lab}</text>')
    b.append(f'<text x="{x1 + 30}" y="{ay + 6}" font-family="I,serif" font-style="italic" font-size="19" fill="{ink}" fill-opacity=".6">cold?</text>')
    # ticks below
    for bt, lab, tick in STOPS:
        if not tick:
            continue
        x = X(bt)
        b.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{ay + 16}" y2="{ay + 24}" stroke="{ink}" stroke-opacity=".4"/>'
                 f'<text x="{x:.1f}" y="{ay + 46}" text-anchor="middle" font-family="M,monospace" font-size="15" fill="{ink}" fill-opacity=".55">{tick}</text>')
    # the proton crossing all of time, naming each moment as it passes
    kt = []
    for bt, lab, _ in STOPS:
        f = bt / LEN * .92
        a, z = max(f - .025, 0), min(f + .06, .999)
        x = X(bt)
        b.append(f'<text x="{x:.1f}" y="{ay - 26}" text-anchor="middle" font-family="I,serif" font-style="italic" font-size="21" fill="{ink}" opacity="0">{lab}'
                 f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{a:.3f};{f:.3f};{z - .02:.3f};{z:.3f};1" dur="{D}s" repeatCount="indefinite"/></text>')
    b.append(f'<g><circle r="13" fill="{acc}" fill-opacity=".22"/><circle r="5.5" fill="{acc}"/><circle r="2.2" fill="#ffffff"/>'
             f'<animateMotion path="M{x0},{ay} H{x1}" keyPoints="0;1;1" keyTimes="0;.92;1" calcMode="linear" dur="{D}s" repeatCount="indefinite"/>'
             f'<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.9;.94;1" dur="{D}s" repeatCount="indefinite"/></g>')
    return svg(W, H, 'Tiempo — From before the Big Bang to the last light. One scroll through all of time, coloured by the '
               'temperature of the universe, with four possible endings.', style, ''.join(b))

# ------------------------------------------------------------------ the scroll link
def scroll(t):
    ink, acc = t['ink'], t['acc']
    W, H = 460, 100
    x0, x1, y = 40, 420, 50
    b = [f'<text x="{x0}" y="26" font-family="M,monospace" font-size="13" letter-spacing="1.5" fill="{ink}" opacity=".55">{pow10(-43, " s", 13)}</text>',
         f'<text x="{x1}" y="26" text-anchor="end" font-family="M,monospace" font-size="13" letter-spacing="1.5" fill="{ink}" opacity=".55">{pow10(100, " yr", 13)}</text>']
    for k in range(20):
        x = x0 + (x1 - x0) * k / 19
        big = k % 5 == 0 or k == 19
        b.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{38 if big else 44}" y2="{y}" stroke="{ink}" stroke-opacity="{.5 if big else .25}"/>')
    b.append(f'<line x1="{x0}" x2="{x1}" y1="{y}" y2="{y}" stroke="{ink}" stroke-opacity=".3"/>')
    b.append(f'<circle cy="{y}" r="5" fill="{acc}"><animate attributeName="cx" values="{x0};{x1};{x0}" dur="7s" repeatCount="indefinite" '
             'calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></circle>')
    b.append(f'<text x="{W / 2 - 14}" y="86" text-anchor="middle" font-family="I,serif" font-style="italic" font-size="26" fill="{ink}">Scroll through all of time</text>')
    b.append(arrow(W / 2 + 128, 78, 18, acc, 1.8))
    return svg(W, H, 'Scroll through all of time: open Tiempo', '', ''.join(b))

# ------------------------------------------------------------------ the ENTER bar
def enter(t):
    ink, acc = t['ink'], t['acc']
    style = '.k{animation:k 2.4s ease-in-out infinite}@keyframes k{0%,80%,100%{transform:translateY(0)}88%{transform:translateY(2px)}}'
    b = [f'<rect x="10" y="15" width="480" height="60" rx="30" fill="{t["page"]}" stroke="{ink}" stroke-opacity=".3"/>',
         arrow(40, 45, 15, acc, 1.6),
         f'<text x="66" y="51" font-family="M,monospace" font-size="16" letter-spacing=".5" fill="{ink}">drayzu.github.io/Tiempo</text>',
         f'<g class="k"><rect x="372" y="27" width="100" height="36" rx="18" fill="{acc}"/>'
         f'<text x="414" y="50" text-anchor="middle" font-family="M,monospace" font-weight="600" font-size="13" letter-spacing="1.5" fill="{t["key"]}">ENTER</text>'
         f'<path d="M455,38 v7 h-8 m3,-3 l-3,3 l3,3" fill="none" stroke="{t["key"]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>']
    return svg(500, 90, 'Open drayzu.github.io/Tiempo', style, ''.join(b))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, th in THEMES.items():
        write(f'header-{name}.svg', header(th))
        write(f'scroll-{name}.svg', scroll(th))
        write(f'enter-{name}.svg', enter(th))
