/* =========================================================================
 * 悉尼蓝花楹街角 · 通用工具（随机数 / 几何构建 / 材质工厂）
 * Sydney Jacaranda Corner — utilities & materials
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};
  var P = JAC.PALETTE;

  /* ---- 可复现随机数 ------------------------------------------------- */
  JAC.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  JAC.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---- 三渲二色阶贴图（3 级明暗） ---------------------------------- */
  JAC.toonGradient = function (steps) {
    var data = new Uint8Array(steps.length * 4);
    for (var i = 0; i < steps.length; i++) {
      var v = Math.round(steps[i] * 255);
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    var tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };

  /* ---- 几何合并：把大量小几何合成单次绘制 -------------------------- */
  JAC.mergeGeoms = function (list) {
    var geos = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g) continue;
      if (g.index) g = g.toNonIndexed();
      geos.push(g);
    }
    if (!geos.length) return new THREE.BufferGeometry();

    var hasColor = false;
    var total = 0;
    for (var j = 0; j < geos.length; j++) {
      total += geos[j].getAttribute('position').count;
      if (geos[j].getAttribute('color')) hasColor = true;
    }

    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var col = hasColor ? new Float32Array(total * 3) : null;
    var po = 0, no = 0, uo = 0, co = 0;

    for (var k = 0; k < geos.length; k++) {
      var g2 = geos[k];
      var p = g2.getAttribute('position');
      var n = g2.getAttribute('normal');
      var u = g2.getAttribute('uv');
      var c = g2.getAttribute('color');
      var cnt = p.count;
      pos.set(p.array, po); po += cnt * 3;
      if (n) nor.set(n.array, no);
      no += cnt * 3;
      if (u) uv.set(u.array, uo);
      uo += cnt * 2;
      if (col) {
        if (c) {
          col.set(c.array, co);
        } else {
          for (var q = 0; q < cnt; q++) {
            col[co + q * 3] = 1; col[co + q * 3 + 1] = 1; col[co + q * 3 + 2] = 1;
          }
        }
        co += cnt * 3;
      }
    }

    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  };

  /* ---- 沿曲线的渐细管（树干 / 枝条 / 细枝） ------------------------ */
  JAC.taperedTube = function (points, r0, r1, segs, radial) {
    segs = segs || 10;
    radial = radial || 6;
    var curve = new THREE.CatmullRomCurve3(points);
    var frames = curve.computeFrenetFrames(segs, false);
    var positions = [], normals = [], uvs = [], indices = [];
    var i, j;

    for (i = 0; i <= segs; i++) {
      var t = i / segs;
      var Pt = curve.getPointAt(t);
      var N = frames.normals[i], B = frames.binormals[i];
      var r = r0 + (r1 - r0) * t;
      for (j = 0; j <= radial; j++) {
        var v = (j / radial) * Math.PI * 2;
        var sn = Math.sin(v), cs = -Math.cos(v);
        var nx = cs * N.x + sn * B.x;
        var ny = cs * N.y + sn * B.y;
        var nz = cs * N.z + sn * B.z;
        normals.push(nx, ny, nz);
        positions.push(Pt.x + r * nx, Pt.y + r * ny, Pt.z + r * nz);
        uvs.push(j / radial, t);
      }
    }
    for (i = 1; i <= segs; i++) {
      for (j = 1; j <= radial; j++) {
        var a = (radial + 1) * (i - 1) + (j - 1);
        var b = (radial + 1) * i + (j - 1);
        var c = (radial + 1) * i + j;
        var d = (radial + 1) * (i - 1) + j;
        indices.push(a, b, d, b, c, d);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return g;
  };

  /* ---- 起伏屋面：两圈轮廓之间放样 + 顶盖（轮廓点为 Vector2，y 即世界 z） */
  JAC.loft = function (bottomPts, topPts, yBottom, yTop, capTop, capBottom) {
    var n = bottomPts.length;
    var positions = [], uvs = [], indices = [];
    var i;
    for (i = 0; i < n; i++) {
      var b = bottomPts[i], tp = topPts[i];
      positions.push(b.x, yBottom, b.y, tp.x, yTop, tp.y);
      uvs.push(i / n, 0, i / n, 1);
    }
    for (i = 0; i < n; i++) {
      var a = i * 2;
      var c = ((i + 1) % n) * 2;
      indices.push(a, c, a + 1, c, c + 1, a + 1);
    }
    var centerIdx, cx, cz, v0, v1;
    if (capTop) {
      cx = 0; cz = 0;
      for (i = 0; i < n; i++) { cx += topPts[i].x; cz += topPts[i].y; }
      cx /= n; cz /= n;
      centerIdx = positions.length / 3;
      positions.push(cx, yTop, cz); uvs.push(0.5, 0.5);
      for (i = 0; i < n; i++) {
        v0 = i * 2 + 1; v1 = ((i + 1) % n) * 2 + 1;
        indices.push(v0, centerIdx, v1);
      }
    }
    if (capBottom) {
      cx = 0; cz = 0;
      for (i = 0; i < n; i++) { cx += bottomPts[i].x; cz += bottomPts[i].y; }
      cx /= n; cz /= n;
      centerIdx = positions.length / 3;
      positions.push(cx, yBottom, cz); uvs.push(0.5, 0.5);
      for (i = 0; i < n; i++) {
        v0 = i * 2; v1 = ((i + 1) % n) * 2;
        indices.push(v1, centerIdx, v0);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  /* ---- 弧形雨棚（由墙面水平挑出、外缘微垂） ----------------------- */
  JAC.curvedSheet = function (width, depth, drop, arcSegs) {
    arcSegs = arcSegs || 10;
    var positions = [], uvs = [], indices = [];
    var i;
    for (i = 0; i <= arcSegs; i++) {
      var ang = (i / arcSegs) * Math.PI * 0.5 * 0.78;
      var z = Math.sin(ang) * depth;
      var y = -drop * (1 - Math.cos(ang));
      positions.push(-width / 2, y, z, width / 2, y, z);
      uvs.push(0, i / arcSegs, 1, i / arcSegs);
    }
    for (i = 0; i < arcSegs; i++) {
      var a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  /* ---- 接触阴影贴图（径向渐变） ----------------------------------- */
  JAC.radialShadowTexture = function () {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(58,48,72,0.55)');
    g.addColorStop(0.5, 'rgba(58,48,72,0.22)');
    g.addColorStop(1, 'rgba(58,48,72,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };

  JAC.blobShadow = function (texture, w, h, x, y, z) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0.22,
        depthWrite: false, fog: true
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 1;
    return m;
  };

  /* ---- 材质工厂：全场景共享，便于昼夜统一控制 --------------------- */
  JAC.createMaterials = function (gradient) {
    var toon = function (color, extra) {
      var params = { color: color, gradientMap: gradient };
      if (extra) for (var k in extra) params[k] = extra[k];
      return new THREE.MeshToonMaterial(params);
    };

    var M = {
      gradient: gradient,

      cream:      toon(P.cream),
      creamTrim:  toon(P.creamTrim),
      creamShade: toon(P.creamShade),
      roof:       toon(P.roof, { side: THREE.DoubleSide }),
      roofDark:   toon(P.roofDark),
      awning:     toon(0xAAB3C2, { side: THREE.DoubleSide }),
      pavement:   toon(P.pavement),
      pavement2:  toon(P.pavement2),
      baseSide:   toon(P.baseSide),

      bark:       toon(P.bark),
      blossom:    toon(0xFFFFFF, { vertexColors: true }),

      bench:      toon(P.bench),
      benchDark:  toon(P.benchDark),
      door:       toon(P.door),
      doorDark:   toon(P.doorDark, { side: THREE.DoubleSide }),

      metal: new THREE.MeshStandardMaterial({
        color: P.metal, metalness: 0.85, roughness: 0.38
      }),
      metalLight: new THREE.MeshStandardMaterial({
        color: P.metalLight, metalness: 0.7, roughness: 0.45
      }),
      lampMetal: new THREE.MeshStandardMaterial({
        color: P.lampMetal, metalness: 0.8, roughness: 0.42
      }),

      // 玻璃：保留反射，夜间自发光暖光
      glass: new THREE.MeshStandardMaterial({
        color: P.glass, metalness: 0.35, roughness: 0.12,
        emissive: 0xFF9E4D, emissiveIntensity: 0.0
      }),
      glassStreak: new THREE.MeshBasicMaterial({
        color: P.glassStreak, transparent: true, opacity: 0.26, depthWrite: false
      }),

      // 灯泡：基础自发光，亮度随时段变化
      bulb: new THREE.MeshBasicMaterial({ color: P.warmSoft, fog: true }),
      bulbHalo: new THREE.MeshBasicMaterial({
        color: P.warm, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false
      }),

      // 花瓣：纯色平涂，保持轻盈
      petal: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, side: THREE.DoubleSide,
        transparent: true, opacity: 0.92
      })
    };

    M.bulbBase = new THREE.Color(P.warmSoft);
    M.haloBase = new THREE.Color(P.warm);
    return M;
  };

  /* ---- 投影 / 受影统一开关 ---------------------------------------- */
  JAC.setShadowFlags = function (root, cast, receive) {
    root.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = cast !== false;
        o.receiveShadow = receive !== false;
      }
    });
    return root;
  };
})(window);
