import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101a29);
scene.fog = new THREE.FogExp2(0x101a29, .018);
const camera = new THREE.OrthographicCamera(-5.9,5.9,5.9,-5.9,.1,100);
camera.position.set(8.7,5.9,10.7); camera.lookAt(0,1.1,0);
const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.55;
document.body.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,1.05,0); controls.enableDamping=true; controls.dampingFactor=.07; controls.minZoom=.65; controls.maxZoom=2.6; controls.maxPolarAngle=Math.PI*.48; controls.enablePan=false;

const C={base:0x26293b,asphalt:0x263344,sidewalk:0x66717a,wall:0xd9d3c9,trim:0x334b58,roof:0x607783,cream:0xffedd1,warm:0xffdca1,cyan:0x88ddec,red:0xe76c68,green:0x67c7aa,ink:0x263548};
const mat=(c,opts={})=>new THREE.MeshStandardMaterial({color:c,roughness:.78,metalness:0,...opts});
const ink=mat(C.ink), wall=mat(C.wall), trim=mat(C.trim), road=mat(C.asphalt,{roughness:.21,metalness:.25}),walk=mat(C.sidewalk,{roughness:.68}),white=mat(0xf0eee5),yellow=mat(0xf5dca5),red=mat(C.red),green=mat(C.green),glass=mat(0xa6ddeb,{transparent:true,opacity:.17,roughness:.08,metalness:.1,depthWrite:false,side:THREE.DoubleSide});
function box(x,y,z,w,h,d,m,outline=false){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);if(outline){const e=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry),new THREE.LineBasicMaterial({color:0x293847,transparent:true,opacity:.63}));o.add(e)}return o}
function plane(x,y,z,w,d,m){const o=new THREE.Mesh(new THREE.PlaneGeometry(w,d),m);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);o.receiveShadow=true;scene.add(o);return o}
function cyl(x,y,z,r,h,m,seg=10){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),m);o.position.set(x,y,z);o.castShadow=true;scene.add(o);return o}
function wire(points,color=0x263747,r=.012){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,20,r,4,false),mat(color));scene.add(o);return o}
function label(text,w,h,bg,fg,rot=0){const c=document.createElement('canvas');c.width=1024;c.height=Math.max(128,Math.round(1024*h/w));const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.round(c.height*.56)}px sans-serif`;ctx.fillText(text,c.width/2,c.height*.53);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));o.rotation.y=rot;scene.add(o);return o}
function bulb(x,y,z,color,power,dist){const l=new THREE.PointLight(color,power,dist,2);l.position.set(x,y,z);scene.add(l);return l}
scene.add(new THREE.HemisphereLight(0x9dbbd6,0x233044,2.2));
const moon=new THREE.DirectionalLight(0xb8d5ee,2.35);moon.position.set(-4,9,7);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-6;moon.shadow.camera.right=6;moon.shadow.camera.top=6;moon.shadow.camera.bottom=-6;moon.shadow.bias=-.0005;scene.add(moon);

// One continuous square collector's plinth.
box(0,-.32,0,7.6,.62,7.6,mat(0x202b3a),true);
box(0,-.045,0,7.48,.08,7.48,road);
box(0,-.67,0,7.65,.12,7.65,mat(0x101a28),true);
// Raised corner pavement, storefront plot and wet road.
box(-.8,.035,-.75,5.55,.18,5.5,walk);
plane(.08,.131,1.85,7.1,3.55,road);
plane(2.73,.132,-.47,1.9,5.7,road);
box(-.8,.135,1.03,5.55,.035,.085,mat(0x9ca9a9));
box(1.96,.135,-.75,.085,.035,5.45,mat(0x9ca9a9));
for(let i=-3;i<4;i++) box(i*.78,.141,1.19,.045,.008,.11,mat(0x344250));
for(let z=-2.7;z<.55;z+=.38) box(2.03,.143,z,.1,.008,.026,mat(0x24313c));
// Crosswalk and parking markings.
for(let x=-2.6;x<1.15;x+=.48) plane(x,.151,2.62,.32,.68,mat(0xb8c8cb,{transparent:true,opacity:.72,roughness:.31}));
for(const z of [-2.7,-1.55,-.4]){box(3.13,.152,z,.42,.007,.035,white);box(3.48,.152,z,.04,.007,.7,white)}
// Mirror like shallow puddles and neon reflections.
const puddleMat=mat(0x547a94,{transparent:true,opacity:.35,roughness:.04,metalness:.55,depthWrite:false});
for(const [x,z,sx,sz] of [[-.8,2.07,.86,.31],[1.36,2.03,.5,.24],[2.68,-1.7,.28,.92],[-2.45,1.72,.47,.24]]){const p=new THREE.Mesh(new THREE.CircleGeometry(1,40),puddleMat);p.rotation.x=-Math.PI/2;p.scale.set(sx,sz,1);p.position.set(x,.151,z);scene.add(p)}
for(const [x,z,w,d,color] of [[-.9,1.92,.72,.12,0xffd9a5],[.8,2.24,.42,.08,0x75c7d1],[2.7,-1.1,.12,.75,0x83d0cb]])plane(x,.154,z,w,d,mat(color,{transparent:true,opacity:.15,roughness:.08,metalness:.3,depthWrite:false}));

// Store shell: broad front and right windows keep interior readable.
const sy=.16;
box(-.75,sy+.075,-1.13,4.25,.15,3.75,mat(0xe3c6a5,{emissive:0x765032,emissiveIntensity:.18}));
box(-.75,2.55,-3.02,4.25,4*.045,.16,wall,true);
box(-2.88,1.37,-1.13,.16,2.45,3.75,wall,true);
box(1.38,1.39,-2.23,.16,2.4,1.58,wall,true);
box(-.75,2.63,-1.13,4.48,.2,4.03,mat(C.roof),true);
box(-.75,2.78,-1.13,4.66,.11,4.2,mat(0x324958),true);
box(-.75,2.88,-1.13,4.72,.08,4.26,mat(0x203745),true);
// Eaves, stripes and lit convenience store sign.
box(-.75,2.45,.84,4.56,.48,.28,mat(0xf8f1df),true);
box(-.75,2.17,.995,4.57,.07,.075,red);
box(-.75,2.52,.997,4.57,.065,.075,green);
box(-.75,2.82,.78,4.7,.12,.44,mat(0x263b48),true);
const sign=label('まちかど  コンビニ',3.14,.32,'#fff4db','#263d4d');sign.position.set(-.75,2.37,1.0);
box(-.75,2.58,1.015,3.3,.025,.025,mat(0xffe8bb,{emissive:0xffd9a2,emissiveIntensity:.8}));
box(-.75,2.19,1.015,3.3,.02,.025,mat(0xffe3ac,{emissive:0xffd38d,emissiveIntensity:.6}));
// Deep awning and exposed ceiling lights.
box(-.75,2.08,.73,4.35,.12,.5,mat(0x294759),true);
for(const x of [-2.35,-1.2,.25,.95]){box(x,2.01,.86,.36,.025,.09,mat(0xffe8ba,{emissive:0xffdfaa,emissiveIntensity:2}));bulb(x,1.96,.78,0xffd9a2,.9,2)}
// Window framing; center doorway is dynamic.
for(const x of [-2.82,-1.65,-.49,.56,1.29]) box(x,1.27,.77,.055,1.77,.07,trim);
box(-.76,.41,.77,4.15,.06,.07,trim);box(-.76,2.13,.77,4.15,.07,.07,trim);
for(const x of [-2.24,-1.07]) box(x,1.27,.776,1.1,1.64,.015,glass);
box(.94,1.27,.776,.68,1.64,.015,glass);
const doorL=box(-.13,1.23,.793,.61,1.58,.028,glass),doorR=box(.47,1.23,.793,.61,1.58,.028,glass);
for(const x of [-.43,.17,.77]) box(x,1.25,.805,.025,1.65,.035,trim);
for(const x of [-.13,.47])box(x,1.17,.82,.035,.31,.045,mat(0xe6e7db));
box(.17,.39,.81,1.24,.035,.1,trim);
for(const z of [-1.45,-.55,.35]) box(1.46,1.28,z,.075,1.75,.055,trim);
box(1.47,.41,-.3,.08,.06,1.35,trim);box(1.47,2.14,-.3,.08,.07,1.35,trim);
for(const z of [-1.02,-.06]) box(1.465,1.29,z,.02,1.64,.82,glass);
// Interior: warm ceiling, aisles, stocked shelves, drinks, bento, register.
box(-.76,2.48,-1.13,4.08,.08,3.68,mat(0xfff0d7,{emissive:0xffdfb3,emissiveIntensity:.27}));
for(const x of [-2.4,-1.2,.1,1.0]){box(x,2.37,-1.25,.1,.035,2.7,mat(0xffe8c1,{emissive:0xffd8a1,emissiveIntensity:1.8}));bulb(x,2.15,-1.3,0xffd8a2,1.9,3)}
for(const [x,z] of [[-2.32,-1.58],[-1.44,-1.67],[-.55,-1.68]]){
  box(x,.89,z,.54,1.16,1.36,mat(0x718081),true);
  for(const yy of [.48,.79,1.09,1.38]){box(x,yy,z,.57,.035,1.39,mat(0xe4d9c8));for(let j=0;j<5;j++){const zz=z-.55+j*.27;const col=[0xe6a36e,0x82b4a4,0xf3d38d,0xdd8582,0x98bad0][(j+Math.round(x*10)+20)%5];box(x-.12,yy+.085,zz,.13,.15,.12,mat(col),true);box(x+.13,yy+.075,zz,.14,.13,.13,mat(0xf6e8cb),true)}}
}
// Rear drinks cooler with glowing colored bottle rows.
box(.65,1.28,-2.77,1.25,1.88,.32,mat(0x869aa2),true);
box(.65,1.31,-2.57,1.13,1.72,.05,mat(0xc7e9e8,{emissive:0x8bbabd,emissiveIntensity:.35}));
for(let row=0;row<4;row++)for(let j=0;j<7;j++){const m=mat([0x90cbba,0xd8b47d,0xa3bfdb,0xea9a8e][(j+row)%4]);cyl(.16+j*.165,.56+row*.34,-2.51,.056,.24,m,8)}
// Counter, register, coffee, hot snacks.
box(.79,.78,-.08,.92,.82,.53,mat(0xd2baa5),true);box(.79,1.21,-.08,.96,.06,.57,mat(0x52727a));
box(.57,1.41,-.08,.28,.35,.2,mat(0x3c505a),true);box(.57,1.5,.034,.21,.13,.015,mat(0x92d5c7,{emissive:0x5eaa9a,emissiveIntensity:.4}));
box(1.04,1.42,-.08,.25,.39,.23,mat(0x343f48),true);cyl(1.04,1.24,.06,.055,.1,white);
box(.73,.69,-1.35,.52,.64,.42,mat(0xe4d2b7),true);box(.73,1.02,-1.35,.54,.08,.44,mat(0x536e76));
for(let i=0;i<4;i++)cyl(.51+i*.15,1.1,-1.35,.046,.07,mat(0xba8154));
box(-2.47,.87,.35,.52,1.12,.25,mat(0xbcc6bb),true);for(let i=0;i<5;i++)box(-2.47,.52+i*.18,.5,.42,.09,.03,mat([0xcf7980,0x75aabd,0xd4b78a][i%3]));
box(-1.22,.46,.44,.52,.48,.49,mat(0x9bb9c0),true);box(-1.22,.74,.44,.5,.04,.48,white);
const back=label('お弁当 ・ おにぎり',1.55,.24,'#f7e4c8','#6f6d61');back.position.set(-1.36,1.92,-2.83);
// Simple floor navigation and rear service door.
for(let i=0;i<3;i++)plane(-.18,.256,-1.4+i*.46,.16,.25,mat(0xe4cf9b));
box(-2.46,1.35,-2.92,.57,1.72,.05,mat(0xb3bcb5),true);box(-2.23,1.25,-2.88,.035,.11,.03,trim);
// Entrance details.
box(.16,.18,1.16,1.4,.025,.43,mat(0x334e56),true);for(let i=0;i<7;i++)box(-.42+i*.18,.197,1.16,.025,.006,.36,mat(0x6b8a87));
// Vending machine.
box(-2.61,.91,1.4,.66,1.47,.58,mat(0xd4e8e7),true);box(-2.61,1.33,1.704,.55,.52,.015,mat(0x72aeb8,{emissive:0x4d9ca8,emissiveIntensity:.72}));
for(let i=0;i<4;i++)for(let j=0;j<2;j++)cyl(-2.81+i*.13,1.48-j*.2,1.72,.045,.12,mat([0xedb2a0,0xaad4c7,0xd8cd9c,0x87b7cb][i]));
box(-2.61,.71,1.71,.45,.16,.02,trim);box(-2.82,.48,1.72,.1,.07,.02,red);
// Umbrella stand with transparent blue umbrellas.
cyl(1.12,.46,1.28,.16,.51,mat(0x536873));for(const [x,z] of [[1.04,1.26],[1.16,1.31],[1.11,1.2]]){cyl(x,.94,z,.012,.65,trim,6);const top=new THREE.Mesh(new THREE.ConeGeometry(.12,.23,8),mat(0x7fabb6,{transparent:true,opacity:.82}));top.position.set(x,1.29,z);scene.add(top)}
// Trash can, bicycle, guard rails.
cyl(1.61,.48,.87,.19,.63,mat(0x81928f));cyl(1.61,.8,.87,.21,.035,trim);
function torus(x,y,z,r,m){const t=new THREE.Mesh(new THREE.TorusGeometry(r,.025,6,24),m);t.position.set(x,y,z);t.castShadow=true;scene.add(t);return t}
const bike=mat(0x8ba7a7);for(const x of [-1.7,-.96])torus(x,.47,2.95,.27,ink);wire([[-1.7,.47,2.95],[-1.43,.82,2.95],[-.96,.47,2.95],[-1.25,.48,2.95],[-1.7,.47,2.95]],0x8ba7a7,.024);wire([[-1.43,.82,2.95],[-1.25,.48,2.95],[-.96,.47,2.95]],0x8ba7a7,.024);wire([[-.96,.47,2.95],[-.9,1.02,2.95],[-.7,1.03,2.95]],0x8ba7a7,.018);box(-1.46,.86,2.95,.24,.035,.09,ink);box(-1.78,.43,2.95,.13,.22,.23,mat(0x9ab1a0),true);
for(const z of [-2.35,-1.45]){cyl(2.15,.47,z,.055,.72,mat(0x8c9da0));cyl(2.15,.47,z+.53,.055,.72,mat(0x8c9da0));box(2.15,.74,z+.265,.04,.04,.53,mat(0x8c9da0))}
// Pole, street lamp, signs, cables.
cyl(3.23,1.65,-2.95,.07,3.08,trim);wire([[3.23,3.07,-2.95],[2.55,3.01,-2.95]],0x334752,.045);box(2.49,2.99,-2.95,.29,.07,.22,white);bulb(2.49,2.85,-2.95,0xffd5a3,2.2,3.2);
cyl(-3.32,2,-3.15,.075,3.74,mat(0x45565d));for(const y of [2.8,3.26])box(-3.32,y,-3.15,.62,.045,.055,trim);
wire([[-3.62,3.25,-3.15],[-1.3,3.01,-3.68],[1.1,3.12,-3.58],[3.23,3.05,-2.95]],0x23313e,.013);
wire([[-3.62,2.83,-3.15],[-1.2,2.66,-3.57],[1.1,2.84,-3.61],[3.23,2.7,-2.95]],0x293745,.01);
box(3.2,2.55,-2.95,.09,.32,.23,mat(0x485e64));box(3.2,2.55,-2.82,.04,.12,.02,mat(0x7ac59d,{emissive:0x45b97e,emissiveIntensity:1.1}));
const street=label('ひかり通り',.62,.19,'#608b9a','#f8f5e9',Math.PI/2);street.position.set(3.31,1.91,-2.48);
// Alley slit, outdoor unit and small poster board.
box(-3.08,.61,-2.45,.2,.8,.43,mat(0x81939a),true);for(let j=0;j<4;j++)box(-2.96,.43+j*.12,-2.45,.02,.025,.31,trim);
box(-3.42,.85,-.52,.12,1.26,.82,mat(0x6e8690),true);const poster=label('新発売  コーヒー',.54,.83,'#f3ddc5','#b96362',Math.PI/2);poster.position.set(-3.35,.88,-.5);
box(-2.94,.45,-3.26,.5,.8,.33,mat(0x435661));box(-2.94,.87,-3.26,.55,.07,.37,mat(0x31434d));
// Fine pavement slabs, gutters, distant warm pools.
const ripples=[];
for(let x=-3.35;x<1.85;x+=.56)for(let z=-2.88;z<.8;z+=.56){if(Math.abs(x)<2&&z<.65)continue;box(x,.132,z,.012,.003,.48,mat(0x4a5a63,{transparent:true,opacity:.42}))}
for(const [x,z] of [[-.2,1.6],[1.3,2.9],[2.8,-.4]]){const ring=new THREE.Mesh(new THREE.RingGeometry(.12,.135,32),new THREE.MeshBasicMaterial({color:0x9ac8d4,transparent:true,opacity:.35,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.159,z);scene.add(ring);ripples.push(ring)}

// Rain strokes stay inside the collectible's footprint.
const count=310, rainPos=new Float32Array(count*6),drops=[];
for(let i=0;i<count;i++){const x=(Math.random()-.5)*7.2,z=(Math.random()-.5)*7.2,y=.2+Math.random()*4.1,s=.025+Math.random()*.08;drops.push({x,y,z,s});}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xa6d9e2,transparent:true,opacity:.32,depthWrite:false}));scene.add(rain);
const drips=[];for(let i=0;i<27;i++){const x=-2.85+i*.17;const d=box(x,1.98,.985,.011,.08,.011,mat(0xaedce5,{transparent:true,opacity:.58}));drips.push({mesh:d,phase:Math.random()*6.28})}
const glassRuns=[];for(let i=0;i<19;i++){const x=-2.66+Math.random()*3.78;const d=box(x,1+Math.random()*.7,.801,.008,.05+Math.random()*.12,.006,mat(0xc7eff0,{transparent:true,opacity:.37,depthWrite:false}));glassRuns.push({mesh:d,phase:Math.random()*6.28})}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const t=clock.getElapsedTime();controls.update();
  for(let i=0;i<count;i++){const d=drops[i];d.y-=.055+d.s*.25;if(d.y<.18){d.y=3.5+Math.random()*.9;d.x=(Math.random()-.5)*7.2;d.z=(Math.random()-.5)*7.2}const k=i*6;rainPos[k]=d.x;rainPos[k+1]=d.y;rainPos[k+2]=d.z;rainPos[k+3]=d.x-.045;rainPos[k+4]=d.y-.17;rainPos[k+5]=d.z+.035}rainGeo.attributes.position.needsUpdate=true;
  const open=Math.max(0,Math.sin(t*.42-1.2)-.78)/.22;doorL.position.x=-.13-open*.35;doorR.position.x=.47+open*.35;
  for(const [i,d] of drips.entries()){d.mesh.position.y=1.95-((t*.53+d.phase+i*.03)%1)*.63;d.mesh.scale.y=.45+Math.sin(t*3+d.phase)*.2}
  for(const d of glassRuns)d.mesh.position.y=.9+((t*.18+d.phase)%1)*.92;
  for(const [i,r] of ripples.entries()){const phase=(t*.38+i*.32)%1;r.scale.setScalar(.45+phase*2.5);r.material.opacity=.34*(1-phase)}
  sign.material.opacity=.97+.03*Math.sin(t*2.7);renderer.render(scene,camera)}
animate();
function resize(){const a=innerWidth/innerHeight,span=5.8;camera.left=-span*a;camera.right=span*a;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
addEventListener('resize',resize);resize();
