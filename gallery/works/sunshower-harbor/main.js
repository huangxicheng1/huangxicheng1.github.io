import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createBoats} from './boats.js';
import {createBuildings} from './buildings.js';
import {createProps} from './props.js';
const scene=new THREE.Scene(); scene.background=new THREE.Color('#dcefeb'); scene.fog=new THREE.Fog('#dcefeb',48,100);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,150); camera.position.set(24,22,28);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.2; document.body.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,1,0); controls.enableDamping=true; controls.minDistance=14; controls.maxDistance=65; controls.maxPolarAngle=Math.PI*.49; controls.update();
scene.add(new THREE.HemisphereLight(0xeafffb,0x8aaba4,2.1)); const sun=new THREE.DirectionalLight(0xfff1c9,2.5); sun.position.set(-15,28,12); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;sun.shadow.normalBias=.035;scene.add(sun);
const mat=(c,opts={})=>new THREE.MeshStandardMaterial({color:c,roughness:.85,...opts});
const concrete=mat('#c8d0c8'), side=mat('#aab9b1'), dark=mat('#587d79'), sand=mat('#99aca0');
function box(w,h,d,m,x,y,z){const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);q.castShadow=true;q.receiveShadow=true;scene.add(q);return q}
// Complete square geological slice, with concrete quay occupying an L.
box(20,1.5,20,sand,0,-1.55,0);box(8,2.05,20,side,-6,-.58,0);box(12,2.05,5,side,4,-.58,7.5);box(8,.25,20,concrete,-6,.55,0);box(12,.25,5,concrete,4,.55,7.5);
// horizontal masonry bands and seams on quay walls
for(let y=-1.4;y<.5;y+=.55){box(.035,.025,15,mat('#839d95'),-1.98,y,-2.5);box(12,.025,.035,mat('#839d95'),4,y,4.98)}
for(let z=-9.7;z<5;z+=2.1)for(let y=-1.15;y<.5;y+=.55)box(.04,.48,.025,mat('#96a9a1'),-1.96,y,z+(Math.round(y*10)%2)*.4);
// water volume, deliberately translucent so the cutaway reads as water
const waterSide=new THREE.MeshStandardMaterial({color:'#6bbcb2',transparent:true,opacity:.46,roughness:.25,depthWrite:false,side:THREE.DoubleSide});box(12,1.9,15,waterSide,4,-.48,-2.5);
const seaFloor=mat('#9fb5a3');box(12,.08,15,seaFloor,4,-1.48,-2.5);
for(let i=0;i<115;i++){let x=-1.5+Math.random()*11,z=-9.5+Math.random()*14;let p=new THREE.Mesh(new THREE.DodecahedronGeometry(.05+Math.random()*.14,0),mat(i%3?'#a1b8ad':'#d2cdb7'));p.position.set(x,-1.39,z);p.scale.y=.5;scene.add(p)}
const waterGeo=new THREE.PlaneGeometry(12,15,42,52); waterGeo.rotateX(-Math.PI/2); const original=waterGeo.attributes.position.array.slice();const water=new THREE.Mesh(waterGeo,new THREE.MeshStandardMaterial({color:'#79c9bd',transparent:true,opacity:.84,roughness:.27,metalness:.05,side:THREE.DoubleSide}));water.position.set(4,.38,-2.5);water.receiveShadow=true;scene.add(water);
// deliberately angular posterized highlights floating on the sea
const flecks=[];for(let i=0;i<150;i++){let g=new THREE.PlaneGeometry(.12+Math.random()*.8,.025+Math.random()*.12);g.rotateX(-Math.PI/2);let m=new THREE.MeshBasicMaterial({color:[0xd8f4e6,0xa5e4d6,0x469d99,0x286f7d][i%4],transparent:true,opacity:.5});let o=new THREE.Mesh(g,m);o.position.set(-1.6+Math.random()*11.3,.43,-9.7+Math.random()*14.4);scene.add(o);flecks.push(o)}
// underwater details: weeds, fish, discarded tire and anchor chain
const seaweed=[];for(let i=0;i<28;i++){let stem=new THREE.Mesh(new THREE.ConeGeometry(.06,.8+Math.random()*.5,5),mat(i%2?'#558f71':'#76a585'));stem.position.set(-1+Math.random()*10,-.9,-9+Math.random()*13);stem.rotation.z=(Math.random()-.5)*.5;scene.add(stem);seaweed.push(stem)}
let tire=new THREE.Mesh(new THREE.TorusGeometry(.55,.17,8,18),mat('#455a58'));tire.rotation.x=Math.PI/2;tire.position.set(8,-1.25,-7);scene.add(tire);
const fishes=[];for(let i=0;i<9;i++){let f=new THREE.Group();let body=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),mat(i%2?'#d8e7c7':'#88b7ac'));body.scale.set(1.8,.65,.65);f.add(body);let tail=new THREE.Mesh(new THREE.ConeGeometry(.11,.19,3),mat('#9bc5b7'));tail.rotation.z=-Math.PI/2;tail.position.x=-.25;f.add(tail);f.position.set(Math.random()*10-1,-.55-Math.random()*.5,-9+Math.random()*13);scene.add(f);fishes.push(f)}
// scattered sea foam and rain rings
const rings=[];for(let i=0;i<25;i++){let ring=new THREE.Mesh(new THREE.RingGeometry(.09,.115,24),new THREE.MeshBasicMaterial({color:'#e9fff3',transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(-1.8+Math.random()*11.5,.46,-9.8+Math.random()*14.5);scene.add(ring);rings.push(ring)}
// sun shower: fine, luminous short strokes
let count=500, arr=new Float32Array(count*6);for(let i=0;i<count;i++){let x=Math.random()*27-13,y=Math.random()*15+1,z=Math.random()*27-13;arr.set([x,y,z,x-.08,y-.32,z+.04],i*6)}const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(arr,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#fff1c7',transparent:true,opacity:.42}));scene.add(rain);
// A fleeting rainbow only appears occasionally through the sun shower.
const rainbow=new THREE.Group();for(let i=0;i<4;i++){let m=new THREE.MeshBasicMaterial({color:[0xeeb3a4,0xf3d0a3,0xc5deb8,0xa9d8d7][i],transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});let arc=new THREE.Mesh(new THREE.TorusGeometry(4.5+i*.13,.045,5,64,Math.PI),m);rainbow.add(arc)}rainbow.position.set(4,6,-9);scene.add(rainbow);
// Birds as minimal angular strokes, above and beyond the harbor
const birds=[];for(let i=0;i<7;i++){let g=new THREE.Group();let geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.45,0,0),new THREE.Vector3(0,-.12,0),new THREE.Vector3(.45,0,0)]);g.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#718d89'})));g.position.set(-7+i*2,7+i%3,-6+i*.6);scene.add(g);birds.push(g)}
// Concrete steps descend into the water at the inside corner.
for(let i=0;i<4;i++)box(2.7,.18,1.1,concrete,-.8+i*.25,.48-i*.19,4.15-i*.7);
// Tetrapods: four stout tapered arms meet around a single center.
for(let i=0;i<7;i++){const g=new THREE.Group();const m=mat(i%2?'#c7d1c9':'#e0e3d8');for(const v of [[0,1,0],[.82,-.4,0],[-.41,-.4,.71],[-.41,-.4,-.71]]){let arm=new THREE.Mesh(new THREE.CylinderGeometry(.17,.31,1.05,6),m);let dir=new THREE.Vector3(...v).normalize();arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);arm.position.copy(dir.multiplyScalar(.4));g.add(arm)}g.position.set(8.1+(i%3)*.62,.42,-8.4+Math.floor(i/3)*.7);g.rotation.y=i;g.scale.setScalar(.8);scene.add(g)}
// Old iron ladder, tide marks and shells on the exposed quay face.
const rust=mat('#956a50');for(let z of [-6,-5.25])box(.09,2,.09,rust,-1.91,-.35,z);for(let y=-1.2;y<.7;y+=.3)box(.1,.07,.83,rust,-1.9,y,-5.62);
for(let i=0;i<60;i++){let shell=new THREE.Mesh(new THREE.SphereGeometry(.08+Math.random()*.05,6,4),mat(i%2?'#d5d5c1':'#9aafa1'));shell.position.set(-1.89,-1.15+Math.random()*.4,-9+Math.random()*13);shell.scale.x=.35;scene.add(shell)}
// Puddles on the quay, reduced to quiet, reflective color shapes.
for(let i=0;i<18;i++){let puddle=new THREE.Mesh(new THREE.CircleGeometry(.3+Math.random()*.5,12),new THREE.MeshBasicMaterial({color:'#a8c9c4',transparent:true,opacity:.35}));puddle.rotation.x=-Math.PI/2;puddle.scale.y=.3;puddle.position.set(-9+Math.random()*6,.686,-9+Math.random()*18);scene.add(puddle)}

scene.add(createBuildings()); const boatUpdate=createBoats(scene); const props=createProps(scene);
let clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);let t=clock.getElapsedTime(); let phase=t%95; rainbow.children.forEach(a=>a.material.opacity=phase>80&&phase<87 ? Math.sin((phase-80)/7*Math.PI)*.22 : 0); sun.intensity=2.4+Math.sin(t*.08)*.12;const p=waterGeo.attributes.position;for(let i=0;i<p.count;i++){let x=original[i*3],z=original[i*3+2];p.array[i*3+1]=Math.sin(x*1.5+t*.9)*.035+Math.sin(z*1.8-t*.7)*.028}p.needsUpdate=true;waterGeo.computeVertexNormals();flecks.forEach((f,i)=>{f.position.y=.45+Math.sin(t+i)*.025;f.material.opacity=.3+.23*(1+Math.sin(t*1.3+i))/2});rings.forEach((r,i)=>{let s=((t*.5+i*.31)%2);r.scale.setScalar(.2+s*2);r.material.opacity=.45*(1-s/2)});for(let i=0;i<count;i++){let j=i*6;arr[j]-=.018;arr[j+1]-=.12;arr[j+3]-=.018;arr[j+4]-=.12;if(arr[j+1]<.5){arr[j+1]=15;arr[j+4]=14.68;arr[j]=Math.random()*27-13;arr[j+3]=arr[j]-.08}}rainGeo.attributes.position.needsUpdate=true;seaweed.forEach((s,i)=>s.rotation.z=Math.sin(t*.8+i)*.2);fishes.forEach((f,i)=>{f.position.x+=Math.sin(t*.5+i)*.006;f.position.z+=.004*Math.cos(t*.4+i)});birds.forEach((b,i)=>{b.position.x=Math.sin(t*.12+i)*7;b.position.z=-5+Math.cos(t*.12+i)*5;b.rotation.y=-t*.12-i});boatUpdate(t); props.update(t);controls.update();renderer.render(scene,camera)}animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});




