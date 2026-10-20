"""Deterministic, synthetic interview desktop for the Cue launch film.

Public API: ``render_scene(seconds, helpers) -> PIL.Image.Image`` (RGBA, 1920x1080).
``helpers`` contains the existing film renderer's text/font/rr/mark/icon/dotted/
smooth/tween/COL helpers plus desktop_wallpaper(width, height). This module
neither imports that renderer nor captures the screen, opens applications, or
accesses the network.
"""
from __future__ import annotations

from functools import lru_cache
import io
import math
from pathlib import Path
import token
import tokenize

from PIL import Image, ImageDraw, ImageFilter


SIZE = (1920, 1080)
BX, BY, BW, BH = 54, 66, 1812, 938
CUE_X, CUE_Y, CUE_W, CUE_H = 752, 347, 1080, 660
MEET_MINI = (1396, 159, 420, 173)
HEIGHTS = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
TRAPPING_RAIN_WATER_SOLUTION = '''class Solution:
    def trap(self, height):
        left, right = 0, len(height) - 1
        left_max = right_max = water = 0

        while left < right:
            if height[left] <= height[right]:
                left_max = max(left_max, height[left])
                water += left_max - height[left]
                left += 1
            else:
                right_max = max(right_max, height[right])
                water += right_max - height[right]
                right -= 1
        return water'''

_BASE_CACHE = {}


def _ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _phase(t, a, b):
    return _ease((t - a) / (b - a))


def _mix(a, b, p):
    return a + (b - a) * p


def _wrap(d, h, value, width, size, weight=450, mono=False):
    result, line = [], ''
    for word in value.split():
        candidate = (line + ' ' + word).strip()
        if d.textlength(candidate, font=h['font'](size, weight, mono)) > width and line:
            result.append(line)
            line = word
        else:
            line = candidate
    return result + ([line] if line else [])


def _paragraph(d, h, xy, value, width, size=24, fill='#d7d9df', lh=34, weight=450):
    lines = _wrap(d, h, value, width, size, weight)
    for n, line in enumerate(lines):
        h['text'](d, (xy[0], xy[1] + n * lh), line, size, fill, weight)
    return xy[1] + len(lines) * lh


@lru_cache(maxsize=12)
def _shadow(w, ht, radius=24, blur=22, strength=115):
    margin = 64
    layer = Image.new('RGBA', (w + margin * 2, ht + margin * 2))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((margin, margin + 10, margin + w, margin + ht + 10), radius,
                        fill=(0, 0, 0, strength))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def _window(im, layer, xy, opacity=1.0, scale=1.0, radius=24, shadow=115):
    w, ht = layer.size
    x, y = xy
    sh = _shadow(w, ht, radius, 22, shadow)
    if scale != 1:
        layer = layer.resize((round(w * scale), round(ht * scale)), Image.Resampling.LANCZOS)
        sh = sh.resize((round(sh.width * scale), round(sh.height * scale)), Image.Resampling.LANCZOS)
    if opacity < 1:
        alpha = [round(i * max(0, opacity)) for i in range(256)]
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(alpha))
        sh = sh.copy()
        sh.putalpha(sh.getchannel('A').point(alpha))
    im.alpha_composite(sh, (round(x - 64 * scale), round(y - 64 * scale)))
    im.alpha_composite(layer, (round(x), round(y)))


def _meet_logo(d, x, y, width):
    """The actual Google Meet asset's seven colored paths, at its 622:512 ratio.

    Coordinates and colors are from public/assets/tools/google-meet.svg. At UI
    size its cubic rounded tips are faithfully represented by these vertices.
    """
    s = width / 622
    paths = [
        ('#00832D', [(351.419,255.568),(411.978,324.79),(493.418,376.827),(507.584,256.005),(493.418,137.908),(410.418,183.621)]),
        ('#0066DA', [(0,365.583),(0,468.541),(4,488),(22,506),(42.598,511.136),(145.556,511.136),(166.876,433.344),(145.556,365.583),(74.92,344.263)]),
        ('#E94235', [(145.556,0),(0,145.554),(74.925,166.822),(145.556,145.554),(166.488,78.715)]),
        ('#2684FC', [(0,365.629),(145.556,365.629),(145.556,145.551),(0,145.551)]),
        ('#00AC47', [(586.398,61.629),(493.416,137.91),(493.416,376.827),(586.782,453.404),(602,457),(615,450),(621.204,436.607),(621.204,78.086),(615,64),(602,58)]),
        ('#00AC47', [(351.419,255.568),(351.419,365.583),(145.556,365.583),(145.556,511.136),(450.825,511.136),(473,505),(488,489),(493.418,468.541),(493.418,376.827)]),
        ('#FFBA00', [(450.825,0),(145.556,0),(145.556,145.554),(351.419,145.554),(351.419,255.568),(493.42,137.905),(493.42,42.598),(487,21),(472,6)]),
    ]
    for color, pts in paths:
        d.polygon([(x + px * s, y + py * s) for px, py in pts], fill=color)


