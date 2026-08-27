/* =========================================================
 * 外贸工作台 · Supabase 实时同步模块
 * 基于 Supabase PostgreSQL REST API（公开 anon key）。
 * 纯前端 HTML 直接 fetch，无需任何后端/云函数。
 * 所有设备共享同一批数据（单用户多设备），实时轮询同步。
 *
 * 对外暴露 window.__ftSupabase，接口与旧同步层完全一致，
 * 由 cloudbase-patch.js 的 engine() 统一调度。
 *
 * 表结构（由用户提前用一段 SQL 在 Supabase SQL Editor 建好）：
 *   customers / ai_history / market_analyses / calendar / settings
 *   每张表字段：id text primary key, data text, updated_at timestamptz
 *   RLS 策略允许 anon 读写（SQL 中已开）。
 *
 * 配置：window.localStorage 存 sb_url（https://xxx.supabase.co）
 *      和 sb_key（anon public key）。
 * ========================================================= */
(function () {
  if (typeof window === 'undefined') return;

  const SB = {
    url: '',
    key: '',
    connected: false,
    lastSync: '',
    lastError: '',
    pollTimer: null,
    lastFingerprint: '',
    onStatus: null
  };

  // 业务 key -> 表名
  const TABLES = {
    customers: 'customers',
    aiHistory: 'ai_history',
    marketAnalyses: 'market_analyses',
    calendar: 'calendar',
    settings: 'settings'
  };

  function status(msg, type) { if (SB.onStatus) { try { SB.onStatus(msg, type); } catch (e) {} } }
  function getState() { return window.__ftState || {}; }

  // ---------- 保存/读取配置 ----------
  function saveConfig(url, key) {
    try { localStorage.setItem('sb_url', url || ''); localStorage.setItem('sb_key', key || ''); } catch (e) {}
  }
  function getConfig() {
    return { url: localStorage.getItem('sb_url') || '', key: localStorage.getItem('sb_key') || '' };
  }

  // ---------- 连接 ----------
  async function connect(url, key) {
    if (url) SB.url = url.trim().replace(/\/+$/, '');
    if (key) SB.key = key.trim();
    if (!SB.url || !SB.key) return { ok: false, error: '未配置 Supabase URL 或密钥' };
    try {
      // 用一次轻量请求验证连通性 + 权限（查 customers 表，最多 1 行）
      // 注意：新版 Supabase key（sb_publishable/sb_secret）只能放 apikey header，
      //      不能放 Authorization: Bearer（会被当成 JWT 解析报 Invalid JWT）
      const r = await fetch(`${SB.url}/rest/v1/customers?select=id&limit=1`, {
        headers: { apikey: SB.key, 'Content-Type': 'application/json' }
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        let msg = `HTTP ${r.status}`;
        if (r.status === 401 || r.status === 403) msg = '密钥无效或无权限（请确认 anon key 正确）';
        else if (r.status === 404) msg = '表不存在，请先在 Supabase SQL Editor 运行建表 SQL';
        else if (body && body.length < 200) msg += ': ' + body;
        SB.lastError = msg; status(msg, 'err');
        return { ok: false, error: msg };
      }
      SB.connected = true;
      SB.lastError = '';
      status('已连接（Supabase）', 'ok');
      return { ok: true };
    } catch (e) {
      SB.connected = false;
      SB.lastError = e.message || '连接失败';
      status(SB.lastError, 'err');
      return { ok: false, error: SB.lastError };
    }
  }

  // ---------- REST 封装 ----------
  // 新版 Supabase key 只能放 apikey header（不能放 Authorization Bearer，会被当 JWT 拒绝）
  function hdrs() { return { 'apikey': SB.key, 'Content-Type': 'application/json' }; }

  // ---------- upsert 一条记录 ----------
  async function upsertRecord(key, id, doc) {
    if (!SB.connected) return { ok: false, error: '未连接' };
    const table = TABLES[key];
    if (!table) return { ok: false, error: '未知表' };
    try {
      const updatedAt = doc.updatedAt || new Date().toISOString();
      const { id: _drop, ...rest } = doc;
      // data 字段存业务数据（JSON 字符串），updated_at 存时间戳
      const payload = { id, data: JSON.stringify(rest), updated_at: updatedAt };
      // Supabase REST upsert：POST + on_conflict=id + Prefer merge-duplicates
      const r = await fetch(`${SB.url}/rest/v1/${table}?on_conflict=id`, {
        method: 'POST',
        headers: { ...hdrs(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return { ok: false, error: `写入失败 HTTP ${r.status}: ${body.slice(0,150)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || '写入失败' };
    }
  }

  // ---------- 拉取某表全部记录 ----------
  async function pullTable(key) {
    if (!SB.connected) return { ok: false, error: '未连接' };
    const table = TABLES[key];
    if (!table) return { ok: false, error: '未知表' };
    try {
      const r = await fetch(`${SB.url}/rest/v1/${table}?select=id,data,updated_at`, { headers: hdrs() });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const rows = await r.json();
      const records = (Array.isArray(rows) ? rows : []).map(row => {
        let obj = {};
        try { obj = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch (e) {}
        return { id: row.id, updatedAt: row.updated_at || obj.updatedAt || '', ...obj };
      });
      return { ok: true, records };
    } catch (e) {
      return { ok: false, error: e.message || '拉取失败' };
    }
  }

  // ---------- 删除记录 ----------
  async function deleteRecord(key, id) {
    if (!SB.connected) return;
    const table = TABLES[key];
    if (!table) return;
    try {
      await fetch(`${SB.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: hdrs() });
    } catch (e) {}
  }

  // ---------- 全量推送 ----------
  async function fullPush() {
    const st = getState();
    if (!st.customers) return { ok: false, error: '数据未就绪' };
    if (!SB.connected) return { ok: false, error: '未连接' };
    try {
      for (const key of ['customers', 'aiHistory', 'marketAnalyses']) {
        const list = st[key] || [];
        for (const rec of list) {
          const id = rec.id || rec.bizId;
          if (id) await upsertRecord(key, id, rec);
        }
      }
      if (st.calendar) {
        const calRec = Object.assign({ updatedAt: new Date().toISOString() }, st.calendar);
        await upsertRecord('calendar', 'ftw_calendar', calRec);
      }
      if (st.settings) {
        const setRec = Object.assign({ updatedAt: new Date().toISOString() }, st.settings);
        await upsertRecord('settings', 'ftw_settings', setRec);
      }
      SB.lastSync = new Date().toLocaleString('zh-CN');
      SB.lastError = '';
      status('已上传 ' + (st.customers || []).length + ' 个客户', 'ok');
      return { ok: true };
    } catch (e) {
      SB.lastError = e.message || '同步失败';
      return { ok: false, error: SB.lastError };
    }
  }

  // ---------- 拉取并合并 ----------
  async function pullAndMerge() {
    if (!SB.connected) return { ok: false, error: '未连接' };
    const st = getState();
    try {
      for (const key of ['customers', 'aiHistory', 'marketAnalyses']) {
        const res = await pullTable(key);
        if (res.ok && Array.isArray(res.records)) {
          if (key === 'customers') {
            const localMap = new Map((st.customers || []).map(c => [c.id, c]));
            res.records.forEach(c => {
              if (!c.id) return;
              if (localMap.has(c.id)) {
                const t1 = new Date(localMap.get(c.id).updatedAt || 0).getTime();
                const t2 = new Date(c.updatedAt || 0).getTime();
                localMap.set(c.id, t2 >= t1 ? c : localMap.get(c.id));
              } else localMap.set(c.id, c);
            });
            st.customers = Array.from(localMap.values());
          } else {
            st[key] = res.records;
          }
        }
      }
      const calRes = await pullTable('calendar');
      if (calRes.ok && Array.isArray(calRes.records) && calRes.records.length) {
        const calRec = calRes.records.find(r => r.id === 'ftw_calendar');
        if (calRec) {
          const t1 = new Date((st.calendar && st.calendar.updatedAt) || 0).getTime();
          const t2 = new Date(calRec.updatedAt || 0).getTime();
          if (t2 >= t1) st.calendar = { todos: [], customHolidays: [], ...calRec };
        }
      }
      const setRes = await pullTable('settings');
      if (setRes.ok && Array.isArray(setRes.records) && setRes.records.length) {
        const setRec = setRes.records.find(r => r.id === 'ftw_settings');
        if (setRec) {
          const t1 = new Date((st.settings && st.settings.__syncedAt) || 0).getTime();
          const t2 = new Date(setRec.updatedAt || 0).getTime();
          if (t2 > t1 && setRec.profile) {
            const clean = Object.assign({}, setRec);
            delete clean.id; delete clean.updatedAt; delete clean.__syncedAt;
            st.settings = Object.assign({}, st.settings, clean, { __syncedAt: setRec.updatedAt });
            if (SB.onSettings) { try { SB.onSettings(clean, setRec.updatedAt); } catch (e) {} }
          }
        }
      }
      SB.lastSync = new Date().toLocaleString('zh-CN');
      SB.lastError = '';
      return { ok: true, count: st.customers.length };
    } catch (e) {
      SB.lastError = e.message || '拉取失败';
      return { ok: false, error: SB.lastError };
    }
  }

  // ---------- 指纹 ----------
  function fingerprint() {
    const st = getState();
    const cust = st.customers || [];
    const cal = st.calendar || { todos: [], customHolidays: [] };
    const calStr = JSON.stringify({ t: (cal.todos || []).length, h: (cal.customHolidays || []).length, upd: cal.updatedAt || '' });
    const setStr = (st.settings && st.settings.__syncedAt) || '';
    return `${cust.length}|${cust.reduce((a, c) => a + (c.updatedAt || ''), '')}|${calStr}|${setStr}`;
  }

  // ---------- 轮询 ----------
  function isBusy() {
    const st = getState();
    if (st.view !== 'dashboard' && st.view !== 'crm' && st.view !== 'calendar') return true;
    const modalRoot = document.getElementById && document.getElementById('modal-root');
    if (modalRoot && modalRoot.innerHTML && modalRoot.innerHTML.trim().length > 0) return true;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return true;
    return false;
  }
  function startPolling(interval) {
    if (SB.pollTimer) return;
    SB.lastFingerprint = fingerprint();
    const ms = interval || 12000;
    SB.pollTimer = setInterval(async () => {
      if (!SB.connected) return;
      if (isBusy()) return;
      const cur = fingerprint();
      if (cur !== SB.lastFingerprint) { SB.lastFingerprint = cur; try { await fullPush(); } catch (e) {} }
      const r = await pullAndMerge();
      if (r.ok) {
        const cur2 = fingerprint();
        if (cur2 !== SB.lastFingerprint) SB.lastFingerprint = cur2;
        if (window.__ftRefreshUI) window.__ftRefreshUI();
      }
    }, ms);
  }
  function stopPolling() { if (SB.pollTimer) { clearInterval(SB.pollTimer); SB.pollTimer = null; } }
  function disconnect() { stopPolling(); SB.connected = false; }

  window.__ftSupabase = {
    connect, disconnect, fullPush, pullAndMerge, startPolling, stopPolling,
    pullTable, upsertRecord, deleteRecord,
    saveConfig, getConfig,
    getState: () => ({ connected: SB.connected, lastSync: SB.lastSync, lastError: SB.lastError }),
    onStatus: (fn) => { SB.onStatus = fn; },
    onSettings: (fn) => { SB.onSettings = fn; }
  };
})();
