"""The README's vector pieces: the header, the "scroll through all of time" link and the ENTER bar.

    python tools/readme_svg.py   ->  docs/media/{header,scroll,enter}-{dark,light}.svg

Fonts are subset and embedded, so the SVGs look the same on GitHub as here. The header's time axis
follows the journey (each era where it falls along the scroll), coloured by the temperature of the
universe: white-hot, then the orange of the first light, then dark for almost all of time.
"""
import base64, io, math, os, random
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
    (27, 'the quarks are caught', pow10(-5, ' s', 15)),
    (66, 'let there be light', pow10(13, ' s', 15)),
    (96, 'the first star', pow10(15, ' s', 15)),
    (157, 'you are here', 'now'),
    (184, 'the Sun goes out', 'in ' + pow10(9, ' yr', 15)),
    (207, 'the last star', 'in ' + pow10(14, ' yr', 15)),
    (247, 'the last light', 'in ' + pow10(100, ' yr', 15)),
]
# (beat, colour): the temperature of the universe along the way
HEAT = [(0, '#d9d4ff'), (8, '#ffffff'), (40, '#f4f1ff'), (58, '#ffe2b0'), (66, '#ffb35c'), (72, '#ff7a3d'),
        (78, '#a8341f'), (86, '#2a1612'), (100, '#141210')]

