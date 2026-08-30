from PIL import Image
from collections import Counter

SHEET = r"C:/Users/vlck1/Desktop/dev/game/assets/custom/dragon_opacity2.png"
SW=[(187,34,28),(169,31,26),(253,224,152),(211,49,29),(181,78,42),(252,209,135),
    (128,29,24),(107,36,23),(225,151,78),(48,14,10),(74,23,15),(174,101,53),(77,76,76),(30,26,24)]
IDLE=[(702,82,824,196),(855,82,982,196),(1012,82,1137,196),(1164,82,1287,196),(1315,83,1435,196)]
WALK=[(692,280,843,383),(849,282,990,383),(1011,282,1146,383),(1165,282,1305,383),(1328,283,1480,383)]

_im=Image.open(SHEET).convert("RGB"); _p=_im.load()
def isbg(c): return c[0]>232 and c[1]>232 and c[2]>232 and max(c)-min(c)<12

def restore(box, N=4):
    x0,y0,x1,y1=box
    ow,oh=(x1-x0)//N,(y1-y0)//N
    # 아래(발)를 기준으로 맞춰 자른다
    yoff=(y1-y0)-oh*N
    out=Image.new("RGBA",(ow,oh),(0,0,0,0)); o=out.load(); ca={}
    for by in range(oh):
        for bx in range(ow):
            v=Counter()
            for j in range(N):
                for i in range(N):
                    c=_p[x0+bx*N+i, y0+yoff+by*N+j]
                    if isbg(c): v[None]+=1; continue
                    if c not in ca:
                        ca[c]=min(SW,key=lambda q:(q[0]-c[0])**2*2+(q[1]-c[1])**2*4+(q[2]-c[2])**2)
                    v[ca[c]]+=1
            w=v.most_common(1)[0][0]
            if w: o[bx,by]=(w[0],w[1],w[2],255)
    return out

# ---- 14색 → 0x72 6색, 역할별 수동 대응 ----
OUT=(34,34,34); DARK=(98,35,47); MID=(159,41,78); HOT=(218,78,56)
TAN=(216,165,125); CREAM=(252,203,163)
MAP={(30,26,24):OUT,(77,76,76):OUT,
     (48,14,10):DARK,(74,23,15):DARK,
     (107,36,23):MID,(128,29,24):MID,(169,31,26):MID,
     (187,34,28):HOT,(211,49,29):HOT,(181,78,42):HOT,
     (174,101,53):TAN,(225,151,78):TAN,
     (252,209,135):CREAM,(253,224,152):CREAM}
PAL6=[OUT,DARK,MID,HOT,TAN,CREAM]

def remap(im):
    w,h=im.size;p=im.load();o=Image.new("RGBA",(w,h),(0,0,0,0));q=o.load()
    for y in range(h):
        for x in range(w):
            c=p[x,y]
            if c[3]: v=MAP[c[:3]]; q[x,y]=(v[0],v[1],v[2],255)
    return o

def neighbours(p,x,y,w,h):
    for dy in(-1,0,1):
        for dx in(-1,0,1):
            if dx or dy:
                nx,ny=x+dx,y+dy
                if 0<=nx<w and 0<=ny<h: yield p[nx,ny]

def denoise(im, rounds=2):
    """혼자 떠 있는 픽셀을 주변 다수색으로 흡수. 실루엣(알파)은 건드리지 않는다."""
    for _ in range(rounds):
        w,h=im.size;p=im.load();o=im.copy();q=o.load()
        for y in range(h):
            for x in range(w):
                c=p[x,y]
                if not c[3]: continue
                nb=[n for n in neighbours(p,x,y,w,h) if n[3]]
                same=sum(1 for n in nb if n[:3]==c[:3])
                if same<=1 and nb:
                    win=Counter(n[:3] for n in nb).most_common(1)[0][0]
                    q[x,y]=(win[0],win[1],win[2],255)
        im=o
    return im

def outline(im):
    """실루엣 가장자리를 전부 검정으로 — 0x72 규칙"""
    w,h=im.size;p=im.load();o=im.copy();q=o.load()
    for y in range(h):
        for x in range(w):
            if not p[x,y][3]: continue
            edge = any((x+dx<0 or x+dx>=w or y+dy<0 or y+dy>=h or not p[x+dx,y+dy][3])
                       for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))
            if edge: q[x,y]=(OUT[0],OUT[1],OUT[2],255)
    return o

# ---- 최종 채택: D + 밝은색 보호 ----
MAP_D={**MAP,(107,36,23):DARK,(128,29,24):DARK}
PROTECT=(TAN,CREAM)

def apply_map(f,M=MAP_D):
    w,h=f.size;p=f.load();o=Image.new("RGBA",(w,h),(0,0,0,0));q=o.load()
    for y in range(h):
        for x in range(w):
            c=p[x,y]
            if c[3]: v=M[c[:3]];q[x,y]=(v[0],v[1],v[2],255)
    return o

