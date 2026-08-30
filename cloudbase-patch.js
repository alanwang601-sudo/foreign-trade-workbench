/* =========================================================
 * 外贸工作台 · CloudBase/Supabase 同步注入补丁
 * 提供两套互不干扰的同步入口：
 *   1) window.__ftCloud        —— CloudBase NoSQL 版（保留，老接口）
 *   2) window.__ftSupabaseCloud —— Supabase 版（新增，推荐）
 * 二者都包装底层引擎的 connect/fullPush/pullAndMerge/轮询/推送接口，
 * 供 web.js 设置页分别绑定。
 * ========================================================= */
(function () {
  if (typeof window === 'undefined') return;

  // ---------- 通用配置键 ----------
  const CB_ENV_KEY = 'ftw_cb_envid';
  const CB_REGION_KEY = 'ftw_cb_region';

  function getState() { return window.__ftState || {}; }

  function safeSettingsForCloud(settings) {
    const out = Object.assign({}, settings || {});
    [
      'apiKey', 'searchGoogleKey', 'searchBingKey', 'searchBraveKey', 'searchTavilyKey',
      'webdavPass', 'webdavPassword', 'webdavUser', 'webdavUsername',
      'sb_key', 'sbKey', 'supabaseKey', 'token', 'accessToken', 'refreshToken'
    ].forEach(k => { delete out[k]; });
    return out;
  }

  // =====================================================
  // 一、CloudBase NoSQL 版（window.__ftCloud）
  // =====================================================
  const cbSyncState = { connected: false, envId: '', lastSync: '', lastError: '', mode: '' };

  function cbGetConfig() {
    return { envId: localStorage.getItem(CB_ENV_KEY) || '', region: localStorage.getItem(CB_REGION_KEY) || 'ap-shanghai' };
  }
  function cbSaveConfig(envId, region) {
    localStorage.setItem(CB_ENV_KEY, envId || '');
    localStorage.setItem(CB_REGION_KEY, region || 'ap-shanghai');
  }
  function cbEngine() { return window.__ftPg || null; }

  async function cbConnect() {
    const cfg = cbGetConfig();
    if (!cfg.envId) return { ok: false, error: '未配置环境 ID' };
    const eng = cbEngine();
    if (!eng) return { ok: false, error: '同步模块未加载' };
    try {
      const r = await eng.connect(cfg.envId);
      if (!r.ok) return r;
      cbSyncState.mode = 'nosql';
      cbSyncState.connected = true;
      cbSyncState.envId = cfg.envId;
      window.__ftState = window.__ftState || getState();
      // 首次连接必须先处理待删 + 拉取远端删除，再上传本地；否则旧设备会把已删除客户重新复活。
      if (window.__ftFlushDeletes) { try { await window.__ftFlushDeletes(); } catch (e) {} }
      const pull = await eng.pullAndMerge();
      if (eng.fullPush) await eng.fullPush();
      if (pull && pull.ok && window.__ftRefreshUI) window.__ftRefreshUI();
      if (eng.startPolling) eng.startPolling();
      cbSyncState.lastSync = new Date().toLocaleString('zh-CN');
      return { ok: true, mode: cbSyncState.mode };
    } catch (e) {
      cbSyncState.connected = false;
      cbSyncState.lastError = e.message || '连接失败';
      return { ok: false, error: cbSyncState.lastError };
    }
  }
  function cbDisconnect() { const e = cbEngine(); if (e && e.disconnect) e.disconnect(); cbSyncState.connected = false; }

  // 通用：推送日历 / 推送配置 / 监听配置
  async function pushCalendarVia(eng) {
    if (!eng || !eng.upsertRecord) return { ok: false, error: '未加载' };
    try {
      const st = getState();
      if (!st.calendar) return { ok: true };
      const calRec = Object.assign({ updatedAt: new Date().toISOString() }, st.calendar);
      return await eng.upsertRecord('calendar', 'ftw_calendar', calRec);
    } catch (err) { return { ok: false, error: err.message }; }
  }
  async function pushSettingsVia(eng) {
    if (!eng || !eng.upsertRecord) return { ok: false, error: '未加载' };
    try {
      const st = getState();
      if (!st.settings) return { ok: true };
      const rec = Object.assign({ updatedAt: new Date().toISOString() }, safeSettingsForCloud(st.settings));
      return await eng.upsertRecord('settings', 'ftw_settings', rec);
    } catch (err) { return { ok: false, error: err.message }; }
  }

  window.__ftCloud = {
    connect: cbConnect,
    disconnect: cbDisconnect,
    pushAll: () => { const e = cbEngine(); return e && e.fullPush ? e.fullPush() : { ok: false, error: '未加载' }; },
    clearBusinessData: () => { const e = cbEngine(); return e && e.clearBusinessData ? e.clearBusinessData() : { ok: false, error: '当前 CloudBase 同步层不支持云端整表清空' }; },
    pullAll: () => { const e = cbEngine(); return e && e.pullAndMerge ? e.pullAndMerge() : { ok: false, error: '未加载' }; },
    startPolling: () => { const e = cbEngine(); if (e && e.startPolling) e.startPolling(); },
    pushCalendar: () => pushCalendarVia(cbEngine()),
    pushSettings: () => pushSettingsVia(cbEngine()),
    onSettings: (fn) => { const e = cbEngine(); if (e && e.onSettings) e.onSettings(fn); },
    getConfig: cbGetConfig, saveConfig: cbSaveConfig,
    getState: () => cbSyncState,
    onStatus: (fn) => { const e = cbEngine(); if (e && e.onStatus) e.onStatus(fn); }
  };

  // =====================================================
  // 二、Supabase 版（window.__ftSupabaseCloud）推荐
  // =====================================================
  const sbSyncState = { connected: false, url: '', lastSync: '', lastError: '', mode: 'supabase' };

  const SB_URL_KEY = 'sb_url';
  const SB_KEY_KEY = 'sb_key';

  function sbGetConfig() {
    return { url: localStorage.getItem(SB_URL_KEY) || '', key: localStorage.getItem(SB_KEY_KEY) || '' };
  }
  function sbSaveConfig(url, key) {
    localStorage.setItem(SB_URL_KEY, url || '');
    localStorage.setItem(SB_KEY_KEY, key || '');
  }
  function sbEngine() { return window.__ftSupabase || null; }

  async function sbConnect(url, key) {
    const eng = sbEngine();
    if (!eng) return { ok: false, error: 'Supabase 同步模块未加载' };
    if (url) sbSaveConfig(url, key);
    const cfg = sbGetConfig();
    if (!cfg.url || !cfg.key) return { ok: false, error: '未配置 Supabase URL 或密钥' };
    try {
      const r = await eng.connect(cfg.url, cfg.key);
      if (!r.ok) return r;
      sbSyncState.connected = true;
      sbSyncState.url = cfg.url;
      window.__ftState = window.__ftState || getState();
      // 首次连接必须先处理待删 + 拉取远端删除，再上传本地。
      if (window.__ftFlushDeletes) { try { await window.__ftFlushDeletes(); } catch (e) {} }
      const pull = await eng.pullAndMerge();
      if (eng.fullPush) await eng.fullPush();
      if (pull && pull.ok && window.__ftRefreshUI) window.__ftRefreshUI();
      if (eng.startPolling) eng.startPolling();
      sbSyncState.lastSync = new Date().toLocaleString('zh-CN');
      return { ok: true, mode: 'supabase' };
    } catch (e) {
      sbSyncState.connected = false;
      sbSyncState.lastError = e.message || '连接失败';
      return { ok: false, error: sbSyncState.lastError };
    }
  }
  function sbDisconnect() { const e = sbEngine(); if (e && e.disconnect) e.disconnect(); sbSyncState.connected = false; }

  window.__ftSupabaseCloud = {
    connect: sbConnect,
    disconnect: sbDisconnect,
    pushAll: () => { const e = sbEngine(); return e && e.fullPush ? e.fullPush() : { ok: false, error: '未加载' }; },
    clearBusinessData: () => { const e = sbEngine(); return e && e.clearBusinessData ? e.clearBusinessData() : { ok: false, error: '未加载' }; },
    pullAll: () => { const e = sbEngine(); return e && e.pullAndMerge ? e.pullAndMerge() : { ok: false, error: '未加载' }; },
    startPolling: () => { const e = sbEngine(); if (e && e.startPolling) e.startPolling(); },
    pushCalendar: () => pushCalendarVia(sbEngine()),
    pushSettings: () => pushSettingsVia(sbEngine()),
    onSettings: (fn) => { const e = sbEngine(); if (e && e.onSettings) e.onSettings(fn); },
    getConfig: sbGetConfig, saveConfig: sbSaveConfig,
    getState: () => sbSyncState,
    onStatus: (fn) => { const e = sbEngine(); if (e && e.onStatus) e.onStatus(fn); }
  };

  // =====================================================
  // 三、自动连接（仅 CloudBase；Supabase 由设置页手动连接）
  // =====================================================
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const cfg = cbGetConfig();
      if (cfg.envId) {
        cbConnect().then(r => {
          if (r.ok) window.dispatchEvent(new CustomEvent('ftw-cloud-connected', { detail: { ok: true, mode: r.mode } }));
        });
      }
    }, 1500);
  });
})();
