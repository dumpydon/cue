#!/usr/bin/env python3
"""Cue production edit from the explicitly authorized public Glee hardware film.

All product screens are synthetic. No capture APIs, network, profiles, or keys.
"""
from __future__ import annotations
import argparse
from functools import lru_cache
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import token
import tokenize

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
WIDTH, HEIGHT, FPS, FRAMES = 1920, 1080, 60, 1140
FFMPEG = os.environ.get('FFMPEG_BIN', 'ffmpeg')
SOURCE_URL = 'https://github.com/dumpydon/glee/blob/main/docs/media/glee-launch.mp4'
SOURCE_SHA256 = 'facd89a7e49ba1aeed09cbd916d0726e108b7c4988e067f7776741283493e625'
DEFAULT_MASTER = Path(os.environ.get('CUE_FILM_MASTER', str(HERE / 'source/glee-launch.mp4')))
SF = '/System/Library/Fonts/SFNS.ttf'
MONO = '/System/Library/Fonts/SFNSMono.ttf'
COL = dict(bg='#fdffff', ink='#1f1f1f', toolbar='#260336', panel='#403645',
           text='#f5f4fa', muted='#c0b5c4', violet='#7852b6', light='#c3a4ed',
           blue='#4d9bfa', cyan='#94ddf0', border='#75657b')
UI_SIZE = (1440, 800)
CODE = '''def longest_unique(text):
    left = best = 0
    last = {}
    for right, char in enumerate(text):
        if char in last:
            left = max(left, last[char] + 1)
        last[char] = right
        best = max(best, right - left + 1)
    return best'''


def smooth(x):
    x = float(np.clip(x, 0, 1))
    return x*x*(3-2*x)


def tween(t, a, b):
    return smooth((t-a)/(b-a))


@lru_cache(maxsize=120)
def font(size, weight=450, mono=False):
    f = ImageFont.truetype(MONO if mono else SF, int(size))
    if not mono:
        f.set_variation_by_axes([100, 96, 400, weight])
    return f


def text(d, xy, s, size=28, fill=None, weight=450, center=False, mono=False):
    f = font(size, weight, mono)
    if center:
        xy = (xy[0]-d.textlength(s,font=f)/2, xy[1])
    d.text(xy, s, font=f, fill=fill or COL['text'], anchor='lt')


def rr(d, box, fill, radius=18, outline=None, width=1):
    d.rounded_rectangle(tuple(int(x) for x in box), radius, fill, outline, width)


def mark(d, x, y, size, color=COL['text']):
    scale=size/256
    pts=lambda a:[(x+v[0]*scale,y+v[1]*scale) for v in a]
    d.ellipse((x+25*scale,y+25*scale,x+231*scale,y+231*scale),outline=color,width=max(1,round(12*scale)))
    d.ellipse((x+42*scale,y+42*scale,x+214*scale,y+214*scale),outline=color,width=max(1,round(5*scale)))
    poly=[]
    for a in np.linspace(225,315,24):poly.append((128+75*math.cos(math.radians(a)),128+75*math.sin(math.radians(a))))
    poly.append((146,128))
    for a in np.linspace(45,135,24):poly.append((128+75*math.cos(math.radians(a)),128+75*math.sin(math.radians(a))))
    poly.append((110,128))
    d.polygon(pts(poly),fill=color)
    for px,py in [(128,25),(231,128),(128,231),(25,128)]:
        d.ellipse((x+(px-11)*scale,y+(py-11)*scale,x+(px+11)*scale,y+(py+11)*scale),fill=color)


