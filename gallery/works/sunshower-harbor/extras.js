// Concrete steps descend into the water at the inside corner.
for(let i=0;i<4;i++)box(2.7,.18,1.1,concrete,-.8+i*.25,.48-i*.19,4.15-i*.7);
// Tetrapods: four stout tapered arms meet around a single center.
for(let i=0;i<7;i++){const g=new THREE.Group();const m=mat(i%2?'#c7d1c9':'#e0e3d8');for(const v of [[0,1,0],[.82,-.4,0],[-.41,-.4,.71],[-.41,-.4,-.71]]){let arm=new THREE.Mesh(new THREE.CylinderGeometry(.17,.31,1.05,6),m);let dir=new THREE.Vector3(...v).normalize();arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);arm.position.copy(dir.multiplyScalar(.4));g.add(arm)}g.position.set(8.1+(i%3)*.62,.42,-8.4+Math.floor(i/3)*.7);g.rotation.y=i;g.scale.setScalar(.8);scene.add(g)}
// Old iron ladder, tide marks and shells on the exposed quay face.
const rust=mat('#956a50');for(let z of [-6,-5.25])box(.09,2,.09,rust,-1.91,-.35,z);for(let y=-1.2;y<.7;y+=.3)box(.1,.07,.83,rust,-1.9,y,-5.62);
for(let i=0;i<60;i++){let shell=new THREE.Mesh(new THREE.SphereGeometry(.08+Math.random()*.05,6,4),mat(i%2?'#d5d5c1':'#9aafa1'));shell.position.set(-1.89,-1.15+Math.random()*.4,-9+Math.random()*13);shell.scale.x=.35;scene.add(shell)}
// Puddles on the quay, reduced to quiet, reflective color shapes.
for(let i=0;i<18;i++){let puddle=new THREE.Mesh(new THREE.CircleGeometry(.3+Math.random()*.5,12),new THREE.MeshBasicMaterial({color:'#a8c9c4',transparent:true,opacity:.35}));puddle.rotation.x=-Math.PI/2;puddle.scale.y=.3;puddle.position.set(-9+Math.random()*6,.686,-9+Math.random()*18);scene.add(puddle)}
