// Axion Pulse — escena WebGL: fondo "metal líquido" con ondas de triángulos,
// orbe wireframe que late a 120 BPM y polvo. Técnicas reimplementadas.
import * as THREE from 'three';

const BPM = 120;
const ORB_RANGE = 4.3; // viewport heights
// Overall intensity of the orb's deformation (shapes + music + jelly). 1 = the full version;
// the user asked for half of it (2026-11-25): subtler and more even. At the bottom of the page,
// as the orb rises back in the footer, it calms down to DEFORM_END.
const DEFORM = .5;
const DEFORM_END = .1;

const bgVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const bgFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;        // css px
uniform float uDpr;
uniform vec2 uPointer;    // 0..1, y up
uniform float uTime;
uniform float uReveal;
uniform float uZoom;
uniform float uBeat;
uniform float uWavesOn;
uniform vec4 uWaves[6];   // x, y (css px, y down), start time, strength

float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }

float heightAt(vec2 p, float aspect){
  float drift = uTime*.065;
  p += .13*vec2(sin(p.y*2.1+drift), cos(p.x*1.5-drift));
  vec2 hand = (uPointer-.5)*vec2(aspect,1.)*2.;
  float influence = exp(-dot(p-hand,p-hand)*1.6);
  float fold = p.x*.83 + p.y*.56 + .32*sin(p.y*1.7 - p.x*.45 + drift);
  return (sin(fold*4.5+drift)*.22 + sin(fold*8.7-drift*.6)*.045 + influence*.18) * smoothstep(0.,1.,uReveal);
}

// equilateral triangle grid, side 30px: three line families
const float SIDE = 30.0;
const float H = 25.980762; // SIDE*sqrt(3)/2
vec4 triGrid(vec2 p){
  vec2 n0 = vec2(0.,1.), n1 = vec2(.8660254,.5), n2 = vec2(-.8660254,.5);
  vec3 q = vec3(dot(p,n0), dot(p,n1), dot(p,n2)) / H;
  vec3 d = abs(fract(q) - .5);          // .5 = on a line
  vec3 dist = (.5 - d) * H;              // px to nearest line per family
  float m = min(dist.x, min(dist.y, dist.z));
  float line = 1. - smoothstep(0., 1.1, m);
  return vec4(line, floor(q));
}

