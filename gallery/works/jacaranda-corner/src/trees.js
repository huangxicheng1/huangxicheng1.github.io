/* =========================================================================
 * 悉尼蓝花楹街角 · 蓝花楹（弯曲分叉枝干 / 花簇沿细枝分布 / 冠层留空隙 /
 *                        树梢轻摆）
 * Sydney Jacaranda Corner — jacaranda trees with swaying blossom crowns
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};
  var P = JAC.PALETTE;

  var C_LIGHT = new THREE.Color(P.bloomLight);
  var C_MID = new THREE.Color(P.bloomMid);
  var C_DEEP = new THREE.Color(P.bloomDeep);
  var C_PINK = new THREE.Color(P.bloomPink);

  /* ---- 花簇：若干不规则球体，顶面偏亮 ---------------------------- */
  function addCluster(geos, center, size, rnd, detail) {
    var n = 2 + Math.floor(rnd() * 2);
    for (var i = 0; i < n; i++) {
      var r = size * (0.42 + rnd() * 0.42);
      var g = new THREE.IcosahedronGeometry(r, detail === undefined ? 1 : detail);
      g.scale(1, 0.72 + rnd() * 0.28, 1);
      // 逐面法线：花簇呈现硬朗的三渲二切面
      g.computeVertexNormals();
      g.translate(
        center.x + (rnd() - 0.5) * size * 0.85,
        center.y + (rnd() - 0.5) * size * 0.62,
        center.z + (rnd() - 0.5) * size * 0.85
      );

      var pick = rnd();
      var col = pick < 0.3 ? C_LIGHT : pick < 0.72 ? C_MID : pick < 0.9 ? C_DEEP : C_PINK;

      var pos = g.getAttribute('position');
      var nor = g.getAttribute('normal');
      var colors = new Float32Array(pos.count * 3);
      for (var v = 0; v < pos.count; v++) {
        var shade = 0.9 + 0.22 * Math.max(0, nor.getY(v));
        colors[v * 3] = Math.min(1, col.r * shade);
        colors[v * 3 + 1] = Math.min(1, col.g * shade);
        colors[v * 3 + 2] = Math.min(1, col.b * shade);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geos.push(g);
    }
  }

  /* ---- 单株蓝花楹 -------------------------------------------------- */
  function createTree(M, spec) {
    var rnd = JAC.mulberry32(spec.seed);
    var group = new THREE.Group();
    var H = spec.height, SP = spec.spread;

    var barkGeos = [];
    var blossoms = [];

    // ---- 树干：弯曲上扬 ----
    var leanA = rnd() * Math.PI * 2;
    var leanX = Math.cos(leanA) * H * 0.055;
    var leanZ = Math.sin(leanA) * H * 0.055;
    var trunkH = H * 0.52;
    var trunkPts = [];
    for (var i = 0; i <= 5; i++) {
      var t = i / 5;
      trunkPts.push(new THREE.Vector3(
        leanX * t * t + Math.sin(t * 2.4 + spec.seed) * H * 0.015,
        t * trunkH,
        leanZ * t * t + Math.cos(t * 2.1 + spec.seed * 1.3) * H * 0.015
      ));
    }
    var trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    barkGeos.push(JAC.taperedTube(trunkPts, H * 0.052, H * 0.022, 10, 7));

    // ---- 主枝：弯曲分叉 ----
    var nBranch = spec.branches || 5;
    for (var b = 0; b < nBranch; b++) {
      var anchor = trunkCurve.getPoint(0.56 + 0.4 * (b / Math.max(1, nBranch - 1)) * (0.85 + rnd() * 0.3));
      var az = (b / nBranch) * Math.PI * 2 + rnd() * 1.0 + spec.seed * 0.37;
      var reach = SP * (0.52 + rnd() * 0.42);
      var rise = H * (0.2 + rnd() * 0.22);
      var dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      var bow = (rnd() - 0.5) * reach * 0.3;

      var p3 = anchor.clone().add(new THREE.Vector3(dir.x * reach, rise, dir.z * reach));
      var p1 = anchor.clone().add(new THREE.Vector3(dir.x * reach * 0.34, rise * 0.42, dir.z * reach * 0.34))
        .add(new THREE.Vector3(-dir.z * bow, 0, dir.x * bow));
      var p2 = anchor.clone().add(new THREE.Vector3(dir.x * reach * 0.72, rise * 0.82, dir.z * reach * 0.72))
        .add(new THREE.Vector3(-dir.z * bow * 0.6, 0, dir.x * bow * 0.6));
      var branchPts = [anchor, p1, p2, p3];

      barkGeos.push(JAC.taperedTube(branchPts, H * 0.021, H * 0.008, 8, 6));

      var branchCurve = new THREE.CatmullRomCurve3(branchPts);
      var bGeos = [];

      // ---- 细枝 ----
      var twigTs = [0.45, 0.65, 0.82, 0.96];
      for (var k = 0; k < twigTs.length; k++) {
        var tw = branchCurve.getPoint(twigTs[k]);
        var tan = branchCurve.getTangent(twigTs[k]);
        var sideV = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        var sign = rnd() > 0.5 ? 1 : -1;
        var len = SP * (0.3 + rnd() * 0.28);
        var tip = tw.clone()
          .add(tan.clone().multiplyScalar(len * 0.55))
          .add(sideV.clone().multiplyScalar(sign * len * 0.5))
          .add(new THREE.Vector3(0, len * (0.22 + rnd() * 0.3), 0));

        var mid = tw.clone().lerp(tip, 0.55)
          .add(new THREE.Vector3(0, len * 0.12, 0));
        barkGeos.push(JAC.taperedTube([tw, mid, tip], H * 0.0095, H * 0.004, 5, 5));

        // 花簇沿细枝分布（保留空隙）
        var size = H * 0.064 * (0.85 + rnd() * 0.55);
        if (rnd() > 0.06) addCluster(bGeos, tip, size, rnd);
        if (rnd() > 0.3) addCluster(bGeos, mid, size * 0.9, rnd, 0);
        if (rnd() > 0.3) {
          addCluster(bGeos, tw.clone().lerp(tip, 0.32), size * 0.8, rnd, 0);
        }
        if (rnd() > 0.52) {
          addCluster(bGeos, tw.clone().lerp(tip, 0.12), size * 0.66, rnd, 0);
        }
      }

      // 枝头花簇
      addCluster(bGeos, p3, H * 0.07 * (0.9 + rnd() * 0.5), rnd);

      // 花簇网格以主枝根部为轴心，便于树梢轻摆
      if (bGeos.length) {
        for (var q = 0; q < bGeos.length; q++) {
          bGeos[q].translate(-anchor.x, -anchor.y, -anchor.z);
        }
        var mesh = new THREE.Mesh(JAC.mergeGeoms(bGeos), M.blossom);
        mesh.position.copy(anchor);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        blossoms.push({
          mesh: mesh,
          phase: rnd() * Math.PI * 2,
          speed: 0.55 + rnd() * 0.5,
          amp: 0.016 + rnd() * 0.028
        });
      }
    }

    var bark = new THREE.Mesh(JAC.mergeGeoms(barkGeos), M.bark);
    bark.castShadow = true;
    bark.receiveShadow = true;
    group.add(bark);

    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.rotY || 0;
    group.userData.blossoms = blossoms;
    group.userData.phase = (spec.seed % 17) * 0.41;
    return group;
  }

  /* ---- 树阵：前低后高，两侧与后方围合 ------------------------------ */
  JAC.createTrees = function (M, env) {
    var group = new THREE.Group();

    var specs = [
      { seed: 11, height: 4.6, spread: 2.3, x: -10.0, z: 4.2, rotY: 0.4, branches: 4 },
      { seed: 23, height: 6.2, spread: 2.9, x: -11.2, z: -3.4, rotY: 1.1, branches: 5 },
      { seed: 37, height: 8.0, spread: 3.6, x: -8.8, z: -10.8, rotY: 2.2, branches: 5 },
      { seed: 51, height: 8.8, spread: 4.0, x: -1.6, z: -12.4, rotY: 3.0, branches: 6 },
      { seed: 67, height: 7.2, spread: 3.4, x: 6.6, z: -10.6, rotY: 4.1, branches: 5 },
      { seed: 83, height: 5.6, spread: 2.8, x: 9.8, z: -3.2, rotY: 5.0, branches: 4 },
      { seed: 97, height: 3.6, spread: 2.0, x: 8.4, z: 5.8, rotY: 0.9, branches: 4 }
    ];

    specs.forEach(function (s) {
      var tree = createTree(M, s);
      group.add(tree);
      if (env && env.addBlob) {
        env.addBlob(s.spread * 2.6, s.spread * 2.2, s.x, s.z, 0.85);
      }
    });

    return {
      group: group,
      update: function (t) {
        group.children.forEach(function (tree) {
          var ph = tree.userData.phase;
          tree.rotation.z = Math.sin(t * 0.5 + ph) * 0.011;
          tree.rotation.x = Math.sin(t * 0.36 + ph * 1.7) * 0.008;
          var bl = tree.userData.blossoms;
          for (var i = 0; i < bl.length; i++) {
            var b = bl[i];
            b.mesh.rotation.z = Math.sin(t * b.speed + b.phase) * b.amp;
            b.mesh.rotation.x = Math.sin(t * b.speed * 0.78 + b.phase * 1.3) * b.amp * 0.75;
          }
        });
      }
    };
  };
})(window);