def icon(d,x,y,kind,size=25,color=COL['text']):
    w=max(2,int(size/11))
    if kind=='mic':
        rr(d,(x+size*.33,y,x+size*.67,y+size*.65),None,size*.18,color,w)
        d.arc((x+size*.14,y+size*.22,x+size*.86,y+size*.83),0,180,color,w)
        d.line((x+size*.5,y+size*.83,x+size*.5,y+size),color,w)
        d.line((x+size*.3,y+size,x+size*.7,y+size),color,w)
    elif kind=='screen':
        rr(d,(x,y,x+size,y+size*.7),None,3,color,w)
        d.line((x+size*.5,y+size*.7,x+size*.5,y+size*.95),color,w)
        d.line((x+size*.2,y+size*.95,x+size*.8,y+size*.95),color,w)
    elif kind=='incognito':
        d.ellipse((x,y+size*.42,x+size*.4,y+size*.82),outline=color,width=w)
        d.ellipse((x+size*.6,y+size*.42,x+size,y+size*.82),outline=color,width=w)
        d.line((x+size*.4,y+size*.56,x+size*.6,y+size*.56),color,w)
        d.line((x+size*.1,y+size*.22,x+size*.9,y+size*.22),color,w)
    elif kind=='gear':
        d.ellipse((x+size*.17,y+size*.17,x+size*.83,y+size*.83),outline=color,width=w)
        d.ellipse((x+size*.37,y+size*.37,x+size*.63,y+size*.63),outline=color,width=w)
        for a in range(0,360,45):
            dx,dy=math.cos(math.radians(a)),math.sin(math.radians(a))
            d.line((x+size*(.5+dx*.32),y+size*(.5+dy*.32),x+size*(.5+dx*.47),y+size*(.5+dy*.47)),color,w)


def dotted(d,box,radius=24,spacing=12,color='#b8a1d0'):
    x1,y1,x2,y2=box
    pts=[]
    for a in np.arange(x1+radius,x2-radius,spacing):pts.extend([(a,y1),(a,y2)])
    for a in np.arange(y1+radius,y2-radius,spacing):pts.extend([(x1,a),(x2,a)])
    for cx,cy,st in [(x1+radius,y1+radius,180),(x2-radius,y1+radius,270),(x2-radius,y2-radius,0),(x1+radius,y2-radius,90)]:
        for a in np.linspace(st,st+90,max(3,int(radius*math.pi/2/spacing))):
            pts.append((cx+radius*math.cos(math.radians(a)),cy+radius*math.sin(math.radians(a))))
    for x,y in pts:d.ellipse((x-1.7,y-1.7,x+1.7,y+1.7),fill=color)


def toolbar(d,t,mode='Coding',incognito=False):
    rr(d,(10,10,1430,94),COL['toolbar'],25,'#74547f',2)
    mark(d,34,30,43)
    text(d,(92,35),'Cue',28,weight=580)
    d.line((169,31,169,73),'#775380',2)
    icon(d,195,36,'gear',31)
    icon(d,255,37,'incognito',34)
    rr(d,(322,27,522,78),'#46264e',14,'#805e8a')
    text(d,(346,40),mode,25,weight=500)
    d.line((480,47,487,54,494,47),COL['text'],2)
    d.ellipse((556,45,568,57),fill=COL['cyan'])
    text(d,(585,38),'Listening',27,weight=520)
    d.line((748,32,748,74),'#775380',2)
    icon(d,782,39,'screen',26)
    text(d,(824,40),'Screen',24)
    icon(d,938,38,'mic',26)
    text(d,(978,40),'Mic',24)
    for i in range(27):
        h=5+(8+7*math.sin(i*.6+t*5))*(.4+.6*math.sin(i*1.2+t*.6)**2)
        rr(d,(1130+i*7,52-h/2,1133+i*7,52+h/2),COL['cyan'],2)
    rr(d,(1349,35,1399,73),'#5e4567',10)
    text(d,(1374,43),'×',25,center=True)
    if incognito:dotted(d,(3,3,1437,101),30)


def composer(d,y=712):
    rr(d,(37,y,1403,y+59),'#352a3b',17,'#78657e')
    text(d,(58,y+19),'Ask a follow-up…',24,'#b3a4bc')
    rr(d,(1274,y+10,1349,y+49),'#3178cf',11)
    text(d,(1311,y+18),'Assist',20,weight=570,center=True)
    rr(d,(1361,y+10,1392,y+49),COL['blue'],10)
    text(d,(1377,y+17),'↑',24,weight=650,center=True)