void main(){
  float aspect = uRes.x/uRes.y;
  vec2 p = (vUv-.5)*vec2(aspect,1.)*2. / uZoom;
  float h = heightAt(p, aspect), e = .006;
  vec3 n = normalize(vec3((h-heightAt(p+vec2(e,0.),aspect))/e, (h-heightAt(p+vec2(0.,e),aspect))/e, 1.));
  vec3 light = normalize(vec3((uPointer.x-.5)*1.4-.5, (uPointer.y-.5)*.6+.8, 1.));
  vec3 r = reflect(vec3(0.,0.,-1.), n);
  float broad = pow(max(dot(r,light),0.),12.);
  float edge  = pow(max(dot(r,normalize(vec3(-.8,.3,.7))),0.),60.);
  float sheen = smoothstep(.6,.92,r.y)*.12;
  float vignette = 1.-smoothstep(.2,1.15,length((vUv-.5)*vec2(1.,.8)));
  float center = 1.-.5*exp(-pow((vUv.y-.5)*5.,2.));
  vec3 col = vec3(.031,.043,.055) + vec3(.16,.18,.19)*(broad*.65+edge*.25+sheen)*vignette*center;

  // cyan flakes that glint when their facet faces the reflection
  for (int k=0; k<2; k++){
    float sc = k==0 ? 9.5 : 15.5;
    float th = k==0 ? .965 : .986;
    vec2 g = (vUv*vec2(aspect,1.))*sc;
    vec2 id = floor(g); vec2 f = fract(g)-.5;
    float rnd = hash21(id + float(k)*17.);
    if (rnd > th){
      float ang = hash21(id+3.1)*6.2831 + uTime*.15;
      vec2 o = (vec2(hash21(id+1.7), hash21(id+9.2))-.5)*.6;
      vec2 fp = f - o;
      fp = mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*fp;
      float dot_ = 1. - smoothstep(.02,.07, length(fp*vec2(1.,2.2)));
      vec3 facet = normalize(vec3(cos(ang), sin(ang), 1.2));
      float glint = pow(max(dot(r,facet),0.),18.)*2.8;
      col += mix(vec3(.02,.22,.27), vec3(.26,.86,.96), glint) * dot_ * (.25 + glint) * vignette;
    }
  }

  // triangle-grid waves
  if (uWavesOn > .5){
    vec2 css = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y) / uDpr;
    vec4 tg = triGrid(css);
    float acc = 0.;
    for (int i=0;i<6;i++){
      vec4 w = uWaves[i];
      float t = uTime - w.z;
      if (w.z < 0. || t < 0. || t > 6.) continue;
      float front = t*650.;
      float lag = front - distance(css, w.xy) + (hash31(tg.yzw)-.5)*60.;
      float s = step(0., lag) * ((1.-smoothstep(0.,24.,lag))*.9 + (1.-smoothstep(0.,260.,lag))*.35);
      acc = max(acc, s * w.w);
    }
    col += mix(vec3(.75), vec3(.24,.84,.94), .25) * tg.x * acc;
  }

  col *= 1. + uBeat*.04;
  col += (fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
  gl_FragColor = vec4(mix(vec3(.005), col*1.05, smoothstep(0.,1.,uReveal)), 1.);
}`;

// The orb is a solid geodesic sphere (dark chrome) with its triangle grid drawn in the
// fragment shader from per-triangle barycentric coordinates: anti-aliased lines of constant
// pixel width, never the back grid showing through, no moiré.
// The surface is displaced on the GPU. Its shape is a mix of very low-frequency waves over the
// sphere (spherical harmonics, orders 2–3, plus a rounded-cube term): always soft, convex-looking
// curves, never spikes. JS blends between random mixes, so the forms keep changing. The music
// moves the whole body (swell, jelly squash/stretch, broad soft ripples) rather than poking it.
// Normals are recomputed from the displaced surface so the chrome and the grid follow the shape.
const orbVert = /* glsl */`
attribute vec3 aBary;
uniform float uTime;
uniform float uBeat;
uniform float uIntensity;
uniform float uAmount;            // how far the shape pushes the surface
uniform float uDeform;            // overall deformation intensity (DEFORM in JS)
uniform float uCoef[13];          // weights of the soft basis below (blended in JS)
uniform vec3 uKickDir;
uniform float uKickT, uKickAmp, uJelly;
uniform float uMid, uHigh;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vBary;

