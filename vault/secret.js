/* 加密笔记的解锁层：口令 → PBKDF2 派生密钥 → AES-GCM 解出正文。
 * 正文密文按篇拆在 vault/enc/ 里，点开某篇时才临时加载，列表页不会为此多下几百 KB。
 * 密钥只放在本标签页的 sessionStorage 里，关掉页面就没了；不写 localStorage、不上传。
 * 与封存室共用同一个口令和同一份 salt。 */
(function () {
  'use strict';

  const data = window.SECRET_NOTES || null;
  const STORE = 'secret-notes-key';
  const STORE_LOCAL = 'secret-notes-remember';
  const REMEMBER_DAYS = 30;
  let key = null;
  const bodies = {};   // id -> {iv, ct}
  const plain = {};    // id -> 解密后的 markdown（本页内复用）

  function b64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToB64(bytes) {
    let binary = '';
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary);
  }

  function recall() {
    if (key) return key;
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) return (key = b64ToBytes(saved));
    } catch { /* 无痕模式下读不到，走口令输入 */ }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_LOCAL) || 'null');
      if (saved && saved.exp > Date.now() && saved.salt === data.salt && saved.k) {
        return (key = b64ToBytes(saved.k));
      }
    } catch { /* ignore */ }
    return key;
  }

  /** 按需加载某一篇的密文脚本，返回 {iv, ct}。 */
  function loadBody(id) {
    if (bodies[id]) return Promise.resolve(bodies[id]);
    if (window.SECRET_BODIES && window.SECRET_BODIES[id]) {
      bodies[id] = window.SECRET_BODIES[id];
      return Promise.resolve(bodies[id]);
    }
    const path = data && data.files ? data.files[id] : null;
    if (!path) return Promise.resolve(null);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = new URL(path, document.baseURI).href;
      script.onload = () => {
        const found = (window.SECRET_BODIES || {})[id];
        if (found) bodies[id] = found;
        resolve(found || null);
      };
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  async function derive(password) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64ToBytes(data.salt), iterations: data.iter, hash: 'SHA-256' },
      material, 256);
    return new Uint8Array(bits);
  }

  async function decryptBody(material, id) {
    const body = await loadBody(id);
    if (!body) return null;
    const cryptoKey = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['decrypt']);
    const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(body.iv) }, cryptoKey, b64ToBytes(body.ct));
    return JSON.parse(new TextDecoder().decode(result)).content;
  }

  window.SecretNotes = {
    ready: Boolean(data && Array.isArray(data.meta)),
    meta: data && Array.isArray(data.meta) ? data.meta : [],
    has: id => Boolean(data && data.files && data.files[id]),
    isUnlocked: () => Boolean(recall()),

    /** 已解锁则直接返回正文，否则返回 null。 */
    async content(id) {
      if (plain[id] !== undefined) return plain[id];
      const material = recall();
      if (!material) return null;
      try {
        const text = await decryptBody(material, id);
        plain[id] = text;
        return text;
      } catch { return null; }
    },

    /** 用口令解这一篇；口令错了返回 null（GCM 校验失败）。
     *  remember=true 时把派生密钥（不是口令）存到本机 30 天。 */
    async unlockWith(id, password, remember) {
      const material = await derive(password);
      try {
        const text = await decryptBody(material, id);
        key = material;
        plain[id] = text;
        try { sessionStorage.setItem(STORE, bytesToB64(material)); } catch { /* 存不下也能看这一次 */ }
        if (remember) {
          try {
            localStorage.setItem(STORE_LOCAL, JSON.stringify({
              k: bytesToB64(material),
              salt: data.salt,
              exp: Date.now() + REMEMBER_DAYS * 864e5
            }));
          } catch { /* 隐私模式写不进去，忽略 */ }
        }
        return text;
      } catch {
        return null;
      }
    },

    /** 锁定：清掉本页记住的密钥与已解密的正文。 */
    forget() {
      key = null;
      for (const id of Object.keys(plain)) delete plain[id];
      try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
      try { localStorage.removeItem(STORE_LOCAL); } catch { /* ignore */ }
    }
  };
})();