def _glyph(d, xy, kind, size=24, color='#d9dbe3', width=2):
    x, y = xy
    s = size
    if kind == 'eye':
        d.arc((x, y+s*.2, x+s, y+s*.82), 190, 350, color, width)
        d.arc((x, y+s*.04, x+s, y+s*.66), 10, 170, color, width)
        d.ellipse((x+s*.37,y+s*.29,x+s*.63,y+s*.55),fill=color)
    elif kind == 'eye-off':
        _glyph(d, xy, 'eye', s, color, width)
        d.line((x+s*.08,y+s*.02,x+s*.92,y+s*.87),fill=color,width=width)
    elif kind == 'search':
        d.ellipse((x,y,x+s*.67,y+s*.67),outline=color,width=width)
        d.line((x+s*.56,y+s*.56,x+s*.91,y+s*.91),color,width)
    elif kind == 'capture':
        q=s*.28
        for px,py,dx,dy in [(x,y,1,1),(x+s,y,-1,1),(x,y+s,1,-1),(x+s,y+s,-1,-1)]:
            d.line((px,py+dy*q,px,py,px+dx*q,py),color,width)
        d.ellipse((x+s*.43,y+s*.43,x+s*.57,y+s*.57),fill=color)
    elif kind == 'camera':
        d.rounded_rectangle((x,y+s*.2,x+s*.7,y+s*.8),4,outline=color,width=width)
        d.polygon([(x+s*.7,y+s*.36),(x+s,y+s*.2),(x+s,y+s*.8),(x+s*.7,y+s*.64)],fill=color)
    elif kind == 'mic':
        d.rounded_rectangle((x+s*.36,y,x+s*.64,y+s*.61),s*.14,outline=color,width=width)
        d.arc((x+s*.17,y+s*.27,x+s*.83,y+s*.81),0,180,color,width)
        d.line((x+s*.5,y+s*.81,x+s*.5,y+s),color,width)
        d.line((x+s*.29,y+s,x+s*.71,y+s),color,width)
    elif kind == 'phone':
        d.arc((x,y+s*.27,x+s,y+s*.92),195,345,color,max(3,width*2))
        d.rounded_rectangle((x,y+s*.46,x+s*.2,y+s*.76),3,fill=color)
        d.rounded_rectangle((x+s*.8,y+s*.46,x+s,y+s*.76),3,fill=color)
    elif kind == 'screen':
        d.rounded_rectangle((x,y,x+s,y+s*.69),3,outline=color,width=width)
        d.line((x+s*.5,y+s*.69,x+s*.5,y+s*.94),color,width)
        d.line((x+s*.23,y+s*.94,x+s*.77,y+s*.94),color,width)
    elif kind == 'chevron':
        d.line((x,y+s*.35,x+s*.5,y+s*.7,x+s,y+s*.35),color,width)
    elif kind == 'x':
        d.line((x,y,x+s,y+s),color,width)
        d.line((x+s,y,x,y+s),color,width)
    elif kind == 'bolt':
        d.polygon([(x+s*.57,y),(x+s*.13,y+s*.58),(x+s*.46,y+s*.58),(x+s*.34,y+s),(x+s*.9,y+s*.38),(x+s*.57,y+s*.38)],fill=color)
    elif kind == 'dots':
        for q in [.13,.5,.87]:
            d.ellipse((x+s*q-2,y+s*.5-2,x+s*q+2,y+s*.5+2),fill=color)
    elif kind == 'return':
        d.line((x+s*.88,y+s*.12,x+s*.88,y+s*.66,x+s*.12,y+s*.66),color,width)
        d.line((x+s*.36,y+s*.42,x+s*.12,y+s*.66,x+s*.36,y+s*.9),color,width)


def _dock_icon(d,h,x,y,kind):
    """Recognizable vector app symbols, with no placeholder letter tiles."""
    if kind=='finder':
        h['rr'](d,(x,y,x+46,y+39),'#91d9fb',10)
        d.rectangle((x+23,y+1,x+43,y+38),fill='#d9f3ff')
        d.line((x+24,y+1,x+21,y+23,x+27,y+23,x+25,y+38),'#3477a7',1)
        for xx in [x+12,x+34]:
            d.line((xx,y+10,xx,y+14),'#2d526f',2)
        d.arc((x+9,y+12,x+37,y+30),10,165,'#2d526f',2)
    elif kind=='safari':
        h['rr'](d,(x,y,x+46,y+39),'#f0f3fa',10)
        d.ellipse((x+6,y+3,x+40,y+37),fill='#62c4ec',outline='#9bdff4',width=1)
        for a in range(0,360,30):
            rad=math.radians(a)
            d.line((x+23+math.cos(rad)*14,y+20+math.sin(rad)*14,x+23+math.cos(rad)*16,y+20+math.sin(rad)*16),'#ebfbff',1)
        d.polygon([(x+30,y+9),(x+26,y+23),(x+16,y+31),(x+20,y+17)],fill='#f6f7f8')
        d.polygon([(x+30,y+9),(x+26,y+23),(x+20,y+17)],fill='#e56973')
    elif kind=='mail':
        h['rr'](d,(x,y,x+46,y+39),'#58aef0',10)
        h['rr'](d,(x+6,y+9,x+40,y+31),'#ecf8ff',3)
        d.line((x+7,y+10,x+23,y+22,x+39,y+10),'#74b9e9',2)
        d.line((x+7,y+30,x+18,y+21),'#99caec',1)
        d.line((x+39,y+30,x+28,y+21),'#99caec',1)
    elif kind=='chrome':
        h['rr'](d,(x,y,x+46,y+39),'#f1f3f7',10)
        d.pieslice((x+5,y+2,x+41,y+38),210,330,fill='#e35b57')
        d.pieslice((x+5,y+2,x+41,y+38),330,90,fill='#eac757')
        d.pieslice((x+5,y+2,x+41,y+38),90,210,fill='#65ad72')
        d.ellipse((x+14,y+11,x+32,y+29),fill='#63a4e4',outline='#e6edf8',width=2)
    elif kind=='cue':
        h['rr'](d,(x,y,x+46,y+39),'#7356b4',10)
        h['mark'](d,x+6,y+3,33,'#ffffff')
    elif kind=='terminal':
        h['rr'](d,(x,y,x+46,y+39),'#c6c8d5',10)
        h['rr'](d,(x+4,y+5,x+42,y+35),'#303442',5)
        d.line((x+11,y+13,x+17,y+19,x+11,y+25),'#e5e9f6',2)
        d.line((x+22,y+26,x+31,y+26),'#e5e9f6',2)
    elif kind=='settings':
        h['rr'](d,(x,y,x+46,y+39),'#b4b8c5',10)
        h['icon'](d,x+10,y+6,'gear',27,'#535a6d')