def header(t):
    """A cover, not a diagram: the title out of the dark, a faint thread of light that our proton runs
    along (white-hot, the orange of the first light, then dark), opening at its end into four dotted
    ways that fade out; one quiet line below says where it is."""
    W, H = 1200, 360
    ink, acc = t['ink'], t['acc']
    dark = t is THEMES['dark']
    x0, x1, ay = 330, 870, 296
    X = lambda b: x0 + (x1 - x0) * b / LEN
    D = 16.0
    rng = random.Random(7)
    style = ('.s{animation:tw 7s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.08}50%{opacity:.55}}'
             '.rise{animation:rise 2.4s cubic-bezier(.2,.7,.2,1) both}'
             '@keyframes rise{from{opacity:0;filter:blur(6px)}to{opacity:1;filter:none}}')
    b = []
    if dark:
        b.append(f'<rect width="{W}" height="{H}" fill="{t["page"]}"/>')
    # The beginning, every loop: a point, a flash, and the embers flying out as the universe expands,
    # cooling from white to orange to red until they go out; then the cold stars, one by one.
    cx, cy = 600, 172
    style += (f'.bang{{transform-origin:{cx}px {cy}px;animation:bang {D}s cubic-bezier(.1,.7,.2,1) infinite}}'
              '@keyframes bang{0%{transform:scale(.02);opacity:0}0.6%{opacity:1}6%{opacity:.9}14%{transform:scale(7);opacity:0}100%{transform:scale(7);opacity:0}}')
    for k, (sc, dur) in enumerate(((1.0, 1), (1.25, 1.15), (1.6, 1.3))):
        style += (f'.e{k}{{transform-origin:{cx}px {cy}px;animation:e{k} {D}s cubic-bezier(.08,.75,.25,1) infinite,heat {D}s linear infinite}}'
                  f'@keyframes e{k}{{0%{{transform:scale(.01);opacity:0}}0.5%{{opacity:1}}{22 * dur:.0f}%{{opacity:.9}}'
                  f'{40 * dur:.0f}%{{transform:scale({sc});opacity:0}}100%{{transform:scale({sc});opacity:0}}}}')
    style += ('@keyframes heat{0%{fill:#ffffff}5%{fill:#fff4e0}12%{fill:#ffc27a}22%{fill:#ff7a3d}34%{fill:#8a2a18}100%{fill:#8a2a18}}'
              f'.cold{{animation:cold {D}s ease-in infinite}}@keyframes cold{{0%,30%{{opacity:0}}55%,92%{{opacity:1}}100%{{opacity:0}}}}')
    b.append(f'<defs><radialGradient id="fl"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#e8eeff" stop-opacity=".8"/>'
             f'<stop offset="1" stop-color="{acc}" stop-opacity="0"/></radialGradient></defs>')
    for k in range(3):
        dots = []
        for _ in range(170):
            a = rng.uniform(0, 6.283)
            r = rng.random() ** .5
            x = cx + math.cos(a) * r * 470
            y = cy + math.sin(a) * r * 150
            dots.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rng.uniform(.6, 1.9):.2f}"/>')
        b.append(f'<g class="e{k}">{"".join(dots)}</g>')
    b.append(f'<circle class="bang" cx="{cx}" cy="{cy}" r="34" fill="url(#fl)"/>')
    stars = []
    for _ in range(110):
        x, y = rng.uniform(10, W - 10), rng.uniform(10, H - 10)
        stars.append(f'<circle class="s" cx="{x:.0f}" cy="{y:.0f}" r="{rng.uniform(.4, 1.1):.2f}" fill="{ink}" '
                     f'style="animation-delay:-{rng.uniform(0, 7):.1f}s"/>')
    b.append(f'<g class="cold">{"".join(stars)}</g>')
    b.append(f'<text class="rise" x="600" y="196" text-anchor="middle" font-family="S,serif" font-size="128" fill="{ink}">Tiempo</text>')
    b.append(f'<text class="rise" x="600" y="244" text-anchor="middle" font-family="I,serif" font-style="italic" font-size="29" '
             f'fill="{ink}" fill-opacity=".72" style="animation-delay:.4s">From before the Big Bang to the last light.</text>')
    # the thread: hot, then the orange of the first light, then almost nothing
    fade = lambda bt: '' if dark or bt < 80 else ' stop-opacity=".25"'
    stops = ''.join(f'<stop offset="{(X(bt) - x0) / (x1 - x0):.4f}" stop-color="{c}"{fade(bt)}/>' for bt, c in HEAT)
    b.append(f'<defs><linearGradient id="heat" gradientUnits="userSpaceOnUse" x1="{x0}" x2="{x1}" y1="0" y2="0">{stops}'
             f'<stop offset="1" stop-color="#141210"{fade(LEN)}/></linearGradient>'
             f'<filter id="glow" x="-10%" y="-300%" width="120%" height="700%"><feGaussianBlur stdDeviation="4"/></filter></defs>')
    b.append(f'<line x1="{x0}" x2="{X(90):.0f}" y1="{ay}" y2="{ay}" stroke="url(#heat)" stroke-width="5" filter="url(#glow)" opacity=".6"/>')
    b.append(f'<line x1="{x0}" x2="{x1}" y1="{ay}" y2="{ay}" stroke="url(#heat)" stroke-width="1.6" stroke-linecap="round"/>')
    b.append(f'<line x1="{X(86):.0f}" x2="{x1}" y1="{ay}" y2="{ay}" stroke="{ink}" stroke-opacity=".16" stroke-width="1.2"/>')
    # at the end, four ways that fade into the dark (no names: the question stays open)
    b.append(f'<defs><linearGradient id="way" gradientUnits="userSpaceOnUse" x1="{x1 - 20}" x2="{x1 + 120}" y1="0" y2="0">'
             f'<stop offset="0" stop-color="{acc}" stop-opacity=".6"/><stop offset="1" stop-color="{acc}" stop-opacity="0"/></linearGradient></defs>')
    for dy in (-30, -10, 10, 30):
        b.append(f'<path d="M{x1 - 20},{ay} C{x1 + 30},{ay} {x1 + 60},{ay + dy} {x1 + 120},{ay + dy * 1.6:.0f}" fill="none" '
                 f'stroke="url(#way)" stroke-width="1.4" stroke-dasharray="1 5" stroke-linecap="round"/>')
    # one quiet line below, naming where the proton is
    for k, (bt, lab, when) in enumerate(STOPS):
        f = bt / LEN * .92
        a, z = max(f - .03, 0), min(f + .07, .999)
        b.append(f'<text x="600" y="{ay + 40}" text-anchor="middle" font-family="M,monospace" font-size="15" letter-spacing="1" '
                 f'fill="{ink}" fill-opacity=".6" opacity="0"><tspan fill="{acc}" fill-opacity="1">{when}</tspan> · {lab}'
                 f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{a:.3f};{a + .02:.3f};{z - .02:.3f};{z:.3f};1" '
                 f'dur="{D}s" repeatCount="indefinite"/></text>')
    b.append(f'<g><circle r="10" fill="{acc}" fill-opacity=".2"/><circle r="4.2" fill="{acc}"/><circle r="1.8" fill="#ffffff"/>'
             f'<animateMotion path="M{x0},{ay} H{x1}" keyPoints="0;1;1" keyTimes="0;.92;1" calcMode="linear" dur="{D}s" repeatCount="indefinite"/>'
             f'<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.9;.94;1" dur="{D}s" repeatCount="indefinite"/></g>')
    return svg(W, H, 'Tiempo — From before the Big Bang to the last light. One scroll through all of time.', style, ''.join(b))

# ------------------------------------------------------------------ the scroll link: just the words
def scroll(t):
    ink, acc = t['ink'], t['acc']
    W, H = 460, 56
    b = [f'<text x="{W / 2 - 14}" y="36" text-anchor="middle" font-family="I,serif" font-style="italic" font-size="26" fill="{ink}">Scroll through all of time</text>',
         arrow(W / 2 + 128, 28, 18, acc, 1.8)]
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
