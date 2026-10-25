"""The README's moment clips: a captured clip on one side, its time and caption on the other.

    python tools/readme_media.py [quarks luz ...]   ->  docs/media/<name>-<theme>.avif / .webp

Drawn at 1840 px wide (about twice the README column, sharp on HiDPI screens), text included, from the
frames captured with `tiempo.pelicula(...)` (dev, `?debug`) into tools/src/frames (1280 x 720 JPG at
30 fps). AVIF at 30 fps for the page; a lighter WebP (920 px, 15 fps) for browsers without AVIF. Each
theme is flattened onto GitHub's own background. Clips play back and forth, or loop forwards with a
crossfade when the moment should not run backwards (an explosion, a flash).
"""
import os, subprocess, sys, textwrap
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(ROOT, 'tools', 'src', 'frames')
OUT = os.path.join(ROOT, 'docs', 'media')
NM = os.path.join(ROOT, 'node_modules')
SERIF = NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2'
ITALIC = NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'
MONO = NM + '/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'

W, H = 960, 360            # layout units
CW, CH = 580, 326          # the clip
Z = 1840 / W               # px per unit
PW, PH = round(W * Z), round(H * Z)
FPS = 30
WEBP_W, WEBP_Q = 920, 70
XFADE = 14                 # frames of crossfade when looping forwards

THEMES = {
    'dark': dict(page=(13, 17, 23), ink=(236, 231, 219), dim=(236, 231, 219, 150), acc=(143, 180, 255)),
    'light': dict(page=(255, 255, 255), ink=(31, 29, 26), dim=(31, 29, 26, 160), acc=(58, 100, 200)),
}

# name, frames dir, start, count, crop (x, y, w, h), time (pre, exponent, unit), title, line, loop
MOMENTS = [
    ('quarks', 'quarks', 0, 120, (160, 90, 960, 540), ('t = ', '-5', ' s'), 'The quarks are caught',
     'In threes their colours add up to white: our proton is born.', 'pingpong'),
    ('light', 'luz2', 0, 120, (160, 90, 960, 540), ('t = ', '13', ' s'), 'Let there be light',
     'After 380 000 years the fog clears, and the sky glows orange.', 'pingpong'),
    ('star', 'estrella', 0, 120, (160, 90, 960, 540), ('t = ', '15', ' s'), 'The first star',
     'A hundred suns, so hot it shines blue. It dies young and seeds the dark.', 'forward'),
    ('now', 'ahora', 0, 120, (200, 112, 880, 495), ('', None, 'now'), 'Now',
     'Ten times less time at every step, down to the second you arrived.', 'pingpong'),
    ('sun', 'gigante', 0, 120, (240, 135, 800, 450), ('in ', '9', ' years'), 'The Sun goes out',
     'A red giant, then a glowing shell around a white dwarf.', 'forward'),
    ('vacuum', 'vacio', 0, 150, (160, 90, 960, 540), ('maybe in ', '161', ' years'), 'A bubble of true vacuum',
     'One of four possible endings: it grows at the speed of light, and nobody sees it coming.', 'forward'),
]

def px(v):
    return round(v * Z)

def feather(w, h, p=3, inner=0.6):
    """A soft superellipse: 1 in the middle, 0 at the edges, no corners."""
    u = np.abs(np.linspace(-1, 1, w))[None, :]
    v = np.abs(np.linspace(-1, 1, h))[:, None]
    d = (u ** p + v ** p) ** (1 / p)
    t = np.clip((d - inner) / (1 - inner), 0, 1)
    return 1 - t * t * (3 - 2 * t)

def card(w, h, r=22):
    """Light theme: a crisp rounded card (anti-aliased by supersampling)."""
    im = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), px(r) * 4, fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255