def _desktop(h, background):
    im = background.copy()
    d = ImageDraw.Draw(im)
    d.rectangle((0,0,1920,34),fill=(30,24,43,165))
    h['text'](d,(24,6),'',23,'#f9f6fb',600)
    h['text'](d,(66,9),'Chrome',17,'#fffaff',650)
    x=151
    for title in ['File','Edit','View','History','Bookmarks','Profiles','Tab','Window','Help']:
        h['text'](d,(x,10),title,16,'#fff5fc',500)
        x += d.textlength(title,font=h['font'](16,500))+24
    # Familiar but deliberately unobtrusive macOS status area.
    d.arc((1620,7,1644,29),210,330,'#fff7fd',2)
    d.arc((1625,12,1639,27),210,330,'#fff7fd',2)
    d.ellipse((1631,23,1634,26),fill='#fff7fd')
    h['rr'](d,(1661,11,1687,24),None,3,'#fff7fd',1)
    d.rectangle((1664,14,1682,21),fill='#fff7fd')
    d.rectangle((1689,15,1691,20),fill='#fff7fd')
    h['text'](d,(1730,10),'Tue Oct 20   9:41 AM',16,'#fff7fd',520)
    # Frosted dock, visible below the browser and the floating Cue window.
    h['rr'](d,(640,1021,1280,1076),(234,223,245,115),21,(255,245,255,100))
    apps = ['finder','safari','mail','chrome','cue','terminal','settings']
    for i,kind in enumerate(apps):
        px=658+i*88
        _dock_icon(d,h,px,1030,kind)
        if i in [0,3]:
            d.ellipse((px+21,1072,px+24,1075),fill='#eae7f3')
    return im


def _chrome(h, active):
    im = _desktop(h, h['desktop_wallpaper'](*SIZE))
    browser=Image.new('RGBA',(BW,BH))
    d=ImageDraw.Draw(browser)
    h['rr'](d,(0,0,BW-1,BH-1),'#191b20',15,'#ffffff30')
    h['rr'](d,(1,1,BW-2,94),'#292b33',14)
    d.rectangle((1,47,BW-2,95),fill='#292b33')
    for x,color in [(25,'#ff6059'),(46,'#ffbd2e'),(67,'#28c840')]:
        d.ellipse((x-6,18,x+6,30),fill=color)
    tabs=[(100,385,'meet'),(391,767,'leetcode')]
    for x1,x2,name in tabs:
        chosen=active==name
        if chosen:
            h['rr'](d,(x1,8,x2,50),'#3a3c45',11)
            d.rectangle((x1,37,x2,50),fill='#3a3c45')
        if name=='meet':
            _meet_logo(d,x1+17,19,23)
            h['text'](d,(x1+50,21),'Technical interview · Meet',17,'#e4e6ec' if chosen else '#adb0bb',500)
        else:
            _leetcode_logo(browser,x1+17,17,22)
            h['text'](d,(x1+50,21),'42. Trapping Rain Water',17,'#e4e6ec' if chosen else '#adb0bb',500)
        _glyph(d,(x2-24,23),'x',9,'#adb0bb',1)
    h['text'](d,(791,20),'+',23,'#b8bac3',450)
    # Navigation and omnibox.
    d.line((24,68,16,76,24,84),'#a8acb8',2)
    d.line((51,68,59,76,51,84),'#696d79',2)
    d.arc((77,67,95,85),45,325,'#a8acb8',2)
    d.polygon([(95,66),(95,73),(88,70)],fill='#a8acb8')
    h['rr'](d,(116,55,BW-149,91),'#1f2128',18)
    d.line((136,68,136,80),'#999dab',2)
    d.ellipse((133,65,139,71),outline='#999dab',width=1)
    url='meet.google.com/nqr-vhcs-kmt' if active=='meet' else 'leetcode.com/problems/trapping-rain-water/'
    h['text'](d,(156,65),url,16,'#cbd0dc',450)
    h['text'](d,(BW-182,65),'☆',20,'#9398a6',450)
    d.ellipse((BW-116,61,BW-88,89),fill='#7d8ca9')
    h['text'](d,(BW-102,67),'Y',15,'#fafbff',650,True)
    for py in [67,75,83]:
        d.ellipse((BW-35,py-1,BW-32,py+2),fill='#cbd0dc')
    im.alpha_composite(_shadow(BW,BH,16,23,110),(BX-64,BY-64))
    im.alpha_composite(browser,(BX,BY))
    return im