// 3D simplex noise — Ashima Arts / Stefan Gustavson (webgl-noise, MIT)
vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
vec4 mod289(vec4 x){ return x - floor(x*(1./289.))*289.; }
vec4 permute(vec4 x){ return mod289(((x*34.)+1.)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - .85373472095314*r; }
float snoise(vec3 v){
  const vec2 C = vec2(1./6., 1./3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857;
  vec3 ns = n_*D.wyz - D.xzx;
  vec4 j = p - 49.*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2. + 1.;
  vec4 s1 = floor(b1)*2. + 1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.);
  m = m*m;
  return 42.*dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// soft basis: real spherical harmonics of orders 2 and 3, each scaled to peak near ±1 on the
// unit sphere, plus a rounded-cube term. Must match SOFT_BASIS in the JS below.
float soft(vec3 p){
  float x = p.x, y = p.y, z = p.z;
  float d = uCoef[0]*2.*x*y + uCoef[1]*2.*y*z + uCoef[2]*.5*(3.*z*z - 1.) + uCoef[3]*2.*x*z + uCoef[4]*(x*x - y*y);
  d += uCoef[5]*y*(3.*x*x - y*y) + uCoef[6]*5.196*x*y*z + uCoef[7]*.9*y*(5.*z*z - 1.) + uCoef[8]*.5*z*(5.*z*z - 3.);
  d += uCoef[9]*.9*x*(5.*z*z - 1.) + uCoef[10]*2.6*z*(x*x - y*y) + uCoef[11]*x*(x*x - 3.*y*y);
  d += uCoef[12]*(dot(p*p, p*p) - .6) / .4;
  return d;
}

vec3 displaced(vec3 dir){
  float off = soft(dir)*uAmount;
  off += snoise(dir*.9 + uTime*.08)*.03;                     // slow organic drift, very low frequency
  // kick: a broad, soft swell where it lands and a wide, gentle wave across the surface
  float c = dot(dir, uKickDir);
  float ang = acos(clamp(c, -1., 1.));
  off += uKickAmp*exp(-uKickT*5.)*max(c, 0.)*max(c, 0.)*.05;
  off += uKickAmp*exp(-uKickT*2.6)*exp(-pow((ang - uKickT*3.6)*2.6, 2.))*.022;
  // mids: broad slow ripple · highs: faint shimmer · constant breathing
  off += sin(dot(dir, vec3(.28,.94,.19))*3.6 - uTime*4.)*uMid*.02;
  off += snoise(dir*2.4 + uTime*1.1)*uHigh*.012;
  off += snoise(dir*1.5 + uTime*.3)*.01*uIntensity;
  // uDeform scales every deformation at once (shape, music, beat pulse, jelly)
  float r = (1. + off*uDeform) * (1. + uBeat*.03*uDeform);
  vec3 p = dir*r;
  // jelly: squash and stretch along the kick axis (volume roughly kept)
  float along = dot(p, uKickDir);
  float j = uJelly*uDeform;
  return p + uKickDir*along*j - (p - uKickDir*along)*j*.5;
}

void main(){
  float R0 = length(position);
  vec3 dir = position / R0;
  // normal of the displaced surface from two tangent neighbours
  vec3 up = abs(dir.y) > .99 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
  vec3 t1 = normalize(cross(up, dir));
  vec3 t2 = cross(dir, t1);
  vec3 p0 = displaced(dir);
  vec3 p1 = displaced(normalize(dir + t1*.012));
  vec3 p2 = displaced(normalize(dir + t2*.012));
  vec3 nObj = normalize(cross(p1 - p0, p2 - p0));
  if (dot(nObj, dir) < 0.) nObj = -nObj;
  vec4 mv = modelViewMatrix * vec4(p0*R0, 1.);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * nObj);
  vBary = aBary;
  gl_Position = projectionMatrix * mv;
}`;

const orbFrag = /* glsl */`
precision highp float;
uniform float uBrightness;
uniform float uBeat;
uniform float uTime;
uniform float uBreak;     // 0 intact → 1 fully shattered
uniform vec2 uRes;
uniform float uDpr;
uniform float uLine;      // half line width, device px
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vBary;

// soft studio environment seen in the chrome (view space, so it stays put while the orb turns)
vec3 envAt(vec3 r){
  float sky  = smoothstep(-.55, .95, r.y);
  float band = exp(-pow((r.y - .08)*3.6, 2.));
  float key  = pow(max(dot(r, normalize(vec3(-.45,.6,.65))), 0.), 16.);
  float fill = pow(max(dot(r, normalize(vec3(.75,.1,.6))), 0.), 6.);
  return mix(vec3(.05,.06,.07), vec3(.52,.58,.64), sky)
       + vec3(.85,.9,.95)*band*.55 + vec3(1.)*key*1.1 + vec3(.24,.84,.94)*fill*.35;
}
float hash31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  // screen-space 30px triangle grid: each cell shrinks into its centre and twinkles as the break front passes
  float leaving = 0.;
  if (uBreak > 0.) {
    vec2 css = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y) / uDpr;
    const float H = 25.980762;
    vec3 q = vec3(css.y, dot(css, vec2(.8660254,.5)), dot(css, vec2(-.8660254,.5))) / H;
    vec3 dist = (.5 - abs(fract(q) - .5)) * H;
    float m = min(dist.x, min(dist.y, dist.z));          // 0 on an edge, H/3 at the centre
    float hsh = hash31(floor(q));
    float maxD = length(uRes*.5);
    float n = distance(css, uRes*.5)/maxD*.82 + hsh*.18;
    float s = clamp((uBreak*1.25 - n)/.2, 0., 1.);
    if (s >= 1. || m < s * (H/3.)) discard;
    leaving = s * (.5 + .5*sin(uTime*(5. + 4.*hsh) + 6.2831*fract(hsh*7.13)));
  }
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;                       // inside the dome once the camera flies in
  vec3 v = normalize(-vViewPos);
  float ndv = clamp(dot(n, v), 0., 1.);
  vec3 r = reflect(-v, n);
  vec3 env = envAt(r);
  float fres = pow(1. - ndv, 3.);

  // grid lines: distance to the triangle's edges in pixels, smoothed over one pixel
  vec3 fw = fwidth(vBary);
  vec3 e = smoothstep(fw*(uLine - .6), fw*(uLine + .6), vBary);
  float line = 1. - min(min(e.x, e.y), e.z);
  line *= mix(.45, 1., smoothstep(.02, .5, ndv));    // calmer at the silhouette, where cells pile up

  vec3 body = env*.10 + vec3(.24,.84,.94)*fres*.16;  // dark chrome
  vec3 lineCol = vec3(.14,.19,.22) + env*.95;        // the grid glows where the chrome reflects light
  vec3 col = mix(body, lineCol, line) + vec3(.75,.92,1.)*fres*.16;
  if (!gl_FrontFacing) col *= .55;
  col = col * uBrightness * (1. + uBeat*.3) + vec3(.85,.95,1.) * leaving * .7;
  gl_FragColor = vec4(col, 1.);
}`;

// edge "lens": bends and RGB-splits the image toward the left/right edges, stronger near the
// pointer and with scroll / pointer speed. The centre stays untouched.
const postVert = bgVert;
const postFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uPointer;
uniform float uTime;
uniform float uScroll;
uniform float uInteraction;
float lensBend(vec2 uv, vec2 ptr, float interaction, float scroll, float t){
  vec2 c = uv-.5;
  float side = smoothstep(.12,.5,abs(c.x));
  float rim  = max(side, smoothstep(.3,.5,abs(c.y))*.35);
  float near = 1.-smoothstep(0.,.55,abs(ptr.x-uv.x));
  float k = .14*(1.+.25*sin(t*.55))*(1.+.6*near*side) + .06*interaction + .08*scroll;
  float wave = .5+.5*sin(uv.y*8.+t*1.2+sin(uv.y*3.1-t*.7)*1.4);
  return k*rim*rim*(.8+.4*wave);
}
void main(){
  vec2 c = vUv - .5;
  float bend = lensBend(vUv, uPointer, uInteraction, uScroll, uTime);
  vec2 toward = c*(1.-bend);
  vec2 split = c*bend*.18;
  vec4 g = texture2D(tDiffuse, .5+toward);
  float r = texture2D(tDiffuse, .5+toward+split).r;
  float b = texture2D(tDiffuse, .5+toward-split).b;
  gl_FragColor = vec4(r, g.g, b, 1.);
}`;