def code(d,x,y,size=24,lh=37):
    keywords={'def','for','in','if','return'}
    builtin={'max','enumerate'}
    charw=d.textlength('M',font=font(size,450,True))
    for i,row in enumerate(CODE.splitlines()):
        text(d,(x-47,y+i*lh),str(i+1).rjust(2),size-3,'#9c8ba3',mono=True)
        text(d,(x,y+i*lh),row,size,'#eae3ed',mono=True)
    for tok in tokenize.generate_tokens(io.StringIO(CODE).readline):
        if tok.type in (token.NEWLINE,token.INDENT,token.DEDENT,token.ENDMARKER):continue
        co=None
        if tok.string in keywords:co='#e9a7ef'
        elif tok.string in builtin or tok.string=='longest_unique':co='#8ddce9'
        elif tok.type==token.NUMBER:co='#ffd693'
        elif tok.type==token.STRING:co='#c3dfb5'
        if co:text(d,(x+tok.start[1]*charw,y+(tok.start[0]-1)*lh),tok.string,size,co,mono=True)


def ui(t,kind='chat',incognito=False):
    im=Image.new('RGBA',UI_SIZE)
    d=ImageDraw.Draw(im)
    toolbar(d,t,'Coding',incognito)
    rr(d,(10,115,1430,790),COL['panel'],26,'#86728e',2)
    if incognito:dotted(d,(3,108,1437,797),32)
    if kind=='chat':
        text(d,(41,147),'LIVE CONTEXT',19,'#b5a6c0',weight=650)
        rr(d,(37,193,665,677),'#493e50',19,'#7c6985')
        text(d,(65,218),'Them',23,'#a9d9f2',weight=600)
        for i,s in enumerate(['How would you find the longest','substring without repeating','characters?']):text(d,(65,262+i*36),s,28,weight=480)
        d.line((65,393,637,393),'#72627c',1)
        text(d,(65,422),'You',23,'#d7baf4',weight=600)
        for i,s in enumerate(["I'll use a sliding window and",'track the last index of each','character.']):text(d,(65,466+i*36),s,28,weight=480)
        text(d,(700,150),'A useful next step',27,weight=600)
        text(d,(700,213),'Start with the invariant.',34,weight=650)
        for i,s in enumerate(['Keep every character in the window','unique. When one repeats, move the','left edge past its previous position.']):text(d,(700,270+i*36),s,27,'#e7dfe9')
        rr(d,(700,425,1397,577),'#352c3d',18)
        text(d,(728,451),'"abcabcbb"  →  3',31,COL['cyan'],weight=550,mono=True)
        text(d,(728,507),'A single pass. No repeated work.',26,COL['muted'])
        text(d,(704,622),'Screen + microphone + Them context',22,'#c8b8d2',weight=500)
    elif kind=='code':
        text(d,(43,146),'The sliding-window solution',31,weight=620)
        rr(d,(38,202,1398,636),'#292430',18,'#6b5b75')
        text(d,(64,222),'PYTHON',17,'#b8a8c3',weight=600)
        code(d,108,268,25,37)
        text(d,(44,658),'Time  O(n)',25,COL['cyan'],weight=550)
        text(d,(298,658),'Space  O(k)',25,'#dab7ee',weight=550)
        text(d,(626,658),'Each character enters and leaves once.',23,'#e3d7e8')
    else:
        text(d,(43,148),'Choose the way Cue helps.',32,weight=600)
        for i,(label,active) in enumerate([('General',False),('Coding',True),('Interview',False)]):
            x=42+i*451
            rr(d,(x,210,x+426,286),'#61416f' if active else '#493c53',17,'#ad8fc0' if active else '#75647f',2)
            text(d,(x+213,235),label,28,weight=560,center=True)
        text(d,(44,326),'Your provider',22,'#c3b3ce',weight=550)
        text(d,(1366,326),'Your model',22,'#c3b3ce',weight=550,center=True)
        rr(d,(42,366,1397,445),'#302738',17,'#766280')
        text(d,(69,389),'OpenAI  ·  Anthropic  ·  Gemini  ·  Custom',29,weight=500)
        rr(d,(1083,382,1379,431),'#584262',12,'#8e70a3')
        text(d,(1231,393),'Fast  /  Smart',24,weight=550,center=True)
        rr(d,(42,483,1397,665),'#352b3e',20,'#7c658b')
        icon(d,71,515,'incognito',43)
        text(d,(139,514),'Incognito mode',30,weight=620)
        text(d,(72,575),'Screen-share protection requested.',27,COL['cyan'],weight=530)
        text(d,(72,617),'Capture behavior varies by app and platform.',22,'#c8b8d2')
    composer(d)
    return im