@lru_cache(maxsize=8)
def _leetcode_mark(size):
    """Resize LeetCode's original reversed mark, preserving its proportions."""
    with Image.open(Path(__file__).resolve().parent/'assets/leetcode.png') as source:
        mark=source.convert('RGBA')
    mark=mark.crop(mark.getbbox())
    return mark.resize((round(mark.width*size/mark.height),size),Image.Resampling.LANCZOS)


def _leetcode_logo(im,x,y,size):
    mark=_leetcode_mark(size)
    im.alpha_composite(mark,(round(x+(size-mark.width)/2),round(y)))


def _meet_static(h):
    im=_chrome(h,'meet')
    d=ImageDraw.Draw(im)
    body=(BX+1,BY+96,BX+BW-2,BY+BH-2)
    d.rectangle(body,fill='#181a1e')
    _meet_logo(d,BX+29,BY+109,68)
    h['text'](d,(BX+112,BY+113),'Google Meet',50,'#e9eaed',520)
    interview_width=d.textlength('Technical interview',font=h['font'](40,450))
    h['text'](d,(BX+BW-30-interview_width,BY+121),'Technical interview',40,'#aeb2bc',450)
    # Comfortable safe edges survive the photographed laptop's taller display.
    top,bottom=BY+187,BY+BH-121
    mid=960
    cards=[(BX+29,mid-12,'#273749','#bad7fc','NC','Nora Chen'),
           (mid+12,BX+BW-30,'#30313d','#d7cef4','YL','You')]
    for left,right,bg,fg,initials,name in cards:
        h['rr'](d,(left,top,right,bottom),bg,23)
        cx=(left+right)/2
        cy=(top+bottom)/2-16
        d.ellipse((cx-93,cy-93,cx+93,cy+93),fill=fg)
        h['text'](d,(cx,cy-31),initials,68,'#27374d' if initials=='NC' else '#4d416d',520,True)
        h['text'](d,(left+24,bottom-43),name,23,'#f2f4fa',520)
        if name=='You':
            d.ellipse((right-61,top+18,right-19,top+60),fill='#20222d')
            _glyph(d,(right-49,top+28),'mic',18,'#dfe1ed',2)
            d.line((right-52,top+25,right-27,top+53),'#dfe1ed',2)
    h['text'](d,(BX+30,BY+BH-66),'9:41 AM  |  Technical interview',21,'#e3e4e9',500)
    controls=[('mic','#34373e'),('camera','#34373e'),('CC','#34373e'),('screen','#34373e'),('dots','#34373e'),('phone','#e8544c')]
    start=735
    for i,(name,co) in enumerate(controls):
        x=start+i*77
        h['rr'](d,(x,BY+BH-88,x+61,BY+BH-28),co,30)
        if name=='CC':
            h['rr'](d,(x+16,BY+BH-68,x+45,BY+BH-47),None,4,'#e7e9f0',2)
            h['text'](d,(x+30,BY+BH-65),'cc',15,'#e7e9f0',550,True)
        else:
            _glyph(d,(x+18,BY+BH-70),name,25,'#fff7f6' if name=='phone' else '#e7e9f0',2)
        if name=='camera':
            d.line((x+15,BY+BH-74,x+47,BY+BH-42),'#e7e9f0',2)
    d.ellipse((BX+BW-147,BY+BH-68,BX+BW-124,BY+BH-45),outline='#d0d3de',width=2)
    h['text'](d,(BX+BW-135,BY+BH-66),'i',21,'#d0d3de',580,True)
    # Participant counter.
    d.ellipse((BX+BW-89,BY+BH-69,BX+BW-77,BY+BH-57),outline='#d0d3de',width=2)
    d.arc((BX+BW-96,BY+BH-55,BX+BW-70,BY+BH-40),180,360,'#d0d3de',2)
    h['text'](d,(BX+BW-59,BY+BH-66),'2',19,'#d0d3de',500)
    return im


def _water_chart(d,h,box,labels=True):
    x,y,w,ht=box
    cols=len(HEIGHTS)
    gap=5
    cw=(w-gap*(cols-1))/cols
    unit=(ht-28)/3
    levels=[0,1,1,2,2,2,2,3,2,2,2,1]
    bottom=y+ht-24
    for i,(bar,level) in enumerate(zip(HEIGHTS,levels)):
        xx=x+i*(cw+gap)
        if level>bar:
            d.rectangle((xx,bottom-level*unit,xx+cw,bottom-bar*unit),fill='#51abdb')
        if bar:
            h['rr'](d,(xx,bottom-bar*unit,xx+cw,bottom),'#777d8b',3)
        if labels:
            h['text'](d,(xx+cw/2,bottom+9),str(bar),15,'#a9adb8',450,True,True)
    d.line((x-4,bottom+1,x+w+4,bottom+1),'#5a5f69',1)


