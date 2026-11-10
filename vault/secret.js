/* 加密笔记的解锁层：口令 → PBKDF2 派生密钥 → AES-GCM 解出正文。
 * 密钥只放在本标签页的 sessionStorage 里，关掉页面就没了；不写 localStorage、不上传。
 * 与封存室共用同一个口令和同一份 salt，所以在封存室解过锁之后，这里会直接可用。 */
(function () {
  'use strict';

  const data = window.SECRET_NOTES || null;
  const STORE = 'secret-notes-key';
  let key = null;

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
      if (saved) key = b64ToBytes(saved);
    } catch { /* 无痕模式下读不到，走口令输入 */ }
    return key;
  }

  async function derive(password) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64ToBytes(data.salt), iterations: data.iter, hash: 'SHA-256' },
      material, 256);
    return new Uint8Array(bits);
  }

  async function decryptBody(material, id) {
    const item = data.enc[id];
    if (!item) return null;
    const cryptoKey = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(item.iv) }, cryptoKey, b64ToBytes(item.ct));
    return JSON.parse(new TextDecoder().decode(plain)).content;
  }

  window.SecretNotes = {
    ready: Boolean(data && Array.isArray(data.meta)),
    meta: data && Array.isArray(data.meta) ? data.meta : [],
    has: id => Boolean(data && data.enc && data.enc[id]),
    isUnlocked: () => Boolean(recall()),

    /** 已解锁则直接返回正文，否则返回 null。 */
    async content(id) {
      const material = recall();
      if (!material) return null;
      try { return await decryptBody(material, id); } catch { return null; }
    },

    /** 用口令解这一篇；口令错了返回 null（GCM 校验失败）。 */
    async unlockWith(id, password) {
      const material = await derive(password);
      try {
        const content = await decryptBody(material, id);
        key = material;
        try { sessionStorage.setItem(STORE, bytesToB64(material)); } catch { /* 存不下也能看这一次 */ }
        return content;
      } catch {
        return null;
      }
    },

    /** 锁定：清掉本页记住的密钥。 */
    forget() {
      key = null;
      try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
    }
  };
})();
