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
    onStatus: null,
    lastOkAt: '',
    failureCount: 0,
    lastReconnectAttempt: 0
  };

  // 业务 key -> 表名
  const TABLES = {
    customers: 'customers',
    aiHistory: 'ai_history',
    marketAnalyses: 'market_analyses',
    calendar: 'calendar',
    settings: 'settings'
  };

  // customers 表中的同步控制记录（不会展示到 CRM）。
  // 单条删除写 tombstone；全量清空写 clear marker，确保其他设备不会把旧客户重新上传。
  const META_DELETE_PREFIX = '__ft_deleted__:';
  const META_CLEAR_ID = '__ft_customers_cleared__';

  function status(msg, type) { if (SB.onStatus) { try { SB.onStatus(msg, type); } catch (e) {} } }
  function getState() { return window.__ftState || {}; }

  function noteSuccess() {
    SB.connected = true;
    SB.failureCount = 0;
    SB.lastError = '';
    SB.lastOkAt = new Date().toISOString();
  }
  function noteFailure(msg) {
    SB.failureCount = (SB.failureCount || 0) + 1;
    SB.lastError = msg || '云端请求失败';
    if (SB.failureCount >= 3) SB.connected = false;
  }
  function friendlyNetworkError(e) {
    const raw = (e && e.message) ? e.message : String(e || '连接失败');
    if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return '无法访问 Supabase 项目：可能已暂停、项目已删除，或当前网络不可达';
    return raw;
  }
  async function fetchTimeout(url, options, ms) {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || 15000) : null;
    try {
      return await fetch(url, Object.assign({}, options || {}, ctrl ? { signal: ctrl.signal } : {}));
    } finally { if (timer) clearTimeout(timer); }
  }


  // 记录的“最近一次有效活动时间”。业务字段 updatedAt/createdAt 可能来自旧备份，
  // 因此同步层还要考虑 syncedAt / _ftImportedAt，避免全量清空标记误杀刚重新导入的数据。
  function customerClock(rec) {
    if (!rec) return 0;
    const vals = [rec.updatedAt, rec.createdAt, rec.syncedAt, rec._ftImportedAt]
      .map(v => new Date(v || 0).getTime())
      .filter(v => Number.isFinite(v) && v > 0);
    return vals.length ? Math.max(...vals) : 0;
  }

  function safeSettingsForCloud(settings) {
    const out = Object.assign({}, settings || {});
    [
      'apiKey', 'searchGoogleKey', 'searchBingKey', 'searchBraveKey', 'searchTavilyKey',
      'webdavPass', 'webdavPassword', 'webdavUser', 'webdavUsername',
      'sb_key', 'sbKey', 'supabaseKey', 'token', 'accessToken', 'refreshToken'
    ].forEach(k => { delete out[k]; });
    return out;
  }

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
      const r = await healthCheck(true);
      if (!r.ok) return r;
      noteSuccess();
      status('已连接（Supabase）', 'ok');
      return { ok: true };
    } catch (e) {
      const msg = friendlyNetworkError(e);
      noteFailure(msg);
      status(msg, 'err');
      return { ok: false, error: msg };
    }
  }

  // ---------- REST 封装 ----------
  // 新版 Supabase key 只能放 apikey header（不能放 Authorization Bearer，会被当 JWT 拒绝）
  function hdrs() { return { 'apikey': SB.key, 'Content-Type': 'application/json' }; }

  // 健康检查优先访问 health_check；旧项目没有该表时回退 customers。
  async function healthCheck(silent) {
    if (!SB.url || !SB.key) return { ok: false, error: '未配置 Supabase URL 或密钥' };
    const paths = ['health_check?select=id&limit=1', 'customers?select=id&limit=1'];
    let last = '';
    for (const path of paths) {
      try {
        const r = await fetchTimeout(`${SB.url}/rest/v1/${path}`, { headers: hdrs() }, 15000);
        if (r.ok) { noteSuccess(); if (!silent) status('云端健康检查正常', 'ok'); return { ok: true, lastOkAt: SB.lastOkAt }; }
        const body = await r.text().catch(() => '');
        if (r.status === 404) { last = '表不存在'; continue; }
        if (r.status === 401 || r.status === 403) last = '密钥无效或无权限';
        else if (r.status === 502 || r.status === 503) last = `Supabase 暂不可达（HTTP ${r.status}）`;
        else last = `HTTP ${r.status}${body && body.length < 120 ? ': ' + body : ''}`;
        break;
      } catch (e) { last = friendlyNetworkError(e); break; }
    }
    const msg = last || 'Supabase 健康检查失败';
    noteFailure(msg);
    if (!silent) status(msg, 'err');
    return { ok: false, error: msg, failures: SB.failureCount };
  }

  function mergeRecordsById(localList, remoteList) {
    const map = new Map();
    (Array.isArray(localList) ? localList : []).forEach(r => { if (r && r.id) map.set(r.id, r); });
    (Array.isArray(remoteList) ? remoteList : []).forEach(r => {
      if (!r || !r.id) return;
      const cur = map.get(r.id);
      if (!cur) { map.set(r.id, r); return; }
      const lt = new Date(cur.updatedAt || cur.createdAt || 0).getTime();
      const rt = new Date(r.updatedAt || r.createdAt || 0).getTime();
      map.set(r.id, rt >= lt ? r : cur);
    });
    return Array.from(map.values());
  }

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
      const r = await fetchTimeout(`${SB.url}/rest/v1/${table}?select=id,data,updated_at`, { headers: hdrs() }, 15000);
      if (!r.ok) { const msg = `HTTP ${r.status}`; noteFailure(msg); return { ok: false, error: msg }; }
      noteSuccess();
      const rows = await r.json();
      const records = (Array.isArray(rows) ? rows : []).map(row => {
        let obj = {};
        try { obj = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch (e) {}
        return { ...obj, id: row.id, updatedAt: row.updated_at || obj.updatedAt || '' };
      });
      return { ok: true, records };
    } catch (e) {
      const msg = friendlyNetworkError(e); noteFailure(msg); return { ok: false, error: msg || '拉取失败' };
    }
  }

  // ---------- 删除记录 ----------
  async function deleteRecord(key, id) {
    if (!SB.connected) return { ok: false, error: '未连接' };
    const table = TABLES[key];
    if (!table) return { ok: false, error: '未知表' };
    if (!id) return { ok: false, error: '缺少 id' };
    try {
      const r = await fetch(`${SB.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: hdrs() });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return { ok: false, error: `删除失败 HTTP ${r.status}: ${body.slice(0, 150)}` };
      }
      // 客户删除额外留下云端墓碑。即使这是云端最后一条客户，其他设备也能知道它是“被删了”，
      // 而不是把自己的旧副本当作新数据重新上传。
      if (key === 'customers' && !String(id).startsWith('__ft_')) {
        const deletedAt = new Date().toISOString();
        const markerId = META_DELETE_PREFIX + id;
        const mr = await upsertRecord('customers', markerId, { _ftMeta: 'customerDeleted', targetId: id, deletedAt, updatedAt: deletedAt });
        if (!mr || !mr.ok) return { ok: false, error: (mr && mr.error) || '客户已删除，但云端删除标记写入失败' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || '删除失败' };
    }
  }

  // ---------- 整表删除 / 业务数据彻底清空 ----------
  async function deleteAllRecords(key) {
    if (!SB.connected) return { ok: false, error: '未连接' };
    const table = TABLES[key];
    if (!table) return { ok: false, error: '未知表' };
    try {
      // id 为主键且非空；not.is.null 会覆盖本表所有记录，包括旧墓碑。
      const r = await fetch(`${SB.url}/rest/v1/${table}?id=not.is.null`, { method: 'DELETE', headers: hdrs() });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return { ok: false, error: `清空 ${table} 失败 HTTP ${r.status}: ${body.slice(0, 150)}` };
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || `清空 ${table} 失败` }; }
  }

  async function clearBusinessData() {
    if (!SB.connected) return { ok: false, error: '未连接' };
    for (const key of ['customers', 'aiHistory', 'marketAnalyses']) {
      const r = await deleteAllRecords(key);
      if (!r.ok) return r;
    }
    // 全量清空标记：保留一条控制记录，防止其他设备把“云端为空”误判成异常后重新上传旧客户。
    const clearedAt = new Date().toISOString();
    const m = await upsertRecord('customers', META_CLEAR_ID, { _ftMeta: 'customersCleared', clearedAt, updatedAt: clearedAt });
    if (!m.ok) return m;
    return { ok: true, clearedAt };
  }

  // ---------- 日历安全合并 ----------
  // 规则：云端独有、本地独有都保留；同 id 时优先 todo 自身 updatedAt 更新者。
  // 旧任务常没有 updatedAt，此时用日历顶层 updatedAt 判断，避免旧 localStorage 覆盖新云端。
  function mergeCalendarSafe(localCal, cloudCal) {
    const local = Object.assign({ todos: [], customHolidays: [] }, localCal || {});
    const cloud = Object.assign({ todos: [], customHolidays: [] }, cloudCal || {});
    const ltTop = new Date(local.updatedAt || 0).getTime() || 0;
    const ctTop = new Date(cloud.updatedAt || 0).getTime() || 0;
    const byId = new Map();
    (local.todos || []).forEach(t => { if (t && t.id) byId.set(t.id, t); });
    (cloud.todos || []).forEach(t => {
      if (!t || !t.id) return;
      const l = byId.get(t.id);
      if (!l) { byId.set(t.id, t); return; }
      const li = new Date(l.updatedAt || l.completedAt || l.createdAt || 0).getTime() || 0;
      const ci = new Date(t.updatedAt || t.completedAt || t.createdAt || 0).getTime() || 0;
      if (ci || li) byId.set(t.id, ci >= li ? t : l);
      else byId.set(t.id, ctTop >= ltTop ? t : l);
    });
    const holMap = new Map();
    (local.customHolidays || []).forEach(h => { if (h && h.id) holMap.set(h.id, h); });
    (cloud.customHolidays || []).forEach(h => { if (h && h.id) holMap.set(h.id, h); });
    const base = ctTop >= ltTop ? Object.assign({}, local, cloud) : Object.assign({}, cloud, local);
    base.todos = Array.from(byId.values());
    base.customHolidays = Array.from(holMap.values());
    base.updatedAt = new Date(Math.max(ltTop, ctTop, Date.now())).toISOString();
    delete base.id;
    return base;
  }

  // ---------- 全量推送 ----------
  async function fullPush() {
    const st = getState();
    if (typeof window.__ftCreateSafetySnapshot === 'function') { try { window.__ftCreateSafetySnapshot('before_supabase_push'); } catch (e) {} }
    if (!st.customers) return { ok: false, error: '数据未就绪' };
    if (!SB.connected) return { ok: false, error: '未连接' };
    try {
      const failedCustomers = [];
      for (const key of ['customers', 'aiHistory', 'marketAnalyses']) {
        const list = st[key] || [];
        for (const rec of list) {
          const id = rec.id || rec.bizId;
          if (!id) continue;
          // 用户主动“上传到云端”本身就是一次明确的重新发布动作。
          // 即使 JSON 里的 updatedAt/createdAt 很旧，也用 syncedAt 证明它是在最近一次清空之后重新发布的。
          let syncStamp = '';
          if (key === 'customers') {
            syncStamp = new Date().toISOString();
            rec.syncedAt = syncStamp;
          }
          const r = await upsertRecord(key, id, rec);
          if (key === 'customers') {
            if (!r || r.ok !== true) {
              delete rec.syncedAt;  // 推送失败就不算同步过
              failedCustomers.push(id);
            } else {
              // 显式重新上传成功 = 允许该客户“复活/重建”。清掉本机同 ID 的旧墓碑和待删队列。
              const tombAt = st.tombstones && st.tombstones[id];
              if (tombAt && new Date(syncStamp).getTime() > new Date(tombAt || 0).getTime()) delete st.tombstones[id];
              if (Array.isArray(st.pendingDeletes)) st.pendingDeletes = st.pendingDeletes.filter(x => x !== id);
            }
          }
        }
      }
      if (typeof window.__ftPersistState === 'function') { try { window.__ftPersistState(); } catch (e) {} }
      if (failedCustomers.length) {
        const msg = `${failedCustomers.length} 个客户上传失败，请检查 Supabase 权限/网络后重试`; noteFailure(msg); return { ok: false, error: msg, failed: failedCustomers };
      }
      if (st.calendar) {
        // 日历不能直接用本机整包覆盖云端：先拉取云端并按 todo id 合并，
        // 防止另一设备/ChatGPT 新增的任务被旧 localStorage 吞掉。
        const calRes = await pullTable('calendar');
      if (!calRes.ok) throw new Error('calendar 拉取失败：' + (calRes.error || '未知错误'));
      if (Array.isArray(calRes.records) && calRes.records.length) {
        const calRec = calRes.records.find(r => r.id === 'ftw_calendar');
        if (calRec) {
          // 不再依赖单一顶层 updatedAt 决定“整包采纳/整包忽略”。
          // 始终按任务 id 合并，保证云端新增任务即使本机时间戳较新也不会消失。
          st.calendar = mergeCalendarSafe(st.calendar || { todos: [], customHolidays: [] }, calRec);
        }
      }
      const setRes = await pullTable('settings');
      if (!setRes.ok) throw new Error('settings 拉取失败：' + (setRes.error || '未知错误'));
      if (Array.isArray(setRes.records) && setRes.records.length) {
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
      // 拉取合并后必须写回 localStorage；否则刷新页面又会加载旧本地日历。
      if (typeof window.__ftPersistState === 'function') { try { window.__ftPersistState(); } catch (e) {} }
      SB.lastSync = new Date().toLocaleString('zh-CN');
      noteSuccess();
      return { ok: true, count: st.customers.length, calendarTodos: (st.calendar && st.calendar.todos || []).length };
    } catch (e) {
      const msg = friendlyNetworkError(e) || '拉取失败'; noteFailure(msg); return { ok: false, error: msg };
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
    const ms = interval || 30000;
    SB.pollTimer = setInterval(async () => {
      if (!SB.connected) {
        if (SB.url && SB.key && Date.now() - (SB.lastReconnectAttempt || 0) > 60000) {
          SB.lastReconnectAttempt = Date.now();
          try { await connect(SB.url, SB.key); } catch (e) {}
        }
        return;
      }
      if (isBusy()) return;
      // 补推离线期间删掉的客户（断网时删除没能通知云端，联网后在这里补删）
      if (window.__ftFlushDeletes) { try { await window.__ftFlushDeletes(); } catch (e) {} }
      // 先拉云端再推本地，避免旧 localStorage 在轮询第一步覆盖云端新任务。
      const before = fingerprint();
      const r = await pullAndMerge();
      if (!r.ok) { status(r.error || '云端同步失败，本地数据已保留', 'err'); return; }
      const afterPull = fingerprint();
      const localChanged = before !== SB.lastFingerprint;
      const remoteChanged = afterPull !== before;
      if (localChanged || remoteChanged) {
        try { await fullPush(); } catch (e) {}
      }
      SB.lastFingerprint = fingerprint();
      if (window.__ftRefreshUI) window.__ftRefreshUI();
    }, ms);
  }
  function stopPolling() { if (SB.pollTimer) { clearInterval(SB.pollTimer); SB.pollTimer = null; } }
  function disconnect() { stopPolling(); SB.connected = false; }

  window.__ftSupabase = {
    connect, disconnect, fullPush, pullAndMerge, startPolling, stopPolling, healthCheck,
    pullTable, upsertRecord, deleteRecord, deleteAllRecords, clearBusinessData,
    saveConfig, getConfig,
    getState: () => ({ connected: SB.connected, lastSync: SB.lastSync, lastError: SB.lastError, lastOkAt: SB.lastOkAt, failureCount: SB.failureCount }),
    onStatus: (fn) => { SB.onStatus = fn; },
    onSettings: (fn) => { SB.onSettings = fn; }
  };
})();
