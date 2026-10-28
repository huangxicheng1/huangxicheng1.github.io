import * as THREE from 'three';

// A small set of hand-built structures for the harbor diorama. Ground level is y=0.
export function createBuildings() {
  const group = new THREE.Group();
  group.position.y = 0.675;
  const M = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:0.86, ...extra});
  const plaster=M(0xeae9df), trim=M(0x8ba3a0), dark=M(0x475c60), wood=M(0x9c795a), roof=M(0x6c8081), white=M(0xf8f8eb), red=M(0xcd6754), green=M(0x759a75), glass=M(0xaadbd7,{transparent:true,opacity:.24,roughness:.15,side:THREE.DoubleSide,depthWrite:false});
  function box(parent,w,h,d,x,y,z,mat){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
  function cyl(parent,rt,rb,h,x,y,z,mat,n=12){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,n),mat);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o}
  function textPanel(parent, text, w,h,x,y,z, color='#476a6a', bg='#e7e9dc', size=56){
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${size}px sans-serif`;text.split('\n').forEach((s,i,a)=>ctx.fillText(s,256,128+(i-(a.length-1)/2)*65));
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex}));p.position.set(x,y,z);parent.add(p);return p;
  }
  function fishBox(p,x,y,z,col=0xe9f2eb){const mat=M(col);box(p,.62,.28,.42,x,y,z,mat);box(p,.64,.035,.44,x,y+.15,z,trim);for(let i=-1;i<=1;i++)box(p,.04,.19,.014,x+i*.17,y,z+.215,trim)}
  function house(x,z,s=1){const h=new THREE.Group();h.position.set(x,0,z);h.scale.setScalar(s);group.add(h);box(h,2.8,2.4,2.6,0,1.2,0,plaster);const rg=new THREE.ConeGeometry(2.35,.85,4);const r=new THREE.Mesh(rg,roof);r.rotation.y=Math.PI/4;r.position.y=2.78;r.castShadow=true;h.add(r);box(h,.6,1.35,.05,.65,.7,1.33,wood);box(h,.8,.65,.06,-.55,1.48,1.34,glass);box(h,.8,.045,.07,-.55,1.48,1.38,white);box(h,.045,.65,.07,-.55,1.48,1.38,white);return h}

  // Fishermen's cooperative warehouse, open facade exposing stocked interior.
  const wh=new THREE.Group();wh.position.set(-6.8,0,-3.5);group.add(wh);
  box(wh,4.6,.14,3.8,0,.07,0,plaster);box(wh,.13,3.1,3.8,-2.25,1.62,0,plaster);box(wh,.13,3.1,3.8,2.25,1.62,0,plaster);box(wh,4.5,3.1,.13,0,1.62,-1.85,plaster);
  box(wh,.55,3.1,.14,-2,1.62,1.85,plaster);box(wh,.55,3.1,.14,2,1.62,1.85,plaster);box(wh,4.6,.7,.14,0,2.85,1.85,plaster);
  box(wh,4.85,.22,4.05,0,3.25,0,roof);box(wh,4.5,.38,.12,0,2.45,1.87,trim);
  for(let j=0;j<4;j++)box(wh,4.4,.025,.14,0,2.29+j*.095,1.95,white);
  textPanel(wh,'漁業協同組合',2.4,.36,0,2.92,1.94,'#456d69','#e8e9dc',55);
  for(let ix=0;ix<3;ix++)for(let iy=0;iy<3;iy++) fishBox(wh,-1.65+ix*.65,.23+iy*.29,-1.3,iy===1?0xc9dfdb:0xf1f4e9);
  box(wh,1.3,.75,.78,.85,.48,-1.22,white);box(wh,1.38,.09,.84,.85,.9,-1.22,trim); // freezer
  box(wh,.8,.65,.07,.45,1.85,-1.76,dark);textPanel(wh,'本日の市況\nあじ  480',.72,.56,.45,1.85,-1.715,'#e7e5c9','#435d59',48);
  box(wh,.52,.12,.42,1.45,.3,.8,dark);box(wh,.08,.48,.08,1.45,.6,.8,dark);box(wh,.37,.26,.12,1.45,.88,.8,trim); // scale
  for(let i=0;i<3;i++){box(wh,.16,.48,.13,-1.3+i*.3,1.25,-1.75,M(0x9aafa0));box(wh,.24,.1,.17,-1.26+i*.3,1.03,-1.69,M(0x6a8179));}
  for(let i=0;i<6;i++){const ice=box(wh,.13,.08,.12,-1.2+i*.28,.18,.7+Math.sin(i*4)*.2,M(0xd7f1ed,{transparent:true,opacity:.65}));ice.rotation.y=i;}
  // glazed clerestory on visible right wall
  for(let i=0;i<3;i++)box(wh,.025,.43,.75,2.32,2.55,-1.15+i*.9,glass);

  // Waiting room, open front, glass side, little lived-in contents.
  const wait=new THREE.Group();wait.position.set(-6.9,0,2.1);group.add(wait);
  box(wait,3.7,.15,2.65,0,.075,0,plaster);box(wait,.12,2.45,2.65,-1.8,1.3,0,trim);box(wait,.12,2.45,2.65,1.8,1.3,0,trim);box(wait,3.6,2.45,.12,0,1.3,-1.28,plaster);
  box(wait,3.95,.16,2.9,0,2.58,0,roof);box(wait,3.8,.16,.12,0,2.3,1.3,trim);for(const x of [-1.75,0,1.75])box(wait,.08,2.2,.08,x,1.2,1.32,trim);
  box(wait,1.66,2.08,.025,-.9,1.2,1.31,glass);box(wait,1.66,2.08,.025,.9,1.2,1.31,glass);
  box(wait,1.9,.16,.48,-.25,.52,-.72,wood);box(wait,1.9,.7,.12,-.25,.93,-.9,wood);for(const x of [-1,.5])box(wait,.1,.48,.35,x,.28,-.7,dark);
  textPanel(wait,'時刻表\n港  →  島',1.05,.64,-.9,1.75,-1.2,'#57726c','#f4eee0',55);
  box(wait,.56,.3,.25,.9,1,-1.02,dark);box(wait,.36,.14,.02,.9,1,-.88,M(0xd2cfad));
  cyl(wait,.11,.14,.34,1.3,.32,.65,M(0xe6e8dc));cyl(wait,.16,.16,.08,1.3,.53,.65,white);
  cyl(wait,.22,.17,.32,-1.3,.3,.7,M(0xb98361));for(let i=0;i<5;i++){let leaf=new THREE.Mesh(new THREE.SphereGeometry(.19,7,5),green);leaf.position.set(-1.3+Math.sin(i*2)*.23,.64+i%2*.15,.7+Math.cos(i*2)*.14);leaf.scale.set(1,.5,.6);wait.add(leaf);}
  const clock=cyl(wait,.22,.22,.06,.9,1.95,-1.18,white,20);clock.rotation.x=Math.PI/2;box(wait,.025,.15,.015,.9,1.98,-1.13,dark);box(wait,.1,.025,.015,.94,1.95,-1.12,dark);
  textPanel(wait,'待 合 室',1.3,.28,0,2.34,1.39,'#516d68','#edf1e7',62);

  // wooded hill and a cluster of low tiled homes
  const hill=new THREE.Mesh(new THREE.SphereGeometry(3.3,18,10),M(0xb1cba1));hill.scale.set(1,.36,.8);hill.position.set(-7.8,.05,-8.1);hill.receiveShadow=true;group.add(hill);
  house(-8.7,-8.4,.55);house(-6.5,-8.8,.45);
  function tree(x,z,sc=1){const t=new THREE.Group();t.position.set(x,.45,z);t.scale.setScalar(sc);group.add(t);cyl(t,.1,.15,1,0,.5,0,wood,8);for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.65-i*.09,9,7),M([0x91b894,0xa8c9a1,0x7fa98b][i]));m.position.set((i-1)*.25,1.2+i*.25,0);m.scale.set(1,.8,.85);t.add(m)}}
  tree(-9.3,-6.9,.85);tree(-9.4,-9.5,1);tree(-5.4,-9.4,.7);tree(-6,-7.1,.65);

  // Short breakwater and beacon, sitting on the far water edge.
  box(group,7.2,.65,.72,5.8,-.325,-8.6,plaster);box(group,7.2,.12,.8,5.8,.055,-8.6,white);
  const light=new THREE.Group();light.position.set(8.55,.075,-8.6);group.add(light);
  cyl(light,.48,.66,.24,0,.12,0,plaster,16);cyl(light,.32,.44,1.55,0,.98,0,white,16);cyl(light,.36,.38,.38,0,1.55,0,red,16);cyl(light,.31,.31,.38,0,1.91,0,M(0xf3d99c,{emissive:0xb49b63,emissiveIntensity:.28}),12);cyl(light,.45,.32,.2,0,2.18,0,red,12);cyl(light,.05,.05,.22,0,2.38,0,red,8);
  return group;
}

