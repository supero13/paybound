"""9:16 (1080x1920) copy of paybound-demo.mp4: full 16:9 video (no crop) on a branded background.
Audio is copied bit-for-bit. Run after build.py:  python3 demo/vertical.py"""
import glob, os, subprocess
from PIL import Image, ImageDraw, ImageFilter, ImageFont
D = os.path.dirname(os.path.abspath(__file__)); OUT = f"{D}/build"; os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920
G = "/usr/share/fonts/truetype/sand-box/google"
def font(fam, size, wght):
    f = [x for x in sorted(glob.glob(f"{G}/{fam}/*.ttf")) if "Italic" not in x][0]
    ft = ImageFont.truetype(f, size)
    try:
        axes = ft.get_variation_axes()
        ft.set_variation_by_axes([wght if a.get("name") == b"Weight" else (a["maximum"] if a.get("name") == b"Optical size" else a["default"]) for a in axes])
    except Exception: pass
    return ft
VIOLET, ORANGE, PINK = (139, 61, 255), (255, 122, 24), (255, 46, 147)
VW, VH = 1080, 608                                   # 16:9 scaled to full width (UI text reaches x=90/1920, so no zoom)
# layout: logo, title, tagline, video, footer, stacked and centred, nudged slightly below centre
LOGO, GAP = 260, 36
F_T, F_TAG, F_FOOT = font("Inter", 112, 900), font("Inter", 44, 700), font("Inter", 32, 600)
stack = LOGO + GAP + 120 + 18 + 56 + 70 + VH + 56 + 40
y0 = (H - stack) // 2 + 30
# background: deep navy with a soft violet-to-orange glow
bg = Image.new("RGB", (W, H), (11, 16, 51))
glow = Image.new("RGB", (W, H), (11, 16, 51)); g = ImageDraw.Draw(glow)
g.ellipse((-350, y0 - 250, 750, y0 + 800), fill=(70, 30, 140))
g.ellipse((350, y0 + 900, 1450, y0 + 1900), fill=(110, 45, 25))
bg = Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(220)), 0.75)
d = ImageDraw.Draw(bg)
# logo with rounded corners and a thin glow ring
lg = Image.open(f"{D}/assets/logo.jpg").convert("RGB").resize((LOGO, LOGO), Image.LANCZOS)
m = Image.new("L", (LOGO, LOGO), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, LOGO, LOGO), 56, fill=255)
lx = (W - LOGO) // 2
d.rounded_rectangle((lx - 6, y0 - 6, lx + LOGO + 6, y0 + LOGO + 6), 62, outline=PINK, width=4)
bg.paste(lg, (lx, y0), m)
y = y0 + LOGO + GAP
# title with a violet-to-orange gradient fill
tw = d.textlength("Paybound", font=F_T)
grad = Image.new("RGB", (int(tw) + 4, 140)); gd = ImageDraw.Draw(grad)
for x in range(grad.width):
    t = x / max(1, grad.width - 1); gd.line((x, 0, x, 140), fill=tuple(int(a + (b - a) * t) for a, b in zip(VIOLET, ORANGE)))
tm = Image.new("L", grad.size, 0); ImageDraw.Draw(tm).text((0, 0), "Paybound", font=F_T, fill=255)
bg.paste(grad, (int((W - tw) / 2), y), tm)
y += 120 + 18
tag = "AI payouts only to confirmed payees"
d.text(((W - d.textlength(tag, font=F_TAG)) / 2, y), tag, font=F_TAG, fill=(235, 232, 255))
vy = y + 56 + 70
# frame around the video
d.rounded_rectangle((-4, vy - 6, W + 4, vy + VH + 6), 0, outline=(255, 46, 147), width=3)
foot = "QDay Aevum Builder Challenge #1 · Confirmation of Payee"
d.text(((W - d.textlength(foot, font=F_FOOT)) / 2, vy + VH + 56), foot, font=F_FOOT, fill=(255, 197, 61))
bg.save(f"{OUT}/vertical-bg.png")
src, dst = f"{D}/paybound-demo.mp4", f"{D}/paybound-demo-vertical.mp4"
T = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).decode().strip()
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", f"{OUT}/vertical-bg.png", "-i", src,
                "-filter_complex", f"[1:v]scale={VW}:{VH}:flags=lanczos[v];[0:v][v]overlay=0:{vy},fps=30,format=yuv420p[o]",
                "-map", "[o]", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "copy", "-t", T, "-movflags", "+faststart", dst], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "40", "-i", dst, "-frames:v", "1", f"{OUT}/vertical-check.png"], check=True)
print("video y", vy, "->", dst)
