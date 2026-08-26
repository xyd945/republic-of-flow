"""
Builds the app-icon master from the brand mark.

The mark is a navy roundel on a WHITE square. Left as-is it makes a poor app
icon: iOS masks to a rounded rectangle, so the home screen shows a white
sticker with the roundel floating inside a white margin — not a navy app.
Cropping alone does not fix it, because a circle inscribed in a square leaves
white corners.

So the ground is replaced with the Republic's navy. The roundel is centred and
its radius is known (measured at 44% of the width), so everything outside it is
background by definition — no colour-keying, and no halo where the ring meets
the ground. The edge is feathered by a pixel so the circle stays smooth.

Pure stdlib: this machine has no image library, and sips cannot composite.
"""
import zlib, struct, sys

SRC, DST = sys.argv[1], sys.argv[2]
# 'solid' fills the ground with the roundel's own navy — required for an app
# icon, which is masked to a rounded rectangle and must not be see-through.
# 'alpha' cuts the ground away instead, so the mark sits on whatever is
# behind it: on the login masthead a navy tile shows its edges, because the
# roundel's navy and the masthead's navy are not the same colour.
MODE = sys.argv[3] if len(sys.argv) > 3 else 'solid'
ALPHA = MODE == 'alpha'


def decode(path):
    d = open(path, 'rb').read()
    pos, idat, w, h, ct = 8, b'', 0, 0, 2
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ, data = d[pos+4:pos+8], d[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, _bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT': idat += data
        elif typ == b'IEND': break
        pos += 12 + ln
    bpp = {0:1, 2:3, 4:2, 6:4}[ct]
    raw, stride = zlib.decompress(idat), w * bpp
    def paeth(a,b,c):
        p = a+b-c; pa,pb,pc = abs(p-a),abs(p-b),abs(p-c)
        return a if pa<=pb and pa<=pc else (b if pb<=pc else c)
    prev, rows, i = bytearray(stride), [], 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        if f == 1:
            for x in range(bpp, stride): line[x] = (line[x]+line[x-bpp]) & 255
        elif f == 2:
            for x in range(stride): line[x] = (line[x]+prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x-bpp] if x >= bpp else 0
                line[x] = (line[x]+((a+prev[x])>>1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x-bpp] if x >= bpp else 0
                c = prev[x-bpp] if x >= bpp else 0
                line[x] = (line[x]+paeth(a, prev[x], c)) & 255
        rows.append(line); prev = line
    return w, h, bpp, rows

def encode(path, w, h, rows, alpha=False):
    ch = 4 if alpha else 3
    stride = w*ch
    raw = bytearray()
    for y in range(h):
        raw.append(0); raw += rows[y]
    tbl = []
    for n in range(256):
        c = n
        for _ in range(8): c = 0xEDB88320 ^ (c >> 1) if c & 1 else c >> 1
        tbl.append(c)
    def crc(b):
        c = 0xFFFFFFFF
        for x in b: c = tbl[(c ^ x) & 0xFF] ^ (c >> 8)
        return c ^ 0xFFFFFFFF
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', crc(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6 if alpha else 2, 0, 0, 0)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))

w, h, bpp, rows = decode(SRC)

def white(r, x):
    o = x * bpp
    return r[o] > 246 and r[o+1] > 246 and r[o+2] > 246

# Measure the mark by scanning its centre lines. A whole-image bounding box is
# not safe here: any stray off-white pixel anywhere drags it, and that is what
# put a crescent of ground back along one edge. Two scans give the real shape.
mid = (w - 1) // 2
row = rows[mid]
L = next(x for x in range(w) if not white(row, x))
Rt = next(x for x in range(w-1, -1, -1) if not white(row, x))
T = next(y for y in range(h) if not white(rows[y], mid))
B = next(y for y in range(h-1, -1, -1) if not white(rows[y], mid))

cx, cy = (L + Rt) / 2, (T + B) / 2
rx, ry = (Rt - L) / 2, (B - T) / 2
print(f'  mark: centre ({cx:.1f},{cy:.1f})  radii ({rx:.1f},{ry:.1f})  '
      f'offset from frame ({cx-(w-1)/2:+.1f},{cy-(h-1)/2:+.1f})')

# It is very slightly an ellipse, and sits a little up and to the left. Cutting
# a circle on the frame centre either clips the ring or leaves a crescent of
# the white ground showing, depending which radius you pick — so the cut
# follows the shape that is actually there.
import math
samples = []
for deg in range(0, 360, 5):
    a = math.radians(deg)
    x = int(cx + math.cos(a) * rx * 0.985)
    y = int(cy + math.sin(a) * ry * 0.985)
    if 0 <= x < w and 0 <= y < h:
        o = x * bpp
        samples.append(tuple(rows[y][o:o+3]))
samples.sort()
NAVY = samples[len(samples)//2]
print(f'  ground sampled from the rim: rgb{NAVY}')

# Output a square centred on the mark, with a small navy margin, so the icon is
# balanced even though the source is not.
half = int(max(rx, ry) * 1.055)
x0, y0 = int(round(cx)) - half, int(round(cy)) - half
side = half * 2
assert x0 >= 0 and y0 >= 0 and x0 + side <= w and y0 + side <= h, 'crop falls outside the source'

# Cut just inside the rim. The mark was exported against white, so its outer
# edge carries a band of anti-aliased near-white pixels; cutting at exactly the
# measured radius keeps about two of them and they read as a bright hairline
# arc around the icon. Trimming 0.8% takes the band without touching the ring.
EDGE, FEATHER = 0.992, 0.006

CH = 4 if ALPHA else 3
out = []
for oy in range(side):
    y = y0 + oy
    src, dst = rows[y], bytearray(side * CH)
    for ox in range(side):
        x = x0 + ox
        # distance in ellipse space; 1.0 is the rim
        e = math.hypot((x - cx) / rx, (y - cy) / ry)
        o, sp = ox * CH, x * bpp
        inside = 1.0
        if e >= EDGE:
            inside = 0.0
        elif e > EDGE - FEATHER:
            inside = 1.0 - (e - (EDGE - FEATHER)) / FEATHER
        if ALPHA:
            dst[o], dst[o+1], dst[o+2] = src[sp], src[sp+1], src[sp+2]
            dst[o+3] = int(255 * inside)
        else:
            for k in range(3):
                dst[o+k] = int(src[sp+k] * inside + NAVY[k] * (1 - inside))
    out.append(dst)
w = h = side
encode(DST, w, h, out, ALPHA)
print(f'  {DST}  {w}x{h}  {"transparent" if ALPHA else "navy"} ground, mark centred')
