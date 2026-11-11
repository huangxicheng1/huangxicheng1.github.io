/* =========================================================================
 * 悉尼蓝花楹街角 · 建筑（奶油白三层历史建筑 / 圆弧转角 / 铁艺阳台 / 雨棚 /
 *                        入口 / 紫色木条长椅）
 * Sydney Jacaranda Corner — heritage building, balcony, awning & bench
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};
  var P = JAC.PALETTE;

  /* ---- 体量常量 ---------------------------------------------------- */
  var FRONT_Z = 3.6;   // 主立面（朝 +Z）
  var SIDE_X = 3.6;    // 侧立面（朝 +X）
  var BACK = -8.4;     // 背面
  var ARC_R = 1.6;     // 转角圆弧半径
  var ARC_CX = 2.0, ARC_CZ = 2.0;

  /* ---- 平面轮廓（外扩 off 生成线脚/檐口） -------------------------- */
  function footShape(off) {
    var x0 = BACK - off;
    var x1 = SIDE_X + off;
    var z1 = FRONT_Z + off;
    var z0 = BACK - off;
    var r = ARC_R + off;
    var s = new THREE.Shape();
    // 形状空间坐标为 (x, -z)
    s.moveTo(x0, -z1);
    s.lineTo(ARC_CX, -z1);
    s.absarc(ARC_CX, -ARC_CZ, r, -Math.PI / 2, 0, false);
    s.lineTo(x1, -z0);
    s.lineTo(x0, -z0);
    s.closePath();
    return s;
  }

  function footPoints(off, divisions) {
    var pts = footShape(off).getPoints(divisions || 10);
    return pts.map(function (p) { return new THREE.Vector2(p.x, -p.y); });
  }

  /* ---- 体量块 ------------------------------------------------------ */
  function mass(M, off, y0, y1, mat, bevel) {
    bevel = bevel === undefined ? 0.05 : bevel;
    var g = new THREE.ExtrudeGeometry(footShape(off), {
      depth: (y1 - y0) - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1,
      curveSegments: 14, steps: 1
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0 + bevel, 0);
    return new THREE.Mesh(g, mat);
  }

  function box(w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  /* ---- 暖光径向贴图（夜间门窗光晕） -------------------------------- */
  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,196,120,0.9)');
    g.addColorStop(0.45, 'rgba(255,186,110,0.32)');
    g.addColorStop(1, 'rgba(255,186,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* ---- 窗（三渲二：纯色 + 少量色阶，玻璃保留反射） ---------------- */
  function makeWindow(M, w, h, arched) {
    var group = new THREE.Group();
    var rectH = arched ? h - w / 2 : h;
    var y0 = -h / 2;              // 窗台基准
    var yMid = y0 + rectH / 2;

    var trim = [], glass = [], streak = [], recess = [];
    var g;

    // 凹槽阴影面
    g = new THREE.BoxGeometry(w + 0.16, h + 0.14, 0.1);
    g.translate(0, y0 + h / 2, 0.0);
    recess.push(g);

    // 玻璃
    g = new THREE.BoxGeometry(w, rectH, 0.05);
    g.translate(0, yMid, 0.09);
    glass.push(g);
    if (arched) {
      g = new THREE.CircleGeometry(w / 2, 18, 0, Math.PI);
      g.translate(0, y0 + rectH, 0.09);
      glass.push(g);
    }

    // 玻璃反光斜纹
    for (var s = 0; s < 2; s++) {
      g = new THREE.BoxGeometry(w * 0.09, rectH * 0.86, 0.004);
      g.rotateZ(0.34);
      g.translate(-w * 0.16 + s * w * 0.32, yMid, 0.118);
      streak.push(g);
    }

    // 窗框
    g = new THREE.BoxGeometry(0.11, rectH + 0.12, 0.16);
    g.translate(-(w / 2 + 0.055), yMid, 0.12); trim.push(g);
    g = new THREE.BoxGeometry(0.11, rectH + 0.12, 0.16);
    g.translate(w / 2 + 0.055, yMid, 0.12); trim.push(g);
    g = new THREE.BoxGeometry(w + 0.22, 0.11, 0.16);
    g.translate(0, y0 - 0.02, 0.12); trim.push(g);
    if (arched) {
      g = new THREE.TorusGeometry(w / 2 + 0.055, 0.055, 6, 20, Math.PI);
      g.translate(0, y0 + rectH, 0.12);
      trim.push(g);
    } else {
      g = new THREE.BoxGeometry(w + 0.22, 0.11, 0.16);
      g.translate(0, y0 + rectH + 0.02, 0.12); trim.push(g);
    }

    // 窗台（挑出）
    g = new THREE.BoxGeometry(w + 0.42, 0.11, 0.34);
    g.translate(0, y0 - 0.13, 0.17); trim.push(g);

    // 分格条（上下推拉窗）
    g = new THREE.BoxGeometry(0.05, rectH, 0.05);
    g.translate(0, yMid, 0.125); trim.push(g);
    for (var m = 0; m < 2; m++) {
      g = new THREE.BoxGeometry(w, 0.05, 0.05);
      g.translate(0, y0 + rectH * (0.34 + m * 0.33), 0.125);
      trim.push(g);
    }

    var mesh;
    mesh = new THREE.Mesh(JAC.mergeGeoms(recess), M.creamShade); group.add(mesh);
    mesh = new THREE.Mesh(JAC.mergeGeoms(glass), M.glass); group.add(mesh);
    mesh = new THREE.Mesh(JAC.mergeGeoms(streak), M.glassStreak); group.add(mesh);
    mesh = new THREE.Mesh(JAC.mergeGeoms(trim), M.creamTrim); group.add(mesh);
    return group;
  }

  /* ---- 入口（门廊 / 台阶 / 门厅暖光） ------------------------------ */
  function makeEntrance(M) {
    var group = new THREE.Group();
    var X = -3.6;

    // 门洞暗部
    group.add(box(2.25, 2.55, 0.5, X, 1.86, 3.4, M.doorDark));

    // 门扇（两扇，带玻璃上亮与下裙板）
    var leafX = [-4.03, -3.17];
    for (var i = 0; i < 2; i++) {
      group.add(box(0.82, 2.18, 0.09, leafX[i], 1.78, 3.54, M.door));
      group.add(box(0.52, 0.88, 0.03, leafX[i], 2.38, 3.6, M.glass));
      group.add(box(0.56, 0.78, 0.03, leafX[i], 1.32, 3.6, M.doorDark));
    }
    // 门上亮子（夜间透出暖光）
    group.add(box(1.78, 0.42, 0.05, X, 3.06, 3.56, M.glass));

    // 门套：壁柱 + 檐板
    group.add(box(0.2, 2.98, 0.26, X - 1.12, 1.92, 3.72, M.creamTrim));
    group.add(box(0.2, 2.98, 0.26, X + 1.12, 1.92, 3.72, M.creamTrim));
    group.add(box(2.62, 0.28, 0.32, X, 3.5, 3.74, M.creamTrim));
    group.add(box(2.42, 0.12, 0.42, X, 3.28, 3.78, M.creamShade));

    // 台阶
    group.add(box(2.72, 0.3, 1.06, X, 0.27, 4.42, M.pavement2));
    group.add(box(2.44, 0.24, 0.72, X, 0.53, 4.22, M.pavement2));

    return group;
  }

  /* ---- 铁艺阳台（二楼） -------------------------------------------- */
  function makeBalcony(M) {
    var group = new THREE.Group();
    var CX = -1.5;
    var frontZ = 4.9;

    // 阳台板与线脚
    group.add(box(6.75, 0.16, 1.56, CX, 3.46, 4.26, M.creamShade));
    group.add(box(6.62, 0.2, 1.42, CX, 3.58, 4.25, M.creamTrim));

    var metalGeos = [];
    var g;

    // 托架
    [-4.35, -1.5, 1.35].forEach(function (x) {
      g = new THREE.BoxGeometry(0.12, 0.62, 0.12);
      g.rotateX(0.62);
      g.translate(x, 3.2, 4.05);
      metalGeos.push(g);
    });

    // 栏杆：横杆 + 竖杆
    function rail(x0, z0, x1, z1) {
      var dx = x1 - x0, dz = z1 - z0;
      var len = Math.sqrt(dx * dx + dz * dz);
      var ang = Math.atan2(dx, dz);
      var mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;

      [4.66, 3.84].forEach(function (y) {
        g = new THREE.BoxGeometry(0.075, 0.075, len + 0.06);
        g.rotateY(ang);
        g.translate(mx, y, mz);
        metalGeos.push(g);
      });

      var n = Math.max(2, Math.round(len / 0.185));
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        g = new THREE.CylinderGeometry(0.023, 0.023, 0.82, 6);
        g.translate(x0 + dx * t, 4.25, z0 + dz * t);
        metalGeos.push(g);
      }
      // 花饰圈（铁艺镂空）
      var rings = Math.round(len / 0.3);
      for (var r = 0; r < rings; r++) {
        var tr = (r + 0.5) / rings;
        g = new THREE.TorusGeometry(0.085, 0.017, 6, 12);
        g.translate(x0 + dx * tr, 4.5, z0 + dz * tr);
        metalGeos.push(g);
      }
    }
    rail(CX - 3.3, frontZ, CX + 3.3, frontZ);          // 正面
    rail(CX - 3.3, 3.68, CX - 3.3, frontZ);            // 左回
    rail(CX + 3.3, 3.68, CX + 3.3, frontZ);            // 右回

    // 角柱
    [[CX - 3.3, frontZ], [CX + 3.3, frontZ], [CX - 3.3, 3.7], [CX + 3.3, 3.7]]
      .forEach(function (p) {
        g = new THREE.CylinderGeometry(0.05, 0.05, 0.98, 8);
        g.translate(p[0], 4.22, p[1]);
        metalGeos.push(g);
      });

    group.add(new THREE.Mesh(JAC.mergeGeoms(metalGeos), M.metal));
    return group;
  }

  /* ---- 雨棚（弧形铁皮 + 铁柱） ------------------------------------ */
  function makeAwning(M) {
    var group = new THREE.Group();
    var CX = -1.5;

    var sheet = new THREE.Mesh(JAC.curvedSheet(7.3, 1.88, 0.52, 12), M.awning);
    sheet.position.set(CX, 6.3, 3.56);
    group.add(sheet);

    // 外缘封边
    group.add(box(7.42, 0.17, 0.13, CX, 5.92, 5.32, M.roofDark));

    var metalGeos = [];
    var g;
    [-4.55, -1.5, 1.55].forEach(function (x) {
      g = new THREE.CylinderGeometry(0.042, 0.042, 2.62, 8);
      g.translate(x, 4.98, 4.88);
      metalGeos.push(g);
      // 斜撑
      g = new THREE.CylinderGeometry(0.028, 0.028, 0.78, 6);
      g.rotateX(0.85);
      g.translate(x, 6.02, 4.58);
      metalGeos.push(g);
    });
    group.add(new THREE.Mesh(JAC.mergeGeoms(metalGeos), M.metal));

    return group;
  }

  /* ---- 屋面（少量露出）+ 烟囱 ------------------------------------- */
  function makeRoof(M) {
    var group = new THREE.Group();
    var bottom = footPoints(0.06, 12);
    var cx = -2.4, cz = -2.4;
    var top = bottom.map(function (p) {
      return new THREE.Vector2(cx + (p.x - cx) * 0.56, cz + (p.y - cz) * 0.56);
    });
    var roof = new THREE.Mesh(JAC.loft(bottom, top, 9.86, 10.74, true, false), M.roof);
    group.add(roof);

    // 烟囱
    group.add(box(0.92, 1.32, 0.74, -6.1, 10.62, -6.1, M.creamShade));
    group.add(box(1.12, 0.16, 0.92, -6.1, 11.32, -6.1, M.roofDark));
    return group;
  }

  /* ---- 紫色木条长椅 ------------------------------------------------ */
  function makeBench(M) {
    var group = new THREE.Group();

    var woodGeos = [], metalGeos = [];
    var g, i;

    // 座面木条
    for (i = 0; i < 4; i++) {
      g = new THREE.BoxGeometry(2.16, 0.055, 0.135);
      g.translate(0, 0.555, -0.25 + i * 0.175);
      woodGeos.push(g);
    }
    // 靠背木条（微倾）
    for (i = 0; i < 3; i++) {
      g = new THREE.BoxGeometry(2.16, 0.135, 0.055);
      g.rotateX(-0.2);
      g.translate(0, 0.83 + i * 0.21, -0.36 - i * 0.045);
      woodGeos.push(g);
    }
    group.add(new THREE.Mesh(JAC.mergeGeoms(woodGeos), M.bench));

    // 侧架（铸铁）
    [-1.02, 1.02].forEach(function (x) {
      g = new THREE.BoxGeometry(0.085, 0.085, 0.62);
      g.translate(x, 0.5, 0); metalGeos.push(g);
      g = new THREE.BoxGeometry(0.085, 0.5, 0.085);
      g.translate(x, 0.25, 0.24); metalGeos.push(g);
      g = new THREE.BoxGeometry(0.085, 0.62, 0.085);
      g.translate(x, 0.31, -0.26); metalGeos.push(g);
      g = new THREE.BoxGeometry(0.075, 0.86, 0.075);
      g.rotateX(-0.2);
      g.translate(x, 0.95, -0.35); metalGeos.push(g);
      // 扶手
      g = new THREE.BoxGeometry(0.085, 0.07, 0.58);
      g.rotateX(-0.12);
      g.translate(x, 0.87, -0.02); metalGeos.push(g);
      g = new THREE.BoxGeometry(0.07, 0.34, 0.07);
      g.translate(x, 0.7, 0.24); metalGeos.push(g);
    });
    group.add(new THREE.Mesh(JAC.mergeGeoms(metalGeos), M.metalLight));

    group.position.set(-3.6, 0.12, 5.95);
    return group;
  }

  /* ---- 对外构建入口 ------------------------------------------------ */
  JAC.buildBuilding = function (M) {
    var group = new THREE.Group();

    // ---- 体量与线脚 ----
    group.add(mass(M, 0.16, 0, 0.62, M.creamShade));            // 基座
    group.add(mass(M, 0, 0, 3.15, M.cream));                    // 一层
    group.add(mass(M, 0.13, 3.15, 3.45, M.creamTrim));          // 层间线脚
    group.add(mass(M, 0, 3.45, 6.15, M.cream));                 // 二层
    group.add(mass(M, 0.11, 6.15, 6.42, M.creamTrim));          // 檐口线脚
    group.add(mass(M, 0, 6.42, 8.8, M.cream));                  // 三层
    group.add(mass(M, 0.2, 8.8, 9.18, M.creamTrim));            // 顶部檐口
    group.add(mass(M, 0.12, 9.18, 9.85, M.cream));              // 女儿墙
    group.add(mass(M, 0.18, 9.85, 10.02, M.creamTrim));         // 压顶

    // ---- 窗（主立面 + 侧立面，圆弧转角留空）----
    var windowGlowPlanes = [];
    var glowTex = glowTexture();

    function addGlow(x, y, z, ry, w, h) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          map: glowTex, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.renderOrder = 2;
      windowGlowPlanes.push(m);
      group.add(m);
    }

    function front(x, y, w, h, arched) {
      var win = makeWindow(M, w, h, arched);
      win.position.set(x, y, FRONT_Z);
      group.add(win);
    }
    function side(z, y, w, h, arched) {
      var win = makeWindow(M, w, h, arched);
      win.position.set(SIDE_X, y, z);
      win.rotation.y = Math.PI / 2;
      group.add(win);
    }

    var baysF = [-6.6, -0.6, 1.2];          // 一层（转角处让位给入口轴线）
    var bays2F = [-6.6, -3.6, -0.6, 1.2];
    var baysS = [-6.6, -3.6, -0.6, 1.2];

    baysF.forEach(function (x) { front(x, 1.86, 1.35, 2.1, true); });
    bays2F.forEach(function (x) {
      if (x === -0.6) {
        front(x, 4.95, 1.35, 2.5, true);     // 通往阳台的落地门
      } else {
        front(x, 4.82, 1.35, 1.95, false);
      }
    });
    bays2F.forEach(function (x) { front(x, 7.55, 1.35, 1.95, true); });
    baysS.forEach(function (z) {
      side(z, 1.86, 1.35, 2.1, true);
      side(z, 4.82, 1.35, 1.95, false);
      side(z, 7.55, 1.35, 1.95, true);
    });

    // 一层窗夜间光晕（溢到人行道）
    addGlow(-6.6, 1.7, FRONT_Z + 0.35, 0, 3.2, 3.4);
    addGlow(-0.6, 1.7, FRONT_Z + 0.35, 0, 3.2, 3.4);
    addGlow(1.2, 1.7, FRONT_Z + 0.35, 0, 3.2, 3.4);

    // ---- 入口 / 阳台 / 雨棚 / 屋面 / 长椅 ----
    group.add(makeEntrance(M));
    group.add(makeBalcony(M));
    group.add(makeAwning(M));
    group.add(makeRoof(M));
    group.add(makeBench(M));

    // 门厅暖光
    var doorLight = new THREE.PointLight(P.warmSoft, 0, 8, 2);
    doorLight.position.set(-3.6, 2.15, 4.9);
    group.add(doorLight);

    var doorGlowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 3.2),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    doorGlowPlane.rotation.x = -Math.PI / 2;
    doorGlowPlane.position.set(-3.6, 0.16, 5.1);
    doorGlowPlane.renderOrder = 2;
    group.add(doorGlowPlane);

    JAC.setShadowFlags(group, true, true);

    return {
      group: group,
      doorLight: doorLight,
      doorGlowPlane: doorGlowPlane,
      windowGlowPlanes: windowGlowPlanes
    };
  };
})(window);