const dustVert = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uRise;
varying float vSeed;
void main(){
  vec3 p = position;
  p.y = mod(p.y + 15. + uRise*(.4 + aSeed*.6), 30.) - 15.;
  vec4 mv = modelViewMatrix * vec4(p,1.);
  gl_PointSize = .35 * 270. / -mv.z;
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;

const dustFrag = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uAppear;
varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - .5;
  float a = vSeed*6.2831 + uTime*.3;
  c = mat2(cos(a),-sin(a),sin(a),cos(a))*c;
  float d = length(c*vec2(1.,2.4));
  float m = 1. - smoothstep(.15,.5,d);
  float glint = pow(.5+.5*sin(uTime*1.3 + vSeed*40.), 18.)*2.8;
  float o = mix(.1,.6,fract(vSeed*7.31));
  vec3 col = mix(vec3(.92), vec3(.24,.84,.94), step(.8, fract(vSeed*3.7)));
  gl_FragColor = vec4(col, m * o * (.4 + glint) * uAppear);
}`;

// Geodesic sphere, non-indexed, with a barycentric attribute per triangle corner.
// Points are spaced by angle (slerp weights) instead of projecting a flat subdivision, which
// keeps triangle sizes even: longest/shortest edge 1.18 vs 1.43 for IcosahedronGeometry.
function geodesicGeometry(radius, freq) {
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => new THREE.Vector3(...v).normalize());
  const F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const OMEGA = Math.acos(1 / Math.sqrt(5));            // angle between neighbouring icosahedron vertices
  const pos = [], bary = [];
  const corner = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let f = 0; f < 20; f++) {
    const A = V[F[f * 3]], B = V[F[f * 3 + 1]], C = V[F[f * 3 + 2]];
    const P = (i, j) => {
      const wa = Math.sin(((freq - i - j) / freq) * OMEGA), wb = Math.sin((i / freq) * OMEGA), wc = Math.sin((j / freq) * OMEGA);
      return new THREE.Vector3().addScaledVector(A, wa).addScaledVector(B, wb).addScaledVector(C, wc).normalize();
    };
    const push = (a, b, c) => {
      // keep every triangle wound outward so gl_FrontFacing means "outside"
      nrm.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      if (nrm.dot(a) < 0) { const tmp = b; b = c; c = tmp; }
      [a, b, c].forEach((p, k) => { pos.push(p.x * radius, p.y * radius, p.z * radius); bary.push(...corner[k]); });
    };
    for (let i = 0; i < freq; i++) {
      for (let j = 0; j < freq - i; j++) {
        push(P(i, j), P(i + 1, j), P(i, j + 1));
        if (i + j < freq - 1) push(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function initGL(canvas, { mobile = false, reduce = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;

  // ---------- background ----------
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const waves = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -1, 0));
  let waveIdx = 0;
  const bgMat = new THREE.ShaderMaterial({
    vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
      uDpr: { value: renderer.getPixelRatio() },
      uPointer: { value: new THREE.Vector2(.5, .5) },
      uTime: { value: 0 }, uReveal: { value: 0 }, uZoom: { value: 1 }, uBeat: { value: 0 },
      uWavesOn: { value: 1 }, uWaves: { value: waves },
    },
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

  // ---------- main scene ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .1, 100);
  camera.position.z = 7;

  const orbUniforms = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uIntensity: { value: .5 },
    uBrightness: { value: 1 },
    uBreak: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uDpr: { value: renderer.getPixelRatio() },
    uLine: { value: .45 * renderer.getPixelRatio() },
    uAmount: { value: 0 }, uDeform: { value: DEFORM }, uCoef: { value: new Float32Array(13) },
    uKickDir: { value: new THREE.Vector3(0, 0, 1) }, uKickT: { value: 10 }, uKickAmp: { value: 0 }, uJelly: { value: 0 },
    uMid: { value: 0 }, uHigh: { value: 0 },
  };
  const orbMat = new THREE.ShaderMaterial({
    vertexShader: orbVert, fragmentShader: orbFrag, uniforms: orbUniforms, side: THREE.DoubleSide,
  });
  const orb = new THREE.Mesh(geodesicGeometry(1.6, mobile ? 14 : 18), orbMat);
  orb.position.z = .35;
  orb.scale.setScalar(0);
  orb.frustumCulled = false;   // the displaced surface can grow past the geometry's bounding sphere
  scene.add(orb);

  // ---------- shape sequencer: random soft forms, blended from A to B ----------
  // Same basis as soft() in the shader. Order 2 (the broadest waves) weighs more than order 3,
  // and a third of the forms lean on the rounded cube. Every form is scaled to the same peak,
  // so the orb changes shape without ever getting spiky or pinched.
  const SOFT_BASIS = [
    (x, y) => 2 * x * y, (x, y, z) => 2 * y * z, (x, y, z) => .5 * (3 * z * z - 1), (x, y, z) => 2 * x * z, (x, y) => x * x - y * y,
    (x, y) => y * (3 * x * x - y * y), (x, y, z) => 5.196 * x * y * z, (x, y, z) => .9 * y * (5 * z * z - 1),
    (x, y, z) => .5 * z * (5 * z * z - 3), (x, y, z) => .9 * x * (5 * z * z - 1), (x, y, z) => 2.6 * z * (x * x - y * y),
    (x, y) => x * (x * x - 3 * y * y), (x, y, z) => (x ** 4 + y ** 4 + z ** 4 - .6) / .4,
  ];
  const WEIGHT = [1, 1, 1, 1, 1, .42, .42, .42, .42, .42, .42, .42, 0];
  const PEAK = .17;                                  // largest offset of a form, in radii, at amount 1
  const PROBE = Array.from({ length: 320 }, (_, i) => {   // Fibonacci sphere used to measure a form's peak
    const y = 1 - 2 * (i + .5) / 320, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    return [r * Math.cos(th), y, r * Math.sin(th)];
  });
  const gauss = rnd => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const peakOf = c => {
    let peak = 0;
    for (const [x, y, z] of PROBE) {
      let d = 0;
      for (let i = 0; i < 13; i++) d += c[i] * SOFT_BASIS[i](x, y, z);
      peak = Math.max(peak, Math.abs(d));
    }
    return peak;
  };
  function randomSoftShape(out, rnd = Math.random) {
    for (let i = 0; i < 13; i++) out[i] = gauss(rnd) * WEIGHT[i];
    const cube = rnd() < .35;
    const target = rnd() < .1 ? PEAK * .35 : PEAK * (.75 + .25 * rnd());   // now and then nearly round
    const p = peakOf(out), k = p > 1e-6 ? target * (cube ? .7 : 1) / p : 0;
    for (let i = 0; i < 12; i++) out[i] *= k;
    // rounded cube: flat faces, soft corners. Past ~.08 of the radius the faces would cave in,
    // so the term stays under that even at the loudest amount (1.15).
    if (cube) out[12] = -(.055 + .015 * rnd());
    const all = peakOf(out);
    if (all > PEAK * 1.05) for (let i = 0; i < 13; i++) out[i] *= PEAK * 1.05 / all;
    return out;
  }
  const coefA = new Float32Array(13), coefB = new Float32Array(13);
  const morph = { t: 1, dur: 2, since: 0 };
  function nextShape(dur, rnd) {
    coefA.set(orbUniforms.uCoef.value);              // start from what is on screen right now
    randomSoftShape(coefB, rnd);
    morph.t = 0; morph.dur = dur; morph.since = 0;
  }

  // ---------- kicks: the whole body swells and bounces (jelly), a wide soft wave crosses it ----------
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const kick = { t: 10, amp: 0, jelly: 0, jellyV: 0, count: 0, lastHits: 0, lastPhase: 0, idleBeats: 0 };
  function onKick(strength, musical) {
    // land somewhere on the side facing the camera, expressed in the orb's own space
    tmpV.randomDirection(); tmpV.z = Math.abs(tmpV.z) + .45; tmpV.normalize();
    orbUniforms.uKickDir.value.copy(tmpV.applyQuaternion(tmpQ.copy(orb.quaternion).invert()));
    kick.t = 0; kick.amp = strength;
    kick.jellyV += (musical ? 1.6 : .6) * strength;
    if (musical) state.spin = Math.min(state.spin + .25 * strength, Math.PI);
    kick.count++;
    if (musical && kick.count % 8 === 0) nextShape(1.6);
  }
  let amount = 0;

  const N = mobile ? 250 : 500, R = mobile ? 10 : 15;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = R * (.55 + .45 * Math.cbrt(Math.random()));
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = rr * s * Math.cos(th); pos[i * 3 + 1] = rr * u; pos[i * 3 + 2] = rr * s * Math.sin(th);
    seed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustUniforms = { uTime: { value: 0 }, uRise: { value: 0 }, uAppear: { value: 0 } };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    vertexShader: dustVert, fragmentShader: dustFrag, uniforms: dustUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  // ---------- state ----------
  const state = {
    scrollU: 0, footer: 0, pointer: new THREE.Vector2(.5, .5), pointerEased: new THREE.Vector2(.5, .5),
    lastMove: performance.now(), rotVel: new THREE.Vector2(), spin: 0, popped: false,
  };
  const clock = new THREE.Clock();
  let raf = 0, running = true;

  // ---------- post: edge lens ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: 4 });   // keep MSAA through the lens pass
  const postScene = new THREE.Scene();
  const postMat = new THREE.ShaderMaterial({
    vertexShader: postVert, fragmentShader: postFrag, depthTest: false, depthWrite: false,
    uniforms: {
      tDiffuse: { value: rt.texture }, uPointer: { value: new THREE.Vector2(.5, .5) },
      uTime: { value: 0 }, uScroll: { value: 0 }, uInteraction: { value: 0 },
    },
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
  let lastScrollU = 0, scrollSpeed = 0, pointerSpeed = 0;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    bgMat.uniforms.uRes.value.set(w, h);
    bgMat.uniforms.uDpr.value = renderer.getPixelRatio();
    orbUniforms.uRes.value.set(w, h);
    orbUniforms.uDpr.value = renderer.getPixelRatio();
    orbUniforms.uLine.value = .45 * renderer.getPixelRatio();
    const dpr = renderer.getPixelRatio();
    rt.setSize(Math.round(w * dpr), Math.round(h * dpr));
  }
  addEventListener('resize', resize);
  resize();

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);

  let prevPointer = new THREE.Vector2(.5, .5);
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), .05);
    const t = clock.elapsedTime;
    const beatPhase = (t * BPM / 60) % 1;
    const clockBeat = Math.exp(-beatPhase * 6);
    // con el track sonando, el latido sale del kick real (fundido entre ambos)
    const au = state.audio;
    const beat = reduce ? 0 : au ? lerp(clockBeat, au.beat, au.mix) : clockBeat;

    state.pointerEased.lerp(state.pointer, 1 - Math.exp(-dt * 3));
    bgMat.uniforms.uTime.value = t;
    bgMat.uniforms.uPointer.value.copy(state.pointerEased);
    bgMat.uniforms.uBeat.value = beat;
    bgMat.uniforms.uReveal.value = Math.min(1, bgMat.uniforms.uReveal.value + dt * .6);

    // the orb flies toward the camera until the white section starts its mosaic
    const orbEnd = state.orbEnd || ORB_RANGE;
    const nr = clamp(state.scrollU / orbEnd);
    bgMat.uniforms.uZoom.value = 1 + .6 * smooth(nr);

    // orb flight + footer return
    const x = clamp(state.footer);
    orbUniforms.uDeform.value = lerp(DEFORM, DEFORM_END, smooth(x));   // calmer as it rises back in the footer
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(37.5)) * 2;
    const flyZ = lerp(.35, 6, nr);
    orb.position.z = lerp(flyZ, 5, x);
    orb.position.y = lerp(0, -.22 * visH * (1.6 / 1.4), x);
    const bright = lerp(1, .22, Math.sqrt(nr));
    orbUniforms.uBrightness.value = lerp(bright, 1, x);
    // the orb shatters into screen triangles while the white mosaic arrives
    const brk = clamp((state.scrollU - (orbEnd - .45)) / 1.3) * (1 - x);
    orbUniforms.uBreak.value = brk;
    orb.visible = brk < 1;

    // rotation: pointer + idle + pop spin
    const d = state.pointer.clone().sub(prevPointer); prevPointer.copy(state.pointer);
    const infl = (mobile ? .5 : 1) * lerp(1, .05, clamp(state.scrollU / 1.5));
    const lim = .0785;
    state.rotVel.x = lerp(state.rotVel.x, Math.tanh((-d.y * innerHeight * 8e-4) / lim) * lim * infl, .1);
    state.rotVel.y = lerp(state.rotVel.y, Math.tanh((d.x * innerWidth * 8e-4) / lim) * lim * infl, .1);
    orb.rotation.x += state.rotVel.x;
    orb.rotation.y += state.rotVel.y;
    if (performance.now() - state.lastMove > 1000 && !reduce) { orb.rotation.x += .003; orb.rotation.y += .003; }
    if (state.spin > 0) {
      const step = Math.min(state.spin, THREE.MathUtils.degToRad(266) * dt * (state.spin / (Math.PI * 2.1) + .15));
      orb.rotateOnAxis(new THREE.Vector3(-1299, 678, 0).normalize(), step);
      state.spin -= step;
    }

    orbUniforms.uTime.value = t;
    orbUniforms.uBeat.value = beat * .6;

    // shapes + music
    const playing = !!(au && au.mix > .5);
    const mix = au ? au.mix : 0;
    if (!reduce && state.hold === undefined) {
      if (playing && au.hits !== kick.lastHits) { kick.lastHits = au.hits; onKick(Math.max(.6, au.beat), true); }
      if (au) kick.lastHits = au.hits;
      if (beatPhase < kick.lastPhase && !playing) {            // synthetic 120 BPM pulse when the track is off
        onKick(.35, false);
        if (++kick.idleBeats % 16 === 0) nextShape(3);        // a new form every 8 s
      }
      if (playing && morph.since > 6) nextShape(2.2);          // breakdowns without kicks still move on
    }
    kick.lastPhase = beatPhase;
    morph.t = Math.min(1, morph.t + dt / morph.dur);
    morph.since += dt;
    const w = Math.PI * 2 * 3, zeta = .25;                    // jelly spring: 3 Hz, underdamped
    kick.jellyV += (-w * w * kick.jelly - 2 * zeta * w * kick.jellyV) * dt;
    kick.jelly = clamp(kick.jelly + kick.jellyV * dt, -.15, .15);
    kick.t += dt;
    // idle: soft forms; with the track they lean further as the mix gets louder
    const target = state.hold !== undefined ? state.hold : reduce ? 0 : lerp(.8, .9 + (au ? au.level : 0) * .25, mix);
    amount += (target - amount) * (1 - Math.exp(-dt * 2));
    const U = orbUniforms;
    U.uAmount.value = amount;
    const ease = smooth(morph.t), C = U.uCoef.value;
    for (let i = 0; i < 13; i++) C[i] = coefA[i] + (coefB[i] - coefA[i]) * ease;
    U.uKickT.value = kick.t; U.uKickAmp.value = reduce ? 0 : kick.amp; U.uJelly.value = reduce ? 0 : kick.jelly;
    U.uMid.value = au ? au.mid * mix : 0; U.uHigh.value = au ? au.high * mix : 0;

    dustUniforms.uTime.value = t;
    dustUniforms.uRise.value += .05 * nr + dt * .15;
    dustUniforms.uAppear.value = Math.min(1, dustUniforms.uAppear.value + (state.popped ? dt * .5 : 0));
    dust.rotation.y += dt * .01;

    // lens inputs: scroll speed and pointer speed, smoothed
    const su = Math.abs(state.scrollU - lastScrollU) / Math.max(dt, 1e-3); lastScrollU = state.scrollU;
    scrollSpeed = lerp(scrollSpeed, clamp(su * .35), 1 - Math.exp(-dt * 6));
    pointerSpeed = lerp(pointerSpeed, clamp(d.length() / Math.max(dt, 1e-3) * .6), 1 - Math.exp(-dt * 6));
    postMat.uniforms.uTime.value = t;
    postMat.uniforms.uPointer.value.copy(state.pointerEased);
    postMat.uniforms.uScroll.value = reduce ? 0 : scrollSpeed;
    postMat.uniforms.uInteraction.value = reduce ? 0 : pointerSpeed;

    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(bgScene, bgCam);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, bgCam);
  }
  frame();

  document.addEventListener('visibilitychange', () => { running = !document.hidden; clock.getDelta(); });

  return {
    setScroll(u, footerX, orbEnd) { state.scrollU = u; state.footer = footerX; if (orbEnd > 1) state.orbEnd = orbEnd; },
    setPointer(x, y) { state.pointer.set(x, 1 - y); state.lastMove = performance.now(); },
    setAudio(source) { state.audio = source; },
    // debug (?debug): read the live values
    debug() { return { deform: orbUniforms.uDeform.value, footer: state.footer, amount }; },
    // debug (?debug): hold the form generated from a seed, at a fixed amount
    showShape(seed, amt = 1) {
      let s = seed >>> 0;                                   // mulberry32: same seed, same form
      const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
      randomSoftShape(coefB, rnd); coefA.set(coefB);
      morph.t = 1; amount = amt; state.hold = amt;
    },
    setWaves(on) { bgMat.uniforms.uWavesOn.value = on ? 1 : 0; },
    wave(x, y, strength = .55) {
      waves[waveIdx].set(x, y, clock.elapsedTime, strength);
      waveIdx = (waveIdx + 1) % waves.length;
    },
    popIn() {
      state.popped = true;
      if (reduce) { orb.scale.setScalar(1); return; }
      const s = { v: 0 };
      window.gsap.to(s, { v: 1, duration: 1.3, ease: 'power4.out', onUpdate: () => orb.scale.setScalar(s.v) });
      state.spin = Math.PI * 2 * 1.05;
      setTimeout(() => { nextShape(3); kick.idleBeats = 0; }, 1600);   // start morphing once it has landed
    },
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