def denoise_p(im,rounds=1,protect=PROTECT):
    for _ in range(rounds):
        w,h=im.size;p=im.load();o=im.copy();q=o.load()
        for y in range(h):
            for x in range(w):
                c=p[x,y]
                if not c[3] or c[:3] in protect: continue
                nb=[n for n in neighbours(p,x,y,w,h) if n[3]]
                if sum(1 for n in nb if n[:3]==c[:3])<=1 and nb:
                    win=Counter(n[:3] for n in nb).most_common(1)[0][0]
                    q[x,y]=(win[0],win[1],win[2],255)
        im=o
    return im

def clean(box):
    return outline(denoise_p(apply_map(restore(box))))

def foot_anchor(im):
    """접지점: 가장 아래 불투명 행들의 가로 중앙"""
    w,h=im.size;p=im.load()
    rows=[y for y in range(h) if any(p[x,y][3] for x in range(w))]
    if not rows: return w//2,h
    bot=rows[-1]
    xs=[x for y in range(max(rows[0],bot-2),bot+1) for x in range(w) if p[x,y][3]]
    return (min(xs)+max(xs))//2, bot+1

def place(im, CW, CH):
    """접지점을 캔버스 (CW//2, CH) 에 맞춰 올린다"""
    ax,ay=foot_anchor(im)
    out=Image.new("RGBA",(CW,CH),(0,0,0,0))
    out.alpha_composite(im,(CW//2-ax, CH-ay))
    return out

def drop_islands(im, minsize=6):
    """본체에서 떨어져 나온 작은 조각 제거"""
    w,h=im.size; p=im.load(); seen=[[0]*w for _ in range(h)]; comps=[]
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or not p[sx,sy][3]: continue
            st=[(sx,sy)]; seen[sy][sx]=1; cur=[]
            while st:
                x,y=st.pop(); cur.append((x,y))
                for dy in(-1,0,1):
                    for dx in(-1,0,1):
                        nx,ny=x+dx,y+dy
                        if 0<=nx<w and 0<=ny<h and not seen[ny][nx] and p[nx,ny][3]:
                            seen[ny][nx]=1; st.append((nx,ny))
            comps.append(cur)
    if not comps: return im
    comps.sort(key=len, reverse=True)
    o=im.copy(); q=o.load()
    for c in comps[1:]:
        if len(c) < minsize:
            for x,y in c: q[x,y]=(0,0,0,0)
    return o

def diffpx(a,b):
    pa,pb=a.load(),b.load(); w,h=a.size
    return sum(1 for y in range(h) for x in range(w) if pa[x,y]!=pb[x,y])

def pick4(frames):
    """5장 중 4장을 골라 순환 애니메이션이 가장 매끄러운 조합을 반환"""
    import itertools
    best=None
    for drop in range(len(frames)):
        idx=[i for i in range(len(frames)) if i!=drop]
        cost=sum(diffpx(frames[idx[i]],frames[idx[(i+1)%4]]) for i in range(4))
        if best is None or cost<best[0]: best=(cost,drop,idx)
    return best

def denoise_v2(im, rounds=1, protect=PROTECT):
    """일반색: 같은색 이웃 1개 이하면 흡수.  밝은색(뿔/배): 완전히 고립됐을 때만 흡수."""
    for _ in range(rounds):
        w,h=im.size;p=im.load();o=im.copy();q=o.load()
        for y in range(h):
            for x in range(w):
                c=p[x,y]
                if not c[3]: continue
                nb=[n for n in neighbours(p,x,y,w,h) if n[3]]
                if not nb: continue
                same=sum(1 for n in nb if n[:3]==c[:3])
                lim = 0 if c[:3] in protect else 1
                if same<=lim:
                    win=Counter(n[:3] for n in nb).most_common(1)[0][0]
                    q[x,y]=(win[0],win[1],win[2],255)
        im=o
    return im

def clean2(box):
    return outline(denoise_v2(apply_map(restore(box))))

def final_pass(im):
    """외곽선 칠한 뒤 고립돼버린 픽셀만 정리. 외곽선(OUT)은 건드리지 않는다."""
    w,h=im.size;p=im.load();o=im.copy();q=o.load()
    for y in range(h):
        for x in range(w):
            c=p[x,y]
            if not c[3] or c[:3]==OUT: continue
            nb=[n for n in neighbours(p,x,y,w,h) if n[3]]
            if nb and sum(1 for n in nb if n[:3]==c[:3])==0:
                cand=[n[:3] for n in nb if n[:3]!=OUT] or [n[:3] for n in nb]
                win=Counter(cand).most_common(1)[0][0]
                q[x,y]=(win[0],win[1],win[2],255)
    return o

def clean3(box):
    return final_pass(outline(denoise_v2(apply_map(restore(box)))))

# ---- 실행하면 8장을 이 폴더에 다시 굽는다 ----
if __name__ == "__main__":
    import os
    DEST = os.path.dirname(os.path.abspath(__file__))
    idle = [drop_islands(place(clean3(b), 32, 36)) for b in IDLE]
    walk = [drop_islands(place(clean3(b), 40, 36)) for b in WALK]
    _,_,pi = pick4(idle); _,_,pw = pick4(walk)
    for i,k in enumerate(pi): idle[k].save(os.path.join(DEST, "dragon_idle_anim_f%d.png"%i))
    for i,k in enumerate(pw): walk[k].save(os.path.join(DEST, "dragon_run_anim_f%d.png"%i))
    print("idle", pi, "run", pw)