@lru_cache(maxsize=1)
def wallpaper():
    w,h=2400,1560
    xx=np.linspace(0,1,w)[None,:,None];yy=np.linspace(0,1,h)[:,None,None]
    a=np.array([99,75,131.])[None,None,:];b=np.array([40,28,69.])[None,None,:]
    arr=a*(1-yy)+b*yy+np.sin(xx*3+yy*2)*np.array([8,5,13.])[None,None,:]
    arr=np.broadcast_to(arr,(h,w,3)).copy()
    im=Image.fromarray(np.uint8(np.clip(arr,0,255))).convert('RGBA')
    overlay=Image.new('RGBA',im.size);od=ImageDraw.Draw(overlay)
    for i in range(5):
        od.arc((-300+i*90,220-i*60,3000+i*120,3000+i*100),205,315,fill=(193,164,226,18),width=70)
    im.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(9)))
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,w,76),fill='#241b36')
    mark(d,29,15,45);text(d,(96,23),'Cue',32,weight=550)
    text(d,(2040,24),'MON   9:41',28,'#dfd1ea',weight=500)
    return im


def desktop(t):
    im=desktop_background().copy()
    app=ui(t,'chat' if t<13 else 'code')
    app=app.resize((2180,1211),Image.Resampling.LANCZOS)
    im.alpha_composite(app,(110,198))
    d=ImageDraw.Draw(im)
    # Match the production laptop's physical camera notch.
    rr(d,(1058,-18,1332,36),'#030506',15)
    return np.asarray(im.convert('RGB'))[:,:,::-1].copy()


@lru_cache(maxsize=1)
def desktop_background():
    im=wallpaper().copy()
    shadow=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shadow)
    rr(sd,(106,216,2294,1438),(0,0,0,140),44)
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(35)))
    return im


REFERENCES={
    120:np.float32([[550,154],[1373,153],[1374,692],[548,692]]),
    870:np.float32([[608,451],[1238,434],[1256,846],[619,870]]),
}


