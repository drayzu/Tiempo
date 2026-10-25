"""The README's cover: the title and its phrase, and right below, the hero clip, whole and untouched.

    python tools/readme_cover.py   ->  docs/media/cover-<theme>.avif / .webp

One image, so the title reads as the clip's own: a quiet band with the title on top, the clip below,
blended into the page. Drawn at 1840 px wide (text included) at 30 fps; AVIF for the page and a
lighter WebP (920 px, 15 fps) for browsers without AVIF. The clip loops forwards with a crossfade.
"""
import os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

TITLE = 'Tiempo'
PHRASE = 'From before the Big Bang to the last light.'
FRAMES, COUNT, CROP = 'tools/src/frames/hero', 360, (0, 0, 1280, 720)   # 1280 x 720 JPG at 30 fps
CRF = 34

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'media')
NM = os.path.join(ROOT, 'node_modules')
SERIF = NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2'
ITALIC = NM + '/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'

PW = 1840
BAND = 330                  # the title's band, px
FPS = 30
XFADE = 18
WEBP_W, WEBP_Q = 920, 58
THEMES = {
    'dark': dict(page=(13, 17, 23), ink=(236, 231, 219), dim=(236, 231, 219)),
    'light': dict(page=(255, 255, 255), ink=(31, 29, 26), dim=(31, 29, 26)),
}

def feather(w, h, p=3, inner=0.72):
    u = np.abs(np.linspace(-1, 1, w))[None, :]
    v = np.abs(np.linspace(-1, 1, h))[:, None]
    d = (u ** p + v ** p) ** (1 / p)
    t = np.clip((d - inner) / (1 - inner), 0, 1)
    return 1 - t * t * (3 - 2 * t)

def card(w, h, r=40):
    im = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), r * 4, fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255

def band(th, H):
    """The title and phrase, drawn straight at full size (never scaled)."""
    im = Image.new('RGBA', (PW, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((PW // 2, 205), TITLE, font=ImageFont.truetype(SERIF, 196), fill=th['ink'], anchor='ms')
    d.text((PW // 2, 285), PHRASE, font=ImageFont.truetype(ITALIC, 46), fill=th['dim'] + (180,), anchor='ms')
    return np.asarray(im, dtype=np.float32) / 255

def main():
    x, y, w, h = CROP
    vh = round(PW * h / w)
    H = BAND + vh
    idx = list(range(COUNT))
    seq = [(i, None, 0) for i in idx[XFADE:-XFADE]] + [(idx[-XFADE + k], idx[k], (k + 1) / (XFADE + 1)) for k in range(XFADE)]
    cache = {}
    def frame(i):
        if i not in cache:
            im = Image.open(os.path.join(ROOT, FRAMES, f'{i:04d}.jpg')).crop((x, y, x + w, y + h)).resize((PW, vh), Image.LANCZOS)
            cache[i] = np.asarray(im, dtype=np.float32) / 255
            if len(cache) > 40:
                cache.pop(next(iter(cache)))
        return cache[i]
    mask, rounded = feather(PW, vh), card(PW, vh)
    for theme, th in THEMES.items():
        page = np.array(th['page'], np.float32) / 255
        txt = band(th, BAND)
        ta = txt[..., 3:4]
        top = txt[..., :3] * ta + page * (1 - ta)
        dst = os.path.join(OUT, f'cover-{theme}')
        enc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{PW}x{H}', '-r', str(FPS), '-i', '-',
             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
             '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv',
             '-c:v', 'libsvtav1', '-preset', '5', '-crf', str(CRF), '-g', '600', '-loop', '0', dst + '.avif'],
            stdin=subprocess.PIPE)
        webp = []
        out = np.empty((H, PW, 3), np.float32)
        out[:BAND] = top
        for n, (a, b, wgt) in enumerate(seq):
            rgb = frame(a) if b is None else frame(a) * (1 - wgt) + frame(b) * wgt
            col, al = (page + rgb * (1 - page), mask) if theme == 'dark' else (rgb, rounded)
            out[BAND:] = col * al[..., None] + page * (1 - al[..., None])
            img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), 'RGB')
            enc.stdin.write(img.tobytes())
            if n % 2 == 0:
                webp.append(img.resize((WEBP_W, round(H * WEBP_W / PW)), Image.LANCZOS))
        enc.stdin.close()
        enc.wait()
        webp[0].save(dst + '.webp', save_all=True, append_images=webp[1:], duration=2000 // FPS, loop=0, quality=WEBP_Q, method=4)
        print(f'  cover-{theme}: {len(seq)} frames  {PW}x{H}  avif {os.path.getsize(dst + ".avif") / 1e6:.2f} MB'
              f'  webp {os.path.getsize(dst + ".webp") / 1e6:.2f} MB', flush=True)

if __name__ == '__main__':
    main()
