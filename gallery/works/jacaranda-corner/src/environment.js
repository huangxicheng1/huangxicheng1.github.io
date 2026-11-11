/* =========================================================================
 * 悉尼蓝花楹街角 · 环境（天光 / 底座 / 街灯 / 灯光编排 / 昼夜系统）
 * Sydney Jacaranda Corner — environment, lamps & time-of-day system
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};
  var P = JAC.PALETTE;
  var TIMES = JAC.TIMES;

  /* ---- 天空渐变材质 ------------------------------------------------ */
  function skyMaterial(top, bottom, offset, exponent) {
    var uniforms = {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      offset: { value: offset },
      exponent: { value: exponent }
    };
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWorldPosition = wp.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 bottomColor;',
        'uniform float offset;',
        'uniform float exponent;',
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;',
        '  float t = pow(max(h, 0.0), exponent);',
        '  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);',
        '}'
      ].join('\n')
    });
  }

  /* ---- 渐变天空穹顶 ------------------------------------------------ */
  function createSky() {
    var mat = skyMaterial(TIMES.day.skyTop, TIMES.day.skyBottom, 24.0, 0.72);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 18), mat);
    sky.renderOrder = -10;
    return sky;
  }

  /* ---- 反射环境（供玻璃 / 金属高光采样，按预设生成） ---------------- */
  JAC.createEnvScene = function (preset) {
    var s = new THREE.Scene();
    s.add(new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      skyMaterial(preset.skyTop, preset.skyBottom, 12.0, 0.6)
    ));

    var sunPos = new THREE.Vector3().fromArray(preset.sunPos).normalize().multiplyScalar(36);
    var sun = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: preset.sunColor })
    );
    sun.position.copy(sunPos);
    s.add(sun);

    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(58, 28),
      new THREE.MeshBasicMaterial({ color: preset.hemiGround })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -16;
    s.add(ground);
    return s;
  };

  /* ---- 星空（夜晚淡入） -------------------------------------------- */
  function createStars() {
    var rnd = JAC.mulberry32(97);
    var pts = [];
    for (var i = 0; i < 260; i++) {
      var az = rnd() * Math.PI * 2;
      var el = Math.asin(rnd() * 0.92 + 0.06);
      var r = 150;
      pts.push(
        Math.cos(az) * Math.cos(el) * r,
        Math.sin(el) * r * 0.9 + 6,
        Math.sin(az) * Math.cos(el) * r
      );
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    var m = new THREE.PointsMaterial({
      color: 0xE8ECFF, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false
    });
    return new THREE.Points(g, m);
  }

  /* ---- 方形薄底座 + 人行道细节 ------------------------------------ */
  function createGround(M) {
    var group = new THREE.Group();

    // 底座（圆角方形薄板）
    var shape = new THREE.Shape();
    var s = 13.2, r = 1.25;
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);

    var baseGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.72, bevelEnabled: true,
      bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1,
      curveSegments: 10, steps: 1
    });
    baseGeo.rotateX(-Math.PI / 2);
    baseGeo.translate(0, -0.82, 0);
    var base = new THREE.Mesh(baseGeo, M.baseSide);
    group.add(base);

    // 顶面铺装（略高于底座面）
    var top = new THREE.Mesh(new THREE.BoxGeometry(25.4, 0.12, 25.4), M.pavement);
    top.position.y = -0.02;
    group.add(top);

    // 人行道分区：建筑周边略浅的铺装带
    var walk = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.1, 17.4), M.pavement2);
    walk.position.set(-2.2, 0.05, -2.2);
    group.add(walk);

    // 铺装分缝（细线）
    var seamMat = M.pavement2;
    var seams = [
      [-2.2, 0.115, 8.6, 0.035, 17.4],   // 竖向缝
      [-2.2, 0.115, 8.6, 17.4, 0.035],   // 横向缝
      [6.35, 0.115, 0, 0.035, 25.4],
      [0, 0.115, 6.35, 25.4, 0.035]
    ];
    for (var i = 0; i < seams.length; i++) {
      var sm = new THREE.Mesh(new THREE.BoxGeometry(seams[i][3], 0.05, seams[i][4]), seamMat);
      sm.position.set(seams[i][0], seams[i][1], seams[i][2]);
      group.add(sm);
    }

    // 底座正面铭牌式细边（微缩模型底座的收边）
    var rim = new THREE.Mesh(new THREE.BoxGeometry(26.9, 0.1, 26.9), M.pavement2);
    rim.position.y = -0.86;
    group.add(rim);

    return group;
  }

  /* ---- 街灯 -------------------------------------------------------- */
  function createStreetLamp(M, x, z, rotY) {
    var group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;

    // 底座与灯杆
    var base1 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.22, 12), M.lampMetal);
    base1.position.y = 0.11;
    group.add(base1);
    var base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.28, 12), M.lampMetal);
    base2.position.y = 0.36;
    group.add(base2);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.115, 3.6, 10), M.lampMetal);
    pole.position.y = 2.25;
    group.add(pole);
    var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10), M.lampMetal);
    collar.position.y = 4.02;
    group.add(collar);

    // 灯头（六角罩 + 玻璃 + 顶盖）
    var head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.2, 6), M.lampMetal);
    head.position.y = 4.28;
    group.add(head);
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.52, 6), M.bulb);
    glass.position.y = 4.62;
    group.add(glass);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.46, 0.3, 6), M.lampMetal);
    cap.position.y = 5.02;
    group.add(cap);
    var finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.lampMetal);
    finial.position.y = 5.24;
    group.add(finial);

    // 光晕
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), M.bulbHalo);
    halo.position.y = 4.62;
    group.add(halo);

    // 暖光：点光 + 向下的局部聚光（照亮花簇 / 树干 / 地面）
    var point = new THREE.PointLight(P.warm, 0, 11, 2);
    point.position.y = 4.62;
    group.add(point);

    var spot = new THREE.SpotLight(P.warmSoft, 0, 13, 0.72, 0.65, 1.6);
    spot.position.y = 4.7;
    var target = new THREE.Object3D();
    target.position.set(1.6, 0, 1.2);
    group.add(target);
    spot.target = target;
    group.add(spot);

    return {
      group: group,
      point: point,
      spot: spot,
      glass: glass,
      halo: halo
    };
  }

  /* ---- 灯光编排 ---------------------------------------------------- */
  function createLights() {
    var hemi = new THREE.HemisphereLight(TIMES.day.hemiSky, TIMES.day.hemiGround, TIMES.day.hemiInt);
    var amb = new THREE.AmbientLight(TIMES.day.ambColor, TIMES.day.ambInt);

    var sun = new THREE.DirectionalLight(TIMES.day.sunColor, TIMES.day.sunInt);
    sun.position.set(TIMES.day.sunPos[0], TIMES.day.sunPos[1], TIMES.day.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;

    var target = new THREE.Object3D();
    target.position.set(-1.5, 3.5, -1.5);

    return { hemi: hemi, amb: amb, sun: sun, sunTarget: target };
  }

  /* ---- 昼夜切换系统（平滑过渡） ------------------------------------ */
  function createTimeSystem(refs) {
    var current = {};
    var target = {};
    var from = {};
    var colors = ['skyTop', 'skyBottom', 'fog', 'hemiSky', 'hemiGround',
      'ambColor', 'sunColor'];
    var scalars = ['hemiInt', 'ambInt', 'sunInt', 'starOpacity',
      'windowGlow', 'lampGlow', 'lampLight', 'doorGlow', 'blobOpacity'];

    function snapshot(src, dst) {
      var i;
      for (i = 0; i < colors.length; i++) dst[colors[i]] = new THREE.Color(src[colors[i]]);
      for (i = 0; i < scalars.length; i++) dst[scalars[i]] = src[scalars[i]];
      dst.sunPos = new THREE.Vector3().fromArray(src.sunPos);
    }

    function copyState(dst) {
      var i;
      for (i = 0; i < colors.length; i++) dst[colors[i]] = current[colors[i]].clone();
      for (i = 0; i < scalars.length; i++) dst[scalars[i]] = current[scalars[i]];
      dst.sunPos = current.sunPos.clone();
    }

    snapshot(TIMES.day, current);
    snapshot(TIMES.day, target);
    copyState(from);

    var key = 'day';
    var transitionStart = -1e9;

    function set(name, instant) {
      if (!TIMES[name]) return;
      key = name;
      copyState(from);                 // 从当前显示状态继续过渡，连点不跳变
      snapshot(TIMES[name], target);
      transitionStart = instant ? -1e9 : performance.now();
      if (refs.onTimeChange) refs.onTimeChange(name);
    }

    function update() {
      // 按真实时间收敛：与帧率无关，后台标签页也不会卡在半途
      var elapsed = Math.max(0, (performance.now() - transitionStart) / 1000);
      var k = 1 - Math.exp(-elapsed * 2.6);
      var i;
      for (i = 0; i < colors.length; i++) {
        current[colors[i]].copy(from[colors[i]]).lerp(target[colors[i]], k);
      }
      for (i = 0; i < scalars.length; i++) {
        current[scalars[i]] = JAC.lerp(from[scalars[i]], target[scalars[i]], k);
      }
      current.sunPos.copy(from.sunPos).lerp(target.sunPos, k);

      // 天空
      refs.sky.material.uniforms.topColor.value.copy(current.skyTop);
      refs.sky.material.uniforms.bottomColor.value.copy(current.skyBottom);
      refs.stars.material.opacity = current.starOpacity;

      // 雾与灯
      refs.scene.fog.color.copy(current.fog);
      refs.lights.hemi.color.copy(current.hemiSky);
      refs.lights.hemi.groundColor.copy(current.hemiGround);
      refs.lights.hemi.intensity = current.hemiInt;
      refs.lights.amb.color.copy(current.ambColor);
      refs.lights.amb.intensity = current.ambInt;
      refs.lights.sun.color.copy(current.sunColor);
      refs.lights.sun.intensity = current.sunInt;
      refs.lights.sun.position.copy(current.sunPos).normalize().multiplyScalar(38);

      // 窗户暖光（夜间压低玻璃反光条，突出暖光）
      refs.M.glass.emissiveIntensity = current.windowGlow * 0.85;
      refs.M.glassStreak.opacity = 0.26 * (1 - current.windowGlow * 0.62);

      // 街灯
      var glow = current.lampGlow;
      refs.M.bulb.color.copy(refs.M.bulbBase).multiplyScalar(0.22 + glow * 0.9);
      refs.M.bulbHalo.opacity = 0.05 + glow * 0.22;
      refs.M.bulbHalo.color.copy(refs.M.haloBase);
      for (i = 0; i < refs.lamps.length; i++) {
        refs.lamps[i].point.intensity = current.lampLight * 1.5;
        refs.lamps[i].spot.intensity = current.lampLight * 2.6;
      }

      // 门厅暖光
      if (refs.doorLight) refs.doorLight.intensity = current.doorGlow * 1.25;
      if (refs.doorGlowPlane) refs.doorGlowPlane.material.opacity = current.doorGlow * 0.5;
      if (refs.windowGlowPlanes) {
        for (i = 0; i < refs.windowGlowPlanes.length; i++) {
          refs.windowGlowPlanes[i].material.opacity = current.windowGlow * 0.34;
        }
      }

      // 接触阴影
      for (i = 0; i < refs.blobs.length; i++) {
        refs.blobs[i].material.opacity = current.blobOpacity * (refs.blobs[i].userData.base || 1);
      }
    }

    return {
      set: set,
      update: update,
      get key() { return key; },
      get current() { return current; }
    };
  }

  JAC.createTimeSystem = createTimeSystem;

  /* ---- 对外构建入口 ------------------------------------------------ */
  JAC.buildEnvironment = function (scene, M) {
    var sky = createSky();
    scene.add(sky);

    var stars = createStars();
    scene.add(stars);

    var ground = createGround(M);
    JAC.setShadowFlags(ground, true, true);
    scene.add(ground);

    var lights = createLights();
    scene.add(lights.hemi);
    scene.add(lights.amb);
    scene.add(lights.sun);
    scene.add(lights.sunTarget);
    lights.sun.target = lights.sunTarget;

    // 街灯：一盏在入口左前，一盏在转角右侧（夜间局部照亮花簇/树干/地面）
    var lampA = createStreetLamp(M, -7.6, 7.2, 0.35);
    var lampB = createStreetLamp(M, 10.2, 3.4, -Math.PI / 2);
    scene.add(lampA.group, lampB.group);

    var blobTex = JAC.radialShadowTexture();
    var blobs = [];
    function addBlob(w, h, x, z, base) {
      var b = JAC.blobShadow(blobTex, w, h, x, 0.125, z);
      b.userData.base = base || 1;
      blobs.push(b);
      scene.add(b);
      return b;
    }

    return {
      sky: sky,
      stars: stars,
      lights: lights,
      lamps: [lampA, lampB],
      blobs: blobs,
      addBlob: addBlob
    };
  };
})(window);
