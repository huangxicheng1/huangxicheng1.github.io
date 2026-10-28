import * as THREE from 'three';

// Small working objects arranged on the quay. Coordinates are local to the quay surface.
export function createProps(scene) {
  const group = new THREE.Group(); group.position.y = 0.675; scene.add(group);
  const mat = (color, opts={}) => new THREE.MeshStandardMaterial({color, roughness: 0.85, ...opts});
  const dark=mat(0x283c3d), iron=mat(0x374448), rust=mat(0x9e6650), cream=mat(0xf1f0e7), yellow=mat(0xf5c64b), blue=mat(0x539bb1), orange=mat(0xe3835e), rope=mat(0xa47c59), glass=mat(0xe9ffff,{transparent:true,opacity:.35,roughness:.15,side:THREE.DoubleSide,depthWrite:false});
  const box=(w,h,d,m,x,y,z, parent=group)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o};
  const cyl=(r1,r2,h,m,x,y,z,parent=group,segments=12)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o};
  const sphere=(r,m,x,y,z,parent=group)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,10,7),m);o.position.set(x,y,z);parent.add(o);return o};
  const bar=(a,b,r,m,parent=group)=>{let dir=new THREE.Vector3().subVectors(b,a),o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,dir.length(),8),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());parent.add(o);return o};
  const line=(points,m=rope,r=.026,parent=group)=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,30,r,6,false),m);parent.add(o);return o};
  // Curbs use individual black diagonal patches, like weathered harbour markings.
  box(.35,.22,13,yellow,-.15,.11,-1.5);
  for(let z=-7.7;z<5;z+=.72){let s=box(.37,.23,.28,dark,-.15,.115,z);s.rotation.y=.48;}
  box(10,.22,.35,yellow,5,.11,5.1);
  for(let x=.35;x<10;x+=.72){let s=box(.28,.23,.37,dark,x,.115,5.1);s.rotation.y=.48;}
  // Mooring bollards with rings of heavy rope.
  for (let z of [-6.1,-3.2,-.3,2.65]) {
    cyl(.27,.32,.13,dark,-.8,.065,z); cyl(.17,.22,.55,dark,-.8,.36,z);cyl(.29,.22,.16,dark,-.8,.72,z);
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.19,.035,6,20),rope);ring.rotation.x=Math.PI/2;ring.position.set(-.8,.28+i*.07,z);group.add(ring);}
    line([[-.62,.32,z],[-.18,.18,z+.15],[.25,-.05,z+.34],[.7,-.27,z+.5]],rope,.045);
  }
  // Two instrument cases, with silver seams, handles and clasps.
  for(let i=0;i<2;i++){
    let x=-3.5+i*1.08,z=7.95;let c=box(.82,.19,2.05,mat(i?0x9daeb0:0xb8c5c6,{metalness:.45}),x,.13,z);c.rotation.y=-.12;
    box(.7,.025,1.9,mat(0xd5dede,{metalness:.35}),x,.24,z).rotation.y=-.12;
    for(let zz of [-.6,.55])box(.12,.05,.09,dark,x+.4,.23,z+zz);
    bar(new THREE.Vector3(x-.12,.28,z),new THREE.Vector3(x+.2,.28,z),.025,dark);
  }
  // Clear umbrella tilted against the steps: canopy is faceted, with delicate ribs.
  const umbrella=new THREE.Group();umbrella.position.set(1.1,.11,7.05);umbrella.rotation.z=-.36;group.add(umbrella);
  cyl(.025,.025,1.56,iron,0,.79,0,umbrella);const canopy=new THREE.Mesh(new THREE.SphereGeometry(.85,16,6,0,Math.PI*2,0,Math.PI*.43),glass);canopy.position.y=1.45;canopy.scale.y=.43;umbrella.add(canopy);
  for(let i=0;i<10;i++){let a=i*Math.PI*2/10;bar(new THREE.Vector3(0,1.81,0),new THREE.Vector3(Math.cos(a)*.83,1.5,Math.sin(a)*.83),.009,cream,umbrella);sphere(.026,cream,Math.cos(a)*.83,1.5,Math.sin(a)*.83,umbrella)}
  // Stacked fish crates with open-looking ribs and drainage slots.
  function crate(x,z,y,col=cream){let g=new THREE.Group();g.position.set(x,y,z);group.add(g);box(.83,.1,.53,col,0,.05,0,g);for(let s of [-1,1]){box(.08,.33,.53,col,s*.38,.22,0,g);box(.83,.33,.07,col,0,.22,s*.23,g);}for(let k=-2;k<=2;k++)box(.03,.12,.012,dark,k*.13,.23,.271,g);return g;}
  crate(-4.9,5.85,0);crate(-4.92,5.85,.42);crate(-5.85,5.85,0,blue);crate(-5.85,5.85,.42,blue);crate(-5.85,5.85,.84,cream);
  // Harbour light: round shade and warm bulb.
  function lamp(x,z){cyl(.19,.23,.15,dark,x,.08,z);cyl(.045,.06,3.2,iron,x,1.68,z);bar(new THREE.Vector3(x,3.2,z),new THREE.Vector3(x+.53,3.35,z),.04,iron);cyl(.37,.28,.12,iron,x+.53,3.27,z);cyl(.23,.26,.12,mat(0xffe8aa,{emissive:0xe7b85c,emissiveIntensity:.5}),x+.53,3.17,z);const ring=new THREE.Mesh(new THREE.TorusGeometry(.36,.035,6,24),iron);ring.rotation.x=Math.PI/2;ring.position.set(x+.53,3.31,z);group.add(ring)}
  lamp(-2.4,-5.9);lamp(-2.2,4.15);
  line([[-2.4,3.3,-5.9],[-2.15,3.0,-1],[-2.2,3.3,4.15]],dark,.015);
  // Landing steps, buckets, handled landing net.
  for(let i=0;i<3;i++)box(2.2,.12, .55,mat(0xbcc9c4),1.5,.06-i*.11,5.42+i*.55);
  cyl(.25,.19,.48,blue,-5.2,.24,7.25);cyl(.22,.2,.04,mat(0x7fc0c8),-5.2,.49,7.25);
  bar(new THREE.Vector3(-5.65,.04,7.1),new THREE.Vector3(-5.95,1.65,7.1),.035,rope);
  let hoop=new THREE.Mesh(new THREE.TorusGeometry(.3,.025,7,20),iron);hoop.position.set(-6,1.75,7.1);group.add(hoop);
  // Hand winch: drum, spokes, handle, and hanging rope.
  box(.8,.12,.55,rust,-4.1,.08,3.2);box(.1,.65,.42,rust,-4.4,.39,3.2);box(.1,.65,.42,rust,-3.8,.39,3.2);
  let drum=cyl(.24,.24,.65,rope,-4.1,.62,3.2);drum.rotation.z=Math.PI/2;
  bar(new THREE.Vector3(-3.74,.62,3.2),new THREE.Vector3(-3.65,1,3.2),.035,iron);sphere(.07,dark,-3.65,1,3.2);
  bar(new THREE.Vector3(-4.5,.05,2),new THREE.Vector3(-4.5,2.4,2),.06,iron);bar(new THREE.Vector3(-4.5,2.4,2),new THREE.Vector3(-3.1,2.4,2),.055,iron);line([[-3.1,2.4,2],[-3.1,1.2,2],[-3,1.05,2]],rope,.025);
  // Suspended fishing net and floats.
  bar(new THREE.Vector3(-7,.05,3.3),new THREE.Vector3(-7,1.85,3.3),.035,iron);bar(new THREE.Vector3(-5.2,.05,3.3),new THREE.Vector3(-5.2,1.85,3.3),.035,iron);bar(new THREE.Vector3(-7,1.85,3.3),new THREE.Vector3(-5.2,1.85,3.3),.035,iron);
  const net = new THREE.Group();group.add(net);
  for(let i=0;i<=8;i++){let x=-7+i*.225;line([[x,1.8,3.3],[x+.04,1.25,3.33],[x,.55,3.3]],mat(0x96b0a3),.009,net)}
  for(let i=0;i<6;i++){let y=.62+i*.23;line([[-7,y,3.3],[-6.1,y-.1,3.34],[-5.2,y,3.3]],mat(0x96b0a3),.009,net)}
  for(let i=0;i<8;i++)sphere(.08,i%2?orange:cream,-6.95+i*.24,1.81,3.3);
  // Windsock and little pennants animate gently.
  const windsock = new THREE.Group();windsock.position.set(-7.9,2.6,1.1);group.add(windsock);cyl(.045,.06,2.6,iron,-7.9,1.3,1.1);let sock=cyl(.13,.23,1.25,orange,.62,0,0,windsock);sock.rotation.z=Math.PI/2;for(let i=0;i<3;i++){let band=cyl(.16-i*.025,.17-i*.025,.15,cream,.32+i*.33,0,0,windsock);band.rotation.z=Math.PI/2;}
  // Faded notice board, lettering rendered as a canvas texture.
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#e8e5d5';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#7b9b94';ctx.lineWidth=12;ctx.strokeRect(8,8,496,240);ctx.fillStyle='#426b69';ctx.textAlign='center';ctx.font='bold 58px sans-serif';ctx.fillText('しおかぜ漁港',256,102);ctx.fillStyle='#b56c4d';ctx.font='bold 48px sans-serif';ctx.fillText('注意 落水',256,187);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.82),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));sign.position.set(-7.6,1.25,5.4);group.add(sign);bar(new THREE.Vector3(-8.1,0,5.4),new THREE.Vector3(-8.1,1.55,5.4),.04,iron);bar(new THREE.Vector3(-7.1,0,5.4),new THREE.Vector3(-7.1,1.55,5.4),.04,iron);
  // A weathered drink machine tucked beside the quay, its small display still lit.
  const vending=mat(0xe6ebe3), vendingFace=mat(0xadd6d6,{emissive:0x6aabb2,emissiveIntensity:.25});
  box(.96,1.8,.65,vending,-8.85,.9,6.8);box(.76,.83,.025,vendingFace,-8.85,1.25,7.14);box(.8,.15,.05,cream,-8.85,1.72,7.16);
  for(let i=0;i<5;i++){cyl(.035,.035,.15,i%2?orange:blue,-9.13+i*.14,1.22,7.17);}
  box(.56,.2,.03,dark,-8.9,.48,7.15);box(1.13,.09,.84,rust,-8.85,1.85,6.83);
  // A faded numbered buoy and a loop of line left on the ground.
  sphere(.22,orange,-5.45,.23,8.75);cyl(.04,.04,.13,cream,-5.45,.49,8.75);line([[-5.3,.05,8.75],[-4.9,.04,8.65],[-4.8,.04,8.95],[-5.15,.04,9.1],[-5.35,.04,8.92]],rope,.025);
  return {group, update(time){windsock.rotation.y=Math.sin(time*.7)*.14;windsock.rotation.z=Math.sin(time*1.2)*.06;net.rotation.z=Math.sin(time*.9)*.012;}};
}