def track(master):
    cap=cv2.VideoCapture(str(master));grays={};number=0
    while True:
        ok,frame=cap.read()
        if not ok:break
        if number<=306 or 820<=number<=972:
            grays[number]=cv2.cvtColor(cv2.resize(frame,(960,540)),cv2.COLOR_BGR2GRAY)
        number+=1
    cap.release()
    if number!=FRAMES:raise ValueError('Expected the approved 19s, 60fps public Glee film.')
    tracks={}
    for refno,span in [(120,(45,306)),(870,(820,972))]:
        ref=grays[refno];corners=REFERENCES[refno]
        mask=np.zeros_like(ref)
        cv2.fillConvexPoly(mask,np.int32(corners/2),255)
        mask=cv2.erode(mask,np.ones((12,12),np.uint8))
        seeds=cv2.goodFeaturesToTrack(ref,900,.004,3,mask=mask,blockSize=3)
        tracks[refno]=corners
        for numbers in [range(refno-1,span[0]-1,-1),range(refno+1,span[1]+1)]:
            prev=ref;last=seeds.copy();original=seeds.copy()
            for n in numbers:
                current=grays[n]
                nxt,status,err=cv2.calcOpticalFlowPyrLK(prev,current,last,None,winSize=(31,31),maxLevel=4)
                back,backstatus,_=cv2.calcOpticalFlowPyrLK(current,prev,nxt,None,winSize=(31,31),maxLevel=4)
                valid=(status[:,0]==1)&(backstatus[:,0]==1)&(np.linalg.norm(back-last,axis=2)[:,0]<1.2)&(err[:,0]<50)
                last=nxt[valid];original=original[valid]
                if len(last)<12:break
                H,inliers=cv2.findHomography(original,last,cv2.RANSAC,1.3)
                if H is None:break
                p=cv2.perspectiveTransform(corners[None]/2,H)[0]*2
                tracks[n]=p
                prev=current
        print(f'Tracked hardware display around reference {refno}.',flush=True)
    tracks=stabilize_opening(tracks)
    report={'master':SOURCE_URL,'master_sha256':hashlib.sha256(master.read_bytes()).hexdigest(),'reference_corners':{str(k):v.tolist() for k,v in REFERENCES.items()},'frames':{str(k):v.tolist() for k,v in tracks.items()}}
    (HERE/'tracking.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    return tracks


def stabilize_opening(tracks):
    # Optical flow becomes degenerate while the screen is nearly edge-on.
    # Only this brief, manually measured opening interval uses corner anchors.
    anchors={
        54:[[390,638],[1530,638],[1385,663],[534,663]],
        60:[[383,619],[1535,618],[1380,666],[532,666]],
        66:tracks[66].tolist(),
    }
    for n in list(tracks):
        if n<54:del tracks[n]
    ns=sorted(anchors)
    for n in range(54,66):
        tracks[n]=np.array([[np.interp(n,ns,[anchors[k][i][j] for k in ns]) for j in range(2)] for i in range(4)],np.float32)
    return tracks


def composite_screen(frame,app,corners):
    h,w=app.shape[:2]
    source=np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]])
    H=cv2.getPerspectiveTransform(source,np.float32(corners))
    # Rounded display boundaries and subpixel edge coverage keep the bezel intact.
    mask=Image.new('L',(w,h));d=ImageDraw.Draw(mask);rr(d,(0,0,w-1,h-1),255,28)
    warped=cv2.warpPerspective(app,H,(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR)
    alpha=cv2.warpPerspective(np.asarray(mask),H,(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR)/255.
    alpha=alpha[:,:,None]
    return np.uint8(frame*(1-alpha)+warped*alpha)


def white_frame():return Image.new('RGBA',(WIDTH,HEIGHT),COL['bg'])


def title_pair(im,t,start,first,second,size=82,opacity=1):
    d=ImageDraw.Draw(im)
    a=tween(t,start,start+.36)*opacity
    layer=Image.new('RGBA',im.size);ld=ImageDraw.Draw(layer)
    y=92+int(24*(1-a))
    text(ld,(960,y),first,size,COL['ink'],650,True)
    text(ld,(960,y+size+9),second,size-6,COL['violet'],650,True)
    if a<1:
        layer=layer.filter(ImageFilter.GaussianBlur((1-a)*9))
        layer.putalpha(layer.getchannel('A').point(lambda v:int(v*a)))
    im.alpha_composite(layer)


def feature_frame(t,kind,start):
    im=white_frame()
    if kind=='chat':title_pair(im,t,start,'Screen + mic + Them.','The context comes together.',74)
    elif kind=='code':title_pair(im,t,start,'A clear solution.','Right on cue.',78)
    else:title_pair(im,t,start,'Your mode. Your context.','A little more private.',75)
    p=tween(t,start,start+.55)
    scale=1.01-.025*tween(t,start,start+2.7)
    window=ui(t,kind,kind=='modes')
    ww,hh=round(1440*scale),round(800*scale)
    window=window.resize((ww,hh),Image.Resampling.LANCZOS)
    x=(WIDTH-ww)//2;y=269+round(34*(1-p))
    shadow=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shadow)
    rr(sd,(x+14,y+24,x+ww-14,y+hh-14),(36,17,52,65),30)
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))
    im.alpha_composite(window,(x,y))
    return np.asarray(im.convert('RGB'))[:,:,::-1].copy()


def endcard(t):
    im=white_frame()
    p=tween(t,15.5,16.24)
    # Glee's original typography and restrained blur/spring title entrance.
    scale=1+.024*math.exp(-max(0,t-15.79)*6)*math.sin(max(0,t-15.79)*15)
    layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer)
    text(d,(960,468+round(32*(1-p))),'Cue',round(170*scale),COL['ink'],700,True)
    link=tween(t,16.15,16.8)
    text(d,(960,656),'cue.dumpydon.workers.dev',36,(135,135,135,round(255*link)),550,True)
    if p<1:
        layer=layer.filter(ImageFilter.GaussianBlur((1-p)*17))
        layer.putalpha(layer.getchannel('A').point(lambda v:int(v*p)))
    im.alpha_composite(layer)
    return np.asarray(im.convert('RGB'))[:,:,::-1].copy()


