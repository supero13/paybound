"""Render Paybound demo: piper voiceover + PIL frames + ffmpeg. Run: python3 demo/build.py"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from scenes import SCENES

D = os.path.dirname(os.path.abspath(__file__))
FR, OUT = f"{D}/frames", f"{D}/build"
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
G = "/usr/share/fonts/truetype/sand-box/google"
def font(fam, size, wght=800):
    import glob
    f = [x for x in sorted(glob.glob(f"{G}/{fam}/*.ttf")) if "Italic" not in x][0]
    ft = ImageFont.truetype(f, size)
    try:
        axes = ft.get_variation_axes()
        ft.set_variation_by_axes([wght if a.get("name") == b"Weight" else (a["maximum"] if a.get("name") == b"Optical size" else a["default"]) for a in axes])
    except Exception: pass
    return ft
EMOJI = None
F_H1, F_H2, F_B, F_S, F_M = font("Inter", 132, 900), font("Inter", 56, 800), font("Inter", 40, 600), font("Inter", 30, 500), font("JetBrains Mono", 30, 500)
ORANGE, PINK, PURPLE, CYAN = (255, 122, 24), (255, 46, 147), (139, 61, 255), (25, 211, 255)
STRIP = {"✅": "•", "🛡️": "•", "🔑": "•", "🧾": "•"}

def bg():
    im = Image.new("RGB", (W, H), (11, 8, 32))
    glow = Image.new("RGB", (W, H), (0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse((-300, -400, 900, 500), fill=(120, 20, 80)); g.ellipse((1300, -200, 2300, 700), fill=(10, 80, 110)); g.ellipse((600, 700, 1600, 1500), fill=(60, 20, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    return Image.blend(im, glow, 0.55)

def grad_text(im, xy, text, f):
    d = ImageDraw.Draw(im); x0, y0, x1, y1 = d.textbbox(xy, text, font=f)
    mask = Image.new("L", im.size, 0); ImageDraw.Draw(mask).text(xy, text, font=f, fill=255)
    g = Image.new("RGB", (x1 - x0 + 2, 1))
    for i in range(g.width):
        t = i / max(1, g.width - 1)
        a, b, u = (ORANGE, PINK, t * 2) if t < .5 else (PINK, PURPLE, (t - .5) * 2)
        g.putpixel((i, 0), tuple(int(a[k] + (b[k] - a[k]) * u) for k in range(3)))
    g = g.resize((x1 - x0 + 2, y1 - y0 + 2)); layer = im.copy(); layer.paste(g, (x0, y0))
    im.paste(layer, (0, 0), mask); return y1

def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) > maxw and cur: lines.append(cur); cur = w
        else: cur = t
    return lines + [cur]

def bullets(im, x, y, items, maxw, f=F_B, gap=26):
    d = ImageDraw.Draw(im)
    for it in items:
        for k, v in STRIP.items(): it = it.replace(k + " ", "")
        d.rounded_rectangle((x, y + 14, x + 14, y + 28), 4, fill=PINK)
        for j, line in enumerate(wrap(d, it, f, maxw - 40)):
            d.text((x + 36, y), line, font=f, fill=(243, 240, 255)); y += f.size + 10
        y += gap
    return y

def phone(im, shot, x, y, h=960):
    s = Image.open(f"{FR}/{shot}.png").convert("RGB"); w = int(s.width * h / s.height)
    s = s.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(im); pad = 18
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((x - pad + 10, y - pad + 20, x + w + pad + 10, y + h + pad + 20), 60, fill=(0, 0, 0, 150))
    im.paste(Image.alpha_composite(im.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(25))).convert("RGB"))
    d.rounded_rectangle((x - pad, y - pad, x + w + pad, y + h + pad), 58, fill=(20, 16, 40), outline=(255, 46, 147), width=4)
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w, h), 44, fill=255)
    im.paste(s, (x, y), m)
    return x + w + pad

def frame_for(sc, shot=None):
    im = bg(); d = ImageDraw.Draw(im)
    k = sc["kind"]
    if k == "card":
        y = grad_text(im, (140, 230), sc["title"], F_H1) + 30
        for line in wrap(d, sc["sub"], F_H2, 1600): d.text((140, y), line, font=F_H2, fill=(255, 255, 255)); y += 72
        bullets(im, 150, y + 50, sc["bullets"], 1600)
    elif k == "phone":
        right = phone(im, shot, 200, 60)
        x = right + 110; y = grad_text(im, (x, 210), sc["title"], font("Inter", 76, 900)) + 50
        bullets(im, x, y, sc["bullets"], W - x - 110)
    elif k == "wide":
        s = Image.open(f"{FR}/{shot}.png").convert("RGB"); s = s.resize((1240, int(s.height * 1240 / s.width)), Image.LANCZOS)
        s = s.crop((0, 0, 1240, min(s.height, 830)))
        d.rounded_rectangle((90, 170, 90 + 1240 + 20, 170 + s.height + 20), 24, outline=CYAN, width=4)
        im.paste(s, (100, 180))
        grad_text(im, (90, 40), sc["title"], font("Inter", 84, 900))
        bullets(im, 1400, 230, sc["bullets"], 460, f=F_S)
    elif k == "arch":
        grad_text(im, (120, 60), "Architecture", font("Inter", 84, 900))
        boxes = [("AI draft layer", "Netlify Function · Groq LLM or rules · no keys", 140, 220, PURPLE),
                 ("Web app", "React + wagmi/viem · chain 44005 only", 140, 480, PINK),
                 ("PayeeRegistry", "confirm by re-entering address · delay", 1010, 220, CYAN),
                 ("PayboundVault", "tUSD8 custody · caps · expiry · sessions · pause", 1010, 480, ORANGE),
                 ("Official tUSD8", "0x4565…3483 · 6 decimals", 1010, 740, (46, 229, 157))]
        for t, sub, x, y, c in boxes:
            d.rounded_rectangle((x, y, x + 770, y + 180), 28, fill=(23, 18, 51), outline=c, width=5)
            d.text((x + 36, y + 28), t, font=F_H2, fill=c); d.text((x + 36, y + 108), sub, font=F_S, fill=(220, 215, 245))
        def arrow(x0, y0, x1, y1, label, lx, ly):
            import math
            d.line((x0, y0, x1, y1), fill=(255, 255, 255), width=5); a = math.atan2(y1 - y0, x1 - x0)
            d.polygon([(x1, y1), (x1 - 26 * math.cos(a - .4), y1 - 26 * math.sin(a - .4)), (x1 - 26 * math.cos(a + .4), y1 - 26 * math.sin(a + .4))], fill=(255, 255, 255))
            d.text((lx, ly), label, font=F_S, fill=(255, 197, 61))
        arrow(525, 405, 525, 475, "draft only", 545, 420)
        arrow(915, 570, 1005, 570, "", 0, 0); d.text((916, 590), "you sign", font=font("Inter", 22, 700), fill=(255, 197, 61))
        arrow(1395, 475, 1395, 405, "confirmed payee?", 1415, 420)
        arrow(1395, 665, 1395, 735, "transfer within caps", 1415, 680)
        d.text((140, 760), "Tests: 44 Foundry (unit, fuzz, fork on real tUSD8)", font=F_S, fill=(243, 240, 255))
        d.text((140, 810), "+ 20 assistant tests (resolution, refusals, injection)", font=F_S, fill=(243, 240, 255))
        d.text((140, 890), "github.com/supero13/paybound", font=F_M, fill=(255, 179, 107))
    d.text((W - 520, H - 50), "Testnet only · test tokens only", font=font("Inter", 24, 500), fill=(169, 163, 201))
    return im

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())

import wave, array
XF = 0.4      # crossfade between scenes (video only; narration never overlaps or changes speed)
LEAD = 0.35   # silence before narration in each scene
TAIL = 0.75   # silence after narration before the crossfade starts
RATE = 22050  # Piper output rate; audio is never resampled in Python, only by ffmpeg's encoder
clips, starts, audio = [], [], []
t = 0.0
for i, sc in enumerate(SCENES):
    wav = f"{OUT}/{i:02d}-{sc['id']}.wav"
    subprocess.run(["/tmp/piper/bin/piper", "-m", "/tmp/voices/en_US-ryan-high.onnx", "--output_file", wav], input=sc["vo"].encode(), check=True, capture_output=True)
    with wave.open(wav) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        pcm = array.array("h", w.readframes(w.getnframes()))
    total = LEAD + len(pcm) / RATE + TAIL + XF   # scene length follows the narration
    shots = sc.get("frames") or [None]
    weights = sc.get("weights") or [1] * len(shots)
    lst = f"{OUT}/{i:02d}.txt"
    with open(lst, "w") as fh:
        for j, (sh, wt) in enumerate(zip(shots, weights)):
            png = f"{OUT}/{i:02d}-{j:02d}.png"; frame_for(sc, sh).save(png)
            fh.write(f"file '{png}'\nduration {total * wt / sum(weights):.3f}\n")
        fh.write(f"file '{png}'\n")
    clip = f"{OUT}/{i:02d}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=30,format=yuv420p",
                    "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-an", clip], check=True)
    clips.append((clip, total)); starts.append(t); audio.append(pcm)
    print(sc["id"], f"start {t:.1f}s len {total:.1f}s")
    t += total - XF
length = t + XF
# one continuous narration track at the original rate
track = array.array("h", bytes(2 * int(length * RATE + RATE)))
for st, pcm in zip(starts, audio):
    o = int((st + LEAD) * RATE)
    track[o:o + len(pcm)] = pcm
with wave.open(f"{OUT}/narration.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(track.tobytes())
# video: xfade chain (dissolve, no black frames)
inputs, fc, prev = [], [], "0:v"
for c, _ in clips: inputs += ["-i", c]
for k in range(1, len(clips)):
    off = starts[k]
    out = f"v{k}"
    fc.append(f"[{prev}][{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[{out}]")
    prev = out
na = len(clips)
cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-i", f"{OUT}/narration.wav", "-filter_complex", ";".join(fc),
       "-map", f"[{prev}]", "-map", f"{na}:a", "-t", f"{length:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", f"{D}/paybound-demo.mp4"]
subprocess.run(cmd, check=True)
print("total", f"{dur(f'{D}/paybound-demo.mp4'):.1f}s")
