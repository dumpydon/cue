/* Original Cue launch film. No capture, network calls, or external imagery.
 * renderFrame(seconds) is deterministic; every movement derives from time. */
'use strict';
const canvas = document.getElementById('film');
const c = canvas.getContext('2d', {alpha:false});
const W = 1920, H = 1080;
const C = {bg:'#07070c', white:'#f5f4fa', violet:'#a493ff', cyan:'#8de7ef', muted:'#9593aa'};
const FONT = '"Helvetica Neue", Arial, sans-serif';
const MONO = '"SFMono-Regular", Menlo, monospace';
const screen = document.createElement('canvas'); screen.width=1600; screen.height=1000;
const u = screen.getContext('2d');
const card = document.createElement('canvas'); card.width=1200; card.height=900;
const q = card.getContext('2d');
const mark = new Image(); mark.src='cue-mark.svg';
window.ready = mark.decode();
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,x)=>a+(b-a)*x;
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const range=(t,a,b)=>ease((t-a)/(b-a));
function rr(g,x,y,w,h,r,fill,stroke,lw=1){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.lineWidth=lw;g.strokeStyle=stroke;g.stroke()}}
function txt(g,s,x,y,size=32,color=C.white,weight=400,align='left',font=FONT){g.font=`${weight} ${size}px ${font}`;g.fillStyle=color;g.textAlign=align;g.textBaseline='alphabetic';g.fillText(s,x,y)}
function line(g,x1,y1,x2,y2,color,width=1){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=color;g.lineWidth=width;g.stroke()}
function glow(g,x,y,r,color,alpha=1){g.save();g.globalAlpha*=alpha;const a=g.createRadialGradient(x,y,0,x,y,r);a.addColorStop(0,color);a.addColorStop(1,'transparent');g.fillStyle=a;g.fillRect(x-r,y-r,r*2,r*2);g.restore()}
function pill(g,s,x,y,w,h=48,active=false){rr(g,x,y,w,h,h/2,active?'#35304c':'#1b1a28',active?'#74668f':'#34313e');txt(g,s,x+w/2,y+h/2+8,23,active?C.white:'#aaa7bd',450,'center')}
function markAt(g,x,y,size,alpha=1){g.save();g.globalAlpha*=alpha;g.drawImage(mark,x,y,size,size);g.restore()}
function dots(g,x,y,w,h,r=28,alpha=1){g.save();g.globalAlpha*=alpha;g.beginPath();g.roundRect(x,y,w,h,r);g.setLineDash([.1,11]);g.lineCap='round';g.lineWidth=3;g.strokeStyle='#b5a6ee';g.stroke();g.restore()}
function waveform(g,x,y,t,width=120){for(let i=0;i<22;i++){let a=6+20*(.5+.5*Math.sin(i*.91+t*4))*(.4+.6*Math.sin(i*.6)**2);rr(g,x+i*width/22,y-a/2,3,a,2,C.cyan)}}