def _leetcode_static(h):
    im=_chrome(h,'leetcode')
    d=ImageDraw.Draw(im)
    x1,y1,x2,y2=BX+1,BY+96,BX+BW-2,BY+BH-2
    d.rectangle((x1,y1,x2,y2),fill='#17181c')
    _leetcode_logo(im,x1+24,y1+16,26)
    h['text'](d,(x1+67,y1+20),'LeetCode',22,'#e7e8ee',600)
    d.line((x1+185,y1+16,x1+185,y1+45),'#3f424a',1)
    h['text'](d,(x1+211,y1+22),'Problem List',19,'#bfc2cb',500)
    d.line((x1,y1+60,x2,y1+60),'#32353b',1)
    h['rr'](d,(x1+777,y1+11,x1+872,y1+49),'#30343b',8)
    d.polygon([(x1+792,y1+24),(x1+792,y1+37),(x1+803,y1+30)],fill='#d7dce7')
    h['text'](d,(x1+813,y1+22),'Run',18,'#d7dce7',550)
    h['rr'](d,(x1+883,y1+11,x1+1006,y1+49),'#243d31',8)
    h['text'](d,(x1+945,y1+22),'Submit',18,'#62cb91',570,True)
    h['text'](d,(x2-137,y1+23),'Premium',18,'#e9b65e',500)
    # Split view, left problem and right editor.
    left,right=BX+20,765
    h['rr'](d,(left,y1+75,right,y2-15),'#202126',10,'#303239',1)
    h['rr'](d,(right+12,y1+75,x2-18,y2-15),'#202126',10,'#303239',1)
    h['text'](d,(left+20,y1+92),'Description',18,'#e2e6ed',560)
    h['text'](d,(left+162,y1+92),'Editorial',18,'#8c929e',450)
    h['text'](d,(left+274,y1+92),'Solutions',18,'#8c929e',450)
    d.line((left,y1+124,right,y1+124),'#303239',1)
    h['text'](d,(left+22,y1+153),'42. Trapping Rain Water',33,'#f0f1f5',650)
    h['rr'](d,(left+22,y1+204,left+82,y1+233),'#422733',14)
    h['text'](d,(left+52,y1+211),'Hard',16,'#f09aae',550,True)
    h['rr'](d,(left+93,y1+204,left+171,y1+233),'#2e3037',14)
    h['text'](d,(left+132,y1+211),'Topics',16,'#b1b6c2',450,True)
    h['rr'](d,(left+182,y1+204,left+285,y1+233),'#2e3037',14)
    h['text'](d,(left+234,y1+211),'Companies',16,'#b1b6c2',450,True)
    _paragraph(d,h,(left+22,y1+259),
               'Each bar has width 1. Given the elevation heights, calculate how many units of water remain trapped after the rain.',
               622,24,'#d4d7df',34)
    h['text'](d,(left+22,y1+411),'Example 1',23,'#eceef3',620)
    _water_chart(d,h,(left+47,y1+458,580,196))
    h['rr'](d,(left+22,y1+674,right-22,y1+774),'#292b32',10)
    h['text'](d,(left+40,y1+691),'Input: height =',20,'#c8cbd6',500,False,True)
    h['text'](d,(left+40,y1+720),'[0,1,0,2,1,0,1,3,2,1,2,1]',20,'#e5e8f1',450,False,True)
    h['text'](d,(left+40,y1+749),'Output: 6',20,'#83d3ef',570,False,True)
    h['text'](d,(left+25,y2-42),'The blue area above traps 6 units of rain water.',18,'#9299a7',450)
    h['text'](d,(right+35,y1+92),'Code',18,'#d7dce5',540)
    h['text'](d,(right+35,y1+143),'Python3',18,'#b3bac8',500)
    _glyph(d,(right+124,y1+146),'chevron',10,'#8a929f',1)
    h['text'](d,(right+179,y1+143),'Auto',17,'#808795',450)
    d.line((right+13,y1+175,x2-19,y1+175),'#303239',1)
    code=['class Solution:','    def trap(self, height: List[int]) -> int:','        ']
    for i,line in enumerate(code):
        h['text'](d,(right+37,y1+201+i*33),str(i+1),20,'#717b8c',450,False,True)
        h['text'](d,(right+80,y1+201+i*33),line,22,'#d0c1ed' if i<2 else '#dfe4ef',450,False,True)
    d.line((right+180,y1+265,right+180,y1+290),'#a8bbeb',2)
    return im


def _base(h,name):
    key=(id(h['font']),id(h['desktop_wallpaper']),name)
    if key not in _BASE_CACHE:
        _BASE_CACHE[key]=_meet_static(h) if name=='meet' else _leetcode_static(h)
    return _BASE_CACHE[key].copy()


def _voice_bars(d,x,y,t,color='#acd1ff',height=20):
    for i in range(3):
        ht=height*(.4+.6*(.5+.5*math.sin(t*7.1+i*1.8)))
        d.rounded_rectangle((x+i*6,y+(height-ht)/2,x+i*6+3,y+(height+ht)/2),2,fill=color)


def _meet_activity(im,t,h):
    d=ImageDraw.Draw(im)
    h['rr'](d,(BX+29,BY+187,948,BY+BH-121),None,23,'#96c5fd',3)
    _voice_bars(d,894,BY+211,t,height=22)
    if .35<t<3.35:
        a=_phase(t,.35,.7)*(1-_phase(t,2.65,3.35))
        layer=Image.new('RGBA',(430,51))
        ld=ImageDraw.Draw(layer)
        h['rr'](ld,(0,0,429,50),'#353b46',25,'#535c6a')
        ld.ellipse((21,18,35,32),fill='#94d8ad')
        h['text'](ld,(52,16),"You're in the meeting",21,'#edf2f9',520)
        layer.putalpha(layer.getchannel('A').point([round(v*a) for v in range(256)]))
        im.alpha_composite(layer,(745,186))