def frame_at(number,base,tracks):
    t=number/FPS
    if number<291:
        if number in tracks:base=composite_screen(base,desktop(t),tracks[number])
        return base
    if number<480:return feature_frame(t,'chat',4.85)
    if number<654:return feature_frame(t,'code',8)
    if number<828:return feature_frame(t,'modes',10.9)
    if number<930:
        if number in tracks:base=composite_screen(base,desktop(t),tracks[number])
        if number<930:
            # The source's old lid-related title is on an otherwise empty studio backdrop.
            if number<906:base[40:390]=np.array([255,255,253],np.uint8)
            im=Image.fromarray(base[:,:,::-1]).convert('RGBA')
            title_pair(im,t,13.8,'Stay in the conversation.','The right words. Right on cue.',76,1-tween(t,14.9,15.1))
            return np.asarray(im.convert('RGB'))[:,:,::-1].copy()
        return base
    return endcard(t)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--master',type=Path,default=DEFAULT_MASTER)
    ap.add_argument('--output',type=Path,default=SITE/'public/media/cue-launch.mp4')
    ap.add_argument('--frames-only',action='store_true')
    ap.add_argument('--retrack',action='store_true')
    args=ap.parse_args()
    if not args.master.is_file():raise ValueError('Pass --master or CUE_FILM_MASTER with the authorized Glee movie.')
    if hashlib.sha256(args.master.read_bytes()).hexdigest()!=SOURCE_SHA256:raise ValueError('Production source differs from the authorized Glee master.')
    if args.master.resolve()==args.output.resolve():raise ValueError('Never overwrite the production source.')
    if args.retrack or not (HERE/'tracking.json').exists():tracks=track(args.master)
    else:tracks=stabilize_opening({int(k):np.float32(v) for k,v in json.loads((HERE/'tracking.json').read_text())['frames'].items()})
    previews=HERE/'previews';previews.mkdir(exist_ok=True)
    cap=cv2.VideoCapture(str(args.master))
    if args.frames_only:
        for n in [90,150,240,327,480+90,654+90,870,960,1080]:
            cap.set(cv2.CAP_PROP_POS_FRAMES,n);ok,frame=cap.read()
            if not ok:raise ValueError(f'Unable to read source frame {n}')
            cv2.imwrite(str(previews/f'production-{n:04}.png'),frame_at(n,frame,tracks))
        cap.set(cv2.CAP_PROP_POS_FRAMES,150);ok,frame=cap.read()
        cv2.imwrite(str(SITE/'public/media/cue-launch-poster.jpg'),frame_at(150,frame,tracks),[cv2.IMWRITE_JPEG_QUALITY,95])
        cap.release();print('Production keyframes and photographic poster exported.',flush=True);return
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temp=args.output.with_name('cue-launch.pending.mp4')
    command=[FFMPEG,'-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','60','-i','pipe:0','-i',str(args.master),'-map','0:v','-map','1:a:0?','-map_metadata','-1','-c:v','libx264','-crf','18','-preset','medium','-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-c:a','copy','-movflags','+faststart','-metadata','title=Cue launch','-metadata','artist=dumpydon','-metadata','copyright=Copyright 2026 dumpydon','-t','19',str(temp)]
    enc=subprocess.Popen(command,stdin=subprocess.PIPE)
    n=0
    try:
        while True:
            ok,base=cap.read()
            if not ok:break
            frame=frame_at(n,base,tracks)
            enc.stdin.write(frame.tobytes())
            if n in [150,327,570,744,870,1080]:cv2.imwrite(str(previews/f'production-{n:04}.png'),frame)
            if n==150:cv2.imwrite(str(SITE/'public/media/cue-launch-poster.jpg'),frame,[cv2.IMWRITE_JPEG_QUALITY,95])
            n+=1
            if n%120==0:print(f'Rendered {n}/{FRAMES} production frames.',flush=True)
    finally:
        cap.release();enc.stdin.close()
    if enc.wait()!=0 or n!=FRAMES:raise ValueError(f'Incomplete export: {n} frames')
    temp.replace(args.output)
    data=args.output.read_bytes()
    report={'path':'/media/cue-launch.mp4','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'duration_seconds':19,'resolution':[1920,1080],'fps':60,'frames':n,'production_source':SOURCE_URL,'production_source_sha256':hashlib.sha256(args.master.read_bytes()).hexdigest(),'ui':'Deliberate synthetic Cue UI; no screen or audio capture.','audio':'Authorized public Glee production soundtrack, original AAC stream.','font':SF,'captions':'/media/cue-launch.vtt'}
    (SITE/'film.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':main()