function toolbar(g,x,y,w,incognito=false,t=0){
  rr(g,x,y,w,88,30,'#252033','#554965',1.5);
  if(incognito)dots(g,x-7,y-7,w+14,102,36);
  markAt(g,x+20,y+21,45);
  line(g,x+85,y+25,x+85,y+64,'#5c526b');
  // Cog, incognito, mode, and history are illustrative Cue controls.
  txt(g,'⚙',x+115,y+58,37,'#ded9ed',350,'center');
  if(incognito){g.strokeStyle=C.white;g.lineWidth=3;g.beginPath();g.arc(x+171,y+48,8,0,Math.PI*2);g.arc(x+193,y+48,8,0,Math.PI*2);g.stroke();line(g,x+179,y+48,x+185,y+48,C.white,3);line(g,x+166,y+29,x+198,y+29,C.white,4);}
  else{g.strokeStyle='#cfc8e0';g.lineWidth=2.5;g.beginPath();g.ellipse(x+183,y+45,18,10,0,0,Math.PI*2);g.stroke();g.beginPath();g.arc(x+183,y+45,4,0,Math.PI*2);g.stroke()}
  line(g,x+224,y+25,x+224,y+64,'#5c526b');
  txt(g,'General',x+249,y+54,27,'#e5dff0',450);
  txt(g,'⌄',x+365,y+51,28,'#b7acc9');
  line(g,x+401,y+25,x+401,y+64,'#5c526b');
  rr(g,x+429,y+35,15,15,5,'#b8f2e6');
  txt(g,'Listening',x+459,y+54,26,'#eee9f5',500);
  waveform(g,x+w-165,y+46,t,117);
}
function desktop(t,mode='chat'){
  u.clearRect(0,0,1600,1000);
  const b=u.createLinearGradient(0,0,1600,1000);b.addColorStop(0,'#11111d');b.addColorStop(.5,'#18162a');b.addColorStop(1,'#090d17');u.fillStyle=b;u.fillRect(0,0,1600,1000);
  glow(u,1050,590,800,'#3d2a6b',.60);glow(u,250,900,500,'#12343e',.40);
  // Abstract folds form an original synthetic desktop wallpaper.
  for(let i=0;i<7;i++){u.beginPath();u.moveTo(-100,1060-i*20);u.bezierCurveTo(480,720-i*80,680,1040-i*120,1800,190-i*75);u.strokeStyle=`rgba(158,143,224,${.025+i*.004})`;u.lineWidth=12+i*8;u.stroke()}
  txt(u,'cue',48,48,23,'#d3d0df',500);txt(u,'MON  9:41',1547,48,20,'#88879c',500,'right');
  // A deliberately fictional conversation. No meeting provider or real user data.
  rr(u,115,190,430,650,34,'#11121ce6','#30303e',1.5);
  txt(u,'PRODUCT REVIEW',151,242,19,'#8e8b9f',550);
  rr(u,151,275,358,228,24,'#1b1c2a');
  glow(u,330,393,150,'#3a375a',.7);
  u.beginPath();u.arc(330,369,34,0,Math.PI*2);u.fillStyle='#777087';u.fill();
  u.beginPath();u.ellipse(330,452,69,44,0,Math.PI,Math.PI*2);u.fillStyle='#777087';u.fill();
  txt(u,'LIVE TRANSCRIPT',151,551,18,C.cyan,550);
  txt(u,'Them',151,597,23,'#a4a0b6',500);
  const transcript=['What should we focus on','for the next release?'];
  transcript.forEach((s,i)=>txt(u,s,151,640+i*34,25,'#e5e1ee'));
  waveform(u,151,767,t,180);
  toolbar(u,610,185,835,false,t);
  rr(u,610,294,835,547,31,'#191624ee','#51465e',1.5);
  markAt(u,650,332,37);txt(u,'A clear next step',709,360,26,C.white,500);
  txt(u,'Start with what users repeat.',650,431,34,C.white,500);
  txt(u,'Make the everyday flow feel effortless.',650,483,29,'#c9c1da');
  const lines=['01   Fix the friction in the core workflow.','02   Ship one meaningful improvement.','03   Measure what happens next.'];
  let n=clamp((t-.9)/2.3);
  lines.forEach((s,i)=>{u.save();u.globalAlpha=clamp(n*3-i);txt(u,s,650,570+i*56,26,i===0?C.cyan:'#d0c8df',400);u.restore()});
  rr(u,647,740,758,60,18,'#282233','#53465e');txt(u,'Ask a follow-up…',673,779,24,'#8e849f');txt(u,'↵',1371,781,28,'#b7a9cc',400,'right');
  // Screen reflections are intentionally soft so the demo remains readable.
  const reflection=u.createLinearGradient(200,0,1500,1000);reflection.addColorStop(0,'#ffffff08');reflection.addColorStop(.5,'#ffffff00');reflection.addColorStop(1,'#ffffff02');u.fillStyle=reflection;u.fillRect(0,0,1600,1000);
}
function project(p,cam){
  const yaw=cam.yaw,pitch=cam.pitch;
  let x=p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),z=-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw),y=p[1]-4.9;
  let yy=y*Math.cos(pitch)-z*Math.sin(pitch),zz=y*Math.sin(pitch)+z*Math.cos(pitch);
  let f=1/(1-zz/45);
  return [cam.x+x*cam.scale*f,cam.y-yy*cam.scale*f];
}
function poly(g,ps,fill,stroke,lw=1){g.beginPath();ps.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke()}}
function surf(g,pts,cam,fill,stroke,lw=1){poly(g,pts.map(p=>project(p,cam)),fill,stroke,lw)}
function tri(g,img,ss,dd){
  const [s0,s1,s2]=ss,[d0,d1,d2]=dd;
  const den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
  const a=(d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/den;
  const cc=(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/den;
  const e=(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
  const b=(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/den;
  const d=(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/den;
  const f=(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
  // Subpixel overlap prevents antialiased cracks between projected triangles.
  const center=[(d0[0]+d1[0]+d2[0])/3,(d0[1]+d1[1]+d2[1])/3];
  const clip=dd.map(p=>{const dx=p[0]-center[0],dy=p[1]-center[1],len=Math.hypot(dx,dy);return[p[0]+dx/len*1.4,p[1]+dy/len*1.4]});
  g.save();g.beginPath();clip.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.clip();g.transform(a,b,cc,d,e,f);g.drawImage(img,0,0);g.restore();
}
function texture(g,img,cam,point,nx=18,ny=12){
  const sw=img.width,sh=img.height;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const p=[[i/nx,j/ny],[(i+1)/nx,j/ny],[(i+1)/nx,(j+1)/ny],[i/nx,(j+1)/ny]];
    const s=p.map(z=>[z[0]*sw,z[1]*sh]),d=p.map(z=>project(point(...z),cam));
    tri(g,img,[s[0],s[1],s[2]],[d[0],d[1],d[2]]);tri(g,img,[s[0],s[2],s[3]],[d[0],d[2],d[3]]);
  }
}
function laptop(t,cam,alpha=1){
  c.save();c.globalAlpha*=alpha;
  // Grounded reflection and a restrained contact shadow.
  c.save();c.translate(cam.x+40,cam.y+cam.scale*5.4);c.scale(1,.13);glow(c,0,0,cam.scale*12,'#000000',.9);glow(c,-80,-15,cam.scale*10,'#635183',.22);c.restore();
  const metal=c.createLinearGradient(cam.x-700,cam.y-100,cam.x+600,cam.y+500);metal.addColorStop(0,'#3c3d46');metal.addColorStop(.4,'#77737d');metal.addColorStop(.62,'#34333e');metal.addColorStop(1,'#9c939f');
  const base=[[-8.9,.3,-1.1],[8.9,.3,-1.1],[9.2,.3,8.2],[-9.2,.3,8.2]];
  surf(c,[[-9.2,.3,8.2],[9.2,.3,8.2],[9.15,.04,8.3],[-9.15,.04,8.3]],cam,'#9a93a2','#cbc4d0',.8);
  surf(c,base,cam,metal,'#a6a0b0',1.2);
  surf(c,[[-8.45,.32,-.55],[8.45,.32,-.55],[8.55,.32,4.65],[-8.55,.32,4.65]],cam,'#22222b','#a9a0b130',1);
  const rows=[14,14,13,13,12];
  rows.forEach((n,r)=>{for(let k=0;k<n;k++){let kw=15.65/n,x=-7.83+k*kw,z=-.18+r*.88;surf(c,[[x,.35,z],[x+kw-.13,.35,z],[x+kw-.13,.35,z+.63],[x,.35,z+.63]],cam,'#101118','#80798765',.65);
    const p=project([x+kw/2,.36,z+.35],cam);if(cam.scale>67)txt(c,r===0?['esc','1','2','3','4','5','6','7','8','9','0','-','=','⌫'][k]||'':r===1?'QWERTYUIOP[]'[k]||'':r===2?'ASDFGHJKL;’'[k]||'':r===3?'ZXCVBNM,./'[k]||'':'',p[0],p[1],Math.max(5,cam.scale*.095),'#b2adbc',400,'center');
  }});
  surf(c,[[-2.7,.34,5.05],[2.7,.34,5.05],[2.75,.34,7.55],[-2.75,.34,7.55]],cam,'#6f6a78','#aea7b450',1);
  // Extruded display bezel; all geometry is original and unbranded.
  surf(c,[[-8.9,.6,-1.3],[-8.9,11.7,-3.2],[8.9,11.7,-3.2],[8.9,.6,-1.3]],cam,'#181921','#787481',1.3);
  surf(c,[[-8.68,.77,-1.21],[-8.68,11.5,-3.05],[8.68,11.5,-3.05],[8.68,.77,-1.21]],cam,'#05060b','#10121b',1.1);
  texture(c,screen,cam,(x,y)=>[mix(-8.36,8.36,x),mix(11.14,1.1,y),mix(-2.982,-1.262,y)]);
  const top=project([0,11.32,-3.02],cam);c.beginPath();c.arc(top[0],top[1],2.3,0,Math.PI*2);c.fillStyle='#333341';c.fill();
  const shine=c.createLinearGradient(cam.x-500,cam.y-500,cam.x+500,cam.y+400);shine.addColorStop(0,'#b8b0d032');shine.addColorStop(.4,'#ffffff00');shine.addColorStop(1,'#8de7ef06');
  surf(c,[[-8.36,11.14,-2.98],[8.36,11.14,-2.98],[8.36,1.1,-1.26],[-8.36,1.1,-1.26]],cam,shine);
  c.restore();
}
function backdrop(t){
  c.fillStyle=C.bg;c.fillRect(0,0,W,H);
  glow(c,1480+Math.sin(t*.16)*120,420,1030,'#312054',.42);
  glow(c,250,1100,950,'#12252b',.52);
  glow(c,1020,1120,700,'#5d476e',.16);
  // Fine horizon for a spacious studio floor.
  const grad=c.createLinearGradient(0,800,0,1080);grad.addColorStop(0,'#14141c00');grad.addColorStop(1,'#22202b44');c.fillStyle=grad;c.fillRect(0,800,W,280);
}
function caption(s,x,y,size=82,color=C.white,weight=480,align='left'){txt(c,s,x,y,size,color,weight,align)}
function eyebrow(s,x,y,color=C.violet,align='left'){c.save();c.letterSpacing='4px';txt(c,s,x,y,15,color,600,align);c.restore()}
function shotIntro(t){
  const p=range(t,0,4.8),entry=range(t,0,1.1);
  desktop(t);
  const cam={x:mix(1450,1370,p),y:mix(750,720,p),scale:mix(112,85,p),yaw:mix(-.33,-.2,p),pitch:mix(.13,.25,p)};
  laptop(t,cam,entry);
  c.save();c.globalAlpha=range(t,.3,1.2);
  eyebrow('MEET CUE',135,340);
  caption('Stay in the',130,452,85);
  caption('conversation.',130,551,85,C.violet);
  txt(c,'A quieter way to find your next words.',136,621,25,'#a6a0b6');
  c.restore();
}
function shotLaptop(t){
  let p=range(t,4.6,9.2);desktop(t);
  eyebrow('PRESENT, WITH A LITTLE HELP',960,100,C.violet,'center');
  caption('The right words.',960,194,79,C.white,480,'center');
  caption('Right on cue.',960,281,79,C.violet,480,'center');
  laptop(t,{x:960,y:665,scale:mix(44.5,43,p),yaw:mix(-.18,.13,p),pitch:mix(.29,.34,p)});
}
function featureShell(g,title,sub){
  g.clearRect(0,0,1200,900);
  const bg=g.createLinearGradient(0,0,1200,900);bg.addColorStop(0,'#30283d');bg.addColorStop(1,'#15141f');
  rr(g,7,7,1186,886,40,bg,'#74617f',2);
  toolbar(g,44,40,1112,false,0);
  txt(g,title,62,198,30,C.white,500);txt(g,sub,62,244,24,'#a6a0b6');
}
function codeCard(t){
  featureShell(q,'Explain the approach','Synthetic demo · code + reasoning');
  rr(q,48,283,1104,425,24,'#0e1019','#393440',1.3);
  txt(q,'PYTHON',78,324,15,'#8e879f',600);
  const rows=[
    [['def ',C.violet],['find_index',C.cyan],['(items, target):',C.white]],
    [['    lo, hi ',C.white],['= ',C.violet],['0, len(items) - 1', '#e7c89e']],
    [['    while ',C.violet],['lo <= hi:',C.white]],
    [['        mid ',C.white],['= ',C.violet],['(lo + hi) // 2', '#e7c89e']],
    [['        if ',C.violet],['items[mid] == target:',C.white]],
    [['            return ',C.violet],['mid',C.cyan]],
    [['        elif ',C.violet],['items[mid] < target:',C.white]],
    [['            lo ',C.white],['= ',C.violet],['mid + 1', '#e7c89e']],
    [['        else',C.violet],[': hi = mid - 1',C.white]],
    [['    return ',C.violet],['-1','#e7c89e']],
  ];
  rows.forEach((row,i)=>{txt(q,String(i+1).padStart(2,'0'),77,369+i*35,23,'#555363',400,'left',MONO);let x=130;row.forEach(([s,col])=>{txt(q,s,x,369+i*35,25,col,400,'left',MONO);x+=q.measureText(s).width})});
  rr(q,49,737,318,99,20,'#282033','#60516b');txt(q,'TIME COMPLEXITY',73,772,14,'#9d8caf',600);txt(q,'O(log n)',73,812,32,C.cyan,500, 'left',MONO);
  txt(q,'Halve the search space.',404,777,28,C.white,500);txt(q,'One clear step at a time.',404,817,25,'#aaa2b8');
}
function modelsCard(t){
  featureShell(q,'Make Cue yours','Choose your provider. Bring your context.');
  txt(q,'CHAT PROVIDER',65,313,17,C.violet,600);
  const ps=[['OpenAI',true],['Anthropic',false],['Gemini',false],['Custom',false]];
  ps.forEach(([s,a],i)=>pill(q,s,62+i*271,341,253,62,a));
  txt(q,'CONTEXT',65,467,17,C.violet,600);
  const items=[['Live transcript','The conversation, as it happens.'],['Screen context','Add what is in front of you.'],['Your notes','Keep the important details close.']];
  items.forEach(([s,d],i)=>{let y=500+i*96;rr(q,62,y,1076,78,18,'#211d2b','#40364b');rr(q,85,y+25,28,28,8,'#3e3554','#7d6c96');txt(q,'✓',99,y+47,23,C.cyan,500,'center');txt(q,s,139,y+35,25,C.white,500);txt(q,d,139,y+64,21,'#9f96af')});
  txt(q,'Your keys. Your choice.',65,853,24,'#c0b5ce',450);
}
function floating(img,t,opts={}){
  const x=opts.x??1335,y=opts.y??560,scale=opts.scale??.75,yaw=opts.yaw??-.12;
  c.save();c.translate(x,y);c.rotate(Math.sin(t*.25)*.009+(opts.rotate??-.025));
  c.shadowColor='#000000b0';c.shadowBlur=70;c.shadowOffsetY=45;
  if(!opts.bare)rr(c,-img.width*scale/2,-img.height*scale/2,img.width*scale,img.height*scale,34,'#201b2a');
  if(!opts.bare)c.shadowColor='transparent';
  c.drawImage(img,-img.width*scale/2,-img.height*scale/2,img.width*scale,img.height*scale);
  c.shadowColor='transparent';
  const shine=c.createLinearGradient(-450,-350,450,350);shine.addColorStop(0,'#c9b1ff11');shine.addColorStop(.4,'#ffffff00');shine.addColorStop(1,'#8de7ef03');
  if(!opts.bare)rr(c,-img.width*scale/2,-img.height*scale/2,img.width*scale,img.height*scale,34,shine);
  c.restore();
}
function shotCode(t){
  codeCard(t);const p=range(t,8.8,14.7);
  eyebrow('MAKE THE COMPLEX FEEL CLEAR',135,304);
  caption('Context in.',130,414,88);
  caption('Clarity out.',130,519,88,C.violet);
  txt(c,'Code, reasoning, and the next useful step.',136,590,25,'#aaa2b7');
  floating(card,t,{x:mix(1390,1350,p),y:545,scale:mix(.72,.76,p)});
  // A small original glass chip adds a second layer of depth.
  c.save();c.translate(902,882);c.rotate(-.04);rr(c,0,0,330,72,20,'#181723','#4c405d');waveform(c,21,36,t,68);txt(c,'Listening for context',111,45,19,'#bdb3cf');c.restore();
}
function shotModels(t){
  modelsCard(t);const p=range(t,14.2,19.4);
  eyebrow('BUILT AROUND THE WAY YOU WORK',135,305);
  caption('Your models.',130,418,86);
  caption('Your context.',130,521,86,C.violet);
  txt(c,'A familiar place for your own setup.',136,593,25,'#aaa2b7');
  floating(card,t,{x:mix(1355,1325,p),y:548,scale:mix(.74,.77,p),rotate:.018});
}
function privacyCard(t){
  q.clearRect(0,0,1200,900);
  toolbar(q,69,142,1062,true,t);
  rr(q,69,274,1062,464,32,'#201b2a','#554763',1.5);dots(q,62,267,1076,478,39);
  markAt(q,109,313,45);txt(q,'Incognito mode',178,348,35,C.white,500);
  line(q,109,391,1091,391,'#51455e');
  txt(q,'Keep your focus.',109,466,52,C.white,500);
  txt(q,'Stay in the conversation.',109,532,39,'#b6a8cb',400);
  rr(q,109,590,591,70,22,'#30273d','#655375');
  txt(q,'Screen-share protection requested',137,635,25,C.cyan,500);
}
function shotPrivacy(t){
  privacyCard(t);
  eyebrow('INCOGNITO MODE',960,125,C.violet,'center');
  caption('A little more private.',960,221,80,C.white,480,'center');
  floating(card,t,{x:960,y:641,scale:.91,rotate:0,bare:true});
  txt(c,'Requests screen-share protection. Capture behavior varies by app and platform.',960,1025,19,'#8c839e',400,'center');
}
function shotEnd(t){
  const p=range(t,22.5,25.8);
  glow(c,960,520,680,'#342154',.55);
  c.save();c.globalAlpha=.3;for(let i=0;i<4;i++){c.beginPath();c.ellipse(960,575,370+i*105+p*70,110+i*44,0,0,Math.PI*2);c.strokeStyle=`rgba(164,147,255,${.12-i*.02})`;c.lineWidth=1;c.stroke()}c.restore();
  c.save();c.globalAlpha=range(t,22.6,23.4);c.translate(0,mix(25,0,p));
  markAt(c,737,372,143);
  caption('Cue',918,508,172,C.white,500);
  caption('The right words. Right on cue.',960,618,34,'#b8adc9',400,'center');
  eyebrow('YOUR DESKTOP. A LITTLE CLEARER.',960,727,C.violet,'center');
  c.restore();
}
const shots=[{start:0,end:4.9,fn:shotIntro},{start:4.45,end:9.35,fn:shotLaptop},{start:8.9,end:14.85,fn:shotCode},{start:14.4,end:19.45,fn:shotModels},{start:19,end:23.35,fn:shotPrivacy},{start:22.9,end:27,fn:shotEnd}];
window.renderFrame=function(t){
  canvas.width=W;canvas.height=H;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  backdrop(t);
  const shot=shots.find((s,i)=>t>=s.start&&t<s.end&&(i===shots.length-1||t<shots[i+1].start));
  // Cross-dissolves use an isolated layer to avoid alpha accumulating in geometry.
  let idx=0;for(let i=0;i<shots.length;i++)if(t>=shots[i].start)idx=i;
  if(idx>0&&t<shots[idx-1].end){shots[idx-1].fn(t);const a=range(t,shots[idx].start,shots[idx-1].end);const oc=document.createElement('canvas');oc.width=W;oc.height=H;const og=oc.getContext('2d');og.drawImage(canvas,0,0);backdrop(t);shots[idx].fn(t);c.save();c.globalAlpha=1-a;c.drawImage(oc,0,0);c.restore();}
  else shots[idx].fn(t);
  // A restrained monochromatic vignette gives all shots the same lens character.
  const v=c.createRadialGradient(960,540,400,960,540,1150);v.addColorStop(0,'#00000000');v.addColorStop(1,'#00000070');c.fillStyle=v;c.fillRect(0,0,W,H);
  const fade=range(t,0,.45)*(1-range(t,26.4,27));if(fade<1){c.fillStyle=`rgba(7,7,12,${1-fade})`;c.fillRect(0,0,W,H)}
  return true;
};
