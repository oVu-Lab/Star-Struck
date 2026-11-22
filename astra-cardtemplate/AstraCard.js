// AstraCard — reusable holographic Commander card component (Three.js r128, WebGL).
// Vanilla ES module. No build step required. See README.md for the integration API.
import * as THREE from 'three'; // pinned local r128 package (three@0.128.0)

const W = 1152, H = 1744;
const VS = `varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const COM = `precision highp float;varying vec2 vUv;varying vec3 vP;uniform vec3 uCam,uTint;uniform float uP;
const vec2 PX=vec2(1./1152.,1./1744.);
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1.,0.)),f.x),mix(hs(i+vec2(0.,1.)),hs(i+vec2(1.,1.)),f.x),f.y);}
vec3 hue(float h){return .5+.5*cos(6.2832*(h+vec3(0.,.33,.67)));}
vec3 cpal(float x){float t=fract(x)*5.;vec3 c0=vec3(.08,.88,1.),c1=vec3(.28,.62,1.),c2=vec3(.68,.36,1.),c3=vec3(1.,.34,.74),c4=vec3(1.,.78,.24);
if(t<1.)return mix(c0,c1,t);if(t<2.)return mix(c1,c2,t-1.);if(t<3.)return mix(c2,c3,t-2.);if(t<4.)return mix(c3,c4,t-3.);return mix(c4,c0,t-4.);}
float lm(vec3 c){return dot(c,vec3(.299,.587,.114));}
float rr(vec2 p){vec2 q=abs(p)-vec2(.94,1.44);return length(max(q,0.))+min(max(q.x,q.y),0.)-.06;}`;
const FS = COM + `uniform sampler2D tB,tC,tF,tD,tT;uniform vec4 uFB;vec2 FU(vec2 u){return (u-uFB.xy)/(uFB.zw-uFB.xy);}
const vec2 AN[9]=vec2[9](vec2(.05,.96),vec2(.95,.96),vec2(.05,.04),vec2(.95,.04),vec2(.17,.63),vec2(.83,.63),vec2(.113,.26),vec2(.356,.406),vec2(.65,.8));
float cr(vec2 d){d*=vec2(2.,3.);return exp(-length(d)*45.)+.6*(exp(-abs(d.x)*300.-abs(d.y)*12.)+exp(-abs(d.y)*300.-abs(d.x)*12.));}
void main(){
float sd=rr((vUv-.5)*vec2(2.,3.));float fw=fwidth(sd)+1e-4;float cov=1.-smoothstep(-fw,fw,sd);if(cov<=0.)discard;
vec3 v=normalize(uCam-vP);vec2 tv=v.xy/max(v.z,.3);vec2 vd=tv/vec2(2.,3.);float ph=uP/6.2832;
vec2 uL=.5+vec2(-tv.x*1.4+.1*sin(uP),-tv.y*1.1+.08*cos(uP));
vec3 Ld=normalize(vec3((uL-.5)*vec2(2.,3.)*.9,1.1));
vec2 dir=normalize(vec2(.8,.6));float sp=-.4+1.8*fract(ph);
float band=exp(-pow((dot(vUv-.5,dir)+.5-sp)*11.,2.));
// ---- background
vec2 uB=clamp(mix(vec2(.03),vec2(.97),vUv-vd*.22),.002,.998);
vec3 cb=texture2D(tB,uB,1.3).rgb;float lb=lm(cb);
float ed=abs(lm(texture2D(tB,uB+vec2(PX.x*2.,0.)).rgb)-lm(texture2D(tB,uB-vec2(PX.x*2.,0.)).rgb))+abs(lm(texture2D(tB,uB+vec2(0.,PX.y*2.)).rgb)-lm(texture2D(tB,uB-vec2(0.,PX.y*2.)).rgb));
float dark=(1.-smoothstep(.14,.4,lb))*(1.-smoothstep(.05,.22,ed));
vec2 dc=(uB-vec2(.5,.685))*vec2(2.,3.);float ang=atan(dc.y,dc.x),rad=length(dc);
float rays=.5+.5*sin(ang*22.+rad*5.+tv.x*7.+tv.y*5.);
float gr=sin((uB.x*2.+uB.y*3.)*300.+(tv.x+tv.y)*16.);
vec3 ir=hue(rad*.8+tv.x*1.3+tv.y*.8+.12*rays)*(.3+.6*rays)+hue(ang/6.2832*2.+tv.y*1.2+.4)*.22*(.5+.5*gr);
vec2 g=uB*vec2(50.,75.);vec2 id=floor(g),f=fract(g);float h0=hs(id);
vec2 df=f-(.5+.24*(vec2(hs(id+1.),hs(id+2.))-.5));float a0=hs(id+4.)*6.2832;float cs0=cos(a0),sn0=sin(a0);
vec2 rf=vec2(df.x*cs0-df.y*sn0,df.x*sn0+df.y*cs0);float tp=hs(id+5.);float shp=0.;
if(tp<.60){shp=1.-smoothstep(.04,.26,abs(rf.x)*1.35+abs(rf.y));}
else if(tp<.85){shp=exp(-dot(df,df)*18.)*.42;}
else{shp=exp(-abs(df.y)*24.)*(1.-smoothstep(0.,.46,abs(df.x)))+exp(-abs(df.x)*24.)*(1.-smoothstep(0.,.46,abs(df.y)))+exp(-length(df)*20.)*.4;}
float twf=1.+floor(hs(id+8.)*2.);float st=step(.95,h0)*shp*(.28+.72*(.5+.5*sin(6.2832*ph*twf+h0*60.)));
vec3 bg=cb+(ir*.12+st*cpal(hs(id+3.)+ph*.25)*1.10)*dark;
float gold=(1.-dark)*smoothstep(.25,.55,lb);
bg+=gold*vec3(1.,.78,.42)*(.15+.5*band+.35*pow(.5+.5*sin(dot(uB,vec2(9.,6.))*3.+tv.x*5.),3.));
// ---- flow dust + sparkles (between bg and subject)
vec3 dust=vec3(0.);
for(int k=0;k<2;k++){float fk=float(k);vec2 u=vUv-vd*(.12+.06*fk);
float s=u.x*(5.+fk*3.)+u.y*3.+sin(u.y*9.+6.2832*ph+fk*2.)*.3;
float fl=pow(.5+.5*sin(s*8.+6.2832*ph*(1.+fk)+sin(u.x*13.+u.y*7.+tv.x*3.)*1.6),7.);
float dn=vn(u*vec2(60.,90.)+fk*13.)*.6+vn(u*vec2(140.,210.)+fk*29.)*.4;
fl*=.35+.65*dn;
dust+=fl*mix(vec3(1.,.8,.45),vec3(.6,.95,1.),fk)*.28;}
{vec2 us=vUv-vd*.1;vec2 gg=us*vec2(26.,39.);vec2 ci=floor(gg),cf=fract(gg);float q=hs(ci+7.);
if(q>.72){vec2 ct=.5+.28*vec2(sin(6.2832*ph+q*40.),cos(6.2832*ph+q*70.));vec2 df=cf-ct;
vec3 n=normalize(vec3((vec2(hs(ci),hs(ci+3.))-.5)*1.8,.7));
float flSpec=pow(max(dot(n,normalize(Ld+v)),0.),18.);float mf=1.+floor(hs(ci+11.)*2.);
float mTw=.30+.70*(.5+.5*sin(6.2832*ph*mf+q*50.));float fl=(.26+.74*flSpec)*mTw;
float a1=hs(ci+15.)*6.2832;float cs1=cos(a1),sn1=sin(a1);vec2 rf=vec2(df.x*cs1-df.y*sn1,df.x*sn1+df.y*cs1);
float mt=hs(ci+13.);float shp=0.;
if(mt<.60){shp=1.-smoothstep(.02,.22,abs(rf.x)*1.4+abs(rf.y));}
else if(mt<.85){shp=exp(-((rf.x*1.6)*(rf.x*1.6)+(rf.y*.85)*(rf.y*.85))*18.)*.40;}
else if(mt<.95){shp=(exp(-abs(df.y)*28.)*(1.-smoothstep(0.,.45,abs(df.x)))+exp(-abs(df.x)*28.)*(1.-smoothstep(0.,.45,abs(df.y))))*.9+exp(-length(df)*22.)*.45;}
else{float gf=pow(.5+.5*sin(6.2832*ph*mf+q*50.),4.);fl=(.25+1.10*gf)*(.45+.55*flSpec);
shp=(exp(-abs(df.y)*26.)*(1.-smoothstep(0.,.48,abs(df.x)))+exp(-abs(df.x)*26.)*(1.-smoothstep(0.,.48,abs(df.y))))+exp(-length(df)*18.)*.55;}
dust+=fl*shp*cpal(hs(ci+9.)+.08*sin(6.2832*ph+q*20.))*1.15;}}
float sa=0.;for(int i=0;i<4;i++){vec2 o=vec2(float(i%2)-.5,float(i/2)-.5)*.02;sa+=texture2D(tC,vUv+(.5-uL)*.12+o,2.5).a;}sa*=.25;
vec3 col=(bg+dust*.9)*(1.-.45*sa)+dust*.1;
// ---- subject: relief ray-march
float z=1.,dz=1./28.;vec2 uvr=vUv,du=-vd*.16*dz;
for(int i=0;i<28;i++){if(texture2D(tD,uvr).r>=z)break;z-=dz;uvr+=du;}
vec2 a=uvr-du,b=uvr;float za=z+dz,zb=z;
for(int i=0;i<5;i++){vec2 m=(a+b)*.5;float zm=(za+zb)*.5;if(texture2D(tD,m).r>=zm){b=m;zb=zm;}else{a=m;za=zm;}}
uvr=clamp(b,0.,1.);
vec4 tc=texture2D(tC,uvr);float ca=tc.a;vec3 cc=tc.rgb/max(ca,.004);
vec2 e=PX*3.;float hx=texture2D(tD,uvr+vec2(e.x,0.)).r-texture2D(tD,uvr-vec2(e.x,0.)).r;float hy=texture2D(tD,uvr+vec2(0.,e.y)).r-texture2D(tD,uvr-vec2(0.,e.y)).r;
vec3 n=normalize(vec3(-clamp(vec2(hx,hy)*2.5,-.45,.45),1.));
float hl=dot(n,Ld)*.5+.5;
float lit=.9+.24*hl-.05*smoothstep(.08,.3,length(vec2(hx,hy)));
vec2 e2=PX*1.5;vec4 tr=texture2D(tC,uvr+vec2(e2.x,0.)),tl=texture2D(tC,uvr-vec2(e2.x,0.)),tu=texture2D(tC,uvr+vec2(0.,e2.y)),td=texture2D(tC,uvr-vec2(0.,e2.y));
float ink=dot(vec2(lm(tr.rgb)-lm(tl.rgb),lm(tu.rgb)-lm(td.rgb)),normalize(Ld.xy+1e-3))*1.2;
cc=cc*lit*(1.+ink*.5);
float lc=lm(cc);float mx=max(cc.r,max(cc.g,cc.b));float sat=(mx-min(cc.r,min(cc.g,cc.b)))/(mx+.01);
float fm=1.-smoothstep(.2,.3,length((uvr-vec2(.512,.72))*vec2(2.,3.)));
float metal=smoothstep(.36,.56,sat)*smoothstep(.45,.7,lc)*(1.-fm);
float br=.65+.35*sin(uvr.x*900.+sin(uvr.y*45.)*4.);
float spc=pow(max(dot(n,normalize(Ld+v)),0.),36.)*br*metal*(1.-smoothstep(.75,.95,lc));
cc+=(1.-exp(-spc*2.))*vec3(1.,.86,.55)*.9+metal*vec3(1.,.8,.5)*.18*(.5+.5*sin(dot(uvr,vec2(14.,9.))+tv.x*6.));
float ea=abs(tr.a-tl.a)+abs(tu.a-td.a);
cc+=smoothstep(.05,.5,ea)*pow(1.-v.z,1.5)*(1.-fm)*vec3(1.,.93,.8)*.4;
cc*=1.-.12*texture2D(tF,FU(uvr+(uL-.5)*.03),2.).a;
vec3 ov=max(cc-.82,0.);cc=min(cc,.82)+.16*(1.-exp(-ov*6.));
col=mix(col,cc,ca);
// ---- frame (foil)
vec2 uf=FU(vUv);vec4 fr=texture2D(tF,uf,.4);float fa=fr.a;vec3 fc=fr.rgb/max(fa,.004);
float rel=dot(vec2(lm(texture2D(tF,uf+vec2(PX.x*1.5,0.)).rgb)-lm(texture2D(tF,uf-vec2(PX.x*1.5,0.)).rgb),lm(texture2D(tF,uf+vec2(0.,PX.y*1.5)).rgb)-lm(texture2D(tF,uf-vec2(0.,PX.y*1.5)).rgb)),normalize(Ld.xy+1e-3))*2.5;
float th=fa-texture2D(tF,uf-normalize(Ld.xy+1e-3)*.0016).a;
float t=.5+.5*sin(dot(vUv,vec2(5.,7.))*3.+tv.x*5.+tv.y*4.+uP);
vec3 c2=mix(vec3(.82,.9,1.),uTint*2.,.25);
vec3 mc=mix(mix(vec3(1.,.82,.45),c2,smoothstep(.2,.6,t)),vec3(.95,.82,.9),smoothstep(.62,.95,t)*.3);
float gl=pow(.5+.5*sin(dot(vUv,vec2(9.,13.))+tv.x*9.+tv.y*5.),4.);
vec3 fcol=fc*.55+mc*lm(fc)*(.7+1.3*gl+1.6*band)+rel*.6+th*.5;
col=mix(col,fcol,fa);
vec2 tq=vUv-vd*.015;vec2 ts=vec2(tq.x,(tq.y-.86)/.14);
if(ts.y>0.&&ts.y<1.&&ts.x>0.&&ts.x<1.){vec4 tt=texture2D(tT,ts);vec3 tcl=tt.rgb/max(tt.a,.004);
tcl*=.94+.2*pow(.5+.5*sin(dot(vUv,vec2(16.,4.))+tv.x*6.),3.)+.5*band;col=mix(col,min(tcl,1.),tt.a);}
// ---- glass sweep, spotlight, 4-point stars
col+=band*vec3(1.,.95,.85)*.2*(1.-fm*.5);
vec2 sl=(vUv-uL)*vec2(2.,3.);col+=exp(-dot(sl,sl)*.9)*.07;
float stv=0.;for(int i=0;i<9;i++){vec2 A=AN[i];float pk=exp(-pow((dot(A-.5,dir)+.5-sp)*9.,2.));stv+=cr(vUv-A)*(.3+1.4*pk);}
col+=stv*vec3(1.,.93,.75)*.9;
vec2 g2=vUv*vec2(90.,135.);vec2 c2i=floor(g2);vec3 rn=normalize(vec3(vec2(hs(c2i+1.),hs(c2i+2.))-.5,.45));
vec2 df2=fract(g2)-.5;float r2a=hs(c2i+4.)*6.2832;float cs2=cos(r2a),sn2=sin(r2a);
vec2 rf2=vec2(df2.x*cs2-df2.y*sn2,df2.x*sn2+df2.y*cs2);float dia2=1.-smoothstep(.03,.34,abs(rf2.x)*1.25+abs(rf2.y));
float tw=pow(max(dot(rn,normalize(Ld+v)),0.),22.)*step(.72,hs(c2i))*dia2*(.45+.55*sin(ph*12.5664+hs(c2i)*50.));
col+=tw*cpal(hs(c2i+5.)+.1*sin(ph*6.2832+hs(c2i)*30.))*(fa*1.4+ca*(.45+metal*1.5)*(1.-fm)+dark*.90);
gl_FragColor=vec4(min(col,1.),cov);}`;
const SFS = COM + `uniform float uI;void main(){float sd=rr((vUv-.5)*vec2(2.,3.));float fw=fwidth(sd)+1e-4;float cov=1.-smoothstep(-fw,fw,sd);if(cov<=0.)discard;
vec3 v=normalize(uCam-vP);float t=.5+.5*sin(dot(vUv,vec2(3.,5.))*2.+v.x*6.+v.y*4.+uI*.5);
float br=.55+.45*sin(vUv.x*500.+sin(vUv.y*20.)*2.+uI);
vec3 m=mix(vec3(.5,.4,.22),vec3(.96,.86,.62),t*t)*(.55+.45*br)+smoothstep(-.03,0.,sd)*.3;gl_FragColor=vec4(m,cov);}`;
const PVS = `attribute vec3 seed;attribute vec4 meta;uniform float uP,uZ,uS,uPr,uCs;varying float vA,vF,vIr;varying vec4 vM;
void main(){float t=meta.x;float k=t>=.60&&t<.85?1.+floor(seed.z*1.3):1.+floor(seed.z*3.);
float f=fract(seed.y+uP/6.2831853*k);float ph=meta.z*6.2831853;
float fg=step(.01,uZ);float spanX=mix(3.4,1.44,fg);float spanY=mix(4.,2.16,fg);
float driftX=sin(uP*k+seed.z*31.4159)*(.030+.025*meta.w)+cos(uP+ph)*.020;
float driftY=sin(uP*2.+ph)*.018;
vec3 p=vec3((seed.x-.5)*spanX+driftX,(f-.5)*spanY+driftY,uZ+(seed.z-.5)*.3);
vec4 mv=modelViewMatrix*vec4(p,1.);float edge=sin(f*3.14159265);
float twFreq=1.+floor(meta.w*3.);float tw1=.5+.5*sin(uP*twFreq+ph);
float tw2=.5+.5*sin(uP*(twFreq+1.)+seed.x*43.9823);float flash=0.;float szM=1.25;
if(t<.60){vA=edge*(.32+.68*smoothstep(.12,.95,tw1*.65+tw2*.35));szM=1.25;}
else if(t<.85){vA=edge*(.22+.46*tw1);szM=1.45;}
else if(t<.95){vA=edge*(.34+.66*pow(max(tw1,1e-4),2.2));szM=1.90;}
else{flash=pow(max(tw1*.5+tw2*.5,1e-4),6.);vA=edge*(.36+.94*flash);szM=2.15+.30*flash;}
vM=meta;vF=flash;vIr=sin(uP+ph);gl_PointSize=uS*(.5+seed.z)*szM*uPr*uCs*300./-mv.z;gl_Position=projectionMatrix*mv;}`;
const PFS = `precision highp float;varying float vA,vF,vIr;varying vec4 vM;
vec3 pal(float x){float t=fract(x)*5.;vec3 c0=vec3(.08,.88,1.),c1=vec3(.28,.62,1.),c2=vec3(.68,.36,1.),c3=vec3(1.,.34,.74),c4=vec3(1.,.78,.24);
if(t<1.)return mix(c0,c1,t);if(t<2.)return mix(c1,c2,t-1.);if(t<3.)return mix(c2,c3,t-2.);if(t<4.)return mix(c3,c4,t-3.);return mix(c4,c0,t-4.);}
void main(){vec2 p=gl_PointCoord-.5;float t=vM.x;float rot=t<.85?vM.z*6.2831853:(vM.z-.5)*.56;
float cs=cos(rot),sn=sin(rot);vec2 rp=vec2(p.x*cs-p.y*sn,p.x*sn+p.y*cs);
vec3 col=pal(vM.y+vF*.14+vIr*.06);vec3 rgb=col;float alpha=0.;
if(t<.60){float ax=abs(rp.x)*(1.25+.45*vM.w),ay=abs(rp.y);
float dDia=ax+ay;float core=1.-smoothstep(.18,.38,dDia);
float edgeGlow=exp(-dDia*8.)*(.18+.18*step(.55,vM.w));
alpha=clamp(core*.92+edgeGlow,0.,1.)*vA*.88;}
else if(t<.85){float dDust=length(vec2(rp.x*1.5,rp.y*.85));float mask=1.-smoothstep(.12,.5,length(p));
alpha=exp(-dDust*dDust*14.)*mask*vA*.45;}
else if(t<.95){float rayH=exp(-abs(rp.y)*26.)*(1.-smoothstep(0.,.49,abs(rp.x)));
float rayV=exp(-abs(rp.x)*26.)*(1.-smoothstep(0.,.49,abs(rp.y)));
float core=exp(-length(rp)*18.);float halo=exp(-dot(rp,rp)*18.)*.16;
alpha=clamp((rayH+rayV)*.95+core*.85+halo,0.,1.2)*vA*.92;rgb=mix(col,vec3(1.,.98,.96),clamp(core*.55,0.,1.));}
else{vec2 rp45=.70710678*vec2(rp.x-rp.y,rp.x+rp.y);
float r1=exp(-abs(rp.y)*24.)*(1.-smoothstep(0.,.5,abs(rp.x)))+exp(-abs(rp.x)*24.)*(1.-smoothstep(0.,.5,abs(rp.y)));
float r2=(exp(-abs(rp45.y)*32.)*(1.-smoothstep(0.,.32,abs(rp45.x)))+exp(-abs(rp45.x)*32.)*(1.-smoothstep(0.,.32,abs(rp45.y))))*.45;
float core=exp(-length(rp)*15.);float halo=exp(-dot(rp,rp)*14.)*(.22+.26*vF);
alpha=clamp((r1+r2)*.95+core+halo,0.,1.3)*vA*.95;rgb=mix(col,vec3(1.,.99,.97),clamp(core*.6+vF*.18,0.,1.));}
if(alpha<=.004)discard;gl_FragColor=vec4(rgb,clamp(alpha,0.,1.));}`;

// ---------------------------------------------------------------- module config
const DEFAULT_ASSETS = Object.freeze({
  bg: new URL('./assets-astra/bg.jpeg', import.meta.url).href,
  character: new URL('./assets-astra/character.png', import.meta.url).href,
  frame: new URL('./assets-astra/frame.png', import.meta.url).href,
  depth: new URL('./assets-astra/depth.jpeg', import.meta.url).href
});
const DEFAULT_FRAME = Object.freeze({
  crop: [30, 38, 1095, 1674], // outermost gold line of frame.png -> card edge
  clear: [
    [110, 112, 185, H - 112],
    [970, 112, 1048, H - 112],
    [112, 116, 1040, 200],
    [112, 1550, 1040, 1634]
  ] // inner rail ring removed; outer beaded border + corner ornaments kept
});
const DEFAULT_FONT = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&display=swap';
const CSS_URL = new URL('./AstraCard.css', import.meta.url).href;

export const ASTRA_CARD_DEFAULTS = Object.freeze({
  tilt: 1,
  autoplay: true,
  animateEffects: true,
  interactive: true,
  selectable: true,
  selected: false,
  studio: false,
  glow: null,
  css: true,
  fontUrl: DEFAULT_FONT
});

/** Standard preset for stationary game-UI cards: 0° locked card body (no sway/tilt), while sparkles, flowing dust, star flares, glass sweep & particles keep animating. */
export const ASTRA_CARD_STATIC_OPTIONS = Object.freeze({
  autoplay: false,
  interactive: false,
  tilt: 0,
  animateEffects: true
});

// ---------------------------------------------------------------- one-time document helpers (idempotent, shared across instances)
function ensureCss() {
  if (document.getElementById('astra-card-css')) return;
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    const rawHref = link.getAttribute('href') || '';
    if (link.href === CSS_URL || /(?:^|\/)AstraCard\.css(?:[?#]|$)/.test(rawHref)) return;
  }
  const l = document.createElement('link');
  l.id = 'astra-card-css';
  l.rel = 'stylesheet';
  l.href = CSS_URL;
  document.head.appendChild(l);
}

const fontCache = new Map();
function ensureFont(url) {
  if (!url) return Promise.resolve();
  if (fontCache.has(url)) return fontCache.get(url);
  if (typeof document !== 'undefined') {
    try {
      if (document.fonts?.check?.('700 16px "Cinzel Decorative"')) {
        const resolved = Promise.resolve();
        fontCache.set(url, resolved);
        return resolved;
      }
    } catch {
      // Ignore font check issues on partial DOM mocks
    }
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      const rawHref = link.getAttribute('href') || '';
      if (
        link.href === url ||
        rawHref === url ||
        link.href?.includes('Cinzel+Decorative') ||
        rawHref.includes('Cinzel+Decorative')
      ) {
        const resolved = Promise.resolve();
        fontCache.set(url, resolved);
        return resolved;
      }
    }
  }
  const p = new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
    setTimeout(res, 1200);
  });
  fontCache.set(url, p);
  return p;
}

const loadImg = s => new Promise((r, j) => {
  const i = new Image();
  i.crossOrigin = 'anonymous';
  i.onload = () => r(i);
  i.onerror = () => j(new Error('AstraCard: failed to load ' + s));
  i.src = s;
});

// ---------------------------------------------------------------- image pre-processing (cached per asset set & shared by instances)
const cv = img => {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  return [c, x];
};
const cl = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// If alpha channel is missing: key background out (white or edge-connected black for subject; checkerboard-gray for frame)
function fix(x, m) {
  const d = x.getImageData(0, 0, W, H), p = d.data;
  let has = 0;
  for (let i = 3; i < p.length; i += 1588) {
    if (p[i] < 250) { has = 1; break; }
  }
  if (has) return;

  if (m === 'w') {
    const cornerIdx = [0, (W - 1) * 4, (H - 1) * W * 4, (H * W - 1) * 4];
    const darkCorners = cornerIdx.every(idx => Math.max(p[idx], p[idx + 1], p[idx + 2]) < 16);
    if (darkCorners) {
      // Safe exterior flood-fill for black-matte JPEG exports without punching holes in dark interior armor
      const visited = new Uint8Array(W * H);
      const q = new Int32Array(W * H);
      let head = 0, tail = 0;
      const push = idx => {
        if (visited[idx]) return;
        const o = idx * 4;
        if (Math.max(p[o], p[o + 1], p[o + 2]) < 18) {
          visited[idx] = 1;
          q[tail++] = idx;
        }
      };
      for (let bx = 0; bx < W; bx++) { push(bx); push((H - 1) * W + bx); }
      for (let by = 0; by < H; by++) { push(by * W); push(by * W + (W - 1)); }
      while (head < tail) {
        const idx = q[head++];
        const py = (idx / W) | 0, px = idx - py * W;
        p[idx * 4 + 3] = 0;
        if (px > 0) push(idx - 1);
        if (px < W - 1) push(idx + 1);
        if (py > 0) push(idx - W);
        if (py < H - 1) push(idx + W);
      }
      x.putImageData(d, 0, 0);
      return;
    }
  }

  for (let i = 0; i < p.length; i += 4) {
    let a;
    if (m === 'w') {
      a = cl((250 - Math.min(p[i], p[i + 1], p[i + 2])) / 28);
      if (a > 0 && a < 1) {
        for (let k = 0; k < 3; k++) {
          p[i + k] = Math.max(0, Math.min(255, (p[i + k] - 255 * (1 - a)) / a));
        }
      }
    } else {
      a = cl((p[i] - p[i + 2] - 14) / 36);
    }
    p[i + 3] = a * 255;
  }
  x.putImageData(d, 0, 0);
}

function blur(a, r) {
  const t = new Float32Array(a.length);
  const wMax = W - 1;
  const hMax = H - 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let sum = 0;
    let count = 0;
    for (let k = 0; k <= r && k < W; k++) {
      sum += a[row + k];
      count++;
    }
    for (let x = 0; x < W; x++) {
      if (x > 0) {
        const addIdx = x + r;
        if (addIdx <= wMax) { sum += a[row + addIdx]; count++; }
        const remIdx = x - r - 1;
        if (remIdx >= 0) { sum -= a[row + remIdx]; count--; }
      }
      t[row + x] = sum / count;
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k <= r && k < H; k++) {
      sum += t[k * W + x];
      count++;
    }
    for (let y = 0; y < H; y++) {
      if (y > 0) {
        const addIdx = y + r;
        if (addIdx <= hMax) { sum += t[addIdx * W + x]; count++; }
        const remIdx = y - r - 1;
        if (remIdx >= 0) { sum -= t[remIdx * W + x]; count--; }
      }
      a[y * W + x] = sum / count;
    }
  }
}

const titleCache = new Map();
function mkTitle(txt) {
  const key = String(txt == null ? '' : txt);
  if (!titleCache.has(key)) {
    titleCache.set(key, doMkTitle(key).catch(e => { titleCache.delete(key); throw e; }));
  }
  return titleCache.get(key);
}

async function doMkTitle(txt) {
  const c = document.createElement('canvas');
  c.width = 1152;
  c.height = 244;
  const x = c.getContext('2d');
  txt = String(txt == null ? '' : txt);
  if (!txt.trim()) return c;

  const F = '"Cinzel Decorative","Cinzel","Trajan Pro",Georgia,serif', tr = 16, ly = 120;
  let fs = 96;
  try {
    const hasFont = document.fonts?.check?.('700 ' + fs + 'px "Cinzel Decorative"');
    if (!hasFont && document.fonts?.load) {
      await Promise.race([
        document.fonts.load('700 ' + fs + 'px "Cinzel Decorative"', txt),
        new Promise(r => setTimeout(r, 800))
      ]);
    }
  } catch (e) { /* fall back to serif stack */ }

  x.textBaseline = 'alphabetic';
  x.lineJoin = 'round';
  const meas = () => {
    x.font = '700 ' + fs + 'px ' + F;
    const w = [...txt].map(ch => x.measureText(ch).width);
    return [w, w.reduce((a, b) => a + b, 0) + tr * (Math.max(txt.length, 1) - 1)];
  };
  let [ws, tw] = meas();
  if (tw > 560) {
    fs = Math.max(40, fs * 560 / tw);
    [ws, tw] = meas();
  }
  const x0 = (1152 - tw) / 2, by = ly + fs * 0.35;
  const draw = fn => {
    let px = x0;
    [...txt].forEach((ch, i) => { fn(ch, px); px += ws[i] + tr; });
  };

  // bright pearl-white celestial ornament behind the name: soft core glow, light streaks, 4-point flares
  {
    x.save();
    const R0 = tw / 2 + 90, cg = x.createRadialGradient(576, 0, 0, 576, 0, R0);
    cg.addColorStop(0, 'rgba(255,251,238,.9)');
    cg.addColorStop(0.5, 'rgba(255,245,216,.55)');
    cg.addColorStop(1, 'rgba(255,238,190,0)');
    x.save(); x.translate(0, ly); x.scale(1, 0.26); x.fillStyle = cg; x.beginPath(); x.arc(576, 0, R0, 0, 7); x.fill(); x.restore();

    const hl = x.createLinearGradient(576 - tw / 2 - 190, 0, 576 + tw / 2 + 190, 0);
    hl.addColorStop(0, 'rgba(255,250,236,0)');
    hl.addColorStop(0.5, 'rgba(255,253,244,1)');
    hl.addColorStop(1, 'rgba(255,250,236,0)');
    x.fillStyle = hl;
    x.beginPath(); x.ellipse(576, ly, tw / 2 + 190, 4, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(576, ly - 26, tw / 2 + 90, 1.4, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(576, ly + 26, tw / 2 + 90, 1.4, 0, 0, 7); x.fill();

    const vl = x.createLinearGradient(0, ly - 56, 0, ly + 56);
    vl.addColorStop(0, 'rgba(255,250,236,0)');
    vl.addColorStop(0.5, 'rgba(255,253,244,.95)');
    vl.addColorStop(1, 'rgba(255,250,236,0)');
    x.fillStyle = vl; x.beginPath(); x.ellipse(576, ly, 3, 56, 0, 0, 7); x.fill();

    const fl = (cx, cy, R) => {
      x.save();
      x.shadowColor = 'rgba(255,244,210,.95)';
      x.shadowBlur = R * 0.7;
      x.fillStyle = 'rgba(255,253,246,1)';
      const q = R * 0.1;
      x.beginPath();
      x.moveTo(cx, cy - R);
      x.quadraticCurveTo(cx + q, cy - q, cx + R * 1.6, cy);
      x.quadraticCurveTo(cx + q, cy + q, cx, cy + R);
      x.quadraticCurveTo(cx - q, cy + q, cx - R * 1.6, cy);
      x.quadraticCurveTo(cx - q, cy - q, cx, cy - R);
      x.closePath();
      x.fill();
      x.restore();
    };
    fl(x0 - 52, ly, 30); fl(x0 + tw + 52, ly, 30);
    fl(x0 - 128, ly - 16, 13); fl(x0 + tw + 128, ly - 16, 13);
    fl(x0 - 110, ly + 20, 9); fl(x0 + tw + 110, ly + 20, 9);
    x.restore();
  }

  x.save(); x.shadowColor = 'rgba(255,214,120,.85)'; x.shadowBlur = 14; x.strokeStyle = 'rgba(146,96,24,.95)'; x.lineWidth = 7; draw((ch, px) => x.strokeText(ch, px, by)); x.restore();
  x.save(); x.shadowColor = 'rgba(0,0,0,0)'; x.shadowOffsetY = 0; x.shadowBlur = 0; x.strokeStyle = 'rgba(176,118,32,.95)'; x.lineWidth = 3.6; draw((ch, px) => x.strokeText(ch, px, by)); x.restore();
  const g = x.createLinearGradient(0, by - fs * 0.75, 0, by);
  [[0, '#fff3bf'], [0.3, '#f9d874'], [0.55, '#e6b043'], [0.8, '#f5d273'], [1, '#fff2b8']].forEach(s => g.addColorStop(s[0], s[1]));
  x.fillStyle = g; draw((ch, px) => x.fillText(ch, px, by));
  x.lineWidth = 1.2; x.strokeStyle = 'rgba(255,252,238,.6)'; draw((ch, px) => x.strokeText(ch, px, by));

  const star = (cx, cy, r) => {
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r * 0.26 : r;
      x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    }
    x.closePath();
    x.fill();
  };
  for (const s of [-1, 1]) {
    const sx = s < 0 ? x0 - 30 : x0 + tw + 30;
    const gr = x.createLinearGradient(sx, 0, sx + s * 2, 0);
    gr.addColorStop(0, 'rgba(246,227,176,.95)');
    gr.addColorStop(1, 'rgba(201,162,74,0)');
    x.strokeStyle = gr; x.lineWidth = 2.2; x.beginPath(); x.moveTo(sx, ly); x.lineTo(sx + s * 2, ly); x.stroke();
    x.save(); x.shadowColor = 'rgba(255,205,110,.9)'; x.shadowBlur = 12; x.fillStyle = '#fff1cf'; star(sx, ly, 0); x.restore();
    x.fillStyle = '#d2a548'; star(sx, ly, 0);
  }
  return c;
}

const cache = new Map();
function prepare(u, fr) {
  const key = JSON.stringify([u, fr]);
  if (!cache.has(key)) {
    cache.set(key, doPrepare(u, fr).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

async function doPrepare(u, fr) {
  const [ib, ic, ifr, idp] = await Promise.all([u.bg, u.character, u.frame, u.depth].map(loadImg));
  const [cB, xB] = cv(ib), [cC, xC] = cv(ic), [cF, xF] = cv(ifr), [, xD] = cv(idp);
  fix(xC, 'w');
  fix(xF, 'c');

  if (fr && fr.clear) {
    const d = xF.getImageData(0, 0, W, H);
    const z = (a, b, c, e) => {
      for (let y = b; y < e; y++) for (let xx = a; xx < c; xx++) d.data[(y * W + xx) * 4 + 3] = 0;
    };
    for (const rect of fr.clear) z(...rect);
    xF.putImageData(d, 0, 0);
  }
  const cF2 = document.createElement('canvas');
  cF2.width = W;
  cF2.height = H;
  const crop = (fr && fr.crop) ? fr.crop : [0, 0, W, H];
  cF2.getContext('2d').drawImage(cF, ...crop, 0, 0, W, H);

  const dd = xC.getImageData(0, 0, W, H), P = dd.data, DP = xD.getImageData(0, 0, W, H).data, n = W * H;
  let hf = new Float32Array(n);
  for (let i = 0; i < n; i++) hf[i] = P[i * 4 + 3] > 10 ? 0.25 + 0.75 * DP[i * 4] / 255 : 0;
  let srcP = new Uint8ClampedArray(P), dstP = P;
  let srcH = new Float32Array(hf), dstH = hf;
  for (let it = 0; it < 5; it++) {
    srcP.set(dstP);
    srcH.set(dstH);
    for (let y = 1; y < H - 1; y++) {
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx;
        const i4 = i * 4;
        if (srcP[i4 + 3] > 10) continue;
        let bj = -1, ba = 10;
        const jL = i - 1, aL = srcP[jL * 4 + 3];
        if (aL > ba) { ba = aL; bj = jL; }
        const jR = i + 1, aR = srcP[jR * 4 + 3];
        if (aR > ba) { ba = aR; bj = jR; }
        const jU = i - W, aU = srcP[jU * 4 + 3];
        if (aU > ba) { ba = aU; bj = jU; }
        const jD = i + W, aD = srcP[jD * 4 + 3];
        if (aD > ba) { ba = aD; bj = jD; }
        if (bj >= 0) {
          const bj4 = bj * 4;
          dstP[i4] = srcP[bj4];
          dstP[i4 + 1] = srcP[bj4 + 1];
          dstP[i4 + 2] = srcP[bj4 + 2];
          dstP[i4 + 3] = ba * 0.8;
          dstH[i] = srcH[bj];
        }
      }
    }
  }
  hf = dstH;
  xC.putImageData(dd, 0, 0);
  blur(hf, 3);
  blur(hf, 3);

  const cD = document.createElement('canvas');
  cD.width = W;
  cD.height = H;
  const xd = cD.getContext('2d'), di = xd.createImageData(W, H);
  for (let i = 0; i < n; i++) {
    const v = hf[i] * 255;
    di.data[i * 4] = di.data[i * 4 + 1] = di.data[i * 4 + 2] = v;
    di.data[i * 4 + 3] = 255;
  }
  xd.putImageData(di, 0, 0);

  const sm = xB.getImageData(0, 0, W, H).data;
  let ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < n; i += 97) { ar += sm[i * 4]; ag += sm[i * 4 + 1]; ab += sm[i * 4 + 2]; }
  const m = n / 97;
  ar /= m; ag /= m; ab /= m;

  return { cB, cC, cF2, cD, tint: [ar, ag, ab] };
}

const T = (c, pm, mip = true) => {
  const t = new THREE.CanvasTexture(c);
  t.premultiplyAlpha = pm;
  t.anisotropy = 8;
  if (!mip) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  return t;
};

const CB = Object.freeze({
  ready: 'onReady',
  click: 'onClick',
  select: 'onSelect',
  hoverstart: 'onHoverStart',
  hoverend: 'onHoverEnd',
  error: 'onError'
});

// ---------------------------------------------------------------- component
export class AstraCard {
  /** Drop all cached pre-processed canvases (~40 MB per unique asset set). Existing instances are unaffected. */
  static clearCache() {
    cache.clear();
    titleCache.clear();
  }

  /** Warm font, processed card textures, and title canvas caches without creating a WebGL context. */
  static preload(opts = {}) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const urls = { ...DEFAULT_ASSETS, ...(opts.assets || {}) };
    const frame = opts.frame || DEFAULT_FRAME;
    const name = opts.name || 'ASTRA';
    const fontUrl = opts.fontUrl !== undefined ? opts.fontUrl : DEFAULT_FONT;
    return Promise.all([
      ensureFont(fontUrl),
      prepare(urls, frame),
      mkTitle(name),
    ]);
  }

  constructor(container, opts = {}) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('AstraCard: container must be an HTMLElement');
    }
    this.o = {
      ...ASTRA_CARD_DEFAULTS,
      assets: {},
      frame: DEFAULT_FRAME,
      ...opts
    };
    this.data = { name: 'ASTRA', ...(opts.data || {}) };
    this.container = container;

    this._alive = true;
    this._paused = false;
    this._inView = true;
    this._ready = false;
    this._lost = false;
    this._dirty = true;
    this._selected = !!this.o.selected;
    this._hover = false;
    this._error = null;
    this._readyWaiters = [];

    this.pose = { ry: 0, rx: 0, rz: 0, fy: 0 };
    this._man = null;
    this._last = -1e9;
    this._down = 0;
    this._pid = null;
    this._p0 = null;
    this._phase = 0;
    this._lastTs = null;
    this._w = 0;
    this._rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._buildDom();
    this._bind();
    this._init();
  }

  // ---- state getters
  get element() { return this.root; }
  get ready() { return this._ready; }
  get selected() { return this._selected; }
  get paused() { return this._paused; }
  get hovering() { return this._hover; }
  get destroyed() { return !this._alive; }

  /** Returns a shallow copy of the current Commander/card data. */
  getData() {
    return {
      ...this.data,
      ...(this.data.assets ? { assets: { ...this.data.assets } } : {})
    };
  }

  /** Returns current controlled selection state. */
  isSelected() {
    return this._selected;
  }

  /** Promise resolving to this card instance once WebGL & textures are ready (rejects on init error/destroy). */
  whenReady() {
    if (this._ready) return Promise.resolve(this);
    if (this._error) return Promise.reject(this._error);
    if (!this._alive) return Promise.reject(new Error('AstraCard: instance was destroyed before becoming ready'));
    return new Promise((resolve, reject) => {
      this._readyWaiters.push({ resolve, reject });
    });
  }

  /** Merge new Commander/card data. Only redraws title or reloads artwork when those fields actually change. */
  update(next = {}) {
    if (!this._alive || !next || typeof next !== 'object') return;
    const prev = this.data;
    const prevUrls = JSON.stringify(this._urls());
    const merged = { ...prev, ...next };
    if (prev.assets || next.assets) {
      merged.assets = { ...(prev.assets || {}), ...(next.assets || {}) };
    }
    this.data = merged;

    if (this.data.name !== prev.name) {
      this.root.setAttribute('aria-label', String(this.data.name || 'ASTRA'));
      this._refreshTitle();
    }
    if (this.data.glow !== prev.glow) {
      this._applyGlow();
    }
    if (JSON.stringify(this._urls()) !== prevUrls) {
      this._refreshAssets();
    }
  }

  /** Update runtime behavior options without tearing down the WebGL context. */
  setOptions(next = {}) {
    if (!this._alive || !next || typeof next !== 'object') return;
    const prevUrls = JSON.stringify(this._urls());
    const prevFrame = JSON.stringify(this.o.frame);
    this.o = {
      ...this.o,
      ...next,
      assets: next.assets ? { ...(this.o.assets || {}), ...next.assets } : this.o.assets
    };
    if (!this.o.interactive) this._man = null;
    this.root.classList.toggle('astra-card--studio', !!this.o.studio);
    this._applyInteractivity();
    this._applyGlow();
    if ('selected' in next) this.setSelected(!!next.selected);
    if ('tilt' in next) this._fit();
    this._dirty = true;

    if (JSON.stringify(this._urls()) !== prevUrls || JSON.stringify(this.o.frame) !== prevFrame) {
      this._refreshAssets();
    }
  }

  /** Controlled selection state setter (toggles .is-selected and aria-pressed). */
  setSelected(on) {
    if (!this._alive) return;
    this._selected = !!on;
    this.root.classList.toggle('is-selected', this._selected);
    if (this.o.selectable) {
      this.root.setAttribute('aria-pressed', this._selected ? 'true' : 'false');
    }
  }

  pause() {
    if (!this._alive) return;
    this._paused = true;
    this._lastTs = null;
    this.root.classList.add('astra-card--paused');
  }

  resume() {
    if (!this._alive) return;
    this._paused = false;
    this._lastTs = null;
    this._dirty = true;
    this.root.classList.remove('astra-card--paused');
  }

  /** Force a layout & WebGL viewport re-measure (useful after modal/tab transitions). */
  resize() {
    if (!this._alive) return;
    this._fit();
  }

  /** Stop RAF, remove all listeners/observers, dispose GPU resources, and remove DOM. Safe to call multiple times. */
  destroy() {
    if (!this._alive) return;
    this._alive = false;
    cancelAnimationFrame(this._raf);
    this._ro && this._ro.disconnect();
    this._io && this._io.disconnect();
    this._ro = this._io = null;

    if (this._readyWaiters.length) {
      const err = new Error('AstraCard: destroyed before ready');
      for (const w of this._readyWaiters) w.reject(err);
      this._readyWaiters.length = 0;
    }

    const r = this.root;
    r.removeEventListener('pointermove', this._onMove);
    r.removeEventListener('pointerdown', this._onDown);
    r.removeEventListener('pointerenter', this._onEnter);
    r.removeEventListener('pointerleave', this._onLeave);
    r.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
    document.removeEventListener('visibilitychange', this._onVis);
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this._onLost);
      this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    }

    if (this.sc) {
      const disposedGeo = new Set();
      const disposedMat = new Set();
      this.sc.traverse(o => {
        if (o.geometry && !disposedGeo.has(o.geometry)) {
          disposedGeo.add(o.geometry);
          o.geometry.dispose();
        }
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mat of mats) {
            if (mat && !disposedMat.has(mat)) {
              disposedMat.add(mat);
              mat.dispose();
            }
          }
        }
      });
    }
    if (this.U) {
      for (const k of ['tB', 'tC', 'tF', 'tD', 'tT']) {
        this.U[k] && this.U[k].value && this.U[k].value.dispose();
      }
    }
    if (this.r) {
      this.r.dispose();
      this.r.forceContextLoss && this.r.forceContextLoss();
    }
    r.remove();
    this.U = this.r = this.sc = this.cam = this.card = this.canvas = this.shd = this.statusEl = null;
  }

  // ---- internals
  _emit(type, extra = {}) {
    const cb = this.o[CB[type]];
    const payload = this.getData();
    const firstArg = type === 'error' ? extra.error : payload;
    try {
      cb && cb(firstArg, this);
    } catch (e) {
      console.error('AstraCard callback error:', e);
    }
    this.root.dispatchEvent(new CustomEvent('astra:' + type, {
      bubbles: true,
      detail: {
        data: payload,
        card: this,
        selected: this._selected,
        ...extra
      }
    }));
  }

  _urls() {
    return { ...DEFAULT_ASSETS, ...(this.o.assets || {}), ...(this.data.assets || {}) };
  }

  _applyGlow() {
    const g = this.data.glow || this.o.glow;
    if (g) this.root.style.setProperty('--astra-glow', g);
    else this.root.style.removeProperty('--astra-glow');
  }

  _applyInteractivity() {
    const r = this.root;
    const canSelect = !!this.o.selectable;
    const canInteract = !!this.o.interactive;
    r.classList.toggle('astra-card--noninteractive', !canSelect && !canInteract);
    if (canSelect) {
      r.setAttribute('role', 'button');
      r.setAttribute('tabindex', '0');
      r.setAttribute('aria-pressed', this._selected ? 'true' : 'false');
    } else {
      r.setAttribute('role', 'img');
      r.removeAttribute('tabindex');
      r.removeAttribute('aria-pressed');
    }
  }

  _buildDom() {
    if (this.o.css) ensureCss();
    const hostHasHeight = this.container.clientHeight >= 2;

    const r = this.root = document.createElement('div');
    r.className = 'astra-card astra-card--loading'
      + (this.o.studio ? ' astra-card--studio' : '')
      + (hostHasHeight ? '' : ' astra-card--aspect')
      + (this._selected ? ' is-selected' : '');
    r.setAttribute('aria-label', String(this.data.name || 'ASTRA'));
    this._applyInteractivity();
    this._applyGlow();

    r.innerHTML = '<div class="astra-card__glow" aria-hidden="true"></div>'
      + '<canvas class="astra-card__canvas"></canvas>'
      + '<div class="astra-card__shadow" aria-hidden="true"></div>'
      + '<div class="astra-card__status" aria-live="polite"></div>';
    this.canvas = r.querySelector('.astra-card__canvas');
    this.shd = r.querySelector('.astra-card__shadow');
    this.statusEl = r.querySelector('.astra-card__status');
    this.container.appendChild(r);
  }

  _bind() {
    const r = this.root;
    this._onMove = e => {
      if (!this.o.interactive) return;
      if (this._down && this._pid !== null && e.pointerId !== this._pid) return;
      const b = r.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const clamp = v => Math.max(-1, Math.min(1, v));
      const nx = clamp((e.clientX - b.left) / b.width * 2 - 1);
      const ny = clamp((e.clientY - b.top) / b.height * 2 - 1);
      const A = this.o.tilt * Math.PI / 180;
      this._man = { ry: nx * 17.5 * A, rx: ny * 10.5 * A, rz: 0, fy: 0 };
      this._last = performance.now();
      this._dirty = true;
    };

    this._onDown = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this._down = 1;
      this._pid = e.pointerId;
      this._p0 = { x: e.clientX, y: e.clientY, t: performance.now() };
      this._onMove(e);
    };

    this._onUp = e => {
      if (!this._down) return;
      if (this._pid !== null && e.pointerId !== this._pid) return;
      this._down = 0;
      this._pid = null;
      const now = performance.now(), p = this._p0;
      this._p0 = null;
      this._last = now;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8 && now - p.t < 600) {
        this._emit('click', { originalEvent: e });
        if (this.o.selectable) this._emit('select', { originalEvent: e });
      }
    };

    this._onCancel = e => {
      if (!this._down) return;
      if (this._pid !== null && e.pointerId !== this._pid) return;
      this._down = 0;
      this._pid = null;
      this._p0 = null;
      this._last = performance.now();
    };

    this._onEnter = () => {
      this._hover = true;
      r.classList.add('astra-card--hovered');
      this._emit('hoverstart');
    };

    this._onLeave = () => {
      this._hover = false;
      r.classList.remove('astra-card--hovered');
      this._last = performance.now();
      this._dirty = true;
      this._emit('hoverend');
    };

    this._onKey = e => {
      if (!this.o.selectable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._emit('click', { originalEvent: e });
        this._emit('select', { originalEvent: e });
      }
    };

    this._onLost = e => {
      e.preventDefault();
      this._lost = true;
      this._lastTs = null;
    };

    this._onRestored = () => {
      this._lost = false;
      this._lastTs = null;
      if (this.U) {
        for (const k of ['tB', 'tC', 'tF', 'tD', 'tT']) {
          if (this.U[k] && this.U[k].value) this.U[k].value.needsUpdate = true;
        }
      }
      this._fit();
      this._dirty = true;
    };

    this._onVis = () => {
      if (document.hidden) this._lastTs = null;
      else this._dirty = true;
    };

    r.addEventListener('pointermove', this._onMove);
    r.addEventListener('pointerdown', this._onDown);
    r.addEventListener('pointerenter', this._onEnter);
    r.addEventListener('pointerleave', this._onLeave);
    r.addEventListener('keydown', this._onKey);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onCancel);
    document.addEventListener('visibilitychange', this._onVis);
    this.canvas.addEventListener('webglcontextlost', this._onLost);
    this.canvas.addEventListener('webglcontextrestored', this._onRestored);

    if (typeof IntersectionObserver === 'function') {
      this._io = new IntersectionObserver(es => {
        this._inView = es[es.length - 1].isIntersecting;
        if (!this._inView) this._lastTs = null;
        else this._dirty = true;
      });
      this._io.observe(r);
    }
  }

  async _init() {
    try {
      await ensureFont(this.o.fontUrl);
      let key, nm, prep, cT;
      do {
        key = JSON.stringify(this._urls());
        nm = this.data.name;
        [prep, cT] = await Promise.all([prepare(JSON.parse(key), this.o.frame), mkTitle(nm)]);
        if (!this._alive) return;
      } while (key !== JSON.stringify(this._urls()) || nm !== this.data.name);

      this._initGL(prep, cT);
      this._ready = true;
      this.root.classList.remove('astra-card--loading', 'astra-card--error');
      this.root.classList.add('astra-card--ready');
      for (const w of this._readyWaiters) w.resolve(this);
      this._readyWaiters.length = 0;
      this._emit('ready');
    } catch (e) {
      if (!this._alive) return;
      this._error = e;
      this.root.classList.remove('astra-card--loading');
      this.root.classList.add('astra-card--error');
      if (this.statusEl) {
        this.statusEl.textContent = 'Card render failed. Serve over HTTP and verify card assets.';
      }
      for (const w of this._readyWaiters) w.reject(e);
      this._readyWaiters.length = 0;
      console.error(e);
      this._emit('error', { error: e });
    }
  }

  _initGL(prep, cT) {
    const [ar, ag, ab] = prep.tint, r = this.root;
    r.style.setProperty('--astra-a', `rgb(${ar * 2.2 | 0},${ag * 2.2 | 0},${ab * 2.6 | 0})`);
    r.style.setProperty('--astra-b', `rgb(${ar * 0.25 | 0},${ag * 0.25 | 0},${ab * 0.3 | 0})`);

    const U = this.U = {
      tB: { value: T(prep.cB, false) },
      tC: { value: T(prep.cC, true) },
      tF: { value: T(prep.cF2, true) },
      tT: { value: T(cT, true) },
      tD: { value: T(prep.cD, false, false) },
      uCam: { value: new THREE.Vector3(0, 0, 7) },
      uP: { value: 0 },
      uPr: { value: 1 },
      uCs: { value: 1 },
      uTint: { value: new THREE.Vector3(ar / 255, ag / 255, ab / 255) },
      uFB: { value: new THREE.Vector4(0, 0, 1, 1) }
    };

    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.r.setClearColor(0, 0);
    const sc = this.sc = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const card = this.card = new THREE.Group();
    sc.add(card);

    const geo = new THREE.PlaneGeometry(2, 3);
    const mat = (u, f) => new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VS,
      fragmentShader: f,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      extensions: { derivatives: true }
    });

    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(geo, mat({ uCam: U.uCam, uI: { value: i }, uTint: U.uTint, uP: U.uP }, SFS));
      s.position.z = -0.014 * (8 - i);
      s.renderOrder = i;
      card.add(s);
    }
    const fr = new THREE.Mesh(geo, mat(U, FS));
    fr.renderOrder = 20;
    card.add(fr);

    const wrap01 = v => ((v % 1) + 1) % 1;
    const pts = (cnt, z, s, ro) => {
      const g = new THREE.BufferGeometry();
      const sd = new Float32Array(cnt * 3);
      const mt = new Float32Array(cnt * 4);
      for (let i = 0; i < cnt; i++) {
        sd[i * 3] = wrap01((i + 0.5) * 0.7548776662 + (Math.random() - 0.5) * 0.14);
        sd[i * 3 + 1] = wrap01((i + 0.5) * 0.5698402910 + (Math.random() - 0.5) * 0.14);
        sd[i * 3 + 2] = Math.random();
        mt[i * 4] = ((i * 37 + 13) % cnt + 0.5) / cnt;
        mt[i * 4 + 1] = Math.random();
        mt[i * 4 + 2] = Math.random();
        mt[i * 4 + 3] = Math.random();
      }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3));
      g.setAttribute('seed', new THREE.BufferAttribute(sd, 3));
      g.setAttribute('meta', new THREE.BufferAttribute(mt, 4));
      const p = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { uP: U.uP, uPr: U.uPr, uCs: U.uCs, uZ: { value: z }, uS: { value: s } },
        vertexShader: PVS,
        fragmentShader: PFS,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      p.frustumCulled = false;
      p.renderOrder = ro;
      sc.add(p);
    };
    pts(90, -0.8, 0.06, -1);
    pts(60, 1.2, 0.16, 30);

    this._fit();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(r);
    this._dirty = true;
    this._draw(0, this.pose);
    this._raf = requestAnimationFrame(this._tick);
  }

  _refreshTitle() {
    const g = this._tg = (this._tg || 0) + 1;
    mkTitle(this.data.name).then(c => {
      if (!this._alive || g !== this._tg || !this.U) return;
      this.U.tT.value.dispose();
      this.U.tT.value = T(c, true);
      this._dirty = true;
    }).catch(e => console.error(e));
  }

  async _refreshAssets() {
    if (!this.U) return;
    const key = JSON.stringify(this._urls());
    const frKey = JSON.stringify(this.o.frame);
    try {
      const prep = await prepare(JSON.parse(key), this.o.frame);
      if (!this._alive || !this.U || key !== JSON.stringify(this._urls()) || frKey !== JSON.stringify(this.o.frame)) return;
      for (const [k, c, pm, mip] of [['tB', prep.cB, false, true], ['tC', prep.cC, true, true], ['tF', prep.cF2, true, true], ['tD', prep.cD, false, false]]) {
        this.U[k].value.dispose();
        this.U[k].value = T(c, pm, mip);
      }
      const [ar, ag, ab] = prep.tint;
      this.U.uTint.value.set(ar / 255, ag / 255, ab / 255);
      this.root.style.setProperty('--astra-a', `rgb(${ar * 2.2 | 0},${ag * 2.2 | 0},${ab * 2.6 | 0})`);
      this.root.style.setProperty('--astra-b', `rgb(${ar * 0.25 | 0},${ag * 0.25 | 0},${ab * 0.3 | 0})`);
      this._dirty = true;
    } catch (e) {
      if (this._alive) this._emit('error', { error: e });
    }
  }

  _auto(p) {
    const A = this.o.tilt;
    if (!A) return { ry: 0, rx: 0, rz: 0, fy: 0 };
    const d = Math.PI / 180;
    return {
      ry: 17.5 * A * d * Math.sin(p),
      rx: -10.5 * A * d * Math.sin(2 * p),
      rz: 1.2 * d * Math.sin(p),
      fy: 0.05 * Math.sin(2 * p)
    };
  }

  _setCam(a) {
    const vh = this.o.tilt === 0 ? Math.max(3.12, 2.08 / a) : Math.max(3.7, 2.6 / a);
    this.cam.aspect = a;
    this.cam.position.set(0, 0, vh / 2 / Math.tan(Math.PI / 12));
    this.cam.updateProjectionMatrix();
  }

  _fit() {
    if (!this.r || !this.root) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this._w = w;
    // Scale ambient blur cleanly for compact slots while keeping 70px / 14px at full stage sizes
    const glowBlur = Math.round(Math.min(70, Math.max(18, w * 0.14)));
    const shadowBlur = Math.round(Math.min(14, Math.max(4, w * 0.03)));
    this.root.style.setProperty('--astra-glow-blur', glowBlur + 'px');
    this.root.style.setProperty('--astra-shadow-blur', shadowBlur + 'px');
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.r.setPixelRatio(pr);
    if (this.U && this.U.uPr) this.U.uPr.value = pr;
    if (this.U && this.U.uCs) this.U.uCs.value = Math.max(0.5, Math.min(1.15, h / 640));
    this.r.setSize(w, h, false);
    this._setCam(w / h);
    this._dirty = true;
  }

  _draw(phi, ps) {
    const c = this.card;
    c.rotation.set(ps.rx, ps.ry, ps.rz, 'YXZ');
    c.position.y = ps.fy;
    c.updateMatrixWorld();
    this.cam.updateMatrixWorld();
    this.U.uCam.value.copy(c.worldToLocal(this.cam.position.clone()));
    this.U.uP.value = phi;
    this.r.render(this.sc, this.cam);
  }

  _tick = ts => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this._tick);
    if (this._paused || !this._inView || this._lost || document.hidden || !this.U) {
      this._lastTs = null;
      return;
    }

    const dt = this._lastTs == null ? 0 : Math.min(ts - this._lastTs, 100);
    this._lastTs = ts;

    const sway = !!(this.o.autoplay && this.o.tilt !== 0 && !this._rm);
    const fx = !!(this.o.animateEffects && !this._rm);
    if (sway || fx) {
      this._phase = (this._phase + (dt / 6000) * Math.PI * 2) % (Math.PI * 2);
    }

    const now = performance.now();
    const manualActive = !!(this.o.interactive && this.o.tilt !== 0 && this._man && (this._down || now - this._last < 1500));
    const tg = manualActive ? this._man : (sway ? this._auto(this._phase) : { ry: 0, rx: 0, rz: 0, fy: 0 });

    const ps = this.pose;
    let maxDiff = 0;
    for (const q in tg) {
      const diff = tg[q] - ps[q];
      if (Math.abs(diff) > maxDiff) maxDiff = Math.abs(diff);
      ps[q] += diff * 0.12;
    }

    if (!sway && !fx && !manualActive && maxDiff < 1e-4 && !this._dirty) return;
    this._dirty = false;

    const p = (sway || fx) ? this._phase : 0;
    this._draw(p, ps);

    const sx = Math.min(110, (this._w || 500) * 0.22);
    this.shd.style.transform = `translateX(${-ps.ry * sx}px) scale(${1 - ps.fy * 2})`;
    this.shd.style.opacity = String(0.6 + ps.fy);
  };
}

export default AstraCard;