def text_layer(when, title, line, tx, th):
    pre, exp, unit = when
    f_t = ImageFont.truetype(SERIF, px(50))
    f_l = ImageFont.truetype(ITALIC, px(27))
    f_m = ImageFont.truetype(MONO, px(22))
    f_ms = ImageFont.truetype(MONO, px(14))
    tl = textwrap.wrap(title, 15)
    ll = textwrap.wrap(line, 30)
    block = 44 + 52 * len(tl) + 14 + 32 * len(ll)
    im = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = (H - block) // 2
    # when: «t = 10^-5 s», «in 10^9 years», «now»
    x = px(tx)
    if pre:
        d.text((x, px(y)), pre, font=f_m, fill=th['acc'])
        x += d.textlength(pre, font=f_m)
    if exp is not None:
        d.text((x, px(y)), '10', font=f_m, fill=th['acc'])
        x += d.textlength('10', font=f_m) + px(1)
        e = exp.replace('-', '−')
        d.text((x, px(y - 9)), e, font=f_ms, fill=th['acc'])
        x += d.textlength(e, font=f_ms) + px(2)
    d.text((x, px(y)), unit, font=f_m, fill=th['acc'])
    y += 44
    for ln in tl:
        d.text((px(tx), px(y)), ln, font=f_t, fill=th['ink'])
        y += 52
    y += 14
    for ln in ll:
        d.text((px(tx), px(y)), ln, font=f_l, fill=th['dim'])
        y += 32
    return np.asarray(im, dtype=np.float32) / 255

def encode_avif(dst):
    return subprocess.Popen(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{PW}x{PH}', '-r', str(FPS), '-i', '-',
         '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
         '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv',
         '-c:v', 'libsvtav1', '-preset', '5', '-crf', '34', '-g', '600', '-loop', '0', dst],
        stdin=subprocess.PIPE)

def sequence(start, count, mode):
    """Frame indices, or (a, b, w) blends for the crossfade of a forward loop."""
    idx = list(range(start, start + count))
    if mode == 'pingpong':
        return [(i, None, 0) for i in idx + idx[-2:0:-1]]
    # forwards: the last frames fade into the first ones, so the loop has no seam
    body = idx[:-XFADE]
    tail = [(idx[-XFADE + k], idx[k], (k + 1) / (XFADE + 1)) for k in range(XFADE)]
    return [(i, None, 0) for i in body[XFADE:]] + tail

def moment(k, m):
    name, clip, start, count, crop, when, title, line, mode = m
    left = k % 2 == 0
    cw, ch = px(CW), px(CH)
    cx = 0 if left else PW - cw
    cy = (PH - ch) // 2
    tx = CW + 10 if left else 30
    x, y, w, h = crop
    seq = sequence(start, count, mode)
    clips = {}
    def frame(i):
        if i not in clips:
            im = Image.open(os.path.join(FR, clip, f'{i:04d}.jpg')).crop((x, y, x + w, y + h)).resize((cw, ch), Image.LANCZOS)
            clips[i] = np.asarray(im, dtype=np.float32) / 255
        return clips[i]
    mask = feather(cw, ch)
    rounded = card(cw, ch)
    for theme, th in THEMES.items():
        page = np.array(th['page'], np.float32) / 255
        txt = text_layer(when, title, line, tx, th)
        ta = txt[..., 3:4]
        dst = os.path.join(OUT, f'{name}-{theme}')
        enc = encode_avif(dst + '.avif')
        webp = []
        for n, (a, bb, wgt) in enumerate(seq):
            rgb = frame(a) if bb is None else frame(a) * (1 - wgt) + frame(bb) * wgt
            if theme == 'dark':
                # screen over the page: black becomes the page, light stays light; feathered edges
                col, al = page + rgb * (1 - page), mask
            else:
                col, al = rgb, rounded
            out = np.empty((PH, PW, 3), np.float32)
            out[:] = page
            out[cy:cy + ch, cx:cx + cw] = col * al[..., None] + page * (1 - al[..., None])
            out = txt[..., :3] * ta + out * (1 - ta)
            img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), 'RGB')
            enc.stdin.write(img.tobytes())
            if n % 2 == 0:
                webp.append(img.resize((WEBP_W, round(PH * WEBP_W / PW)), Image.LANCZOS))
        enc.stdin.close()
        enc.wait()
        webp[0].save(dst + '.webp', save_all=True, append_images=webp[1:], duration=2000 // FPS, loop=0, quality=WEBP_Q, method=4)
        print(f'  {name}-{theme}: {len(seq)} frames  avif {os.path.getsize(dst + ".avif") / 1e6:.2f} MB'
              f'  webp {os.path.getsize(dst + ".webp") / 1e6:.2f} MB', flush=True)

if __name__ == '__main__':
    which = sys.argv[1:]
    for k, m in enumerate(MOMENTS):
        if not which or m[0] in which:
            moment(k, m)
