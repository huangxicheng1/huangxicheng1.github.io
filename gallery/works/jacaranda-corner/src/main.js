/* =========================================================================
 * 悉尼蓝花楹街角 · 主程序（渲染器 / 相机 / 交互 / 昼夜切换 / 动画循环）
 * Sydney Jacaranda Corner — renderer, camera, interaction & animation loop
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC;

  /* 动效强度：尊重系统的“减少动态效果”设置 */
  var motionScale = 1;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    motionScale = 0.16;
  }

  function init() {
    var canvas = document.getElementById('stage');

    /* ---- 渲染器 ---- */
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    /* ---- 场景与雾 ---- */
    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(JAC.TIMES.day.fog, 60, 210);

    /* ---- 相机：接近正面的三分之四视角，略微俯视 ---- */
    var camera = new THREE.PerspectiveCamera(33, 16 / 10, 0.1, 500);
    var camDefault = new THREE.Vector3(19.5, 13.8, 24.5);
    var targetDefault = new THREE.Vector3(-1.8, 4.0, -1.4);
    camera.position.copy(camDefault);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(targetDefault);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 13;
    controls.maxDistance = 50;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.495;

    /* ---- 材质（三渲二：3 级色阶） ---- */
    var gradient = JAC.toonGradient([0.6, 0.81, 1.0]);
    var M = JAC.createMaterials(gradient);

    /* ---- 环境：天光 / 底座 / 街灯 ---- */
    var env = JAC.buildEnvironment(scene, M);

    /* ---- 建筑 / 树木 / 花瓣 ---- */
    var building = JAC.buildBuilding(M);
    scene.add(building.group);

    var trees = JAC.createTrees(M, env);
    scene.add(trees.group);

    var petals = JAC.createPetals(M, motionScale > 0.5 ? 150 : 70);
    scene.add(petals.mesh);

    /* ---- 接触阴影（树下 / 门前 / 长椅下） ---- */
    env.addBlob(3.6, 2.1, -3.6, 5.95, 1.0);
    env.addBlob(4.4, 2.4, -3.6, 4.3, 0.75);
    env.addBlob(3.2, 1.9, -7.6, 7.2, 0.55);
    env.addBlob(3.2, 1.9, 10.2, 3.4, 0.55);

    /* ---- 玻璃 / 金属反射环境（按时段切换） ---- */
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envMaps = {};
    ['day', 'dusk', 'night'].forEach(function (k) {
      envMaps[k] = pmrem.fromScene(JAC.createEnvScene(JAC.TIMES[k]), 0.04).texture;
    });
    pmrem.dispose();
    function applyEnv(k) {
      [M.glass, M.metal, M.metalLight, M.lampMetal].forEach(function (m) {
        m.envMap = envMaps[k];
        m.needsUpdate = true;
      });
    }
    applyEnv('day');

    /* ---- 昼夜系统 ---- */
    var timeSystem = JAC.createTimeSystem({
      scene: scene,
      sky: env.sky,
      stars: env.stars,
      lights: env.lights,
      lamps: env.lamps,
      blobs: env.blobs,
      M: M,
      doorLight: building.doorLight,
      doorGlowPlane: building.doorGlowPlane,
      windowGlowPlanes: building.windowGlowPlanes,
      onTimeChange: applyEnv
    });

    /* ---- 界面：白天 / 黄昏 / 夜晚 ---- */
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll('[data-time]')
    );
    function setTime(name, instant) {
      timeSystem.set(name, instant);
      buttons.forEach(function (btn) {
        var active = btn.getAttribute('data-time') === name;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTime(btn.getAttribute('data-time'));
      });
    });

    // 支持 ?time=day|dusk|night 直接进入指定时段（直达链接即时呈现）
    var preset = (window.location.search.match(/[?&]time=(day|dusk|night)/) || [])[1];
    setTime(preset || 'day', !!preset);

    /* ---- 双击回到默认视角 ---- */
    var tween = null;
    canvas.addEventListener('dblclick', function () {
      tween = {
        t: 0,
        from: camera.position.clone(),
        to: camDefault.clone(),
        fromT: controls.target.clone(),
        toT: targetDefault.clone()
      };
    });

    /* ---- 自适应尺寸 ---- */
    function resize() {
      var w = canvas.clientWidth || 800;
      var h = canvas.clientHeight || 500;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---- 动画循环 ---- */
    var clock = new THREE.Clock();
    function easeInOut(x) {
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    }

    function animate() {
      requestAnimationFrame(animate);
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.9);
        var e = easeInOut(tween.t);
        camera.position.lerpVectors(tween.from, tween.to, e);
        controls.target.lerpVectors(tween.fromT, tween.toT, e);
        if (tween.t >= 1) tween = null;
      }

      controls.update();
      timeSystem.update();
      trees.update(t * motionScale);
      petals.update(dt * motionScale, t * motionScale);

      renderer.render(scene, camera);
    }
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
