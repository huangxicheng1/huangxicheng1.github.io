import * as THREE from 'three';

// Three small, individually dressed working boats for the harbor diorama.
export function createBoats(scene) {
  const white = new THREE.MeshStandardMaterial({color:0xf5f5ec, roughness:.72});
  const cream = new THREE.MeshStandardMaterial({color:0xe8e8db, roughness:.8});
  const edge = new THREE.MeshStandardMaterial({color:0x617d7c, roughness:.8});
  const dark = new THREE.MeshStandardMaterial({color:0x253b3f, roughness:.9});
  const orange = new THREE.MeshStandardMaterial({color:0xee7043, roughness:.8});
  const wood = new THREE.MeshStandardMaterial({color:0xa88c6b, roughness:.92});
  const blue = new THREE.MeshStandardMaterial({color:0x619ca4, roughness:.72});
  const glass = new THREE.MeshStandardMaterial({color:0xc6edeb, transparent:true, opacity:.26, roughness:.14, metalness:.05, side:THREE.DoubleSide, depthWrite:false});
  const rubber = new THREE.MeshStandardMaterial({color:0x384a49, roughness:1});
  const glow = new THREE.MeshStandardMaterial({color:0x78e6d4, emissive:0x2a9e99, emissiveIntensity:.65});
  const ropeMat = new THREE.MeshStandardMaterial({color:0xb87548, roughness:1});
  const boatRecords=[];
  const makeBox=(parent,x,y,z,w,h,d,mat)=>{let m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const rod=(parent,a,b,r,mat)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start);const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),6),mat);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());parent.add(m);return m;};
  const ring=(parent,x,y,z,r,t,mat,rotY=Math.PI/2)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(r,t,6,20),mat);m.position.set(x,y,z);m.rotation.y=rotY;parent.add(m);return m;};
  function hull(parent, length, width) {
    const w=width/2,l=length/2;
    const pts=[[-w,-l], [w,-l], [w,l*.53], [w*.53,l*.82], [0,l],[-w*.53,l*.82],[-w,l*.53]];
    const vs=[];
    for(const [x,z] of pts) vs.push(x,.42,z);
    for(const [x,z] of pts) vs.push(x*.70,-.16,z*.84);
    const idx=[]; for(let i=0;i<pts.length;i++){let n=(i+1)%pts.length;idx.push(i,n,i+7,n,n+7,i+7);}
    for(let i=1;i<pts.length-1;i++)idx.push(0,i+1,i);
    const geom=new THREE.BufferGeometry(); geom.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));geom.setIndex(idx);geom.computeVertexNormals();
    const mesh=new THREE.Mesh(geom,white);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
    // A fine dark waterline makes the sculpted silhouette legible.
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];rod(parent,[a[0],.23,a[1]],[b[0],.23,b[1]],.025,blue);rod(parent,[a[0],.43,a[1]],[b[0],.43,b[1]],.027,edge);}
  }
  function boat(z0, variant) {
    const group=new THREE.Group(); group.position.set(-.75,.38,z0); scene.add(group);
    const length=variant===1?3.5:3.2, width=1.48, w=width/2;
    hull(group,length,width);
    // Open aft working well and little fittings.
    makeBox(group,0,.46,-.91,1.06,.06,.90,wood);
    makeBox(group,0,.51,-1.13,.8,.10,.16,cream);
    makeBox(group,-.37,.57,-.68,.28,.20,.30,blue);
    for(let j=0;j<3;j++) makeBox(group,-.37,.69,-.79+j*.10,.3,.018,.02,white);
    // Cabin glass deliberately remains transparent so the wheel and screens show through.
    const cabZ=variant===1?.05:.20;
    makeBox(group,0,.52,cabZ,1.06,.14,1.23,cream);
    for(const x of [-.51,.51]) for(const z of [cabZ-.58,cabZ+.58]) rod(group,[x,.56,z],[x,1.39,z],.026,edge);
    makeBox(group,-.51,.97,cabZ,.018,.70,1.11,glass);
    makeBox(group,.51,.97,cabZ,.018,.70,1.11,glass);
    makeBox(group,0,.97,cabZ+.58,1.01,.70,.018,glass);
    // Open cabin door at the rear.
    makeBox(group,-.37,.97,cabZ-.58,.27,.70,.018,glass);
    makeBox(group,.40,.97,cabZ-.58,.22,.70,.018,glass);
    makeBox(group,0,1.42,cabZ,1.18,.12,1.36,white);
    makeBox(group,0,1.50,cabZ,1.06,.035,1.24,blue);
    makeBox(group,0,.70,cabZ+.31,.82,.22,.31,cream);
    makeBox(group,-.24,.84,cabZ+.22,.23,.10,.07,glow);
    makeBox(group,.10,.84,cabZ+.22,.20,.10,.07,glow);
    ring(group,.32,.91,cabZ+.16,.13,.018,dark,0);
    rod(group,[.32,.91,cabZ+.12],[.32,.91,cabZ+.20],.015,dark);
    makeBox(group,-.25,.65,cabZ-.25,.29,.08,.30,wood);
    // Thermos, mug and chart board.
    const flask=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.19,8),edge);flask.position.set(.31,.89,cabZ+.25);group.add(flask);
    makeBox(group,-.22,.83,cabZ+.31,.18,.015,.18,wood);
    makeBox(group,-.22,.845,cabZ+.31,.14,.008,.13,white);
    makeBox(group,.46,.95,cabZ-.35,.08,.29,.13,new THREE.MeshStandardMaterial({color:0xf3c957}));
    // Roof radar, aerial and mast.
    const rad=new THREE.Mesh(new THREE.SphereGeometry(.18,12,7,0,Math.PI*2,0,Math.PI/2),cream);rad.position.set(-.3,1.53,cabZ-.05);group.add(rad);
    rod(group,[.28,1.52,cabZ-.3],[.28,2.24,cabZ-.3],.018,edge);
    rod(group,[.28,2.03,cabZ-.3],[.58,2.03,cabZ-.3],.012,edge);
    rod(group,[-.46,1.52,cabZ+.36],[-.48,2.08,cabZ+.36],.012,dark);
    // Life rings and tire fenders on port and starboard.
    for(const x of [-.77,.77]) {
      ring(group,x,.39,.23,.22,.047,orange);
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        const p=new THREE.Mesh(new THREE.BoxGeometry(.065,.07,.12),white);p.position.set(x, .39+Math.sin(angle)*.22,.23+Math.cos(angle)*.22);p.rotation.x=-angle;group.add(p);
      }
      for(const z of [-1.08,.91]){ring(group,x,.18,z,.20,.075,rubber);rod(group,[x,.45,z],[x,.30,z],.012,ropeMat);}
    }
    // Bow rail gives the boats a delicate silhouette.
    for(const x of [-.53,.53]) {rod(group,[x,.45,1.0],[x,.76,1.0],.014,edge);rod(group,[x,.76,1.0],[x*.7,.76,1.38],.014,edge);}
    rod(group,[-.37,.76,1.38],[.37,.76,1.38],.014,edge);
    // A mooring line curves from the harbor edge down to the boat.
    const lineGeo=new THREE.BufferGeometry(); const line=new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0x9f6747}));scene.add(line);
    boatRecords.push({group,line,z0,variant});
  }
  boat(-6.3,0); boat(-1.8,1); boat(2.45,2);
  return function update(time) {
    for(const {group,line,z0,variant} of boatRecords) {
      const t=time*.65+variant*1.7;group.position.y=.38+Math.sin(t)*.035;group.rotation.z=Math.sin(t*.83)*.025;group.rotation.x=Math.sin(t*.72)*.018;
      const points=[];const end=new THREE.Vector3(-1.46,.46+group.position.y,z0-.9);const start=new THREE.Vector3(-2.05,.83,z0-1.35);
      for(let i=0;i<=20;i++){const u=i/20; const p=start.clone().lerp(end,u);p.y-=Math.sin(Math.PI*u)*(.18+.05*Math.sin(t));points.push(p);}
      line.geometry.setFromPoints(points);
    }
  };
}

