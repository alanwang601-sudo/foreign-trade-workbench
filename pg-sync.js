/* =========================================================
 * 外贸工作台 · CloudBase 同步模块（NoSQL 文档库版）
 * 基于腾讯云开发 CloudBase 云数据库（文档型 NoSQL）。
 * 前端通过 CloudBase JS SDK 的 database() 接口读写，匿名登录。
 * 所有设备共享同一批数据（单用户多设备），实时轮询同步。
 *
 * 说明：本文件对外暴露 window.__ftPg（接口与旧版一致，命名保留
 *      以保证上层无需改动）。底层已从 PostgreSQL(rdb) 切换到
 *      NoSQL 文档库：无需建表 / 无 RLS / 无序列授权，开箱即用，
 *      不依赖易被风控隔离的 PostgreSQL 实例。
 *
 * 集合与业务 key 映射：
 *   customers       -> customers
 *   aiHistory       -> ai_history
 *   marketAnalyses  -> market_analyses
 *   calendar        -> calendar      （单条记录 ftw_calendar）
 *   settings        -> settings      （单条记录 ftw_settings）
 * 每条文档带 bizId 字段作唯一标识，updatedAt 作冲突仲裁时间戳。
 * ========================================================= */
(function () {
  if (typeof window === 'undefined') return;

  const PG = {
    app: null,        // cloudbase 实例
    db: null,         // 数据库引用
    inited: false,
    connected: false,
    envId: '',
    lastSync: '',
    lastError: '',
    pollTimer: null,
    lastFingerprint: '',
    onStatus: null
  };

  // 集合名（与 cloudbase 环境中的集合保持一致）
  const COLLECTIONS = {
    customers: 'customers',
    aiHistory: 'ai_history',
    marketAnalyses: 'market_analyses',
    calendar: 'calendar',
    settings: 'settings'
  };

  function status(msg, type) { if (PG.onStatus) { try { PG.onStatus(msg, type); } catch (e) {} } }

  // ---------- 自动创建所有需要的集合（连接后兜底，避免用户手动建集合） ----------
  async function ensureCollections() {
    if (!PG.db) return;
    const names = Object.values(COLLECTIONS);
    for (const name of names) {
      try {
        // CloudBase Web SDK：createCollection 显式创建集合（已存在会抛错，忽略）
        if (typeof PG.db.createCollection === 'function') {
          await PG.db.createCollection(name);
        }
      } catch (e) {}
    }
  }

  // ---------- 初始化 + 匿名登录 ----------
  async function connect(envId) {
    if (!envId) return { ok: false, error: '未配置环境 ID' };
    try {
      if (typeof cloudbase === 'undefined') return { ok: false, error: 'CloudBase SDK 未加载' };
      if (!PG.inited) {
        PG.app = cloudbase.init({ env: envId, region: 'ap-shanghai' });
        PG.inited = true;
        PG.envId = envId;
      }
      // 匿名登录
      const auth = PG.app.auth;
      try {
        await auth.signInAnonymously();
      } catch (e) {
        // 可能已登录
        try { await auth.getLoginState(); } catch (e2) {}
      }
      // NoSQL 文档库
      PG.db = PG.app.database();
      PG.connected = true;
      PG.lastError = '';
      // 自动建集合（已存在则忽略错误），免去用户手动在控制台建集合
      try { await ensureCollections(); } catch (e) {}
      status('已连接（NoSQL 云数据库）', 'ok');
      return { ok: true, envId };
    } catch (e) {
      PG.connected = false;
      PG.lastError = e.message || '连接失败';
      status(PG.lastError, 'err');
      return { ok: false, error: PG.lastError };
    }
  }

  function getState() { return window.__ftState || {}; }
  function getColl(key) { return (PG.db && COLLECTIONS[key]) ? PG.db.collection(COLLECTIONS[key]) : null; }

  // ---------- 拉取某集合全部数据 ----------
  // 返回 {ok, records}，records: [{ id: bizId, updatedAt, ...业务字段 }]
  async function pullTable(key) {
    const coll = getColl(key);
    if (!coll) return { ok: false, error: '未连接或集合不存在' };
    try {
      const res = await coll.limit(1000).get();
      const records = (res.data || []).map(d => {
        // 把内部字段 _id/bizId/id 排除，id 统一用 bizId 表示，避免业务字段覆盖
        const { _id, bizId, id: _ignored, ...rest } = d;
        return { id: bizId, updatedAt: rest.updatedAt || '', ...rest };
      });
      return { ok: true, records };
    } catch (e) {
      return { ok: false, error: e.message || '拉取失败' };
    }
  }

  // ---------- upsert 一条记录 ----------
  async function upsertRecord(key, id, doc) {
    const coll = getColl(key);
    if (!coll) return { ok: false, error: '未连接' };
    try {
      const updatedAt = doc.updatedAt || new Date().toISOString();
      // 去掉内部 id 字段，避免写入文档污染；bizId 作唯一标识
      const { id: _dropId, ...rest } = doc;
      const data = Object.assign({}, rest, { bizId: id, updatedAt });
      // 按 bizId 查是否已存在
      const existing = await coll.where({ bizId: id }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        const docId = existing.data[0]._id;
        await coll.doc(docId).update({ data });
      } else {
        await coll.add({ data });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || '写入失败' };
    }
  }

  // ---------- 删除记录 ----------
  async function deleteRecord(key, id) {
    const coll = getColl(key);
    if (!coll) return;
    try {
      const existing = await coll.where({ bizId: id }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        await coll.doc(existing.data[0]._id).remove();
      }
    } catch (e) {}
  }

  // ---------- 全量推送本地数据到云端 ----------
  async function fullPush() {
    const st = getState();
    if (!st.customers) return { ok: false, error: '数据未就绪' };
    if (!PG.connected) return { ok: false, error: '未连接' };
    try {
      for (const key of ['customers', 'aiHistory', 'marketAnalyses']) {
        const list = st[key] || [];
        for (const rec of list) {
          const id = rec.id || rec.bizId;
          if (id) await upsertRecord(key, id, rec);
        }
      }
      // 日历数据作为单条记录整体同步
      if (st.calendar) {
        const calRec = Object.assign({ updatedAt: new Date().toISOString() }, st.calendar);
        await upsertRecord('calendar', 'ftw_calendar', calRec);
      }
      // 配置数据作为单条记录整体同步（公司画像 + API Key + 连接配置）
      if (st.settings) {
        const setRec = Object.assign({ updatedAt: new Date().toISOString() }, st.settings);
        await upsertRecord('settings', 'ftw_settings', setRec);
      }
      PG.lastSync = new Date().toLocaleString('zh-CN');
      PG.lastError = '';
      status('已上传 ' + (st.customers || []).length + ' 个客户', 'ok');
      return { ok: true };
    } catch (e) {
      PG.lastError = e.message || '同步失败';
      return { ok: false, error: PG.lastError };
    }
  }

  // ---------- 拉取并合并到本地 ----------
  async function pullAndMerge() {
    if (!PG.connected) return { ok: false, error: '未连接' };
    const st = getState();
    try {
      const keys = ['customers', 'aiHistory', 'marketAnalyses'];
      for (const key of keys) {
        const res = await pullTable(key);
        if (res.ok && Array.isArray(res.records)) {
          if (key === 'customers') {
            const tombs = st.tombstones || {};
            // 墓碑判定：本地已删掉的客户，云端旧记录不许复活
            const isDead = (id, updatedAt) => {
              if (!id || !tombs[id]) return false;
              const t = new Date(tombs[id] || 0).getTime();
              if (!t) return false;
              if (!updatedAt) return true;
              return t >= new Date(updatedAt).getTime() - 1000;
            };
            const localMap = new Map((st.customers || []).map(c => [c.id, c]));
            res.records.forEach(c => {
              if (!c.id) return;
              if (isDead(c.id, c.updatedAt)) return;      // ★ 已删除，不采纳云端记录
              if (localMap.has(c.id)) {
                const t1 = new Date(localMap.get(c.id).updatedAt || 0).getTime();
                const t2 = new Date(c.updatedAt || 0).getTime();
                localMap.set(c.id, t2 >= t1 ? c : localMap.get(c.id));
              } else {
                localMap.set(c.id, c);
              }
            });
            st.customers = Array.from(localMap.values()).filter(c => !isDead(c.id, c.updatedAt));
          } else {
            st[key] = res.records;
          }
        }
      }
      // 合并日历数据（单条记录）
      const calRes = await pullTable('calendar');
      if (calRes.ok && Array.isArray(calRes.records) && calRes.records.length) {
        const calRec = calRes.records.find(r => r.id === 'ftw_calendar');
        if (calRec) {
          const t1 = new Date((st.calendar && st.calendar.updatedAt) || 0).getTime();
          const t2 = new Date(calRec.updatedAt || 0).getTime();
          if (t2 >= t1) {
            st.calendar = { todos: [], customHolidays: [], ...calRec };
          }
        }
      }
      // 合并配置数据（单条记录）——跨设备同步公司画像/API Key/连接配置
      const setRes = await pullTable('settings');
      if (setRes.ok && Array.isArray(setRes.records) && setRes.records.length) {
        const setRec = setRes.records.find(r => r.id === 'ftw_settings');
        if (setRec) {
          const t1 = new Date((st.settings && st.settings.__syncedAt) || 0).getTime();
          const t2 = new Date(setRec.updatedAt || 0).getTime();
          // 云端配置比本地新才应用，避免覆盖本地刚保存的配置
          if (t2 > t1 && setRec.profile) {
            const clean = Object.assign({}, setRec);
            delete clean.id; delete clean.updatedAt; delete clean.__syncedAt;
            st.settings = Object.assign({}, st.settings, clean, { __syncedAt: setRec.updatedAt });
            if (PG.onSettings) { try { PG.onSettings(clean, setRec.updatedAt); } catch (e) {} }
          }
        }
      }
      PG.lastSync = new Date().toLocaleString('zh-CN');
      PG.lastError = '';
      return { ok: true, count: st.customers.length };
    } catch (e) {
      PG.lastError = e.message || '拉取失败';
      return { ok: false, error: PG.lastError };
    }
  }

  // ---------- 指纹检测变化 ----------
  function fingerprint() {
    const st = getState();
    const cust = st.customers || [];
    const cal = st.calendar || { todos: [], customHolidays: [] };
    const calStr = JSON.stringify({ t: (cal.todos || []).length, h: (cal.customHolidays || []).length, upd: cal.updatedAt || '' });
    const setStr = (st.settings && st.settings.__syncedAt) || '';
    return `${cust.length}|${cust.reduce((a, c) => a + (c.updatedAt || ''), '')}|${calStr}|${setStr}`;
  }

  // ---------- 轮询同步（上传 + 拉取） ----------
  // 用户正在输入/操作设置页时完全暂停同步，避免干扰输入或清空内容。
  function isBusy() {
    const st = getState();
    if (st.view !== 'dashboard' && st.view !== 'crm' && st.view !== 'calendar') return true;
    const modalRoot = document.getElementById && document.getElementById('modal-root');
    if (modalRoot && modalRoot.innerHTML && modalRoot.innerHTML.trim().length > 0) return true;
    if (document.activeElement &&
        /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return true;
    return false;
  }
  function startPolling(interval) {
    if (PG.pollTimer) return;
    PG.lastFingerprint = fingerprint();
    const ms = interval || 12000; // 默认 12 秒，减少打扰
    PG.pollTimer = setInterval(async () => {
      if (!PG.connected) return;
      if (isBusy()) return;
      const cur = fingerprint();
      if (cur !== PG.lastFingerprint) {
        PG.lastFingerprint = cur;
        try { await fullPush(); } catch (e) {}
      }
      const r = await pullAndMerge();
      if (r.ok) {
        const cur2 = fingerprint();
        if (cur2 !== PG.lastFingerprint) PG.lastFingerprint = cur2;
        if (window.__ftRefreshUI) window.__ftRefreshUI();
      }
    }, ms);
  }

  function stopPolling() { if (PG.pollTimer) { clearInterval(PG.pollTimer); PG.pollTimer = null; } }

  function disconnect() { stopPolling(); PG.connected = false; }

  window.__ftPg = {
    connect, disconnect, fullPush, pullAndMerge, startPolling, stopPolling,
    pullTable, upsertRecord, deleteRecord,
    getState: () => ({ connected: PG.connected, envId: PG.envId, lastSync: PG.lastSync, lastError: PG.lastError }),
    onStatus: (fn) => { PG.onStatus = fn; },
    onSettings: (fn) => { PG.onSettings = fn; }
  };
})();
