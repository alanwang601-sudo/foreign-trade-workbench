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

  // customers 表中的同步控制记录（不会展示到 CRM）。
  // 单条删除写 tombstone；全量清空写 clear marker，确保其他设备不会把旧客户重新上传。
  const META_DELETE_PREFIX = '__ft_deleted__:';
  const META_CLEAR_ID = '__ft_customers_cleared__';

  function status(msg, type) { if (SB.onStatus) { try { SB.onStatus(msg, type); } catch (e) {} } }
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
    // 简易超时包装：15 秒没返回就当作网络/防火墙问题
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('连接超时（15s），请检查网络或 Supabase URL 是否正确')), 15000));
    try {
      // 用一次轻量请求验证连通性 + 权限（查 customers 表，最多 1 行）
      // 注意：新版 Supabase key（sb_publishable/sb_secret）只能放 apikey header，
      //      不能放 Authorization: Bearer（会被当成 JWT 解析报 Invalid JWT）
      const fetchP = fetch(`${SB.url}/rest/v1/customers?select=id&limit=1`, {
        headers: { apikey: SB.key, 'Content-Type': 'application/json' }
      });
      const r = await Promise.race([fetchP, timeout]);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        let msg = `HTTP ${r.status}`;
        if (r.status === 401 || r.status === 403) msg = '密钥无效或无权限（请确认 anon key 正确）';
        else if (r.status === 404) msg = '表不存在，请先在 Supabase SQL Editor 运行建表 SQL';
        else if (r.status === 0 || r.status === 502 || r.status === 503) msg = 'Supabase 不可达（' + r.status + '），请检查 URL 或网络';
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
      const msg = e.message || '连接失败';
      SB.lastError = msg;
      status(msg, 'err');
      return { ok: false, error: msg };
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
          if (!id) continue;
          // syncedAt = "这条已成功同步到云端"的标记，必须随数据一起推上去，
          // 否则 pull 回来时本地对象被云端记录替换、这个标记就丢了，
          // 后面就无法区分「新建还没推」和「别处已删除」两种情况。
          if (key === 'customers') rec.syncedAt = new Date().toISOString();
          const r = await upsertRecord(key, id, rec);
          if (r && !r.ok && key === 'customers') delete rec.syncedAt;  // 推送失败就不算同步过
        }
      }
      if (st.calendar) {
        const calRec = Object.assign({ updatedAt: new Date().toISOString() }, st.calendar);
        await upsertRecord('calendar', 'ftw_calendar', calRec);
      }
      if (st.settings) {
        const setRec = Object.assign({ updatedAt: new Date().toISOString() }, safeSettingsForCloud(st.settings));
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
            const tombs = st.tombstones || {};
            const allRemote = res.records || [];
            const clearMarker = allRemote.find(c => c && c.id === META_CLEAR_ID && c._ftMeta === 'customersCleared');
            const deleteMarkers = allRemote.filter(c => c && String(c.id || '').startsWith(META_DELETE_PREFIX) && c._ftMeta === 'customerDeleted');
            const remoteCustomers = allRemote.filter(c => c && !String(c.id || '').startsWith('__ft_'));

            // 先应用云端删除控制记录，再做普通合并。
            deleteMarkers.forEach(m => {
              if (m.targetId) tombs[m.targetId] = m.deletedAt || m.updatedAt || new Date().toISOString();
            });
            if (clearMarker) {
              const ct = new Date(clearMarker.clearedAt || clearMarker.updatedAt || 0).getTime();
              if (ct) {
                (st.customers || []).forEach(c => {
                  if (!c || !c.id) return;
                  // 全量清空是显式的全局操作：凡是在清空时间之前存在的本地客户都应删除，
                  // 不依赖旧版本是否带 syncedAt。只有清空之后真正新建/修改的记录才保留。
                  const t = new Date(c.updatedAt || c.createdAt || c.syncedAt || 0).getTime();
                  if (!t || t <= ct + 1000) tombs[c.id] = clearMarker.clearedAt || clearMarker.updatedAt;
                });
              }
            }

            // 墓碑判定：本地/云端已删掉的客户，旧记录不许复活
            const isDead = (id, updatedAt) => {
              if (!id || !tombs[id]) return false;
              const t = new Date(tombs[id] || 0).getTime();
              if (!t) return false;
              if (!updatedAt) return true;
              return t >= new Date(updatedAt).getTime() - 1000;
            };

            // 兼容旧版本没有云端 tombstone 的删除：云端存在其他真实客户时，缺失的已同步客户视为远端删除。
            const cloudIds = new Set(remoteCustomers.map(c => c.id).filter(Boolean));
            if (remoteCustomers.length > 0) {
              const nowIso = new Date().toISOString();
              const gone = (st.customers || []).filter(c => c.id && !cloudIds.has(c.id) && c.syncedAt && !tombs[c.id]);
              if (gone.length && gone.length <= 100) {
                gone.forEach(c => { tombs[c.id] = nowIso; });
                if (typeof window.__ftOnRemoteDelete === 'function') {
                  try { window.__ftOnRemoteDelete(gone.map(c => c.name || c.id)); } catch (e) {}
                }
              }
            }

            const localMap = new Map((st.customers || []).map(c => [c.id, c]));
            remoteCustomers.forEach(c => {
              if (!c.id) return;
              if (isDead(c.id, c.updatedAt)) return;
              if (localMap.has(c.id)) {
                const t1 = new Date(localMap.get(c.id).updatedAt || 0).getTime();
                const t2 = new Date(c.updatedAt || 0).getTime();
                localMap.set(c.id, t2 >= t1 ? c : localMap.get(c.id));
              } else localMap.set(c.id, c);
            });
            st.customers = Array.from(localMap.values()).filter(c => !isDead(c.id, c.updatedAt));
          } else {
            st[key] = res.records;
          }
        }
      }
      const calRes = await pullTable('calendar');
      if (calRes.ok && Array.isArray(calRes.records) && calRes.records.length) {
        const calRec = calRes.records.find(r => r.id === 'ftw_calendar');
        if (calRec) {
          const local = st.calendar || { todos: [], customHolidays: [] };
          const t1 = new Date((local.updatedAt) || 0).getTime();
          const t2 = new Date(calRec.updatedAt || 0).getTime();
          // 云端比本地新时才采纳云端；否则保留本地（本地可能刚新增/勾选完成尚未推送）
          if (t2 > t1) {
            // 采纳云端，但合并待办（按 id 取 updatedAt 较新者），避免吞掉本地新增/完成状态
            const cloudCal = { todos: [], customHolidays: [], ...calRec };
            const localTodos = local.todos || [];
            const cloudTodos = cloudCal.todos || [];
            const byId = new Map();
            localTodos.forEach(t => byId.set(t.id, t));
            cloudTodos.forEach(t => {
              if (!t || !t.id) return;
              const l = byId.get(t.id);
              if (l) {
                const lt = new Date(l.updatedAt || 0).getTime();
                const ct = new Date(t.updatedAt || 0).getTime();
                byId.set(t.id, ct >= lt ? t : l);
              } else byId.set(t.id, t);
            });
            cloudCal.todos = Array.from(byId.values());
            // 节日也合并（保留本地云端都有的）
            const lHol = local.customHolidays || [];
            const cHol = cloudCal.customHolidays || [];
            const holMap = new Map(lHol.map(h => [h.id, h]));
            cHol.forEach(h => { if (h && h.id) holMap.set(h.id, h); });
            cloudCal.customHolidays = Array.from(holMap.values());
            // 合并后时间戳取两者较新
            cloudCal.updatedAt = new Date(Math.max(t1, t2)).toISOString();
            st.calendar = cloudCal;
          }
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
      // 补推离线期间删掉的客户（断网时删除没能通知云端，联网后在这里补删）
      if (window.__ftFlushDeletes) { try { await window.__ftFlushDeletes(); } catch (e) {} }
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
    pullTable, upsertRecord, deleteRecord, deleteAllRecords, clearBusinessData,
    saveConfig, getConfig,
    getState: () => ({ connected: SB.connected, lastSync: SB.lastSync, lastError: SB.lastError }),
    onStatus: (fn) => { SB.onStatus = fn; },
    onSettings: (fn) => { SB.onSettings = fn; }
  };
})();
