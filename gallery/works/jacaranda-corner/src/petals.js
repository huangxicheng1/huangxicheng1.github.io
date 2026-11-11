/* =========================================================================
 * 悉尼蓝花楹街角 · 飘落的花瓣
 * Sydney Jacaranda Corner — drifting jacaranda petals (instanced)
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};
  var P = JAC.PALETTE;

  var TONES = [
    new THREE.Color(P.bloomLight),
    new THREE.Color(P.bloomLight),
    new THREE.Color(P.bloomMid),
    new THREE.Color(P.bloomPink)
  ];

  JAC.createPetals = function (M, count) {
    var geo = new THREE.CircleGeometry(0.1, 6);
    geo.scale(1, 0.66, 1);

    var mesh = new THREE.InstancedMesh(geo, M.petal, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    var rnd = JAC.mulberry32(2024);
    var items = [];
    var dummy = new THREE.Object3D();
    var col = new THREE.Color();

    for (var i = 0; i < count; i++) {
      var it = {
        x: (rnd() - 0.5) * 23,
        y: 0.5 + rnd() * 13,
        z: (rnd() - 0.5) * 19,
        vy: 0.3 + rnd() * 0.55,
        swayA: 0.32 + rnd() * 0.62,
        swayF: 0.45 + rnd() * 0.85,
        phase: rnd() * Math.PI * 2,
        rx: rnd() * Math.PI,
        ry: rnd() * Math.PI,
        spinX: (rnd() - 0.5) * 1.5,
        spinY: (rnd() - 0.5) * 2.1,
        scale: 0.62 + rnd() * 0.85
      };
      items.push(it);

      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx, it.ry, 0);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      col.copy(TONES[Math.floor(rnd() * TONES.length)]);
      col.offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return {
      mesh: mesh,
      update: function (dt, t) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          it.y -= it.vy * dt;
          if (it.y < 0.12) {
            it.y = 8 + Math.random() * 7;
            it.x = (Math.random() - 0.5) * 23;
            it.z = (Math.random() - 0.5) * 19;
          }
          var sx = it.x + Math.sin(t * it.swayF + it.phase) * it.swayA;
          var sz = it.z + Math.cos(t * it.swayF * 0.83 + it.phase * 1.3) * it.swayA * 0.72;

          dummy.position.set(sx, it.y, sz);
          dummy.rotation.set(
            it.rx + t * it.spinX,
            it.ry + t * it.spinY,
            Math.sin(t * 0.8 + it.phase) * 0.5
          );
          dummy.scale.setScalar(it.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    };
  };
})(window);
