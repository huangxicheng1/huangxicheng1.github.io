/* =========================================================================
 * 悉尼蓝花楹街角 · 调色板与昼夜预设
 * Sydney Jacaranda Corner — palette & time-of-day presets
 * ========================================================================= */
(function (global) {
  'use strict';

  var JAC = global.JAC = global.JAC || {};

  /* ---- 场景色板：奶油白 / 蓝紫 / 暖黄 ------------------------------- */
  JAC.PALETTE = {
    // 建筑
    cream:      0xF2EAD6, // 奶油白 · 主墙体
    creamTrim:  0xE8DCC0, // 线脚 / 窗框
    creamShade: 0xD2C4A4, // 凹槽 / 阴影面
    roof:       0x8C94A6, // 屋面 · 灰蓝
    roofDark:   0x6E7688,
    // 地面
    pavement:   0xDBD4C2,
    pavement2:  0xC8BFA9,
    baseSide:   0xCBC2AE,
    // 玻璃与铁艺
    glass:      0x33415F,
    glassStreak:0xA9BFDE,
    metal:      0x4A4655,
    metalLight: 0x6E6879,
    lampMetal:  0x3F3B4A,
    // 植物
    bark:       0x8A7358,
    barkLight:  0x9E8768,
    bloomLight: 0xB6A4E8,
    bloomMid:   0x9079D6,
    bloomDeep:  0x7A64C2,
    bloomPink:  0xC6AEEA,
    // 家具与门
    bench:      0x6E5CA8,
    benchDark:  0x584890,
    door:       0x4B4E86,
    doorDark:   0x383B6C,
    // 暖光
    warm:       0xFFB867,
    warmSoft:   0xFFD9A2
  };

  /* ---- 三时段预设：白天 / 黄昏 / 夜晚 ------------------------------- */
  JAC.TIMES = {
    day: {
      key: 'day',
      label: '白天',
      skyTop:    0x6FA9E4,
      skyBottom: 0xDCEBF7,
      fog:       0xCFE2F2,
      hemiSky:   0xBBD9F2,
      hemiGround:0xE2D6B8,
      hemiInt:   0.28,
      ambColor:  0xBFCFE2,
      ambInt:    0.10,
      sunColor:  0xFFF2DA,
      sunInt:    0.72,
      sunPos:    [16, 24, 18],
      starOpacity: 0.0,
      windowGlow: 0.0,
      lampGlow:   0.12,
      lampLight:  0.0,
      doorGlow:   0.0,
      blobOpacity: 0.22
    },
    dusk: {
      key: 'dusk',
      label: '黄昏',
      skyTop:    0x4C4A88,
      skyBottom: 0xF2A05E,
      fog:       0xE0A489,
      hemiSky:   0x8F84CC,
      hemiGround:0xD08F62,
      hemiInt:   0.30,
      ambColor:  0x6E5F96,
      ambInt:    0.12,
      sunColor:  0xFFB478,
      sunInt:    0.58,
      sunPos:    [24, 9, 22],
      starOpacity: 0.18,
      windowGlow: 0.55,
      lampGlow:   0.85,
      lampLight:  0.5,
      doorGlow:   0.6,
      blobOpacity: 0.26
    },
    night: {
      key: 'night',
      label: '夜晚',
      skyTop:    0x141A38,
      skyBottom: 0x39406E,
      fog:       0x272C52,
      hemiSky:   0x3D4880,
      hemiGround:0x2A2F52,
      hemiInt:   0.16,
      ambColor:  0x2B3260,
      ambInt:    0.10,
      sunColor:  0x93A7E4,
      sunInt:    0.32,
      sunPos:    [-16, 20, 12],
      starOpacity: 0.9,
      windowGlow: 1.0,
      lampGlow:   1.25,
      lampLight:  1.0,
      doorGlow:   1.0,
      blobOpacity: 0.30
    }
  };
})(window);