def _mini_meet(im,t,h):
    x,y,w,ht=MEET_MINI
    entrance=_phase(t,5.62,6.05)
    if entrance<=0:
        return
    layer=Image.new('RGBA',(w,ht))
    d=ImageDraw.Draw(layer)
    h['rr'](d,(0,0,w-1,ht-1),'#25282f',13,'#697482',1)
    _meet_logo(d,12,13,40)
    h['text'](d,(66,15),'Google Meet',30,'#eff1f7',550)
    h['text'](d,(w-21,23),'−',18,'#c2c7d2',500,True)
    h['rr'](d,(9,60,w//2-4,ht-10),'#31445c',9,'#9ac7ff',2)
    h['rr'](d,(w//2+4,60,w-10,ht-10),'#383747',9)
    for cx,label,initials,co in [(w*.25,'Nora Chen','NC','#b7d8fe'),(w*.75,'You','YL','#d3c6ef')]:
        d.ellipse((cx-24,70,cx+24,118),fill=co)
        h['text'](d,(cx,83),initials,21,'#3a4662',560,True)
        h['text'](d,(cx,137),label,16,'#f0f2f8',500,True)
    _voice_bars(d,178,75,t,height=17)
    _glyph(d,(w-40,72),'mic',15,'#c1bdd3',1)
    d.line((w-42,71,w-24,90),'#c1bdd3',1)
    _window(im,layer,(x+round(22*(1-entrance)),y),entrance,shadow=95)


def _spotlight(im,t,h):
    show=_phase(t,7.2,7.48)*(1-_phase(t,9.66,10.0))
    if show<=0:
        return
    dim=Image.new('RGBA',SIZE,(4,7,17,round(72*show)))
    im.alpha_composite(dim)
    layer=Image.new('RGBA',(820,322))
    d=ImageDraw.Draw(layer)
    h['rr'](d,(0,0,819,321),(39,39,50,251),20,'#7e7b8b',1)
    _glyph(d,(27,25),'search',30,'#c3c2ce',3)
    typed='cue'[:max(0,min(3,int((t-7.57)/.22)+1))] if t>=7.57 else ''
    h['text'](d,(82,24),typed or 'Spotlight Search',35,'#faf8ff' if typed else '#a5a1b1',450)
    if t<9.40 and (int(t*2.8)%2==0 or typed!='cue'):
        tx=82+d.textlength(typed,font=h['font'](35,450))
        d.line((tx+3,23,tx+3,62),'#aaa1e8',2)
    d.line((1,85,819,85),'#565360',1)
    h['text'](d,(26,106),'TOP HIT',13,'#aba5b9',650)
    selection=bool(typed)
    h['rr'](d,(14,133,806,210),'#594aa2' if selection else '#34333f',11)
    h['rr'](d,(30,145,82,197),'#7753aa',13)
    h['mark'](d,37,152,38,'#ffffff')
    h['text'](d,(102,149),'Cue',26,'#fbf9ff',580)
    h['text'](d,(104,181),'Application',15,'#d4cee8',450)
    _glyph(d,(761,155),'return',23,'#e4dcfa',2)
    h['text'](d,(27,235),'Cue',24,'#e8e3ef',550)
    h['text'](d,(27,272),'Applications',16,'#9d96ae',450)
    h['rr'](d,(671,263,791,301),'#4b455c',10,'#71667d',1)
    _glyph(d,(685,273),'return',18,'#e2d9f0',2)
    h['text'](d,(719,274),'Open',17,'#e2d9f0',520)
    _window(im,layer,(550,257+round(12*(1-show))),show,shadow=150)


def _syntax_code(d,h,xy,value,size=20,lh=23.2,visible_lines=100):
    lines=value.splitlines()
    f=h['font'](size,450,True)
    number_font=h['font'](size-3,450,True)
    ascent=f.getmetrics()[0]
    cw=d.textlength('M',font=f)
    for i,line in enumerate(lines):
        if i>=visible_lines:
            break
        baseline=xy[1]+i*lh+ascent
        d.text((xy[0]-30,baseline),str(i+1).rjust(2),font=number_font,fill='#756d84',anchor='ls')
        d.text((xy[0],baseline),line,font=f,fill='#e8e2ef',anchor='ls')
    for tok in tokenize.generate_tokens(io.StringIO(value).readline):
        if tok.start[0]>visible_lines or tok.type in (token.NEWLINE,token.INDENT,token.DEDENT,token.ENDMARKER):
            continue
        color=None
        if tok.string in {'class','def','while','if','else','return'}:
            color='#d6a3f5'
        elif tok.string in {'max','len','trap','Solution'}:
            color='#92d8ea'
        elif tok.type==token.NUMBER:
            color='#ecc28d'
        if color:
            d.text((xy[0]+tok.start[1]*cw,xy[1]+(tok.start[0]-1)*lh+ascent),tok.string,font=f,fill=color,anchor='ls')


def _cue_drag_offset(t):
    """One continuous screen-space translation shared by window and cursor."""
    outward=_phase(t,18.65,19.7)
    returning=_phase(t,20.0,21.1)
    return -440*outward+260*returning, -90*outward+90*returning


def _cue_geometry(t):
    p=_phase(t,12.66,13.15)
    scale=1-.04*p
    dx,dy=_cue_drag_offset(t)
    x=CUE_X+(CUE_W-CUE_W*scale)/2+dx
    y=CUE_Y+(CUE_H-CUE_H*scale)/2+dy
    return x,y,scale,p


def _cue_grab_point(t):
    x,y,scale,_=_cue_geometry(t)
    # Match _window's raster origin as well as its transform, so even subpixel
    # rounding never lets the arrow drift relative to the dragged titlebar.
    return round(x)+600*scale,round(y)+40*scale


def _cue(im,t,h):
    entrance=_phase(t,10.0,10.42)
    if entrance<=0:
        return
    x,y,scale,privacy=_cue_geometry(t)
    y+=18*(1-entrance)
    incognito=t>=12.66
    answer=_phase(t,15.13,16.35)
    clicked=t>=14.48
    layer=Image.new('RGBA',(CUE_W,CUE_H))
    d=ImageDraw.Draw(layer)
    h['rr'](d,(4,4,1075,655),'#2f263c',23,'#81718e',1)
    toolbar_fill='#2a1e3b' if 18.55<=t<21.2 else '#241a32'
    h['rr'](d,(4,4,1075,77),toolbar_fill,23)
    d.rectangle((5,53,1074,77),fill=toolbar_fill)
    h['mark'](d,23,21,37,'#f0eafa')
    h['text'](d,(73,27),'Cue',26,'#f1edf8',610)
    d.line((141,22,141,58),'#62506f',1)
    h['rr'](d,(161,20,312,59),'#42314f',10,'#6d567f',1)
    h['text'](d,(180,30),'Coding',20,'#ece4f5',550)
    _glyph(d,(280,32),'chevron',12,'#c8b7da',2)
    # The on-screen indicator deliberately changes red -> neutral gray.
    dot='#92909b' if incognito else '#ec696f'
    d.ellipse((339,34,349,44),fill=dot)
    h['text'](d,(361,30),'Incognito' if incognito else 'Visible',19,'#b9adca',500)
    _glyph(d,(820,26),'screen',24,'#bdb0d0',2)
    _glyph(d,(866,25),'mic',24,'#bdb0d0',2)
    for i in range(12):
        ht=5+11*(.5+.5*math.sin(i*.9+t*6))
        h['rr'](d,(907+i*4,39-ht/2,909+i*4,39+ht/2),'#a7c9df',1)
    h['rr'](d,(972,17,1019,61),'#45364f' if incognito else '#382a45',11,'#786087' if incognito else None)
    if incognito:
        h['icon'](d,983,27,'incognito',24,'#d9cee7')
    else:
        _glyph(d,(983,27),'eye',24,'#d9cee7',2)
    _glyph(d,(1041,32),'x',12,'#9b8ba8',2)
    if incognito:
        h['dotted'](d,(1,1,1078,658),25,11,'#b6a6cb')
    if not clicked:
        h['text'](d,(33,102),'LIVE CONTEXT',14,'#b7a1c9',650)
        h['text'](d,(34,133),'Stay with the conversation.',31,'#f2eaf8',620)
        h['rr'](d,(32,192,1048,341),'#3d324a',15,'#62526f',1)
        _voice_bars(d,55,216,t,'#9bc9e6',16)
        h['text'](d,(84,215),'Nora · now',18,'#a9d4eb',550)
        h['text'](d,(56,258),'How would you solve this in linear time?',27,'#f1e9f8',510)
        h['rr'](d,(32,365,1048,547),'#352b41',15,'#60516d',1)
        _glyph(d,(55,391),'capture',22,'#b8a4d3',2)
        h['text'](d,(93,392),'SCREEN CONTEXT',14,'#b9a8cb',630)
        h['text'](d,(55,432),'42. Trapping Rain Water',27,'#eee8f6',570)
        h['text'](d,(55,479),'Two people. One shared problem.',22,'#bfb2cf',450)
        h['rr'](d,(703,411,1020,515),'#292434',12)
        _water_chart(d,h,(724,424,274,78),False)
    elif t<15.13:
        h['text'](d,(33,103),'SMART ASSIST',14,'#b7a1c9',650)
        h['text'](d,(34,137),'Reading your screen…',30,'#f1e9f8',610)
        h['rr'](d,(33,204,1047,540),'#30283c',17,'#655274',1)
        for row,width in enumerate([723,915,830,627,880,763]):
            h['rr'](d,(65,236+row*45,65+width,252+row*45),'#4d3f5c',6)
        # A quiet scan band says screen context is being read.
        sy=217+((t-14.48)/.65)*250
        h['rr'](d,(48,sy,1031,min(sy+3,533)),'#a4c4e8',2)
    else:
        h['text'](d,(33,101),'SMART ANSWER',14,'#b7a1c9',650)
        h['text'](d,(34,128),'Two pointers. One pass.',28,'#f0e8f8',620)
        h['rr'](d,(32,171,1048,550),'#25212f',14,'#5e4e6f',1)
        h['text'](d,(1008,184),'PYTHON',12,'#8f829f',650,True)
        # Reveal complete lines; the final solution has no partial token states.
        lines=max(1,min(15,math.ceil(answer*15)))
        _syntax_code(d,h,(77,188),TRAPPING_RAIN_WATER_SOLUTION,20,23.0,lines)
        if answer>.82:
            h['text'](d,(35,567),'Time  O(n)',19,'#a2d7e5',560)
            h['text'](d,(233,567),'Space  O(1)',19,'#cdb6ed',560)
            h['text'](d,(966,567),'Example  →  6',19,'#d9d0e8',530,True)
    # The same bottom action stays anchored during the entire interaction.
    h['rr'](d,(32,604,1048,644),'#3d304b',11,'#736181',1)
    h['text'](d,(49,616),'Ask a follow-up…',17,'#a99abb',450)
    h['rr'](d,(789,609,1042,639),'#7256a8' if not clicked else '#56446f',8)
    _glyph(d,(803,617),'capture',15,'#f6efff',1)
    h['text'](d,(830,617),'Smart assist',17,'#f5edff',580)
    h['text'](d,(1000,617),'⌘',14,'#d7c8ed',500)
    _glyph(d,(1019,616),'return',14,'#d7c8ed',1)
    _window(im,layer,(x,y),entrance,scale,24,135)
    # The hover label appears before the privacy action, then gives way to state.
    if 11.93<t<12.63:
        tooltip=Image.new('RGBA',(203,37))
        td=ImageDraw.Draw(tooltip)
        h['rr'](td,(0,0,202,36),'#18151f',8,'#6b5b79',1)
        h['text'](td,(101,11),'Turn on incognito',16,'#e2d7ef',500,True)
        im.alpha_composite(tooltip,(round(x+875*scale),round(y+81*scale)))


def _screenshot_pulse(im,t,h):
    age=t-14.48
    if not 0<=age<.56:
        return
    opacity=(1-_phase(age,.07,.56))
    layer=Image.new('RGBA',SIZE)
    d=ImageDraw.Draw(layer)
    # Capture feedback references only the synthetic problem panel.
    h['rr'](d,(75,225,765,987),None,11,(178,208,251,round(220*opacity)),3)
    if age<.18:
        h['rr'](d,(76,226,764,986),(214,232,255,round(38*(1-age/.18))),10)
    im.alpha_composite(layer)


def _position(t,keys):
    for (a,pa),(b,pb) in zip(keys,keys[1:]):
        if t<=b:
            p=_phase(t,a,b)
            return _mix(pa[0],pb[0],p),_mix(pa[1],pb[1],p)
    return keys[-1][1]


def _cursor_position(t):
    # Movement, dwell, click, and response have separate readable beats.
    ix,iy,sc,_=_cue_geometry(12.64)
    eye=(ix+996*sc,iy+40*sc)
    ax,ay,asc,_=_cue_geometry(14.48)
    assist=(ax+914*asc,ay+626*asc)
    keys=[(4.86,(1104,794)),(5.38,(650,96)),(5.66,(650,96)),
          (6.55,(1003,633)),(7.18,(1003,633)),(8.85,(1003,633)),
          (9.30,(796,425)),(9.55,(796,425)),(10.55,(1248,791)),
          (11.91,eye),(12.83,eye),(13.63,(1408,857)),(14.21,assist),
          (14.72,assist),(15.38,(1466,962)),(18.0,(1466,962)),
          (18.55,_cue_grab_point(18.55))]
    if t<=18.55:
        return _position(t,keys)
    # The pointer never slips relative to the titlebar while the mouse is held.
    return _cue_grab_point(t)


def _cursor(im,t,h):
    if t<4.86:
        return
    x,y=_cursor_position(t)
    click_layer=Image.new('RGBA',SIZE)
    cd=ImageDraw.Draw(click_layer)
    for click in [5.55,9.42,12.66,14.48,18.55,21.2]:
        age=t-click
        if 0<=age<.38:
            r=9+31*_phase(age,0,.38)
            a=round(175*(1-age/.38))
            cd.ellipse((x-r,y-r,x+r,y+r),outline=(226,214,255,a),width=2)
    im.alpha_composite(click_layer)
    d=ImageDraw.Draw(im)
    # Native-style black pointer, white edge and a small soft offset shadow.
    pts=[(0,0),(0,30),(8,22),(14,36),(20,33),(14,20),(26,20)]
    d.polygon([(x+px+2,y+py+2) for px,py in pts],fill=(0,0,0,65))
    d.polygon([(x+px,y+py) for px,py in pts],fill='#15121c')
    d.line([(x+px,y+py) for px,py in pts+[pts[0]]],fill='#f8f4ff',width=2,joint='curve')


def render_scene(t, helpers):
    """Render the synthetic Meet → LeetCode → Spotlight → Cue sequence.

    Main action times (seconds): tab click 5.55; Spotlight 7.2–10; Cue launch
    10; eye click 12.66; Smart assist / screenshot 14.48; full answer 16.35.
    Added drag: titlebar press 18.55; move left/up 18.65–19.7; return toward
    right/down 20–21.1; release 21.2; final position holds through 22 seconds.
    """
    t=max(0.0,min(float(t),22.0))
    if t<5.55:
        im=_base(helpers,'meet')
        _meet_activity(im,t,helpers)
    else:
        im=_base(helpers,'leetcode')
        if t<18.65:
            _mini_meet(im,t,helpers)
        _spotlight(im,t,helpers)
        _cue(im,t,helpers)
        _screenshot_pulse(im,t,helpers)
        if t>=18.65:
            # Floating Meet remains above the moved Cue window, at a fixed
            # screen position, even as Cue passes its lower-left corner.
            _mini_meet(im,t,helpers)
    _cursor(im,t,helpers)
    im.putalpha(255)
    return im
