'use strict';

/* =========================================================
 * 外贸工作台 · Web 纯前端版本（浏览器直接运行，无需 Electron）
 * 视图：dashboard / lead(获客) / research(背调) / market(市场) / crm / settings
 * ========================================================= */

// ---------- 常量 ----------
const LS = {
  customers: 'ftw_customers',
  aiHistory: 'ftw_ai_history',
  marketAnalyses: 'ftw_market_analyses',
  calendar: 'ftw_calendar', // { todos: [], customHolidays: [] }
  tombstones: 'ftw_tombstones', // 删除墓碑：{ 客户id: 删除时间ISO }，防止云端旧数据把删掉的客户拉回来
  trash: 'ftw_trash'            // 回收站：{ 客户id: { deletedAt, snapshot } }，30 天内可恢复
};
// 墓碑 / 回收站保留时长（毫秒）：30 天后自动清除，避免无限增长
const TOMBSTONE_TTL = 30 * 24 * 3600 * 1000;
// 回收站最多保留条数（防止 localStorage 被撑爆）
const TRASH_MAX = 50;
// 开发阶段：主流程 9 阶段 + 3 个特殊状态
const STAGES = ['线索', '已验证', '已建联', '已回复', '需求确认', '已报价', '样品测试', '商务谈判', '成交', '暂缓', '无回复', '不匹配'];
const STAGE_CLASS = { '线索': 'b-lead', '已验证': 'b-lead', '已建联': 'b-opp', '已回复': 'b-opp', '需求确认': 'b-opp', '已报价': 'b-nego', '样品测试': 'b-nego', '商务谈判': 'b-nego', '成交': 'b-won', '暂缓': 'b-lost', '无回复': 'b-lead', '不匹配': 'b-lost' };
// 终态/暂停状态：不计入"需跟进"提醒
const CLOSED_STAGES = ['成交', '不匹配', '暂缓'];
// 联系人扩展字段
const CONTACT_ROLES = ['产品决策', 'Strategic Sourcing', 'Purchasing', 'Owner/CEO', 'Sales', 'Technical'];
const CONTACT_PRIORITY = [['P1', 'P1 首要联系人'], ['P2', 'P2 第二联系人'], ['P3', 'P3 升级联系人']];
const CONTACT_CREDIBILITY = ['已验证', '高可信', '推测', '未验证'];
const PRIO_LABEL = { 'P1': 'P1 首要联系人', 'P2': 'P2 第二联系人', 'P3': 'P3 升级联系人' };
const PRIO_CLASS = { 'P1': 'b-due', 'P2': 'b-opp', 'P3': 'b-tag' };
const CRED_CLASS = { '已验证': 'b-won', '高可信': 'b-opp', '推测': 'b-tag', '未验证': 'b-lost' };
// 产品匹配类型
const MATCH_TYPES = ['直接交叉', '同型号替代', '功能替代', '潜在匹配', '待确认'];
const MATCH_CLASS = { '直接交叉': 'b-won', '同型号替代': 'b-won', '功能替代': 'b-opp', '潜在匹配': 'b-tag', '待确认': 'b-lost' };
const CHART_COLORS = ['#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0ea5e9'];
const DEFAULT_SETTINGS = { provider: 'deepseek', apiBase: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', temperature: 0.7, theme: 'light',
  searchEngine: 'tavily', searchGoogleKey: '', searchGoogleCx: '', searchBingKey: '', searchBraveKey: '', searchTavilyKey: '',
  strictLeadMode: true,
  followUpDays: 14,
  enrichContacts: true,
  calNotified: {}, // 记录已弹窗提醒过的日期 YYYY-MM-DD
  profile: { name: '', website: '', products: '', advantages: '', bestSellers: '' } };

// ---------- 内置主要市场节日库 ----------
// { month: 月份1-12, day: 日1-31, name: 节日名, regions: 主要覆盖国家/地区, emoji, note }
// 用于外贸节日问候，覆盖欧美/中东/东南亚/拉美等主要目标市场
const BUILTIN_HOLIDAYS = [
  // ── 欧美 ──
  { m: 1, d: 1, name: '元旦', regions: '全球', emoji: '🎆', note: 'New Year 新年问候' },
  { m: 1, d: 6, name: '主显节', regions: '西班牙/意大利/拉美', emoji: '👑', note: 'Three Kings 送礼/问候' },
  { m: 2, d: 14, name: '情人节', regions: '全球', emoji: '💘', note: "Valentine's Day" },
  { m: 3, d: 8, name: '国际妇女节', regions: '全球', emoji: '🌷', note: "Women's Day" },
  { m: 3, d: 17, name: '圣帕特里克节', regions: '爱尔兰/美国', emoji: '🍀', note: "St. Patrick's Day" },
  { m: 5, d: 1, name: '劳动节', regions: '全球多数国家', emoji: '⚒️', note: 'May Day' },
  { m: 5, d: 4, name: '青年节/国际劳动节后', regions: '部分国家', emoji: '🌱', note: '青年节问候' },
  { m: 6, d: 1, name: '国际儿童节', regions: '全球', emoji: '🎈', note: "Children's Day" },
  { m: 10, d: 31, name: '万圣节', regions: '美国/加拿大/欧洲', emoji: '🎃', note: "Halloween 促销季前问候" },
  { m: 11, d: 11, name: '双十一/光棍节', regions: '中国', emoji: '🛍️', note: "Single's Day 大促" },
  { m: 12, d: 24, name: '平安夜', regions: '欧美', emoji: '🎄', note: 'Christmas Eve 圣诞问候' },
  { m: 12, d: 25, name: '圣诞节', regions: '欧美/全球', emoji: '🎁', note: 'Christmas 最重要的节日问候' },
  { m: 12, d: 26, name: '节礼日', regions: '英国/澳/加/新西兰', emoji: '🎁', note: 'Boxing Day 打折促销' },
  { m: 12, d: 31, name: '跨年夜', regions: '全球', emoji: '🎇', note: "New Year's Eve 新年祝福" },

  // ── 美国 ──
  { m: 1, d: 3, name: '马丁·路德·金日', regions: '美国', emoji: '✊', note: 'MLK Day（1月第3个周一）' },
  { m: 2, d: 3, name: '总统日', regions: '美国', emoji: '🇺🇸', note: "Presidents' Day（2月第3个周一）" },
  { m: 5, d: 5, name: '阵亡将士纪念日', regions: '美国', emoji: '🪖', note: 'Memorial Day（5月最后周一）' },
  { m: 7, d: 4, name: '美国独立日', regions: '美国', emoji: '🎆', note: 'Independence Day 美国国庆' },
  { m: 9, d: 1, name: '劳动节', regions: '美国/加拿大', emoji: '🛠️', note: 'Labor Day（9月第1个周一）' },
  { m: 11, d: 4, name: '感恩节', regions: '美国', emoji: '🦃', note: 'Thanksgiving（11月第4个周四）' },

  // ── 中东 / 穆斯林（依据伊斯兰历，日期每年浮动，按公历近似标注） ──
  { m: 4, d: 10, name: '开斋节（预计）', regions: '中东/东南亚穆斯林国家', emoji: '🌙', note: 'Eid al-Fitr，请核对当年伊斯兰历日期' },
  { m: 6, d: 17, name: '宰牲节（预计）', regions: '中东/穆斯林国家', emoji: '🐐', note: 'Eid al-Adha，请核对当年日期' },

  // ── 东南亚 ──
  { m: 4, d: 13, name: '泰国宋干节(泼水节)', regions: '泰国', emoji: '💦', note: 'Songkran 泰国新年' },
  { m: 4, d: 14, name: '柬埔寨/老挝新年', regions: '柬/老', emoji: '🌊', note: 'Chol Chnam Thmey' },
  { m: 8, d: 9, name: '新加坡国庆日', regions: '新加坡', emoji: '🇸🇬', note: 'National Day' },
  { m: 8, d: 17, name: '印尼独立日', regions: '印尼', emoji: '🇮🇩', note: 'Hari Merdeka' },
  { m: 8, d: 31, name: '马来西亚国庆日', regions: '马来西亚', emoji: '🇲🇾', note: 'Merdeka Day' },
  { m: 11, d: 19, name: '泰国水灯节(预计)', regions: '泰国', emoji: '🏮', note: 'Loy Krathong，农历12月15' },
  { m: 12, d: 12, name: '菲律宾黎刹日', regions: '菲律宾', emoji: '🇵🇭', note: 'Rizal Day' },

  // ── 拉丁美洲 ──
  { m: 5, d: 5, name: '墨西哥五月五日节', regions: '墨西哥', emoji: '🇲🇽', note: 'Cinco de Mayo' },
  { m: 9, d: 16, name: '墨西哥独立日', regions: '墨西哥', emoji: '🎉', note: 'Independence Day' },
  { m: 10, d: 12, name: '哥伦布日', regions: '拉美多国', emoji: '🌎', note: 'Columbus Day' },
  { m: 12, d: 12, name: '瓜达卢佩圣母节', regions: '墨西哥', emoji: '🌹', note: "Virgen de Guadalupe" },

  // ── 欧洲各国 ──
  { m: 6, d: 6, name: '瑞典国庆日', regions: '瑞典', emoji: '🇸🇪', note: 'National Day' },
  { m: 10, d: 3, name: '德国统一日', regions: '德国', emoji: '🇩🇪', note: 'Tag der Deutschen Einheit' },
  { m: 7, d: 14, name: '法国国庆日', regions: '法国', emoji: '🇫🇷', note: 'Bastille Day' },
  { m: 6, d: 2, name: '意大利共和国日', regions: '意大利', emoji: '🇮🇹', note: 'Festa della Repubblica' },
  { m: 6, d: 21, name: '西班牙仲夏节', regions: '西班牙', emoji: '🔥', note: 'San Juan' },
  { m: 4, d: 23, name: '英格兰圣乔治节', regions: '英国', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', note: "St George's Day" }
];

// ---------- 状态 ----------
const state = {
  view: 'dashboard',
  customers: [],
  aiHistory: [],
  marketAnalyses: [],
  settings: Object.assign({}, DEFAULT_SETTINGS),
  crmSearch: '',
  crmStage: '全部',
  crmCountry: '',
  crmIndustry: '',
  crmFollowUp: 'all', // 'all' | 'due'
  tombstones: {},     // 删除墓碑：{ 客户id: 删除时间 }，挡住云端旧记录复活
  trash: {},          // 回收站：{ 客户id: { deletedAt, snapshot } }，30 天内可一键恢复
  pendingDeletes: [], // 离线期间删除、联网后待补推到云端的客户 id
  crmGrade: '全部',   // 客户评级筛选：'全部' | 'A+' | 'A' | 'B' | 'C' | '未评级'
  crmNoFollowDays: 0, // 「≥N 天没跟进」筛选，0 = 不限（配合评级用：A+ 且 7 天没跟进）
  crmSel: new Set(),
  seenSearchLinks: new Set(), // 本轮"智能开发"已看过的网页链接，再次搜索时排除，找新网页
  // 智能开发表单：切换视图时保留已填写内容
  leadForm: { product: '', market: '', industry: '', count: '8', type: 'importer', channel: '', extra: '', oem: '', oemFit: '' },
  // 日历
  calendar: { todos: [], customHolidays: [] },
  calMonth: null, // { y, m } 当前查看的年月（默认当月）
  calDoneNotified: {} // 本次会话已弹窗提醒过的日期，避免重复弹
};

// ---------- 存储 ----------
function loadLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
}
function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function persistAll() {
  saveLS(LS.customers, state.customers);
  saveLS(LS.aiHistory, state.aiHistory);
  saveLS(LS.marketAnalyses, state.marketAnalyses);
  saveLS(LS.calendar, state.calendar);
  if (state.tombstones && Object.keys(state.tombstones).length) saveLS(LS.tombstones, state.tombstones);
  else { try { localStorage.removeItem(LS.tombstones); } catch (e) {} }
  if (state.trash && Object.keys(state.trash).length) saveLS(LS.trash, state.trash);
  else { try { localStorage.removeItem(LS.trash); } catch (e) {} }
}

// =========================================================
// 删除墓碑：本地删掉的客户，必须挡住云端旧记录被拉回来
// =========================================================
// 墓碑里是否有这个客户（且墓碑不早于该记录的更新时间）
function isTombstoned(id, updatedAt) {
  if (!id || !state.tombstones || !state.tombstones[id]) return false;
  const t = new Date(state.tombstones[id] || 0).getTime();
  if (!t) return false;
  if (!updatedAt) return true;
  return t >= new Date(updatedAt).getTime() - 1000; // 1 秒容差，避免时钟误差
}
// 清理过期墓碑与回收站（超过 TOMBSTONE_TTL 的删除记录不再需要拦截 / 不再可恢复）
function pruneTombstones() {
  const now = Date.now();
  let n = 0;
  Object.keys(state.tombstones || {}).forEach(id => {
    const t = new Date(state.tombstones[id] || 0).getTime();
    if (!t || now - t > TOMBSTONE_TTL) { delete state.tombstones[id]; n++; }
  });
  Object.keys(state.trash || {}).forEach(id => {
    const t = new Date((state.trash[id] || {}).deletedAt || 0).getTime();
    if (!t || now - t > TOMBSTONE_TTL) { delete state.trash[id]; n++; }
  });
  return n;
}
// 回收站超出上限时，丢掉最旧的几条
function trimTrash() {
  const ids = Object.keys(state.trash || {});
  if (ids.length <= TRASH_MAX) return 0;
  const sorted = ids.slice().sort((a, b) =>
    new Date((state.trash[a] || {}).deletedAt || 0) - new Date((state.trash[b] || {}).deletedAt || 0));
  let n = 0;
  while (Object.keys(state.trash).length > TRASH_MAX) { delete state.trash[sorted[n]]; n++; }
  return n;
}
// 从回收站恢复客户（同时撤掉墓碑，客户会重新同步到云端）
function restoreCustomer(id) {
  const item = (state.trash || {})[id];
  if (!item || !item.snapshot) return false;
  const c = Object.assign({}, item.snapshot, { updatedAt: nowISO() });
  delete c.syncedAt;   // 让下次推送重新上传
  if (!state.customers.some(x => x.id === id)) state.customers.push(c);
  delete state.trash[id];
  delete state.tombstones[id];
  persistAll();
  return true;
}
// 彻底清除（从回收站抹掉，墓碑保留到过期，确保云端不会把它拉回来）
function purgeFromTrash(id) {
  if (state.trash && state.trash[id]) delete state.trash[id];
  persistAll();
}
// 找出当前真正连上的底层同步引擎（Supabase / CloudBase NoSQL）
// 注意：包装层 __ftCloud / __ftSupabaseCloud 没有 deleteRecord，必须用底层引擎
function liveSyncEngines() {
  const out = [];
  [window.__ftSupabase, window.__ftPg].forEach(e => {
    if (!e || typeof e.deleteRecord !== 'function') return;
    try {
      const s = (typeof e.getState === 'function') ? (e.getState() || {}) : {};
      if (s.connected === true) out.push(e);
    } catch (err) { /* 状态读取失败就当没连上 */ }
  });
  return out;
}
// 统一的客户删除入口：本地删除 + 记墓碑 + 通知所有已连接的云端引擎真删
function deleteCustomers(ids) {
  const idArr = Array.from(ids || []).filter(Boolean);
  if (!idArr.length) return { n: 0, pending: 0, synced: false };
  const stamp = nowISO();
  // 先留快照进回收站（30 天内可恢复），再记墓碑
  idArr.forEach(id => {
    const c = state.customers.find(x => x.id === id);
    if (c) state.trash[id] = { deletedAt: stamp, snapshot: JSON.parse(JSON.stringify(c)) };
    state.tombstones[id] = stamp;
  });
  trimTrash();
  const before = state.customers.length;
  state.customers = state.customers.filter(c => !state.tombstones[c.id]);
  const removed = before - state.customers.length;
  // 通知云端：已连接就直接删，没连接就排队等下次联网补删
  const engines = liveSyncEngines();
  engines.forEach(e => { idArr.forEach(id => { try { e.deleteRecord('customers', id); } catch (err) {} }); });
  if (!engines.length) idArr.forEach(id => { if (!state.pendingDeletes.includes(id)) state.pendingDeletes.push(id); });
  persistAll();
  return { n: removed, pending: state.pendingDeletes.length, synced: engines.length > 0 };
}
// 补推离线期间的删除（联网后 / 每次轮询时会调用）
function flushPendingDeletes() {
  if (!state.pendingDeletes || !state.pendingDeletes.length) return 0;
  const engines = liveSyncEngines();
  if (!engines.length) return 0;
  const ids = state.pendingDeletes.slice();
  state.pendingDeletes = [];
  engines.forEach(e => { ids.forEach(id => { try { e.deleteRecord('customers', id); } catch (err) {} }); });
  persistAll();
  return ids.length;
}
window.__ftFlushDeletes = flushPendingDeletes;
// 回收站：30 天内删掉的客户可一键恢复
function openTrash() {
  const items = Object.keys(state.trash || {})
    .map(id => Object.assign({ id }, state.trash[id]))
    .sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
  if (!items.length) {
    showModal(`<div class="empty"><div class="big">🗑</div>回收站是空的<div class="small muted mt8">删除客户会在这里保留 30 天</div></div>`,
      { title: '回收站', foot: false });
    return;
  }
  const rows = items.map(it => {
    const s = it.snapshot || {};
    const d = new Date(it.deletedAt || 0);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return `<div class="contact-detail">
      <div class="contact-detail-head">
        <strong>${esc(s.name || '(无名)')}</strong>
        ${s.stage ? `<span class="badge ${STAGE_CLASS[s.stage] || 'b-tag'}">${esc(s.stage)}</span>` : ''}
        ${custGrade(s) ? `<span class="badge b-rating ${ratingBadgeClass(custGrade(s))}">⭐${esc(custGrade(s))}</span>` : ''}
        <span class="small muted" style="margin-left:auto">${days <= 0 ? '今天' : days + ' 天前'}删除</span>
      </div>
      <div class="small muted">${esc(s.country || '')}${s.industry ? ' · ' + esc(s.industry) : ''}${(s.contacts || []).length ? ' · ' + s.contacts.length + ' 个联系人' : ''}</div>
      <div class="flex gap8 mt8">
        <button class="btn sm primary" data-restore="${esc(it.id)}">↩ 恢复</button>
        <button class="btn sm danger" data-purge="${esc(it.id)}">彻底删除</button>
      </div>
    </div>`;
  }).join('');
  showModal(`
    <div class="small muted mb12">共 ${items.length} 个已删除客户，保留 30 天。恢复后会重新同步到云端。</div>
    <div id="trash-list">${rows}</div>
  `, { title: '🗑 回收站', foot: true, wide: true });
  const foot = $('#modal-foot');
  foot.innerHTML = `<button class="btn ghost" data-close>关闭</button><button class="btn danger" id="trash-empty">清空回收站</button>`;
  $all('[data-close]', foot).forEach(b => b.addEventListener('click', closeModal));
  const bind = () => {
    $all('#trash-list [data-restore]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.restore;
      if (restoreCustomer(id)) { toast('已恢复', (state.customers.find(c => c.id === id) || {}).name || '', 'ok'); closeModal(); renderCrm(); openTrash(); }
    }));
    $all('#trash-list [data-purge]').forEach(b => b.addEventListener('click', () => {
      purgeFromTrash(b.dataset.purge); closeModal(); openTrash();
    }));
  };
  bind();
  foot.querySelector('#trash-empty').addEventListener('click', () => {
    if (!confirm(`清空回收站？${items.length} 个已删除客户将无法恢复。`)) return;
    state.trash = {}; persistAll(); closeModal(); openTrash(); toast('回收站已清空', '', 'ok');
  });
}

// 别的设备删掉了客户 → 本机同步移除时给个提示，避免"客户自己消失了"的困惑
window.__ftOnRemoteDelete = function (names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return;
  toast('已同步其他设备的删除', `${list.slice(0, 3).join('、')}${list.length > 3 ? ` 等 ${list.length} 个` : ''}客户已在其他设备删除，本机已同步移除`, 'warn');
};

// ---------- 工具 ----------
function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nowISO() { return new Date().toISOString(); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function fmtNum(n) { return (Number(n) || 0).toLocaleString('zh-CN'); }

// ---------- 跟进提醒 ----------
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return toDateStr(new Date()); }
function addDaysStr(dateStr, days) {
  const d = new Date((dateStr || '').length >= 10 ? dateStr.slice(0, 10) + 'T00:00:00' : '1970-01-01T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}
// 客户评级（rating）与各等级对应的默认跟进周期
// 优先级：c.followUpEvery（自定义） > ratingDays[c.rating]（评级默认） > state.settings.followUpDays（全局默认）
const RATINGS = ['A+', 'A', 'B', 'C'];
const RATING_DAYS_DEFAULT = { 'A+': 3, 'A': 7, 'B': 14, 'C': 30 };
function ratingDays(rating) {
  const s = (state.settings && state.settings.ratingDays) || {};
  return s[rating] != null ? s[rating] : (RATING_DAYS_DEFAULT[rating] || 0);
}
// 客户最后一次跟进日期（没有跟进记录则用创建日期兜底）
function lastTouchDate(c) {
  if (c.lastFollowUp && /^\d{4}-\d{2}-\d{2}/.test(c.lastFollowUp)) return c.lastFollowUp.slice(0, 10);
  if (c.createdAt && /^\d{4}-\d{2}-\d{2}/.test(c.createdAt)) return c.createdAt.slice(0, 10);
  return null;
}
// 距离上次跟进已过去多少天（从未跟进过返回 9999，保证任何阈值都能筛出来）
function daysSinceLastFollow(c) {
  const base = lastTouchDate(c);
  if (!base) return 9999;
  const ms = new Date(todayStr() + 'T00:00:00') - new Date(base + 'T00:00:00');
  return Math.max(0, Math.floor(ms / 86400000));
}
// 计算单个客户的跟进状态：下次应跟进日期、是否已逾期、逾期天数
function followUpInfo(c) {
  const g = custGrade(c);
  let interval = 0;
  if (c.followUpEvery && c.followUpEvery > 0) interval = c.followUpEvery;
  else if (g && ratingDays(g)) interval = ratingDays(g);
  if (!interval) interval = (state.settings.followUpDays || 14);
  const base = lastTouchDate(c);
  if (!base) return { next: null, due: true, interval, daysOverdue: null, base: null };
  const next = addDaysStr(base, interval);
  const today = todayStr();
  const due = next <= today;
  let daysOverdue = null;
  if (due) {
    const ms = new Date(today + 'T00:00:00') - new Date(next + 'T00:00:00');
    daysOverdue = Math.max(0, Math.floor(ms / 86400000));
  }
  return { next, due, interval, daysOverdue, base };
}
// 终态（成交/不匹配/暂缓）和"已合作"客户不计入跟进提醒；"无回复"仍计入（需继续跟进）
function isFollowUpDue(c) { return !c.cooperating && !CLOSED_STAGES.includes(c.stage) && followUpInfo(c).due; }
function dueCustomers() { return state.customers.filter(isFollowUpDue); }
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// 去重：把名称/网址/店铺链接归一化后比较（忽略大小写、空格、常见标点）
function normKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[.,'"'`()\[\]【】（）\-_/\\]/g, '').trim();
}
function findDupCustomer(name, website, shopUrl) {
  const nn = normKey(name);
  const nw = normKey(website);
  const ns = normKey(shopUrl);
  if (!nn && !nw && !ns) return null;
  return state.customers.find(c => {
    const cn = normKey(c.name);
    const cw = normKey(c.website);
    const cs = normKey(c.shopUrl);
    if (nn && cn && cn === nn) return true;
    if (nw && cw && cw === nw) return true;
    if (ns && cs && cs === ns) return true;
    return false;
  });
}

function toast(title, msg, type) {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.innerHTML = `<div class="t-title">${esc(title)}</div>${msg ? `<div class="t-msg">${esc(msg)}</div>` : ''}`;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3600);
}

// 弹窗
let _escHandler = null;
function showModal(innerHtml, opts = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-mask"><div class="modal ${opts.wide ? 'wide' : ''}">
    <div class="modal-head"><h3>${opts.title || ''}</h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">${innerHtml}</div>
    ${opts.foot !== false ? `<div class="modal-foot" id="modal-foot"></div>` : ''}
  </div></div>`;
  const mask = $('.modal-mask', root);
  mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });
  $all('[data-close]', root).forEach(b => b.addEventListener('click', closeModal));
  _escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', _escHandler);
  return root;
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
}


// ========== Web 版本：浏览器原生实现（替代 Electron IPC）==========

// --- AI 调用：直接 fetch 到 OpenAI 兼容接口（已在上方 callAI 中实现）---

// --- 搜索引擎：仅支持 Tavily API（浏览器无法绕过 CORS 抓 DuckDuckGo）---
async function webSearchBrowser(query, opts = {}) {
  const engine = (opts.engine || 'tavily').toLowerCase();
  const num = opts.num || 10;

  // Web 版本只支持 Tavily（有 CORS 友好的 API）
  if (engine === 'tavily') {
    const key = state.settings.searchTavilyKey || '';
    if (!key) return { ok: false, error: '请先在设置中配置 Tavily API Key（Web 版本仅支持 Tavily 搜索）', items: [] };
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: query,
          max_results: Math.min(num, 20),
          include_answer: true,
          include_raw_content: true,
          include_images: false
        })
      });
      if (!res.ok) return { ok: false, error: 'Tavily API 错误 (' + res.status + ')', items: [] };
      const j = await res.json();
      const items = (j.results || []).map(r => ({
        title: r.title || '',
        link: r.url || '',
        snippet: r.content ? r.content.slice(0, 300) : (r.snippet || ''),
        emails: [],
        phones: []
      }));
      return { ok: true, items, answer: j.answer || '' };
    } catch (e) {
      return { ok: false, error: e.message || '搜索请求失败', items: [] };
    }
  }

  // Google Custom Search
  if (engine === 'google') {
    const key = state.settings.searchGoogleKey || '';
    const cx = state.settings.searchGoogleCx || '';
    if (!key || !cx) return { ok: false, error: '请先配置 Google API Key 和 Search Engine ID', items: [] };
    try {
      const params = new URLSearchParams({ key, cx, q: query, num: String(num) });
      const res = await fetch('https://www.googleapis.com/customsearch/v1?' + params);
      if (!res.ok) return { ok: false, error: 'Google Search API 错误 (' + res.status + ')', items: [] };
      const j = await res.json();
      const items = (j.items || []).map(r => ({ title: r.title, link: r.link, snippet: r.snippet || '', emails: [], phones: [] }));
      return { ok: true, items };
    } catch (e) {
      return { ok: false, error: e.message || '搜索失败', items: [] };
    }
  }

  // 其他引擎在 Web 版不可用
  return { ok: false, error: 'Web 版本不支持「' + engine + '」搜索引擎，请切换到 Tavily 或 Google', items: [] };
}

// --- 网站可达性检测：通过 CORS proxy 或直接 fetch ---
async function webCheckBrowser(url) {
  if (!url) return { ok: false, error: 'URL 为空' };
  try {
    // 尝试直接 fetch（仅对允许 CORS 的网站有效）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timer);
    // no-cors 模式下 res.ok 始终为 true，但能说明网络基本通
    return { ok: true, status: 'reachable' };
  } catch (e) {
    // 再试 GET 方法
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 8000);
      const res = await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller2.signal });
      clearTimeout(timer2);
      return { ok: true, status: 'reachable' };
    } catch (e2) {
      return { ok: false, error: e2.message || '无法访问该网站（可能存在 CORS 限制或网络不通）' };
    }
  }
}

// --- 配置读写：使用 localStorage ---
const CONFIG_KEY = 'ftw_settings';
async function getConfigWeb() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
async function setConfigWeb(partial) {
  try {
    const current = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    Object.assign(current, partial);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(current));
    return { ok: true, config: current };
  } catch (e) {
    return { ok: false, error: e.message || '保存失败' };
  }
}

// --- 数据导出：生成 JSON 文件下载 ---
async function exportDataWeb(data) {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '外贸工作台数据_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, filePath: a.download };
  } catch (e) {
    return { ok: false, error: e.message || '导出失败', canceled: false };
  }
}

// --- 数据导入：通过文件选择器读取 ---
function importDataWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { resolve({ ok: false, canceled: true }); return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        resolve({ ok: true, data, canceled: false });
      } catch (e) {
        resolve({ ok: false, error: '文件解析失败：' + e.message, canceled: false });
      }
    };
    input.oncancel = () => resolve({ ok: false, canceled: true });
    input.click();
  });
}

// =========================================================
// ---------- AI 调用 ----------
function parseJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(t); } catch (e) { /* continue */ }
  const sObj = t.indexOf('{'); const sArr = t.indexOf('[');
  let start = -1, endChar = '';
  if (sArr !== -1 && (sObj === -1 || sArr < sObj)) { start = sArr; endChar = ']'; }
  else if (sObj !== -1) { start = sObj; endChar = '}'; }
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end !== -1) { try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { /* */ } }
  return null;
}

async function callAI(messages, opts = {}) {
  const base = (state.settings.apiBase || '').replace(/\/+$/, '');
  const key = state.settings.apiKey || '';
  const model = state.settings.model || 'deepseek-chat';
  if (!key) throw new Error('请先在「设置」中配置 API Key');
  const body = {
    model,
    messages,
    temperature: opts.temperature != null ? opts.temperature : state.settings.temperature,
    max_tokens: opts.maxTokens || 1600
  };
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('AI API 错误 (' + res.status + '): ' + errText.slice(0, 200));
  }
  const j = await res.json();
  const c = j.choices && j.choices[0];
  if (!c || !c.message) throw new Error('AI 返回格式异常');
  return c.message.content;
}

function logAI(type, query, count) {
  state.aiHistory.push({ type, query: query || '', count: count || 0, date: nowISO() });
  persistAll();
}

// ---------- 通用提示词 ----------
// 重要：下面两个提示词默认会接收「真实搜索引擎结果」作为上下文。AI 必须从搜索结果里提取公司，
// source 字段必须是搜索结果中的真实 URL。没有搜索结果时，AI 只能输出开发方向示例。
const SYS_LEAD = '你是一名资深外贸开发（B2B 出海）专家。你的任务是整理用户提供的真实网页搜索结果，从中提取可开发的潜在客户线索，' +
  '并基于"我方公司画像"判断每个线索是否为我方潜在客户。' +
  '只返回 JSON，不要任何额外文字、解释或 markdown 代码块。格式严格为：' +
  '{"leads":[{"name":"公司真实名称","website":"真实官网完整 URL（必须是搜索 results 中真实存在的 link，否则留空）","country":"国家/地区","industry":"行业",' +
  '"channel":"来源渠道，如：官网/B2B平台/行业市场(drom等)/展会/社媒/海关数据/转介绍/其他",' +
  '"shopUrl":"店铺或列表链接（如 drom 店铺页、1688 店铺、展会摊位页等），必须是搜索 results 中真实存在的 link，没有则留空",' +
  '"contactHint":"建议的联系人职位与获取渠道（对无网站商家请给出店铺页/社媒/电话/微信/Telegram 等可联系的方式）",' +
  '"contacts":[{"name":"联系人姓名（不确定则留空）","title":"职位（不确定则留空）","email":"真实公开邮箱（不确定则留空）","phone":"真实公开电话/WhatsApp（不确定则留空）","source":"该联系方式来自哪个真实 URL"}],' +
  '"reason":"为何匹配（结合我方优势/畅销品）","fit":"潜在客户/一般/暂不推荐","fitReason":"匹配或不匹配的具体理由",' +
  '"source":"必填：必须是搜索 results 中某条结果的真实 link URL，禁止写\"Google搜索第几条\"、\"行业名录\"等模糊来源"}]}' +
  '【最高优先级：基于真实搜索结果，禁止编造】' +
  '1. 你只能从用户提供的搜索 results 中提取公司。如果搜索结果为空或没有合适公司，请直接返回空 leads 数组，不要编造任何公司名、网址、邮箱、电话。' +
  '2. website 必须是搜索 results 中真实存在的 link。如果搜索结果里没有明确对应的官网，website 必须留空，禁止把品牌名直接加 .com 等拼接域名。' +
  '3. source 字段必须是搜索 results 中对应结果的真实 URL（link 字段）。禁止写"Google搜索第3条"、"某行业名录"、"AI推测"等无法直接点击验证的来源。' +
  '4. 如果搜索结果无法支撑某个具体公司，你只能返回开发方向示例：name 写"某类客户（示例）"，website/source 留空，fit 写"暂不推荐"。' +
  '5. 每条搜索结果已附带从该网站页面正文抓取到的真实邮箱/电话（emails/phones 字段，best-effort）。若某条结果带有 emails/phones，请把它们填入对应线索的 contacts（email/phone 如实填写，source 填该结果 link）；页面正文未提供的联系方式留空，禁止编造。' +
  '6. 宁可少给几条，也绝不为凑数生成虚假信息。';

// 当主模型对 OEM 搜索返回 0 条线索时，用更宽松的二次提取把产品页/零售商页背后的卖家捞出来
const SYS_OEM_FALLBACK = '你是一名汽配外贸线索提取助手。用户给了一个 OEM 号，搜索引擎返回的网页大多是该产品页、汽配零售商/经销商页、B2B 列表页、电商店铺页等。' +
  '这些页面本身就是真实卖家/零售商/经销商/店铺，你的任务是把它们作为潜在客户直接提取出来。' +
  '只返回 JSON，格式：{"leads":[{"name":"公司/店铺名称（优先用页面标题或域名推断）","website":"官网 URL，没有则留空","country":"国家/地区","industry":"汽车后市场/汽配",' +
  '"channel":"来源渠道（官网/B2B平台/行业市场/电商店铺/其他）","shopUrl":"产品页/店铺页/列表页的真实 URL","contactHint":"建议联系方式","contacts":[{"name":"","title":"","email":"","phone":"","source":""}],' +
  '"oemFit":"该卖家可能经营的适配品牌/车型","reason":"为何是潜在客户","fit":"潜在客户","fitReason":"","source":"必填：该线索来自 results 中哪条 link URL"}]}。' +
  '规则：1) 每个线索必须对应一条真实搜索结果，source 必须写该结果的真实 link；2) 产品页、电商店铺页、B2B 列表页背后的公司/店铺都算潜在客户；3) 没有独立官网时允许从链接推导根域名作为 website；4) 禁止编造。';

// OEM 号 → 车型品牌 → 按市场保有量找潜在客户（汽配/滤清器场景）
const SYS_OEM = '你是一名资深汽车配件（滤清器 / OEM 件）外贸开发专家。用户会提供 OEM 号、目标市场，以及（如果用户知道）该 OEM 号适配的汽车品牌 / 车型。' +
  '搜索结果里通常是该 OEM 号对应的产品页、零件零售商/经销商列表页、B2B 列表、汽配电商店铺等。这些页面本身就是真实卖家/零售商/经销商/进口商的线索，不要只盯着"独立官网"才认为是客户。' +
  '你需要从搜索 results 中识别出真实的卖家/零售商/经销商作为潜在客户，输出适配品牌、市场洞察与线索。' +
  '只返回 JSON，不要任何额外文字或 markdown。格式：' +
  '{"fitBrands":["适配品牌/车型1",...],"marketMainBrands":["市场主流品牌1",...],"marketInsight":"目标市场各适配品牌保有量与机会说明",' +
  '"leads":[{"name":"公司/店铺真实名称（从产品页标题、店铺名或域名推断，不确定可写域名本身）","website":"官网完整 URL，没有独立官网则留空",' +
  '"country":"市场国家","industry":"汽车后市场/汽配",' +
  '"channel":"来源渠道（官网/B2B平台/行业市场/展会/社媒/海关数据/转介绍/其他）",' +
  '"shopUrl":"店铺/产品/列表链接（无网站商家填 drom/1688/Amazon/eBay 店铺等产品页），必须是搜索 results 中真实存在的 link，没有则留空",' +
  '"contactHint":"建议的联系方式（店铺页/电话/微信/Telegram/LinkedIn 等）",' +
  '"contacts":[{"name":"","title":"","email":"真实公开邮箱（不确定则留空）","phone":"真实公开电话/WhatsApp（不确定则留空）","source":"该联系方式来自哪个真实 URL"}],' +
  '"oemFit":"该客户可能经营的适配品牌/车型（与 fitBrands 呼应）",' +
  '"reason":"为何匹配（结合我方滤清器产品/优势）","fit":"潜在客户/一般/暂不推荐","fitReason":"匹配或不匹配的具体理由",' +
  '"source":"必填：必须是搜索 results 中某条结果的真实 link URL，禁止写\"Google搜索第几条\"、\"行业名录\"等模糊来源"}]}' +
  '【最高优先级：基于真实搜索结果，禁止编造】' +
  '1. 如果用户已提供"适配品牌/车型"，请直接采用，不再自行猜测；如果用户未提供，你可以基于搜索结果标题/摘要和自身知识识别，但必须在 fitBrands 中标注"AI推测"并提醒用户核实。' +
  '2. 你生成的所有潜在客户线索必须来自搜索 results。如果搜索结果为空，leads 必须为空数组，禁止编造公司、网址、邮箱、电话。' +
  '3. source 字段必须是搜索 results 中对应结果的真实 URL（link 字段）。如果该结果本身就是产品页/店铺页，可直接把它作为 shopUrl 或 source。' +
  '4. 当某个结果没有独立官网、只有产品/店铺页时，允许从该链接推导出根域名作为 website（例如 https://www.example.com/product/xxx → website 可写 https://www.example.com），但 source 必须写原始结果 link；如果无法推断可靠官网，website 留空即可。' +
  '5. 产品页、B2B 列表页、电商店铺页背后的公司/店铺都可以作为潜在客户（如 Summit Racing、AutohausAZ、Rakuten 店铺等），只要它位于目标市场且销售该品类。' +
  '6. 每条搜索结果已附带从该网站页面正文抓取到的真实邮箱/电话（emails/phones 字段）。若带有 emails/phones，请填入对应线索的 contacts（source 填该结果 link）；页面未提供的留空，禁止编造。' +
  '7. 宁可少给几条，也绝不为凑数生成虚假信息。';

const SYS_RESEARCH = '你是一名外贸客户背调专家，擅长通过公开信息评估海外买家。基于公司名/官网输出结构化背调报告。' +
  '只返回 JSON，不要任何额外文字或 markdown 代码块。格式：' +
  '{"overview":"公司概况","country":"国别/地区（如：德国、美国、东南亚）","industry":"行业（如：汽配、户外用品、建材）","size":"规模(营收/人数估计)","products":"主营产品","markets":"目标市场与渠道","strengths":"优势","risks":"风险与警示","creditHint":"信用/资质提示","suggestedApproach":"开发建议","sources":["信息来源"],' +
  '"customer_grade":"A+|A|B|C（综合规模、品类匹配度、采购信号评级：A+极佳、A值得重点跟进、B一般、C低优先；不确定给 B）",' +
  '"development_stage":"线索（新背调未接触的一律填 线索）",' +
  '"development_hook":"开发钩子：为什么【现在】值得联系他（如近期在招采购、新上车型、扩品类、有库存缺口），没有可靠依据就留空",' +
  '"development_strategy":"开发思路：整体打法、先联系谁、主打哪个产品、报价策略，2-4 句，要可执行",' +
  '"next_action":"下一步动作：一个具体可立即执行的动作（如：发 Ford 滤清器报价单并附 OE 对照表）",' +
  '"product_matches":[{"customer_product":"客户在卖的产品/型号","hwa_product":"我方对应型号（不确定就留空）","oe":"OE 号或互换号","match_type":"直接交叉|同型号替代|功能替代|潜在匹配|待确认","priority":"A+|A|B|C"}],' +
  '"contacts":[{"name":"姓名","title":"职位/头衔","email":"邮箱","phone":"电话","linkedin":"LinkedIn 链接或用户名","role":"产品决策|Strategic Sourcing|Purchasing|Owner/CEO|Sales|Technical","priority":"P1|P2|P3","credibility":"已验证|高可信|推测|未验证"}]}' +
  '规则：1) 禁止编造联系方式，找不到就留空；2) product_matches 最多给 5 条，按优先级排序；3) 不确定就标"待确认"/"推测"，不要硬编。';
const SYS_MARKET = '你是一名国际市场分析专家，为外贸企业提供进入某市场的决策分析。' +
  '只返回 JSON，不要任何额外文字或 markdown 代码块。格式：' +
  '{"summary":"总体结论","marketSize":"市场规模估计","trends":["趋势"],"competitors":["竞争者/替代渠道"],"entryStrategy":["进入策略"],"risks":["风险"],"chartData":{"labels":["维度名"],"values":[0到100的机会/吸引力评分]}}';
// 分析“典型/标杆客户”并提炼可复用的理想客户画像(ICP)，给出找相似客户的搜索方向
const SYS_TYPICAL = '你是一名外贸客户画像分析专家。用户会提供一位来自其 CRM 的"典型/标杆客户"信息。请分析这位客户为什么是优质/典型客户，提炼出可复制的"理想客户画像(ICP)"，并给出用它去寻找相似客户的具体搜索方向。' +
  '只返回 JSON，不要任何额外文字或 markdown 代码块。格式：' +
  '{"summary":"一句话概括这位典型客户（含行业/地区/规模/供应链角色）",' +
  '"traits":{"industry":"行业","country":"国家/地区","productType":"经营的产品/品类","scale":"规模(大/中/小/不确定)","role":"供应链角色(进口商/批发商/零售商/制造商/电商等)","channel":"主要渠道","buyingSignals":"采购信号/决策特征"},' +
  '"whyGood":"为什么它是值得复制的典型客户（结合我们产品优势）",' +
  '"searchSuggestion":{"product":"用于搜索相似客户的目标产品/品类描述","market":"目标国家/地区","industry":"行业关键词","type":"客户类型(进口商/分销商/零售商等，中文)","extra":"补充要求(如：偏好有电商渠道、年采购量大等)"}}' +
  '规则：1) 只基于用户提供的信息分析，信息不足时合理推断但标注"推测"；2) searchSuggestion 要足够具体，能直接用于搜索引擎找同类客户；3) 禁止编造不存在的联系方式/网址。';


// 分析"我方公司"：从名称/官网/产品提炼优势与畅销品
const SYS_PROFILE = '你是一名熟悉外贸与跨境电商的行业分析师。请基于"我方公司"的名称、官网与主营产品，提炼出：' +
  '（1）我方最突出的 3-5 条竞争优势（如价格、交期、认证、研发、定制能力、产能等）；' +
  '（2）最值得主推的 3-5 款畅销品或品类方向。' +
  '只返回 JSON，不要任何额外文字或 markdown 代码块。格式：' +
  '{"advantages":["优势1","优势2",...],"bestSellers":["畅销品1","畅销品2",...]}';

// ---------- 图表（自绘 canvas，无外部依赖） ----------
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 10), h = Math.max(rect.height, 10);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

function drawBar(canvas, labels, values, color) {
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 34, padR = 12, padT = 14, padB = 34;
  const max = Math.max(1, ...values);
  const plotW = w - padL - padR, plotH = h - padT - padB;
  ctx.strokeStyle = 'rgba(148,163,184,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();
  const n = labels.length || 1;
  const slot = plotW / n, bw = Math.min(46, slot * 0.6);
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  values.forEach((v, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const bh = (v / max) * plotH;
    const y = padT + plotH - bh;
    ctx.fillStyle = color || CHART_COLORS[0];
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#64748b';
    ctx.fillText(String(v), x + bw / 2, y - 5);
    ctx.save(); ctx.fillStyle = '#94a3b8'; ctx.fillText(trunc(labels[i], 6), padL + slot * i + slot / 2, padT + plotH + 16); ctx.restore();
  });
}
function drawDonut(canvas, labels, values, colors) {
  const { ctx, w, h } = setupCanvas(canvas);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10, ir = r * 0.58;
  let ang = -Math.PI / 2;
  values.forEach((v, i) => {
    const a2 = ang + (v / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, ang, a2); ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    ang = a2;
  });
  ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel') || '#fff';
  ctx.fill();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = getComputedStyle(document.body).color;
  ctx.fillText(String(total), cx, cy - 4);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#94a3b8';
  ctx.fillText('客户', cx, cy + 14);
}
function drawLine(canvas, labels, values, color) {
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 30, padR = 12, padT = 14, padB = 30;
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const plotW = w - padL - padR, plotH = h - padT - padB;
  ctx.strokeStyle = 'rgba(148,163,184,.25)';
  for (let g = 0; g <= 3; g++) { const y = padT + plotH * g / 3; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke(); }
  const n = labels.length;
  const xAt = i => padL + (n <= 1 ? plotW / 2 : plotW * i / (n - 1));
  const yAt = v => padT + plotH * (1 - (v - min) / (max - min || 1));
  // fill
  ctx.beginPath(); ctx.moveTo(xAt(0), padT + plotH);
  values.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
  ctx.lineTo(xAt(n - 1), padT + plotH); ctx.closePath();
  ctx.fillStyle = (color || CHART_COLORS[1]) + '22'; ctx.fill();
  // line
  ctx.beginPath();
  values.forEach((v, i) => { const x = xAt(i), y = yAt(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = color || CHART_COLORS[1]; ctx.lineWidth = 2; ctx.stroke();
  // points + labels
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  values.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2); ctx.fillStyle = color || CHART_COLORS[1]; ctx.fill();
    ctx.fillStyle = '#64748b'; ctx.fillText(trunc(labels[i], 7), xAt(i), padT + plotH + 16);
  });
}

// =========================================================
// 渲染路由
// =========================================================
let main, pageTitleEl;
const VIEW_TITLE = { dashboard: '工作台', lead: '智能开发', research: '深度背调', market: '市场分析', crm: '客户管理', calendar: '日历', settings: '设置' };

function render() {
  // 高亮导航
  $all('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === state.view));
  pageTitleEl.textContent = VIEW_TITLE[state.view] || '工作台';
  const map = { dashboard: renderDashboard, lead: renderLead, research: renderResearch, market: renderMarket, crm: renderCrm, calendar: renderCalendar, settings: renderSettings };
  (map[state.view] || renderDashboard)();
  // 仅在切换视图或首次渲染时重置滚动；同步刷新（__ftRefreshUI）时保留滚动位置
  if (!state._skipScrollReset) {
    const scroller = $('#main') || document.getElementById('main');
    if (scroller) scroller.scrollTop = 0;
  } else {
    state._skipScrollReset = false;
  }
}

// ---------- 工作台 Dashboard ----------
function renderDashboard() {
  const total = state.customers.length;
  const active = state.customers.filter(c => c.stage === '商机' || c.stage === '谈判').length;
  const thisMonth = state.customers.filter(c => c.createdAt && new Date(c.createdAt).getMonth() === new Date().getMonth() && new Date(c.createdAt).getFullYear() === new Date().getFullYear()).length;
  const aiCount = state.aiHistory.length;

  const stageCounts = STAGES.map(s => state.customers.filter(c => c.stage === s).length);
  const byCountry = {};
  state.customers.forEach(c => { const k = c.country || '未知'; byCountry[k] = (byCountry[k] || 0) + 1; });
  let countryEntries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const topCountries = countryEntries.slice(0, 6);
  const otherSum = countryEntries.slice(6).reduce((a, b) => a + b[1], 0);
  const donutLabels = topCountries.map(e => e[0]).concat(otherSum ? ['其他'] : []);
  const donutValues = topCountries.map(e => e[1]).concat(otherSum ? [otherSum] : []);

  // 近 6 个月 AI 获客趋势
  const months = []; const monthVals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    months.push(`${d.getMonth() + 1}月`);
    monthVals.push(state.aiHistory.filter(h => { const dt = new Date(h.date); return `${dt.getFullYear()}-${dt.getMonth()}` === key; }).length);
  }

  const recent = state.customers.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);

  const dueList = dueCustomers();
  const dueBanner = dueList.length ? `<div class="profile-banner warn" id="dash-followup" style="cursor:pointer">🔔 有 <b>${dueList.length}</b> 个客户已超过跟进周期未跟进（默认每 ${state.settings.followUpDays || 14} 天），点击查看需跟进名单 →</div>` : '';

  // 今日节日/待办提醒横幅（日历入口）
  let calBanner = '';
  try {
    const _n = new Date();
    const todayItems = calDayItems(_n.getFullYear(), _n.getMonth() + 1, _n.getDate());
    const todayHol = todayItems.filter(i => i.type === 'holiday');
    const todayTodo = todayItems.filter(i => i.type === 'todo' && !i.done);
    if (todayHol.length || todayTodo.length) {
      const parts = [];
      todayHol.forEach(h => parts.push(`${h.emoji || '🎉'} ${esc(h.name)}`));
      if (todayTodo.length) parts.push(`📌 ${todayTodo.length} 项待办`);
      calBanner = `<div class="profile-banner" style="cursor:pointer;border-color:var(--primary);background:var(--primary-soft,rgba(79,70,229,.08));color:var(--text)" id="dash-calendar">📅 今天是：<b>${parts.join(' · ')}</b> <span class="muted">（${todayHol.length ? '记得给客户发节日问候' : '待办待处理'}）点击查看日历 →</span></div>`;
    }
  } catch (e) {}

  main.innerHTML = `
  <div class="grid cols-4">
    <div class="stat"><div class="bar"></div><div class="label">客户总数</div><div class="value">${total}</div><div class="hint">累计建档客户</div></div>
    <div class="stat"><div class="bar" style="background:var(--warn)"></div><div class="label">进行中商机</div><div class="value">${active}</div><div class="hint">商机 + 谈判阶段</div></div>
    <div class="stat"><div class="bar" style="background:var(--success)"></div><div class="label">本月新增</div><div class="value">${thisMonth}</div><div class="hint">${new Date().getMonth() + 1} 月新建客户</div></div>
    <div class="stat"><div class="bar" style="background:var(--info)"></div><div class="label">AI 调用次数</div><div class="value">${aiCount}</div><div class="hint">获客 / 背调 / 分析</div></div>
  </div>

  ${calBanner}
  ${dueBanner}

  <div class="grid cols-3 mt16">
    <div class="card card-pad">
      <div class="card-title">销售管道（按阶段）</div>
      <div class="canvas-wrap"><canvas id="ch-pipeline" class="chart" style="height:230px"></canvas></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">客户国家分布</div>
      <div class="canvas-wrap"><canvas id="ch-country" class="chart" style="height:230px"></canvas></div>
      <div class="pill-list mt12" id="ch-country-legend"></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">AI 获客趋势（近 6 月）</div>
      <div class="canvas-wrap"><canvas id="ch-trend" class="chart" style="height:230px"></canvas></div>
    </div>
  </div>

  <div class="grid cols-2 mt16">
    <div class="card card-pad">
      <div class="card-title">最近客户</div>
      ${recent.length ? `<div>${recent.map(c => `
        <div class="flex between items-center" style="padding:9px 0;border-bottom:1px solid var(--border)">
          <div><strong>${esc(c.name)}</strong> <span class="muted small">· ${esc(c.country || '—')}</span></div>
          <span class="badge ${STAGE_CLASS[c.stage] || 'b-tag'}">${esc(c.stage)}</span>
        </div>`).join('')}</div>` : `<div class="empty"><div class="big">👥</div>还没有客户，去「AI 获客」或「客户管理」添加吧</div>`}
    </div>
    <div class="card card-pad">
      <div class="card-title">快捷操作</div>
      <div class="flex wrap gap12 mt8">
        <button class="btn primary" data-go="lead">⚡ 智能开发</button>
        <button class="btn" data-go="research">🔍 深度背调</button>
        <button class="btn" data-go="market">📊 市场分析</button>
        <button class="btn" data-go="crm">👥 客户管理</button>
      </div>
      <div class="divider"></div>
      <div class="small muted">AI 状态：${state.settings.apiKey ? '已配置 ✓' : '未配置，请到「设置」填写 API Key'}</div>
    </div>
  </div>`;

  // 图表
  drawBar($('#ch-pipeline'), STAGES, stageCounts, CHART_COLORS[0]);
  if (donutValues.length) { drawDonut($('#ch-country'), donutLabels, donutValues, CHART_COLORS); }
  else { $('#ch-country').getContext('2d').fillText('暂无数据', 10, 20); }
  const legend = $('#ch-country-legend');
  if (legend) legend.innerHTML = donutLabels.map((l, i) => `<span class="chip"><span style="width:9px;height:9px;border-radius:50%;background:${CHART_COLORS[i % CHART_COLORS.length]};display:inline-block"></span>${esc(l)} ${donutValues[i]}</span>`).join('');
  drawLine($('#ch-trend'), months, monthVals, CHART_COLORS[1]);

  $all('[data-go]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.go; render(); }));
  const dfb = $('#dash-followup');
  if (dfb) dfb.addEventListener('click', () => { state.crmFollowUp = 'due'; state.view = 'crm'; render(); });
  const dcb = $('#dash-calendar');
  if (dcb) dcb.addEventListener('click', () => { state.view = 'calendar'; render(); });
}

// ---------- AI 获客 ----------
function fitClass(fit) {
  if (fit === '潜在客户') return 'b-fit-yes';
  if (fit === '一般') return 'b-fit-maybe';
  return 'b-fit-no';
}

function renderLead() {
  const p = state.settings.profile;
  const hasProfile = !!(p.name || p.website || p.products || p.advantages || p.bestSellers);
  const banner = hasProfile
    ? `<div class="profile-banner ok">🏢 <b>我方画像：</b>${esc(p.name || '未命名公司')} · 产品：${esc(p.products || '—')} · 优势：${esc(p.advantages || '—')}${p.bestSellers ? ' · 畅销品：' + esc(p.bestSellers) : ''} <a class="link" data-go-settings>修改画像</a></div>`
    : `<div class="profile-banner warn">⚠ 尚未填写「我方公司画像」，匹配精准度会打折扣。<a class="link" data-go-settings>到设置填写 →</a></div>`;

  main.innerHTML = `
  <div class="page-head">
    <div><h2>智能开发（获客 + 背调）</h2><div class="sub">一句话描述目标客户，AI 自动找线索、做背调式匹配判断，并判定是否为你的潜在客户</div></div>
    <button class="btn ghost" id="lead-sample">填充示例</button>
  </div>
  ${banner}
  <div class="grid cols-2">
    <div class="card card-pad">
      <div class="card-title">开发条件</div>
      <div class="field"><label>拓客方式</label>
        <div class="seg" id="lead-mode">
          <button type="button" class="seg-btn active" data-mode="product">按产品 / 描述</button>
          <button type="button" class="seg-btn" data-mode="oem">按 OEM 号（汽配）</button>
        </div>
      </div>
      <div class="field" id="field-product"><label>目标产品 / 服务 <span class="req">*</span></label>
        <input id="lead-product" type="text" placeholder="如：机油滤清器、空气滤芯"></div>
      <div class="field" id="field-oem" style="display:none"><label>OEM 号 / 零件号 <span class="req">*</span></label>
        <input id="lead-oem" type="text" placeholder="如：26300-2S000, 90915-YZZD3（多个用逗号隔开）"></div>
      <div class="field" id="field-oem-fit" style="display:none"><label>该 OEM 适配的品牌 / 车型 <span class="small muted">（建议填写，避免 AI 猜错）</span></label>
        <input id="lead-oem-fit" type="text" placeholder="如：Ford Ranger T6, Mazda BT-50 / 皮卡柴油燃油滤清器"></div>
      <div class="row2">
        <div class="field"><label>目标市场 / 国家</label><input id="lead-market" type="text" placeholder="如：美国、德国、东南亚"></div>
        <div class="field"><label>行业 / 关键词</label><input id="lead-industry" type="text" placeholder="如：家居用品、建材经销商"></div>
      </div>
      <div class="row2">
        <div class="field"><label>期望数量</label>
          <select id="lead-count"><option>5</option><option selected>8</option><option>10</option><option>15</option></select></div>
        <div class="field"><label>客户类型</label>
          <select id="lead-type">
            <option value="importer">进口商 / 分销商</option>
            <option value="retailer">零售商 / 连锁</option>
            <option value="manufacturer">制造商</option>
            <option value="brand">品牌商</option>
            <option value="distributor">批发商</option>
          </select></div>
      </div>
      <div class="field"><label>来源渠道</label>
        <select id="lead-channel">
          <option value="">不限 / 让 AI 推荐</option>
          <option value="官网">官网 / 独立站</option>
          <option value="B2B平台">B2B 平台（阿里巴巴 / 1688 等）</option>
          <option value="行业市场">行业市场（drom 等无网站小经销商）</option>
          <option value="展会">展会 / 线下摊位</option>
          <option value="社媒">社媒（LinkedIn / Instagram 等）</option>
          <option value="海关数据">海关数据</option>
          <option value="转介绍">老客户转介绍</option>
          <option value="其他">其他</option>
        </select></div>
      <div class="field"><label>补充要求</label>
        <textarea id="lead-extra" placeholder="如：偏好有电商渠道、年采购额较大、近一年有扩张迹象"></textarea></div>
      <button class="btn primary" id="lead-run" style="width:100%">⚡ 生成客户线索</button>
      <div id="lead-error" class="help err" style="color:var(--danger);margin-top:8px"></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">生成结果 <span id="lead-count-badge" class="muted small"></span>
        <button class="btn sm primary" id="lead-save" style="display:none">保存选中到 CRM</button>
      </div>
      <div class="lead-disclaimer">⚠ 默认启用严格模式：只有来源可验证（source 为真实搜索 URL）或联系方式真实的线索才允许保存到 CRM。未配置搜索引擎时，AI 只能基于训练数据整理，可能编造公司/网址。</div>
      <div id="lead-seen-bar" class="lead-seen-bar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 2px">
        <span id="lead-seen-status" class="muted small">已看 0 个网页</span>
        <button class="btn sm ghost" id="lead-more" title="排除已看过的网页，重新搜索找新客户">🔄 换一批（排除已看）</button>
        <button class="btn sm ghost" id="lead-reset-seen" title="清空已看记录，重新包含这些网页">↺ 重置已看</button>
      </div>
      <div id="lead-result"><div class="empty"><div class="big">✦</div>填写左侧条件后点击「生成客户线索」</div></div>
    </div>
  </div>`;

  $all('[data-go-settings]').forEach(a => a.addEventListener('click', () => { state.view = 'settings'; render(); }));

  // 恢复上次填写的内容（切换视图不被清空）
  const lf = state.leadForm;
  const setLeadMode = (mode) => {
    state.leadForm.mode = mode;
    $all('#lead-mode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const isOem = mode === 'oem';
    $('#field-product').style.display = isOem ? 'none' : '';
    $('#field-oem').style.display = isOem ? '' : 'none';
    $('#field-oem-fit').style.display = isOem ? '' : 'none';
  };
  setLeadMode(lf.mode === 'oem' ? 'oem' : 'product');
  if (lf.product) $('#lead-product').value = lf.product;
  if (lf.oem) $('#lead-oem').value = lf.oem;
  if (lf.oemFit) $('#lead-oem-fit').value = lf.oemFit;
  if (lf.market) $('#lead-market').value = lf.market;
  if (lf.industry) $('#lead-industry').value = lf.industry;
  if (lf.count) $('#lead-count').value = lf.count;
  if (lf.type) $('#lead-type').value = lf.type;
  if (lf.channel) $('#lead-channel').value = lf.channel;
  if (lf.extra) $('#lead-extra').value = lf.extra;
  // 输入即保存，保证切走再切回不丢
  ['lead-product', 'lead-oem', 'lead-oem-fit', 'lead-market', 'lead-industry', 'lead-count', 'lead-type', 'lead-channel', 'lead-extra'].forEach(id => {
    const el = $('#' + id);
    if (!el) return;
    const save = () => { state.leadForm[id.replace('lead-', '')] = el.value; };
    el.addEventListener('input', save);
    el.addEventListener('change', save);
  });
  $all('#lead-mode .seg-btn').forEach(b => b.addEventListener('click', () => setLeadMode(b.dataset.mode)));

  $('#lead-sample').addEventListener('click', () => {
    setLeadMode('product');
    $('#lead-product').value = '可折叠户外露营桌';
    $('#lead-market').value = '德国、法国';
    $('#lead-industry').value = '户外用品、露营装备零售商';
    $('#lead-extra').value = '偏好有独立站或 Amazon 店铺、年采购量中等以上';
    state.leadForm = { mode: 'product', product: $('#lead-product').value, oem: '', oemFit: '', market: $('#lead-market').value, industry: $('#lead-industry').value, count: $('#lead-count').value, type: $('#lead-type').value, channel: $('#lead-channel').value, extra: $('#lead-extra').value };
  });

  let lastLeads = [];
  let lastOemMeta = null; // 保存 OEM 拓客的元信息，入 CRM 时写入

  // 构造用于真实搜索引擎的 query
  function buildSearchQuery(mode, product, oem, market, industry, type, channel, oemFit) {
    const typeKwMap = { '进口商/分销商': 'importer distributor', '零售商/连锁': 'retailer chain store', '制造商': 'manufacturer', '品牌商': 'brand', '批发商': 'wholesaler' };
    const parts = [];
    if (mode === 'oem') {
      parts.push(oem);
      if (oemFit) parts.push(oemFit);              // 适配品牌/车型：最关键的分词，必须进搜索词
      if (market) parts.push(market);
      const typeKw = typeKwMap[type] || 'distributor';
      if (typeKw) parts.push(typeKw);              // 用户选择的客户类型英文意图词
      parts.push('auto parts');                    // 保证命中汽配零售商/经销商页面
      if (channel && channel !== '官网') parts.push(channel);
    } else {
      parts.push(product);
      if (market) parts.push(market);
      if (industry) parts.push(industry);
      parts.push(type);
      if (channel && channel !== '官网') parts.push(channel);
    }
    return parts.filter(Boolean).join(' ');
  }

  // 将真实搜索结果格式化为给 AI 的上下文
  function formatSearchResults(res) {
    if (!res || !res.ok || !res.items || !res.items.length) return '';
    const lines = res.items.map((it, idx) => {
      let extra = '';
      if (it.emails && it.emails.length) extra += `\n    页面提取到的邮箱: ${it.emails.join(', ')}`;
      if (it.phones && it.phones.length) extra += `\n    页面提取到的电话: ${it.phones.join(', ')}`;
      return `[${idx + 1}] title: ${it.title || ''}\n    link: ${it.link || ''}\n    snippet: ${it.snippet || ''}${extra}`;
    });
    return `【以下是你能使用的真实搜索引擎结果，所有公司/网址/联系方式必须来自这些结果】\n` +
      `engine: ${res.engine || 'unknown'}\nquery: ${res.query || ''}\n\n` +
      lines.join('\n\n') + `\n\n` +
      `说明：部分结果附上了从该网站页面正文抓取到的真实邮箱/电话（emails/phones 字段），请将其填入对应线索的 contacts，页面未提供的留空，禁止编造。\n` +
      `要求：1) 你只能从上述结果中提取潜在客户；2) source 字段必须写对应结果的真实 link URL；3) 如果上述结果没有合适公司，请直接返回空 leads 数组，不要编造。`;
  }

  // 把搜索结果页里抓取到的真实联系方式，按域名并入 AI 返回的线索（AI 漏抓也兜底补上）
  function mergeExtractedContacts(leads, searchRes) {
    if (!leads || !searchRes || !searchRes.items) return leads;
    const byDomain = {};
    searchRes.items.forEach(it => {
      try { const d = new URL(it.link || '').hostname.replace(/^www\./, ''); if (d) byDomain[d] = it; } catch (e) { /* ignore */ }
    });
    leads.forEach(l => {
      if (!l || typeof l !== 'object') return;
      let hit = null;
      [l.website, l.shopUrl, l.source].filter(Boolean).forEach(u => {
        if (hit) return;
        try { const d = new URL(u).hostname.replace(/^www\./, ''); if (byDomain[d]) hit = byDomain[d]; } catch (e) { /* ignore */ }
      });
      if (!hit) return;
      const exEmails = hit.emails || [];
      const exPhones = hit.phones || [];
      if (!exEmails.length && !exPhones.length) return;
      const contacts = Array.isArray(l.contacts) ? l.contacts.slice() : [];
      const haveEmail = new Set(contacts.map(c => (c.email || '').toLowerCase()));
      const havePhone = new Set(contacts.map(c => (c.phone || '').replace(/\s/g, '')));
      exEmails.forEach(e => { if (!haveEmail.has(e.toLowerCase())) { contacts.push({ name: '', title: '', email: e, phone: '' }); haveEmail.add(e.toLowerCase()); } });
      exPhones.forEach(p => { const pk = p.replace(/\s/g, ''); if (!havePhone.has(pk)) { contacts.push({ name: '', title: '', email: '', phone: p }); havePhone.add(pk); } });
      l.contacts = contacts;
      if (!l.email && exEmails.length) l.email = exEmails[0];
      const extra = [];
      if (exEmails.length) extra.push('邮箱: ' + exEmails.join(', '));
      if (exPhones.length) extra.push('电话: ' + exPhones.join(', '));
      if (extra.length) l.contactHint = [l.contactHint, extra.join('；')].filter(Boolean).join('；');
    });
    return leads;
  }

  // 当 AI 对 OEM 搜索太保守返回 0 条时，直接从搜索结果生成线索兜底
  function buildFallbackOEMLeads(items, oem, market, type, channel) {
    const seenDomains = new Set();
    const typeLabel = type || '潜在客户';
    return items.filter(it => {
      if (!it || !it.link) return false;
      const d = linkToDomain(it.link);
      if (!d || seenDomains.has(d)) return false;
      // 过滤明显不是卖家的搜索引擎/聚合页
      const black = /(google\.com|bing\.com|duckduckgo\.com|yandex\.com|youtube\.com|facebook\.com|instagram\.com|twitter\.com|tiktok\.com|pinterest\.com)$/i;
      if (black.test(d)) return false;
      seenDomains.add(d);
      return true;
    }).slice(0, 12).map(it => {
      const hostname = (() => { try { return new URL(it.link).hostname; } catch (e) { return ''; } })();
      const rootUrl = hostname ? ('https://' + hostname.replace(/^www\./, '')) : '';
      const title = (it.title || '').trim();
      const h = hostname.toLowerCase();
      let channelLabel = channel || '官网/独立站';
      if (/amazon|ebay|aliexpress|alibaba|1688|dhgate|rakuten|made-in-china|ec21|globalsources/.test(h)) channelLabel = 'B2B平台/电商';
      else if (/drom|autoparts|rockauto|oreilly|advanceautoparts|autozone|napa/.test(h)) channelLabel = '行业市场/汽配平台';
      else if (/linkedin/.test(h)) channelLabel = '社媒';
      // 名字优先从标题取第一段，不行就用域名
      let name = title ? title.split(/[-–—|\(\)\[\]]/)[0].trim() : '';
      if (!name || name.length < 2 || /^(BMW|OEM|Febi|111| genuine|正品)/i.test(name)) {
        const parts = hostname.replace(/^www\./, '').split('.');
        name = parts[0].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
        name = name.charAt(0).toUpperCase() + name.slice(1);
      }
      const contacts = [];
      if (it.emails) it.emails.forEach(e => contacts.push({ name: '', title: '', email: e, phone: '', source: it.link }));
      if (it.phones) it.phones.forEach(p => contacts.push({ name: '', title: '', email: '', phone: p, source: it.link }));
      return {
        name,
        website: rootUrl,
        shopUrl: it.link,
        country: market || '',
        industry: '汽车后市场/汽配',
        channel: channelLabel,
        source: it.link,
        reason: `搜索结果页显示该网站销售/供应 OEM ${oem}：${title || ''}`.slice(0, 240),
        fit: '潜在客户',
        fitReason: '来自真实搜索结果的产品/店铺页',
        oemFit: '',
        contactHint: contacts.length ? `已抓取到 ${contacts.length} 条联系方式` : '建议通过网站联系表单或页面上的邮箱/电话进一步触达',
        contacts
      };
    });
  }

  // 判断线索是否可被保存到 CRM（严格模式）
  function leadHasRealContact(l) {
    const contacts = Array.isArray(l.contacts) ? l.contacts : [];
    if (contacts.some(c => (c.email || '').includes('@') || (c.phone || '').length >= 6)) return true;
    if ((l.email || '').includes('@')) return true;
    const hint = String(l.contactHint || '');
    if (/\+?[\d\-\(\)\s]{8,}/.test(hint)) return true;
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(hint)) return true;
    return false;
  }

  // 把链接归一化为域名（用于“已看网页”的安全网过滤）
  function linkToDomain(u) {
    try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }

  // 更新「已看网页」状态条
  function updateSeenBar() {
    const bar = $('#lead-seen-bar'); if (!bar) return;
    const n = state.seenSearchLinks.size;
    $('#lead-seen-status').textContent = n
      ? `已看 ${n} 个网页（再次生成将自动排除，去找新网页）`
      : '已看 0 个网页';
    bar.style.display = '';
  }

  async function runLead() {
    const mode = state.leadForm.mode === 'oem' ? 'oem' : 'product';
    const product = $('#lead-product').value.trim();
    const oem = $('#lead-oem').value.trim();
    const oemFit = $('#lead-oem-fit').value.trim();
    if (mode === 'oem') {
      if (!oem) { $('#lead-error').textContent = '请填写 OEM 号 / 零件号'; return; }
    } else {
      if (!product) { $('#lead-error').textContent = '请填写目标产品 / 服务'; return; }
    }
    $('#lead-error').textContent = '';
    const market = $('#lead-market').value.trim();
    const industry = $('#lead-industry').value.trim();
    const count = parseInt($('#lead-count').value, 10) || 8;
    const typeMap = { importer: '进口商/分销商', retailer: '零售商/连锁', manufacturer: '制造商', brand: '品牌商', distributor: '批发商' };
    const type = typeMap[$('#lead-type').value] || '进口商/分销商';
    const channel = $('#lead-channel').value.trim();
    const extra = $('#lead-extra').value.trim();
    const strict = state.settings.strictLeadMode !== false;

    const profileBlock = hasProfile ? `
我方公司画像（请据此判断匹配度）：
公司名称：${p.name || '—'}
官网：${p.website || '—'}
主营产品：${p.products || '—'}
我们的优势：${p.advantages || '—'}
我们的畅销品：${p.bestSellers || '—'}` : '';

    const btn = $('#lead-run');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 搜索并整理中…';
    $('#lead-result').innerHTML = '<div class="empty"><div class="big">⏳</div>正在搜索真实信息…</div>';

    let searchRes = null;
    let searchError = '';
    const engine = (state.settings.searchEngine || 'none').toLowerCase();
    const prevSeen = new Set(state.seenSearchLinks); // 本次搜索前已看过的网页，用于安全网过滤
    if (engine !== 'none') {
      try {
        const q = buildSearchQuery(mode, product, oem, market, industry, type, channel, oemFit);
        // 把本轮已看过的网页链接传给搜索引擎，让其在查询里加 -site: 排除，去找新网页
        const excludeLinks = Array.from(state.seenSearchLinks).filter(Boolean);
        searchRes = await webSearchBrowser(q, { engine, num: Math.min(15, Math.max(5, count * 2)), exclude: excludeLinks });
        // 记录本次真实返回的网页链接，下次搜索时排除
        if (searchRes && searchRes.ok && Array.isArray(searchRes.items)) {
          searchRes.items.forEach(it => { if (it.link) state.seenSearchLinks.add(it.link); });
        }
        if (!searchRes || !searchRes.ok) {
          searchError = (searchRes && searchRes.error) || '搜索引擎调用失败';
          if (excludeLinks.length) searchError += `（已看 ${excludeLinks.length} 个网页，可点「重置已看」重新包含）`;
        }
      } catch (e) {
        searchError = e.message || '搜索失败';
      }
    }

    let sysContent, userMsg;
    const searchBlock = formatSearchResults(searchRes);
    if (mode === 'oem') {
      sysContent = SYS_OEM;
      const fitBrandsBlock = oemFit ? `用户已确认该 OEM 号适配的汽车品牌 / 车型为：${oemFit}\n请严格以上述适配品牌为准，不要自行编造其它品牌。` : '用户未提供适配品牌/车型，你可以基于知识识别，但必须在 fitBrands 中标注为"AI推测"并提醒核实。';
      userMsg = `请基于以下 OEM 号为我开发潜在客户：
OEM 号 / 零件号：${oem}
${fitBrandsBlock}
我方产品（滤清器类型，供参考）：${product || '滤清器'}
目标市场 / 国家：${market || '不限'}
客户类型：${type}
来源渠道偏好：${channel || '不限（可涵盖官网、B2B平台、行业市场如 drom、展会、社媒、海关数据、转介绍等）'}
期望数量：${count} 个
补充要求：${extra || '无'}
${profileBlock}
${searchBlock}
请先根据用户提供的适配品牌/车型（如有），结合目标市场各品牌汽车保有量判断哪些品牌需求最大，最后生成该市场中销售/分销此类滤清器的潜在客户线索。`;
    } else {
      sysContent = SYS_LEAD;
      userMsg = `请为以下需求整理 ${count} 个潜在客户线索：
目标产品/服务：${product}
目标市场/国家：${market || '不限'}
行业/关键词：${industry || '不限'}
客户类型：${type}
来源渠道偏好：${channel || '不限（可涵盖官网、B2B平台、行业市场如 drom、展会、社媒、海关数据、转介绍等）'}
补充要求：${extra || '无'}
${profileBlock}
${searchBlock}
对每条线索，请基于"我方公司画像"判断它是否为我们的潜在客户（fit），并给出具体理由。`;
    }

    $('#lead-result').innerHTML = '<div class="empty"><div class="big">⏳</div>正在让 AI 整理搜索结果…</div>';

    try {
      const raw = await callAI([{ role: 'system', content: sysContent }, { role: 'user', content: userMsg }], { temperature: 0.5 });
      const obj = parseJson(raw);
      let leads = [];
      if (obj && Array.isArray(obj.leads)) leads = obj.leads;
      else if (Array.isArray(obj)) leads = obj;

      // OEM 二次兜底：主模型太保守返回 0 条，但真实搜索有结果时，用更宽松的提示从产品页/零售商页里捞卖家
      if (mode === 'oem' && leads.length === 0 && searchRes && searchRes.ok && searchRes.items && searchRes.items.length) {
        try {
          const fbUser = `${searchBlock}\nOEM 号：${oem}\n目标市场：${market || '不限'}\n客户类型：${type}\n请只从上述搜索结果中提取潜在客户，返回 JSON 格式 leads 数组。`;
          const fbRaw = await callAI([{ role: 'system', content: SYS_OEM_FALLBACK }, { role: 'user', content: fbUser }], { temperature: 0.3 });
          const fbObj = parseJson(fbRaw);
          const fbLeads = fbObj && Array.isArray(fbObj.leads) ? fbObj.leads : (Array.isArray(fbObj) ? fbObj : []);
          if (fbLeads.length) leads = fbLeads;
        } catch (e) { /* 兜底失败静默，继续走空结果提示 */ }
      }

      // 最后一道兜底：AI 两次都返回 0 条，但真实搜索确实有结果，直接从搜索结果按域名生成线索，
      // 保证“搜索引擎能搜到、就能列出潜在客户”，不再空转跳“无潜在客户”。
      if (mode === 'oem' && leads.length === 0 && searchRes && searchRes.ok && searchRes.items && searchRes.items.length) {
        const fb = buildFallbackOEMLeads(searchRes.items, oem, market, type, channel);
        if (fb.length) {
          leads = fb;
          toast('已从搜索结果直接列出潜在客户', `搜索引擎搜到 ${searchRes.items.length} 个网页，已按域名整理出 ${fb.length} 个候选（请人工核实匹配度）`, 'ok');
        }
      }

      // 把结果页正文抓取到的真实联系方式并入线索（AI 漏抓也兜底）
      leads = mergeExtractedContacts(leads, searchRes);

      // 标记每条线索的 verified 状态
      const searchLinks = new Set((searchRes && searchRes.items || []).map(it => it.link).filter(Boolean));
      const hasRealUrl = (l) => [l.website, l.shopUrl, l.source].some(u => /^https?:\/\//.test(u || ''));
      const fromSearch = !!(searchRes && searchRes.items && searchRes.items.length);
      leads.forEach(l => {
        const inSearch = !!(searchLinks.size && (searchLinks.has(l.website) || searchLinks.has(l.shopUrl) || searchLinks.has(l.source)));
        // 只要真实搜索引擎返回过结果，AI 从中引用的任意真实 http(s) URL 即视为已验证
        // （真实可达性仍由 web:check 兜底核验）。未配置搜索引擎（fromSearch=false）时
        // 不凭 AI 给的 URL 自动验证，以保留“禁止编造公司/网址”的安全网。
        l._verified = inSearch || (fromSearch && hasRealUrl(l));
        l._hasContact = leadHasRealContact(l);
        // 如果 source 是模糊文本（不含 http），强制视为未验证（两种模式一致）
        if ((l.source || '').length > 0 && !/^https?:\/\//.test(l.source || '')) {
          l._verified = false;
        }
      });

      // 严格模式：过滤掉无真实来源且无真实联系方式的线索
      const strictBefore = leads.length;
      if (strict && engine !== 'none') {
        leads = leads.filter(l => l._verified || l._hasContact);
      }
      const strictSkipped = strictBefore - leads.length;

      // 排除已在 CRM 中的客户，避免重复开发
      const before = leads.length;
      leads = leads.filter(l => !findDupCustomer(l.name, l.website, l.shopUrl));
      const dupSkipped = before - leads.length;

      // 安全网：过滤掉仍与“之前已看网页”同域的线索（应对搜索引擎未完全忽略 -site: 的情况）
      const prevSeenDomains = new Set(Array.from(prevSeen).map(linkToDomain).filter(Boolean));
      const beforeSeen = leads.length;
      leads = leads.filter(l => {
        const doms = [l.website, l.shopUrl, l.source].map(linkToDomain).filter(Boolean);
        return !doms.some(d => prevSeenDomains.has(d));
      });
      const seenSkipped = beforeSeen - leads.length;
      lastLeads = leads;

      if (!leads.length) {
        const gotResults = searchRes && searchRes.items && searchRes.items.length;
        const noTavilyKey = !state.settings.searchTavilyKey;
        const parts = [];
        if (searchError) parts.push('搜索引擎调用失败：' + searchError);
        else if (engine === 'none') parts.push('未配置搜索引擎，无法获取真实公司数据。');
        else parts.push('搜索结果中没有找到可验证的潜在客户。');
        if (gotResults) parts.push(`本次搜索引擎实际返回了 ${gotResults} 条真实网页，但均未被认定为可验证线索（AI 可能未严格引用来源链接）。`);
        if (state.seenSearchLinks.size) parts.push(`已累计看过 ${state.seenSearchLinks.size} 个网页；点「换一批（排除已看）」可找新网页，或「重置已看」重新包含它们。`);
        if (dupSkipped) parts.push(`已排除 ${dupSkipped} 条 CRM 重复。`);
        if (strictSkipped) parts.push(`严格模式已过滤 ${strictSkipped} 条无真实来源/联系方式的线索（可到「设置」关闭“严格模式”再试）。`);
        if (!searchError && !gotResults && engine !== 'none' && noTavilyKey) parts.push('DuckDuckGo 偶发限流，可在「设置」配置 Tavily Key 提升稳定性（免费、免信用卡）。');
        throw new Error(parts.join(' '));
      }

      const oemInfo = (mode === 'oem' && obj) ? { brands: obj.fitBrands, marketMainBrands: obj.marketMainBrands, insight: obj.marketInsight } : null;
      if (oemInfo) lastOemMeta = { oemNumber: oem, oemFitBrands: (oemInfo.brands || []).join('、'), marketMainBrands: (oemInfo.marketMainBrands || []).join('、') };

      const bannerParts = [];
      bannerParts.push(`共 ${leads.length} 条`);
      if (dupSkipped) bannerParts.push(`已排除 ${dupSkipped} 条CRM重复`);
      if (seenSkipped) bannerParts.push(`已排除 ${seenSkipped} 条已看`);
      if (strictSkipped) bannerParts.push(`严格模式过滤 ${strictSkipped} 条`);
      if (engine === 'none') bannerParts.push('未启用搜索引擎');
      $('#lead-count-badge').textContent = bannerParts.join(' · ');

      const enrichedCount = (searchRes && searchRes.items) ? searchRes.items.filter(it => (it.emails && it.emails.length) || (it.phones && it.phones.length)).length : 0;
      const searchBanner = engine === 'none'
        ? `<div class="profile-banner warn">⚠ 未配置搜索引擎，以下结果由 AI 基于训练数据生成，公司/网址/联系方式可能不准确，仅供方向参考。</div>`
        : (searchError
          ? `<div class="profile-banner warn">⚠ 搜索引擎调用失败：${esc(searchError)}。本次结果由 AI 基于训练数据整理，真实性需人工核实。</div>`
          : `<div class="profile-banner ok">✓ 已基于真实搜索结果整理。来源徽标为绿色的线索可直接点击 URL 验证。${enrichedCount ? `<br><span class="muted small">📇 已从 ${enrichedCount} 个网站正文抓取到真实邮箱 / 电话，已并入对应线索</span>` : ''}${searchRes && searchRes.fallback ? `<br><span class="muted small">↪ ${esc(searchRes.fallbackNote || '已回退到 Tavily')}</span>` : ''}</div>`);
      const oemBanner = oemInfo ? `<div class="oem-insight">🔧 <b>适配品牌/车型：</b>${esc((oemInfo.brands || []).join('、') || '—')}<br>🚗 <b>市场主流品牌：</b>${esc((oemInfo.marketMainBrands || []).join('、') || '—')}<br>📊 <b>市场洞察：</b>${esc(oemInfo.insight || '—')}</div>` : '';
      $('#lead-result').innerHTML = searchBanner + oemBanner + leads.map((l, i) => {
        const verified = l._verified || l._hasContact;
        const sourceUrl = (l.source || '').startsWith('http') ? l.source : '';
        const contactLines = [];
        const contacts = Array.isArray(l.contacts) ? l.contacts.slice() : [];
        if (l.email) contacts.push({ email: l.email });
        contacts.forEach(c => {
          const parts = [];
          if (c.name) parts.push(c.name);
          if (c.title) parts.push(`(${c.title})`);
          if (c.email) parts.push(`✉ ${c.email}`);
          if (c.phone) parts.push(`📞 ${c.phone}`);
          if (parts.length) contactLines.push(parts.join(' '));
        });
        return `
        <div class="lead-card ${verified ? 'lead-verified' : 'lead-unverified'}" style="margin-bottom:12px">
          <label class="flex between items-center mb8" style="cursor:pointer">
            <div class="flex items-center gap8">
              <input type="checkbox" class="lead-sel" data-i="${i}" ${verified ? 'checked' : ''} ${!verified && strict ? 'disabled' : ''}>
              <strong>${esc(l.name || '未知公司')}</strong>
              ${!verified ? '<span class="badge b-source-uncertain">未验证</span>' : ''}
            </div>
            <span class="badge ${fitClass(l.fit)}">${esc(l.fit || '—')}</span>
          </label>
          <div class="flex between items-center">
            <div class="small muted">${esc(l.industry || '')} · ${esc(l.country || '—')} ${l.channel ? `<span class="badge b-channel">${esc(l.channel)}</span>` : ''}</div>
            <button class="btn sm ghost" data-deep="${i}">🔍 深度背调</button>
          </div>
          <div class="small mt8">🌐 ${l.website ? `<a href="${esc(l.website)}" target="_blank" style="color:var(--primary)">${esc(l.website)}</a>` : (l.shopUrl ? '店铺：' + esc(l.shopUrl) : '—')} <span id="web-status-${i}" class="badge web-pending">🔄 检测中…</span></div>
          ${l.shopUrl ? `<div class="small mt8">🛒 <a href="${esc(l.shopUrl)}" target="_blank" style="color:var(--primary)">店铺 / 列表链接</a></div>` : ''}
          ${l.oemFit ? `<div class="small mt8">🔧 <b>适配：</b>${esc(l.oemFit)}</div>` : ''}
          <div class="small mt8"><span class="badge ${sourceUrl ? 'b-source' : 'b-source-uncertain'}">${sourceUrl ? '来源：' : '来源未验证：'}${esc(l.source || '未注明')}</span></div>
          <div class="small mt8"><b>匹配理由：</b>${esc(l.reason || '')}</div>
          ${l.fitReason ? `<div class="small mt8"><b>判定依据：</b>${esc(l.fitReason)}</div>` : ''}
          <div class="small mt8"><b>联系人线索：</b>${esc(l.contactHint || '—')}</div>
          ${contactLines.length ? `<div class="small mt8">${contactLines.map(line => `<div>• ${esc(line)}</div>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
      $('#lead-save').style.display = '';
      verifyLeadWebsites(leads);
      // 绑定深度背调
      $all('[data-deep]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        const l = lastLeads[+b.dataset.deep];
        if (l) openDeepResearch(l);
      }));
      logAI('lead', (mode === 'oem' ? 'OEM:' + oem : product) + (market ? ' @' + market : ''), leads.length);
      const toastMsg = [`共 ${leads.length} 条`];
      if (dupSkipped) toastMsg.push(`已排除 ${dupSkipped} 条CRM重复`);
      if (seenSkipped) toastMsg.push(`已排除 ${seenSkipped} 条已看`);
      if (strictSkipped) toastMsg.push(`严格模式过滤 ${strictSkipped} 条`);
      toast('线索已生成', toastMsg.join('，'), 'ok');
    } catch (e) {
      $('#lead-result').innerHTML = `<div class="empty"><div class="big">⚠</div>${esc(e.message || '生成失败')}<div style="margin-top:12px"><button class="btn primary" id="lead-retry">🔄 重试</button></div></div>`;
      $('#lead-error').textContent = e.message || '调用失败';
      toast('生成失败', e.message, 'err');
      const rb = $('#lead-retry');
      if (rb) rb.addEventListener('click', runLead);
    } finally {
      btn.disabled = false; btn.innerHTML = '⚡ 生成客户线索';
      updateSeenBar();
    }
  }
  $('#lead-run').addEventListener('click', runLead);
  // 「换一批（排除已看）」：直接重新生成，runLead 已自动排除已看网页，去找新客户
  const leadMoreBtn = $('#lead-more');
  if (leadMoreBtn) leadMoreBtn.addEventListener('click', runLead);
  // 「重置已看」：清空已看记录并重新搜索，让之前看过的网页重新被包含
  const leadResetBtn = $('#lead-reset-seen');
  if (leadResetBtn) leadResetBtn.addEventListener('click', () => {
    if (!state.seenSearchLinks.size) { toast('无需重置', '当前没有已看网页记录', 'ok'); return; }
    state.seenSearchLinks = new Set();
    updateSeenBar();
    toast('已重置已看', '已清空记录，正在重新包含这些网页…', 'ok');
    runLead();
  });
  updateSeenBar();
  // 从 contactHint 中解析出可能的邮箱、电话/WhatsApp
  function parseContactsFromHint(hint) {
    const contacts = [];
    if (!hint) return contacts;
    const emails = hint.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
    const phones = hint.match(/\+?[\d\-\(\)\s]{8,}/g) || [];
    emails.forEach(e => contacts.push({ name: '', title: '', email: e, phone: '' }));
    phones.forEach(p => {
      const exists = contacts.some(c => c.phone === p);
      if (!exists) contacts.push({ name: '', title: '', email: '', phone: p });
    });
    return contacts;
  }

  $('#lead-save').addEventListener('click', () => {
    const sel = $all('.lead-sel:checked:not(:disabled)');
    if (!sel.length) { toast('请先勾选', '没有选中任何可保存线索（严格模式下未验证线索不可保存）', 'err'); return; }
    const strict = state.settings.strictLeadMode !== false;
    let added = 0, skipped = 0, unverifiedSkipped = 0, dupNames = [];
    sel.forEach(cb => {
      const l = lastLeads[+cb.dataset.i];
      if (!l) return;
      const dup = findDupCustomer(l.name, l.website, l.shopUrl);
      if (dup) { skipped++; dupNames.push(l.name || '未知公司'); return; }
      if (strict && !l._verified && !l._hasContact) { unverifiedSkipped++; return; }

      // 合并结构化 contacts（含角色/优先级/可信度/LinkedIn）+ email + contactHint 解析
      let contacts = extractContactsFrom(l);
      if ((l.email || '').includes('@') && !contacts.some(c => c.email === l.email)) {
        contacts.push({ name: '', title: '', email: l.email, phone: '', role: '', priority: '', credibility: '', linkedin: '' });
      }
      parseContactsFromHint(l.contactHint).forEach(c => {
        if (!contacts.some(x => x.email === c.email && x.phone === c.phone)) contacts.push(c);
      });

      state.customers.push({
        id: uid(), name: l.name || '未知公司', website: l.website || '', country: l.country || '',
        industry: l.industry || '', stage: '线索', source: lastOemMeta ? 'OEM拓客' : 'AI获客', owner: '', value: 0,
        channel: l.channel || '', shopUrl: l.shopUrl || '', cooperating: false,
        contacts,
        tags: (l.fit === '潜在客户' ? ['潜在客户'] : []), notes: [], aiReport: null,
        fit: l.fit || '', fitReason: l.fitReason || '', matchReason: l.reason || '',
        leadSource: l.source || '',
        customerGrade: '', productMatches: [],
        devHook: l.hook || l.why_now || l.development_hook || '',
        devStrategy: l.strategy || l.development_strategy || '',
        nextAction: l.next_action || (l.fit === '潜在客户' ? '发首封开发信 + 确认主营品类' : ''),
        oemNumber: lastOemMeta ? lastOemMeta.oemNumber : '',
        oemFitBrands: lastOemMeta ? lastOemMeta.oemFitBrands : (l.oemFit || ''),
        marketMainBrands: lastOemMeta ? lastOemMeta.marketMainBrands : '',
        createdAt: nowISO(), updatedAt: nowISO(), lastFollowUp: ''
      });
      added++;
    });
    persistAll();
    let msg = `新增 ${added} 个客户（阶段：线索）`;
    if (skipped) msg += `，已自动跳过 ${skipped} 个重复`;
    if (unverifiedSkipped) msg += `，严格模式跳过 ${unverifiedSkipped} 条未验证线索`;
    toast(skipped || unverifiedSkipped ? '已保存（部分已过滤）' : '已保存到 CRM', msg, 'ok');
    $('#lead-save').style.display = 'none';
    $('#lead-count-badge').textContent = '';
  });
}

// 线索内联深度背调：生成报告并可保存/更新到 CRM
function openDeepResearch(lead) {
  showModal(`<div id="dr-host"><div class="empty"><div class="big">⏳</div>正在对「${esc(lead.name)}」做深度背调…</div></div>`, { title: '深度背调 · ' + (lead.name || ''), foot: false, wide: true });
  const host = $('#dr-host');
  const userMsg = `请背调以下公司：
公司名称：${lead.name || '未知'}
官网：${lead.website || '未知'}
已知信息：该线索由 AI 获客生成，初步匹配判定为「${lead.fit || '未知'}」。
请基于公开可获取的信息客观评估，无法确认的内容请注明"未知/无法核实"。`;
  callAI([{ role: 'system', content: SYS_RESEARCH }, { role: 'user', content: userMsg }], { temperature: 0.5 })
    .then(raw => {
      const r = parseJson(raw);
      if (!r || typeof r !== 'object') throw new Error('模型未返回有效报告。');
      paintResearchReport(host, r, lead.name || '未知公司', lead.website || '');
    })
    .catch(e => { host.innerHTML = `<div class="empty"><div class="big">⚠</div>背调失败：${esc(e.message)}</div>`; });
}

// ---------- 统一的联系人提取：兼容各种 AI 返回格式 ----------
// 支持：contacts / contact / contact_persons / people / decision_makers / key_contacts
// 值可以是「对象数组」「单个对象」，字段名兼容多种命名
function extractContactsFrom(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const KEYS = ['contacts', 'contact', 'contact_persons', 'contactPersons', 'people', 'decision_makers', 'decisionMakers', 'key_contacts', 'keyContacts', 'persons'];
  let arr = null;
  for (const k of KEYS) {
    if (raw[k] == null) continue;
    const v = raw[k];
    if (Array.isArray(v)) { arr = v; break; }
    if (typeof v === 'object') { arr = [v]; break; }
  }
  // 兜底：如果顶层就是数组
  if (!arr && Array.isArray(raw)) arr = raw;
  if (!arr || !arr.length) return [];
  const pick = (o, names) => {
    for (const n of names) {
      if (o[n] != null && String(o[n]).trim()) return String(o[n]).trim();
    }
    return '';
  };
  const out = [];
  arr.forEach(k => {
    if (!k) return;
    // 支持字符串形式（如 "John - CEO - john@x.com"）
    if (typeof k === 'string') {
      const email = (k.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0];
      const phone = (k.match(/\+?\d[\d\s\-().]{6,}\d/) || [''])[0];
      const name = k.split(/[-–—|,，]/)[0].trim();
      if (name || email || phone) out.push({ name: name && name.length < 40 ? name : '', title: '', email, phone: phone.trim() });
      return;
    }
    if (typeof k !== 'object') return;
    const name = pick(k, ['name', 'contact_name', 'contactName', 'full_name', 'fullName', 'person', '姓名']);
    // role 有歧义：可能是"联系人角色"（Purchasing/产品决策…）或"职位"
    const roleRaw = pick(k, ['contact_role', 'contactRole', '角色', '联系人角色', 'role']);
    let role = '';
    let title = pick(k, ['title', 'position', 'job_title', 'jobTitle', 'designation', '职位']);
    if (roleRaw) {
      const low = String(roleRaw).toLowerCase();
      const hit = CONTACT_ROLES.find(r => r.toLowerCase() === low || low.includes(r.toLowerCase()) || r.toLowerCase().includes(low));
      if (hit) role = hit;               // 命中角色枚举 → 当作"联系人角色"
      else if (!title) title = roleRaw;  // 否则当作"职位"
    }
    const email = pick(k, ['email', 'email_address', 'emailAddress', 'mail', 'e_mail', '邮箱']);
    const phone = pick(k, ['phone', 'tel', 'telephone', 'phone_number', 'phoneNumber', 'mobile', 'cell', '电话']);
    // 优先级 P1/P2/P3
    const prioRaw = pick(k, ['priority', 'prio', 'contact_priority', 'contactPriority', '优先级', '联系人优先级']);
    let priority = '';
    if (prioRaw) {
      const up = String(prioRaw).toUpperCase();
      const hitP = CONTACT_PRIORITY.find(p => up === p[0] || up.includes(p[0]));
      if (hitP) priority = hitP[0];
    }
    // 可信度
    const credRaw = pick(k, ['credibility', 'confidence', 'contact_credibility', 'contactCredibility', '可信度', '联系方式可信度', 'verification']);
    let credibility = '';
    if (credRaw) {
      const hitC = CONTACT_CREDIBILITY.find(c => c === credRaw || String(credRaw).includes(c) || c.includes(String(credRaw)));
      if (hitC) credibility = hitC;
    }
    const linkedin = pick(k, ['linkedin', 'linked_in', 'linkedin_url', 'linkedinUrl', 'LinkedIn', 'li', '领英']);
    if (name || email || phone || linkedin || title || role) out.push({ name, title, email, phone, role, priority, credibility, linkedin });
  });
  return out;
}

// 从背调报告里提取联系人：
// 1) AI 返回的 contacts 数组（每项 {name, title, email, phone}）
// 2) 全文里用正则提取邮箱/电话/可能的姓名
function collectContactsFromResearch(r, companyName) {
  const source = [];
  const contacts = [];
  // 1) AI 返回的 contacts（统一用 extractContactsFrom，兼容单数/复数/各种字段名）
  const fromAI = extractContactsFrom(r);
  if (fromAI.length) {
    fromAI.forEach(k => contacts.push({ name: k.name || '', title: k.title || '', email: k.email || '', phone: k.phone || '' }));
    source.push('AI 返回');
  }
  // 2) 全文正则：把报告所有文本拼一起扫
  const fullText = [r.overview, r.strengths, r.risks, r.creditHint, r.suggestedApproach, r.markets, r.products, r.size].filter(x => typeof x === 'string').join('\n') + ' ' + (companyName || '');
  const emails = Array.from(new Set((fullText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])));
  const phones = Array.from(new Set((fullText.match(/\+?\d[\d\s\-().]{6,}\d/g) || []).map(p => p.trim())));
  // 把已存在的 email/phone 标记出来
  const haveEmails = new Set(contacts.map(c => c.email).filter(Boolean));
  const havePhones = new Set(contacts.map(c => c.phone).filter(Boolean));
  emails.filter(e => !haveEmails.has(e)).forEach(e => contacts.push({ name: '', title: '(文本中提取)', email: e, phone: '' }));
  phones.filter(p => !havePhones.has(p)).forEach(p => contacts.push({ name: '', title: '(文本中提取)', email: '', phone: p }));
  if (emails.length || phones.length) source.push('文本正则');
  // 去重：name+email+phone 完全相同的去重
  const seen = new Set();
  const dedup = contacts.filter(k => {
    const key = (k.name || '') + '|' + (k.email || '') + '|' + (k.phone || '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { contacts: dedup, source };
}

// 可复用的背调报告渲染（用于"深度背调"视图与线索内联深度背调）
function paintResearchReport(host, r, name, site) {
  const sec = (title, val) => val ? `<div class="report-section"><h4>▸ ${title}</h4><div>${esc(val)}</div></div>` : '';
  const list = (title, arr) => (arr && arr.length) ? `<div class="report-section"><h4>▸ ${title}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const custOptions = state.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  // 提取联系人：1) AI 返回的 contacts 字段；2) 全文正则扫邮箱/电话/姓名
  const collected = collectContactsFromResearch(r, name);
  const contactPanel = collected.contacts.length ? `
    <div class="report-section" id="dr-contacts-panel" style="background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(99,102,241,0.06));border:1px dashed var(--success,#16a34a);border-radius:8px;padding:12px">
      <h4>👤 检测到 ${collected.contacts.length} 个潜在联系人</h4>
      <div class="small muted mb8">来源：${collected.source.join('、')}</div>
      <div id="dr-contact-rows">
        ${collected.contacts.map((k, i) => `<label class="check" style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="dr-contact-pick" data-i="${i}" checked>
          <span style="flex:1"><b>${esc(k.name || '—')}</b>${k.title ? ' · <span class="muted">' + esc(k.title) + '</span>' : ''}${k.email ? ' · <a href="mailto:' + esc(k.email) + '" style="color:var(--primary)">' + esc(k.email) + '</a>' : ''}${k.phone ? ' · <a href="tel:' + esc(k.phone) + '" style="color:var(--primary)">' + esc(k.phone) + '</a>' : ''}</span>
        </label>`).join('')}
      </div>
      <div class="flex gap8 mt8">
        <button class="btn sm primary" id="dr-add-to-new">＋ 一键填入「存为新客户」</button>
        <button class="btn sm" id="dr-add-to-existing">👇 一键填入选中客户</button>
        <select id="dr-cust-pick" style="flex:1"><option value="">选择要填入的现有客户…</option>${custOptions}</select>
      </div>
    </div>` : '';

  const kw = [];
  if (r.country) kw.push(['国别', r.country]);
  if (r.industry) kw.push(['行业', r.industry]);
  if (r.size) kw.push(['规模', r.size]);
  if (r.markets) kw.push(['目标市场', r.markets]);
  const keywordPanel = kw.length ? `<div class="report-section profile-keywords"><h4>▸ 画像关键词</h4><div class="pill-list">${kw.map(([k, v]) => `<span class="chip kg"><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</div></div>` : '';
  host.innerHTML = `
    <div class="report-section"><h4>▸ 公司概况</h4><div><strong>${esc(name)}</strong>${site ? ` · <a href="${esc(site)}" target="_blank" style="color:var(--primary)">${esc(site)}</a>` : ''}</div></div>
    ${keywordPanel}
    ${contactPanel}
    ${sec('规模', r.size)}
    ${sec('主营产品', r.products)}
    ${sec('目标市场与渠道', r.markets)}
    ${sec('优势', r.strengths)}
    ${sec('风险与警示', r.risks)}
    ${sec('信用 / 资质提示', r.creditHint)}
    ${sec('开发建议', r.suggestedApproach)}
    ${list('信息来源', r.sources)}
    <div class="divider"></div>
    <div class="row2">
      <button class="btn primary" id="dr-new">＋ 存为新客户</button>
      <div class="flex items-center gap8" style="flex:1">
        <select id="dr-cust" style="flex:1"><option value="">更新到现有客户…</option>${custOptions}</select>
        <button class="btn" id="dr-update">更新</button>
      </div>
    </div>`;

  // 联系人按钮：填入"存为新客户"（先点 ＋ 存为新客户 弹的确认框或直接创建，附加 contacts）
  const cp = host.querySelector('#dr-contacts-panel');
  if (cp) {
    const pickedContacts = () => {
      const idx = Array.from(host.querySelectorAll('.dr-contact-pick:checked')).map(c => +c.dataset.i);
      return idx.map(i => collected.contacts[i]).filter(Boolean);
    };
    host.querySelector('#dr-add-to-new').addEventListener('click', () => {
      const k = pickedContacts();
      if (!k.length) { toast('未选择', '请至少勾选一个联系人', 'warn'); return; }
      // 直接创建客户（不弹重复确认，除非真重复）
      const dup = findDupCustomer(name, site, '');
      const doCreate = () => {
        state.customers.push(Object.assign({
          id: uid(), name, website: site, country: r.country || '', industry: r.industry || '', stage: '线索', source: 'AI背调',
          owner: '', value: 0, channel: '', shopUrl: '', cooperating: false, contacts: k, tags: ['已背调'], notes: [{ date: nowISO(), text: '完成 AI 背调，含 ' + k.length + ' 个联系人' }],
          aiReport: r, createdAt: nowISO(), updatedAt: nowISO(), lastFollowUp: ''
        }, warFieldsFromResearch(r)));
        persistAll(); toast('✓ 已新建客户并填入 ' + k.length + ' 个联系人', name, 'ok');
      };
      if (dup) {
        showModal(`<div style="padding:8px 4px">检测到「<b>${esc(dup.name)}</b>」可能重复。要把联系人<strong>追加到现有客户</strong>还是仍创建新客户？</div>`, { title: '可能重复', foot: true });
        const foot = $('#modal-foot');
        foot.innerHTML = `<button class="btn" data-close>取消</button>
          <button class="btn" id="dr-append-dup">追加到现有</button>
          <button class="btn primary" id="dr-force-new2">仍创建新客户</button>`;
        $all('[data-close]', foot).forEach(b => b.addEventListener('click', closeModal));
        foot.querySelector('#dr-append-dup').addEventListener('click', () => { closeModal(); dup.contacts = (dup.contacts || []).concat(k); dup.updatedAt = nowISO(); if (!dup.tags.includes('已背调')) dup.tags.push('已背调'); dup.aiReport = r; persistAll(); toast('✓ 已追加 ' + k.length + ' 个联系人到「' + dup.name + '」', '', 'ok'); });
        foot.querySelector('#dr-force-new2').addEventListener('click', () => { closeModal(); doCreate(); });
      } else doCreate();
    });
    host.querySelector('#dr-add-to-existing').addEventListener('click', () => {
      const id = host.querySelector('#dr-cust-pick').value;
      const c = state.customers.find(x => x.id === id);
      const k = pickedContacts();
      if (!c) { toast('未选择', '请先在右侧下拉选择要填入的现有客户', 'warn'); return; }
      if (!k.length) { toast('未选择', '请至少勾选一个联系人', 'warn'); return; }
      c.contacts = (c.contacts || []).concat(k);
      c.updatedAt = nowISO();
      if (!c.tags.includes('已背调')) c.tags.push('已背调');
      if (!c.aiReport) c.aiReport = r;
      persistAll();
      toast('✓ 已追加 ' + k.length + ' 个联系人到「' + c.name + '」', '', 'ok');
    });
  }
  host.querySelector('#dr-new').addEventListener('click', () => {
    // 先与 CRM 已有客户做交叉去重核对
    const dup = findDupCustomer(name, site, '');
    if (dup) {
      showModal(`<div style="padding:16px">
        <p>⚠️ <strong>检测到可能与已有客户重复：</strong></p>
        <div class="card" style="margin:12px 0;padding:12px;background:var(--bg2);border-radius:8px">
          <strong>${esc(dup.name)}</strong>${dup.country ? ` · ${esc(dup.country)}` : ''}${dup.industry ? ` · ${esc(dup.industry)}` : ''}<br>
          <span class="text-muted" style="font-size:12px">阶段：${esc(dup.stage)}${dup.cooperating ? ' · 🤝 已合作' : ''}</span>
          ${dup.website ? `<br><a href="${esc(dup.website)}" target="_blank">${esc(dup.website)}</a>` : ''}
        </div>
        <p style="color:var(--warn);font-size:13px">建议选择"更新到现有客户"以避免重复录入。</p>
      </div>`, { title: '⚠️ 可能重复', foot: true });
      const foot = $('#modal-foot');
      foot.innerHTML = `<button class="btn" data-close">返回</button>
        <button class="btn primary" id="dr-force-new">仍要新建（我知道风险）</button>
        <button class="btn primary" id="dr-go-update">去更新该客户</button>`;
      foot.querySelector('#dr-force-new').addEventListener('click', () => {
        closeModal(); doDrNew();
      });
      foot.querySelector('#dr-go-update').addEventListener('click', () => {
        closeModal(); host.querySelector('#dr-cust').value = dup.id; host.querySelector('#dr-update').click();
      });
      return;
    }
    doDrNew();
    function doDrNew() {
    state.customers.push(Object.assign({
      id: uid(), name, website: site, country: r.country || '', industry: r.industry || '', stage: '线索', source: 'AI背调',
      owner: '', value: 0, channel: '', shopUrl: '', cooperating: false, contacts: [], tags: ['已背调'], notes: [{ date: nowISO(), text: '完成 AI 背调' }],
      aiReport: r, createdAt: nowISO(), updatedAt: nowISO(), lastFollowUp: ''
    }, warFieldsFromResearch(r)));
    persistAll(); toast('已保存', '新建客户并附背调报告', 'ok');
    }
  });
  host.querySelector('#dr-update').addEventListener('click', () => {
    const id = host.querySelector('#dr-cust').value;
    const c = state.customers.find(x => x.id === id);
    if (!c) { toast('未选择', '请在下拉中选择要更新的客户', 'err'); return; }
    c.aiReport = r; c.updatedAt = nowISO();
    if (r.country) c.country = r.country;
    if (r.industry) c.industry = r.industry;
    if (!c.tags.includes('已背调')) c.tags.push('已背调');
    if (site && !c.website) c.website = site;
    // 作战信息：只补齐空缺，不覆盖用户已手填的内容（评级尤其以人工为准）
    const wf = warFieldsFromResearch(r);
    delete wf.stage;                                  // 阶段以 CRM 现状为准，不让背调改
    if (custGrade(c)) { delete wf.customerGrade; delete wf.rating; }
    ['devHook', 'devStrategy', 'nextAction', 'productMatches'].forEach(k => { if (c[k]) delete wf[k]; });
    Object.assign(c, wf);
    persistAll(); toast('已更新', `已更新「${c.name}」的背调报告`, 'ok');
  });
}

// ---------- 官网可达性自动检测 ----------
// 对每条线索的 website 调用主进程 web:check，更新徽标：
//   web-ok   ✅ 官网可访问
//   web-bad  ⚠ 无法访问 / 待人工核实
//   web-none 无官网 / 待核实（多为无网站小经销商，属正常）
async function verifyLeadWebsites(leads) {
  await Promise.all((leads || []).map(async (l, i) => {
    const el = document.getElementById('web-status-' + i);
    if (!el) return;
    if (!l.website) { el.className = 'badge web-none'; el.textContent = '无官网·待核实'; return; }
    try {
      const r = await webCheckBrowser(l.website);
      if (r && r.ok) { el.className = 'badge web-ok'; el.textContent = '✅ 官网可访问'; }
      else { el.className = 'badge web-bad'; el.textContent = '⚠ 无法访问·请核实'; el.title = (r && r.error) ? String(r.error) : '无法自动访问'; }
    } catch (e) {
      el.className = 'badge web-bad'; el.textContent = '⚠ 待人工核实';
    }
  }));
}

// ---------- 深度背调 ----------
function renderResearch() {
  main.innerHTML = `
  <div class="page-head">
    <div><h2>深度背调</h2><div class="sub">输入已知公司名 / 官网，AI 生成结构化背调报告（也可在「智能开发」里对每条线索一键深度背调）</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card card-pad">
      <div class="card-title">背调对象</div>
      <div class="field"><label>公司名称 <span class="req">*</span></label><input id="rs-name" type="text" placeholder="如：IKEA、或某区域经销商"></div>
      <div class="field"><label>官网 / 网址</label><input id="rs-site" type="url" placeholder="https://..."></div>
      <div class="field"><label>已知信息（选填）</label><textarea id="rs-extra" placeholder="如：年营收约 5 亿欧元、主要做北美市场、近期在招采购"></textarea></div>
      <button class="btn primary" id="rs-run" style="width:100%">🔍 开始背调</button>
      <div id="rs-error" class="help err" style="color:var(--danger);margin-top:8px"></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">背调报告</div>
      <div id="rs-result"><div class="empty"><div class="big">🔍</div>填写对象后点击「开始背调」</div></div>
    </div>
  </div>`;

  $('#rs-run').addEventListener('click', async () => {
    const name = $('#rs-name').value.trim();
    if (!name) { $('#rs-error').textContent = '请填写公司名称'; return; }
    $('#rs-error').textContent = '';
    const site = $('#rs-site').value.trim();
    const extra = $('#rs-extra').value.trim();
    const userMsg = `请背调以下公司：\n公司名称：${name}\n官网：${site || '未知'}\n已知信息：${extra || '无'}\n请基于公开可获取的信息给出客观评估，无法确认的内容请注明"未知/无法核实"。`;
    const btn = $('#rs-run');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 背调中…';
    $('#rs-result').innerHTML = '<div class="empty"><div class="big">⏳</div>正在生成背调报告…</div>';
    try {
      const raw = await callAI([{ role: 'system', content: SYS_RESEARCH }, { role: 'user', content: userMsg }], { temperature: 0.5 });
      const r = parseJson(raw);
      if (!r || typeof r !== 'object') throw new Error('模型未返回有效报告。');
      paintResearchReport($('#rs-result'), r, name, site);
      logAI('research', name, 1);
      toast('背调完成', name, 'ok');
    } catch (e) {
      $('#rs-result').innerHTML = `<div class="empty"><div class="big">⚠</div>背调失败</div>`;
      $('#rs-error').textContent = e.message;
      toast('背调失败', e.message, 'err');
    } finally { btn.disabled = false; btn.innerHTML = '🔍 开始背调'; }
  });
}

// ---------- 市场分析 ----------
function renderMarket() {
  const dims = [['规模', 'marketSize'], ['趋势', 'trends'], ['竞争者', 'competitors'], ['进入策略', 'entryStrategy'], ['风险', 'risks']];
  main.innerHTML = `
  <div class="page-head">
    <div><h2>市场分析</h2><div class="sub">输入产品与目标市场，AI 给出进入策略与机会评分</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card card-pad">
      <div class="card-title">分析条件</div>
      <div class="field"><label>产品 / 品类 <span class="req">*</span></label><input id="mk-product" type="text" placeholder="如：手持美容仪"></div>
      <div class="row2">
        <div class="field"><label>目标市场</label><input id="mk-market" type="text" placeholder="如：美国、日本"></div>
        <div class="field"><label>时间范围</label><input id="mk-horizon" type="text" placeholder="如：未来 1-2 年"></div>
      </div>
      <div class="field"><label>重点分析维度</label>
        <div class="flex wrap gap12 mt8">
          ${dims.map(d => `<label class="check"><input type="checkbox" class="mk-dim" value="${d[1]}" checked> ${d[0]}</label>`).join('')}
        </div>
      </div>
      <div class="field"><label>补充背景</label><textarea id="mk-extra" placeholder="如：自有工厂、预算有限、主打中端性价比"></textarea></div>
      <button class="btn primary" id="mk-run" style="width:100%">📊 开始分析</button>
      <div id="mk-error" class="help err" style="color:var(--danger);margin-top:8px"></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">分析结果</div>
      <div id="mk-result"><div class="empty"><div class="big">📊</div>填写条件后点击「开始分析」</div></div>
    </div>
  </div>
  <div class="card card-pad mt16">
    <div class="card-title">分析历史（<span id="mk-history-count">${state.marketAnalyses.length}</span>）</div>
    <div id="mk-history"></div>
  </div>`;

  function renderMarketHistory() {
    const box = $('#mk-history');
    if (!box) return;
    box.innerHTML = state.marketAnalyses.length ? state.marketAnalyses.slice().reverse().map((m, i) => `
      <div class="flex between items-center" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" data-mk="${state.marketAnalyses.length - 1 - i}">
        <div><strong>${esc(m.product)}</strong> <span class="muted small">· ${esc(m.market)}</span> <span class="muted small">· ${fmtDate(m.date)}</span></div>
        <span class="badge b-tag">查看</span>
      </div>`).join('') : '<div class="muted small">暂无历史</div>';
    $all('[data-mk]', box).forEach(d => d.addEventListener('click', () => {
      const rec = state.marketAnalyses[+d.dataset.mk];
      if (rec) { $('#mk-product').value = rec.product; $('#mk-market').value = rec.market; paintMarket(rec.data); }
    }));
  }
  renderMarketHistory();

  $('#mk-run').addEventListener('click', async () => {
    const product = $('#mk-product').value.trim();
    if (!product) { $('#mk-error').textContent = '请填写产品 / 品类'; return; }
    $('#mk-error').textContent = '';
    const market = $('#mk-market').value.trim();
    const horizon = $('#mk-horizon').value.trim();
    const extra = $('#mk-extra').value.trim();
    const dims = $all('.mk-dim:checked').map(c => c.value);
    const userMsg = `请分析以下市场：\n产品/品类：${product}\n目标市场：${market || '不限'}\n时间范围：${horizon || '未来'}\n重点维度：${dims.join('、') || '全部'}\n补充背景：${extra || '无'}\n请在 chartData 中用 0-100 分对各维度给出机会/吸引力评分（labels 与 values 一一对应）。`;
    const btn = $('#mk-run');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 分析中…';
    $('#mk-result').innerHTML = '<div class="empty"><div class="big">⏳</div>正在分析市场…</div>';
    try {
      const raw = await callAI([{ role: 'system', content: SYS_MARKET }, { role: 'user', content: userMsg }], { temperature: 0.6, maxTokens: 1800 });
      const r = parseJson(raw);
      if (!r || typeof r !== 'object') throw new Error('模型未返回有效分析。');
      paintMarket(r);
      const rec = { id: uid(), product, market: market || '不限', horizon, data: r, date: nowISO() };
      state.marketAnalyses.push(rec); persistAll();
      logAI('market', product + (market ? ' @' + market : ''), 1);
      toast('分析完成', product, 'ok');
      // 仅刷新历史列表，保留已绘制的分析结果
      $('#mk-history-count').textContent = state.marketAnalyses.length;
      renderMarketHistory();
    } catch (e) {
      $('#mk-result').innerHTML = `<div class="empty"><div class="big">⚠</div>分析失败</div>`;
      $('#mk-error').textContent = e.message;
      toast('分析失败', e.message, 'err');
    } finally { btn.disabled = false; btn.innerHTML = '📊 开始分析'; }
  });

  function paintMarket(r) {
    const list = (title, arr) => (arr && arr.length) ? `<div class="report-section"><h4>▸ ${title}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const cd = r.chartData && Array.isArray(r.chartData.values) ? r.chartData : null;
    $('#mk-result').innerHTML = `
      <div class="report-section"><h4>▸ 总体结论</h4><div>${esc(r.summary || '')}</div></div>
      ${r.marketSize ? `<div class="report-section"><h4>▸ 市场规模</h4><div>${esc(r.marketSize)}</div></div>` : ''}
      ${list('趋势', r.trends)}
      ${list('竞争者 / 替代渠道', r.competitors)}
      ${list('进入策略', r.entryStrategy)}
      ${list('风险', r.risks)}
      ${cd ? `<div class="report-section"><h4>▸ 机会评分</h4><div class="canvas-wrap"><canvas id="mk-chart" class="chart" style="height:200px"></canvas></div></div>` : ''}`;
    if (cd) drawBar($('#mk-chart'), cd.labels, cd.values, CHART_COLORS[2]);
  }
}

// =========================================================
// 客户管理 CRM
// =========================================================
function getFilteredCustomers() {
  const q = state.crmSearch.trim().toLowerCase();
  return state.customers.filter(c => {
    if (state.tombstones && state.tombstones[c.id]) return false; // 已删除的客户不再出现
    if (state.crmStage !== '全部' && c.stage !== state.crmStage) return false;
    if (state.crmCountry && (c.country || '') !== state.crmCountry) return false;
    if (state.crmIndustry && (c.industry || '') !== state.crmIndustry) return false;
    if (state.crmFollowUp === 'due' && !isFollowUpDue(c)) return false;
    const g = custGrade(c);
    if (state.crmGrade && state.crmGrade !== '全部') {
      if (state.crmGrade === '未评级') { if (g) return false; }
      else if (g !== state.crmGrade) return false;
    }
    // 「评级 + N 天没跟进」组合筛选：如 A+ 且 ≥7 天没跟进
    if (state.crmNoFollowDays > 0 && daysSinceLastFollow(c) < state.crmNoFollowDays) return false;
    if (!q) return true;
    const hay = [c.name, c.country, c.industry, c.website, c.channel, c.shopUrl, (c.tags || []).join(' '), (c.contacts || []).map(k => k.name + k.email).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// 从现有客户中去重提取某个字段的可选值（用于筛选下拉）
function distinctValues(field) {
  const set = new Set();
  state.customers.forEach(c => { const v = (c[field] || '').trim(); if (v) set.add(v); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'));
}

// 更新批量操作栏（显示已选数量、绑定按钮可用性）
function updateBatchBar() {
  const bar = $('#crm-batch');
  if (!bar) return;
  const n = state.crmSel.size;
  bar.style.display = n ? 'flex' : 'none';
  const cnt = $('#crm-batch-count');
  if (cnt) cnt.textContent = `已选 ${n} 个`;
  bar.querySelectorAll('[data-batch]').forEach(b => { b.disabled = !n; });
}

// 搜索"已合作客户"时给出醒目提醒，避免重复开发
function updateCoopBanner() {
  const box = $('#coop-reminder');
  if (!box) return;
  const q = state.crmSearch.trim();
  if (!q) { box.innerHTML = ''; return; }
  const k = normKey(q);
  const matches = state.customers.filter(c => c.cooperating && (
    normKey(c.name).includes(k) || normKey(c.country).includes(k) || normKey(c.industry).includes(k) ||
    normKey(c.website).includes(k) || normKey(c.shopUrl).includes(k)
  ));
  if (!matches.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="coop-banner warn">⚠ 提醒：搜索「${esc(q)}」命中 ${matches.length} 个<b>已合作客户</b>，无需重复开发 —— ${matches.slice(0, 5).map(m => `<b>${esc(m.name)}</b>`).join('、')}${matches.length > 5 ? '…' : ''}</div>`;
}

function renderCrm() {
  const stageOpts = ['全部'].concat(STAGES).map(s => `<option ${state.crmStage === s ? 'selected' : ''}>${s}</option>`).join('');
  const countryOpts = distinctValues('country').map(v => `<option ${state.crmCountry === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const industryOpts = distinctValues('industry').map(v => `<option ${state.crmIndustry === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const dueN = dueCustomers().length;
  main.innerHTML = `
  <div class="page-head">
    <div><h2>客户管理</h2><div class="sub">共 ${state.customers.length} 个客户${dueN ? ` · <span style="color:var(--danger);font-weight:700">🔔 ${dueN} 个需跟进</span>` : ''}</div></div>
    <button class="btn primary" id="crm-add">＋ 新增客户</button>
  </div>
  ${dueN ? `<div class="profile-banner warn" id="crm-followup-banner" style="cursor:pointer">🔔 有 <b>${dueN}</b> 个客户已超过设定的跟进周期（默认每 ${state.settings.followUpDays || 14} 天）未跟进，点击查看需跟进名单 →</div>` : ''}
  <div class="card card-pad mb12">
    <div class="flex between items-center wrap gap12">
      <div class="row2" style="flex:1;min-width:320px;gap:10px">
        <input id="crm-filter-search" type="text" placeholder="搜索名称 / 国家 / 行业 / 标签 / 联系人" value="${esc(state.crmSearch)}">
        <select id="crm-filter-stage">${stageOpts}</select>
      </div>
      <div class="row3" style="flex:1;min-width:320px;gap:10px">
        <select id="crm-filter-country"><option value="">全部国家</option>${countryOpts}</select>
        <select id="crm-filter-industry"><option value="">全部行业</option>${industryOpts}</select>
        <select id="crm-filter-grade"><option value="全部">全部评级</option>${['A+', 'A', 'B', 'C', '未评级'].map(g => `<option value="${g}" ${state.crmGrade === g ? 'selected' : ''}>${g === '未评级' ? '未评级' : '⭐ ' + g}</option>`).join('')}</select>
      </div>
      <div class="flex items-center gap8">
        <button class="btn sm ${state.crmFollowUp === 'due' ? 'primary' : ''}" id="crm-filter-followup">🔔 仅看需跟进${dueN ? ` (${dueN})` : ''}</button>
        <select id="crm-filter-nofollow" style="max-width:150px">
          <option value="0">未跟进：不限</option>
          ${[3, 7, 14, 30, 60, 90].map(d => `<option value="${d}" ${state.crmNoFollowDays === d ? 'selected' : ''}>≥ ${d} 天没跟进</option>`).join('')}
        </select>
        <button class="btn sm ghost" id="crm-filter-reset" title="清空全部筛选">重置</button>
      </div>
      <div class="small muted" id="crm-filter-count">显示 ${getFilteredCustomers().length} / ${state.customers.length}</div>
    </div>
  </div>
  <div id="crm-batch" class="card card-pad mb12 batch-bar" style="display:none">
    <span id="crm-batch-count" class="batch-count">已选 0 个</span>
    <button class="btn sm danger" data-batch="del">批量删除</button>
    <select id="crm-batch-stage" class="batch-stage"><option value="">改阶段…</option>${STAGES.map(s => `<option>${s}</option>`).join('')}</select>
    <button class="btn sm" data-batch="stage">应用阶段</button>
    <button class="btn sm" data-batch="tag">批量加标签</button>
    <button class="btn sm" data-batch="export">导出选中</button>
    <button class="btn sm ghost" data-batch="clear">取消选择</button>
  </div>
  <div class="card" style="overflow:hidden">
    <div id="crm-table-container"></div>
  </div>
  <div id="coop-reminder"></div>`;

  renderCrmTable();
  updateCoopBanner();
  updateBatchBar();

  $('#crm-add').addEventListener('click', () => openCustomerForm(null));
  $('#crm-filter-search').addEventListener('input', e => { state.crmSearch = e.target.value; renderCrmTable(); });
  $('#crm-filter-stage').addEventListener('change', e => { state.crmStage = e.target.value; renderCrmTable(); });
  $('#crm-filter-country').addEventListener('change', e => { state.crmCountry = e.target.value; renderCrmTable(); });
  $('#crm-filter-industry').addEventListener('change', e => { state.crmIndustry = e.target.value; renderCrmTable(); });
  const gradeSel = $('#crm-filter-grade');
  if (gradeSel) gradeSel.addEventListener('change', e => { state.crmGrade = e.target.value; renderCrmTable(); });
  const nfSel = $('#crm-filter-nofollow');
  if (nfSel) nfSel.addEventListener('change', e => { state.crmNoFollowDays = parseInt(e.target.value, 10) || 0; renderCrmTable(); });
  const rstBtn = $('#crm-filter-reset');
  if (rstBtn) rstBtn.addEventListener('click', () => {
    state.crmSearch = ''; state.crmStage = '全部'; state.crmCountry = ''; state.crmIndustry = '';
    state.crmGrade = '全部'; state.crmNoFollowDays = 0; state.crmFollowUp = 'all'; state.crmSel.clear();
    renderCrm();
  });
  const fuBtn = $('#crm-filter-followup');
  if (fuBtn) fuBtn.addEventListener('click', () => { state.crmFollowUp = state.crmFollowUp === 'due' ? 'all' : 'due'; renderCrm(); });
  const fuBanner = $('#crm-followup-banner');
  if (fuBanner) fuBanner.addEventListener('click', () => { state.crmFollowUp = 'due'; renderCrm(); });
  bindBatchBar();
}

// 绑定批量操作栏按钮
function bindBatchBar() {
  const bar = $('#crm-batch');
  if (!bar) return;
  const selectedCustomers = () => state.customers.filter(c => state.crmSel.has(c.id));
  bar.querySelector('[data-batch="del"]').addEventListener('click', () => {
    const sel = selectedCustomers();
    if (!sel.length) return;
    if (!confirm(`确定批量删除选中的 ${sel.length} 个客户？\n删除后会同步到云端，其他设备登录同一账号时也会消失。此操作不可撤销。`)) return;
    const ids = new Set(state.crmSel);
    const r = deleteCustomers(ids);
    state.crmSel.clear();
    renderCrmTable(); updateBatchBar();
    toast('已删除 ' + r.n + ' 个客户',
      r.synced ? '已从云端同步删除' : (r.pending ? `离线中，${r.pending} 条待联网后同步删除` : ''),
      'ok');
  });
  bar.querySelector('[data-batch="stage"]').addEventListener('click', () => {
    const st = $('#crm-batch-stage').value;
    if (!st) { toast('请先选择阶段', '', 'err'); return; }
    const sel = selectedCustomers();
    sel.forEach(c => { c.stage = st; c.updatedAt = nowISO(); });
    persistAll(); renderCrmTable();
    toast('已更新阶段', `${sel.length} 个客户 → ${st}`, 'ok');
  });
  bar.querySelector('[data-batch="tag"]').addEventListener('click', () => {
    const t = prompt('输入要批量添加的标签：');
    if (!t) return;
    const tag = t.trim();
    if (!tag) return;
    const sel = selectedCustomers();
    sel.forEach(c => { c.tags = c.tags || []; if (!c.tags.includes(tag)) c.tags.push(tag); c.updatedAt = nowISO(); });
    persistAll(); renderCrmTable();
    toast('已加标签', `${sel.length} 个客户 +「${tag}」`, 'ok');
  });
  bar.querySelector('[data-batch="export"]').addEventListener('click', async () => {
    const sel = selectedCustomers();
    if (!sel.length) return;
    const r = await exportDataWeb({ customers: sel, exportedAt: nowISO(), _note: '仅导出选中的 ' + sel.length + ' 个客户' });
    if (r.ok) toast('已导出选中', r.filePath, 'ok');
    else if (!r.canceled) toast('导出失败', r.error || '', 'err');
  });
  bar.querySelector('[data-batch="clear"]').addEventListener('click', () => {
    state.crmSel.clear(); renderCrmTable(); updateBatchBar();
  });
}

function renderCrmTable() {
  let list = getFilteredCustomers();
  if (state.crmFollowUp === 'due') {
    list = list.slice().sort((a, b) => {
      const na = followUpInfo(a).next || '9999-12-31';
      const nb = followUpInfo(b).next || '9999-12-31';
      return na < nb ? -1 : (na > nb ? 1 : 0);
    });
  }
  const box = $('#crm-table-container');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big">👥</div>${state.customers.length ? '没有匹配的客户' : '还没有客户，点击右上角「新增客户」或去「AI 获客」'}</div>`;
    updateCrmFilterCount(list);
    updateCoopBanner();
    return;
  }
  box.innerHTML = `<table class="tbl">
    <thead><tr><th class="col-sel"><input type="checkbox" id="crm-sel-all" title="全选当前列表"></th><th>公司名称</th><th>国家</th><th>行业</th><th>阶段</th><th>预估价值</th><th>负责人</th><th>跟进（上次 / 下次）</th><th class="text-right">操作</th></tr></thead>
    <tbody>
    ${list.map(c => {
      const fu = followUpInfo(c);
      const g = custGrade(c);
      const due = fu.due && !c.cooperating && !CLOSED_STAGES.includes(c.stage);
      const idle = daysSinceLastFollow(c);
      const pmN = (c.productMatches && c.productMatches.length) || 0;
      return `
      <tr data-id="${c.id}" class="${due ? 'row-due' : ''}" style="cursor:pointer">
        <td class="col-sel"><input type="checkbox" class="c-sel" data-id="${c.id}" ${state.crmSel.has(c.id) ? 'checked' : ''}></td>
        <td><strong>${esc(c.name)}</strong>${g ? ` <span class="badge b-rating ${ratingBadgeClass(g)}" title="评级 ${esc(g)}，每 ${ratingDays(g)} 天跟进">⭐${esc(g)}</span>` : ''}${due ? ` <span class="badge b-due">🔔 需跟进${fu.daysOverdue ? ' · 逾期' + fu.daysOverdue + '天' : ''}</span>` : ''}${c.cooperating ? ` <span class="badge b-coop">🤝 合作</span>` : ''}${pmN ? ` <span class="badge b-tag" title="已配 ${pmN} 条产品匹配">🔧${pmN}</span>` : ''}${(c.tags && c.tags.length) || c.channel ? `<div class="pill-list mt8">${c.channel ? `<span class="chip">${esc(c.channel)}</span>` : ''}${c.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}${c.nextAction ? `<div class="pill-list mt8"><span class="chip" style="border-color:var(--primary);color:var(--primary)" title="下一步动作">➡ ${esc(c.nextAction)}</span></div>` : ''}</td>
        <td>${esc(c.country || '—')}</td>
        <td>${esc(c.industry || '—')}</td>
        <td><span class="badge ${STAGE_CLASS[c.stage] || 'b-tag'}">${esc(c.stage)}</span>${c.cooperating ? ` <span class="badge b-coop">🤝</span>` : ''}${c.fit ? ` <span class="badge ${fitClass(c.fit)}">${esc(c.fit)}</span>` : ''}</td>
        <td>${c.value ? fmtNum(c.value) : '—'}</td>
        <td>${esc(c.owner || '—')}</td>
        <td>${esc(c.lastFollowUp || '—')}<div class="small mt4 ${idle >= 30 ? 'muted' : ''}">${idle >= 9999 ? '<span class="muted">从未跟进</span>' : `<span class="muted">${idle} 天没跟</span>`}</div>${fu.next ? `<div class="small muted mt4">下次 ${fu.next}</div>` : ''}</td>
        <td class="text-right nowrap">
          ${due ? `<button class="btn sm primary" data-act="follow">已跟进</button>` : ''}
          <button class="btn sm" data-act="view">查看</button>
          <button class="btn sm" data-act="edit">编辑</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table>`;

  $all('#crm-table-container tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.addEventListener('click', e => {
      if (e.target.closest('.c-sel')) return;
      if (e.target.closest('[data-act="follow"]')) { markFollowedUp(id); return; }
      if (e.target.closest('[data-act="edit"]')) { openCustomerForm(id); return; }
      openCustomerDetail(id);
    });
  });

  // 行复选框
  $all('#crm-table-container .c-sel').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) state.crmSel.add(id); else state.crmSel.delete(id);
      updateBatchBar();
      const sa = $('#crm-sel-all');
      if (sa) { const vis = getFilteredCustomers().map(c => c.id); sa.checked = vis.length > 0 && vis.every(i => state.crmSel.has(i)); }
    });
  });
  // 全选当前列表
  const selAll = $('#crm-sel-all');
  if (selAll) {
    const visibleIds = list.map(c => c.id);
    selAll.checked = visibleIds.length > 0 && visibleIds.every(id => state.crmSel.has(id));
    selAll.addEventListener('change', () => {
      if (selAll.checked) visibleIds.forEach(id => state.crmSel.add(id));
      else visibleIds.forEach(id => state.crmSel.delete(id));
      renderCrmTable(); updateBatchBar();
    });
  }
  updateCrmFilterCount(list);
  updateCoopBanner();
}

// 顶部「显示 X / Y + 当前生效的筛选条件」实时更新
function updateCrmFilterCount(list) {
  const cntEl = $('#crm-filter-count');
  if (!cntEl) return;
  const active = [];
  if (state.crmSearch.trim()) active.push('搜索「' + state.crmSearch.trim() + '」');
  if (state.crmStage !== '全部') active.push(state.crmStage);
  if (state.crmCountry) active.push(state.crmCountry);
  if (state.crmIndustry) active.push(state.crmIndustry);
  if (state.crmGrade !== '全部') active.push('评级 ' + state.crmGrade);
  if (state.crmNoFollowDays > 0) active.push('≥' + state.crmNoFollowDays + '天没跟进');
  if (state.crmFollowUp === 'due') active.push('仅需跟进');
  cntEl.innerHTML = `显示 <b>${(list || []).length}</b> / ${state.customers.length}` +
    (active.length ? `<div class="small" style="color:var(--primary)">筛选：${esc(active.join(' + '))}</div>` : '');
}

// 一键标记今天已跟进：更新最近跟进日期，重置提醒
function markFollowedUp(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  c.lastFollowUp = todayStr();
  c.updatedAt = nowISO();
  persistAll();
  renderCrm();
  toast('已标记跟进', c.name + ' · ' + c.lastFollowUp, 'ok');
}

function openCustomerForm(id) {
  const c = id ? state.customers.find(x => x.id === id) : null;
  const v = c || { name: '', website: '', country: '', industry: '', stage: '线索', source: '', owner: '', value: 0, contacts: [], tags: [], notes: [], leadSource: '', oemNumber: '', oemFitBrands: '', marketMainBrands: '' };
  const contacts = (v.contacts && v.contacts.length ? v.contacts : [{}]).map(k => contactRow(k)).join('');
  // 产品匹配：老客户若只有旧的「核心产品匹配」文本，打开编辑时自动拆成结构化条目（保存后才真正落库）
  let pmList = (v.productMatches && v.productMatches.length) ? v.productMatches.slice() : [];
  if (!pmList.length && v.coreProductMatch) pmList = extractProductMatchesFrom({ core_product_match: v.coreProductMatch });
  const pms = pmList.map(m => productMatchRow(m)).join('');
  const tags = (v.tags || []).map(t => `<span class="chip" data-tag="${esc(t)}">${esc(t)} <button data-deltag>×</button></span>`).join('');

  showModal(`
    <div class="card card-pad mb12" style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(16,185,129,0.05));border:1px dashed var(--primary)">
      <div class="card-title" style="font-size:13px">✨ AI 一键填充（粘贴 ChatGPT 输出的 JSON）</div>
      <textarea id="f-ai-json" placeholder='把 ChatGPT 给你的 JSON 直接粘到这里，点「解析填充」自动填入所有字段。示例：{"company_name":"ABC Corp","country_region":"United States","industry":"Auto Parts","website":"https://abc.com","tags":["A+客户"],"contact":{"name":"John","title":"CEO","email":"john@abc.com","phone":"+1-555-0123"}}' style="min-height:60px;font-family:Consolas,monospace;font-size:12px"></textarea>
      <div class="flex gap8 mt8">
        <button class="btn sm primary" id="f-ai-parse" type="button">⚡ 解析填充</button>
        <span class="small muted" style="align-self:center">支持：company_name / country_region / industry / website / store_listing_url / source / source_channel / <b>customer_grade</b> / development_stage / <b>development_hook</b> / <b>development_strategy</b> / <b>next_action</b> / followup_days / tags / <b>product_matches[]</b> / contacts[]（含 role·priority·credibility·linkedin）</span>
      </div>
    </div>
    <div class="field"><label>公司名称 <span class="req">*</span></label><input id="f-name" type="text" value="${esc(v.name)}"></div>
    <div class="row3">
      <div class="field"><label>国家 / 地区</label><input id="f-country" type="text" value="${esc(v.country)}"></div>
      <div class="field"><label>行业</label><input id="f-industry" type="text" value="${esc(v.industry)}"></div>
      <div class="field"><label>阶段</label><select id="f-stage">${STAGES.map(s => `<option ${v.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>官网</label><input id="f-website" type="url" value="${esc(v.website)}"></div>
      <div class="field"><label>负责人</label><input id="f-owner" type="text" value="${esc(v.owner)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>预估价值 <span class="small muted">（选填，没数据留空即可）</span></label><input id="f-value" type="number" value="${v.value !== '' && v.value != null ? v.value : ''}" placeholder="留空表示未估"></div>
      <div class="field"><label>来源</label><input id="f-source" type="text" value="${esc(v.source)}" placeholder="如：AI获客 / 展会 / 转介绍"></div>
    </div>
    <div class="row2">
      <div class="field"><label>来源渠道</label><input id="f-channel" type="text" value="${esc(v.channel || '')}" placeholder="如：行业市场 / 展会 / 转介绍"></div>
      <div class="field"><label>店铺 / 列表链接</label><input id="f-shopurl" type="url" value="${esc(v.shopUrl || '')}" placeholder="drom 店铺页、1688 店铺等（无网站商家用）"></div>
    </div>
    <div class="row2">
      <div class="field"><label>客户评级 <span class="small muted">（不同等级对应不同跟进频率：${RATINGS.map(r => r + '=' + ratingDays(r) + '天').join(' / ')}）</span></label>
        <select id="f-rating">
          <option value="">— 未评级 —</option>
          ${RATINGS.map(r => `<option value="${r}" ${v.rating === r ? 'selected' : ''}>${r}（每 ${ratingDays(r)} 天跟进）</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>自定义跟进周期（天）<span class="small muted">（留空则用评级或全局默认）</span></label><input id="f-follow-every" type="number" min="1" max="365" value="${v.followUpEvery || ''}" placeholder="${v.rating ? ratingDays(v.rating) : (state.settings.followUpDays || 14)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>最近跟进日期</label><input id="f-last-follow" type="date" value="${esc(v.lastFollowUp || '')}"></div>
      <div class="field" style="display:flex;align-items:flex-end"><span class="small muted">当前频率：<span id="f-follow-preview">${v.followUpEvery ? v.followUpEvery + '天' : (v.rating ? ratingDays(v.rating) + '天（评级' + v.rating + '）' : (state.settings.followUpDays || 14) + '天（默认）')}</span></span></div>
    </div>
    ${v.leadSource ? `<div class="field"><label>AI 线索来源说明 <span class="small muted">（AI 声称的公司/网址来源）</span></label><input id="f-lead-source" type="text" value="${esc(v.leadSource)}"></div>` : ''}
    <label class="check mt8"><input type="checkbox" id="f-cooperating" ${v.cooperating ? 'checked' : ''}> 标记为我方合作客户（已在合作 / 成交，搜索时会提醒避免重复开发）</label>
    ${v.oemNumber || v.oemFitBrands || v.marketMainBrands ? `
    <div class="card card-pad mt12" style="background:var(--panel-2)">
      <div class="card-title" style="font-size:13px">OEM 拓客信息</div>
      <div class="row3">
        <div class="field"><label>OEM 号</label><input id="f-oem-number" type="text" value="${esc(v.oemNumber || '')}" placeholder="如：U212-13-480"></div>
        <div class="field"><label>适配品牌 / 车型</label><input id="f-oem-fit" type="text" value="${esc(v.oemFitBrands || '')}"></div>
        <div class="field"><label>市场主流品牌</label><input id="f-market-brands" type="text" value="${esc(v.marketMainBrands || '')}"></div>
      </div>
    </div>` : ''}
    <div class="divider"></div>
    <div class="card card-pad" style="background:linear-gradient(135deg,rgba(99,102,241,0.05),rgba(16,185,129,0.03))">
      <div class="card-title" style="font-size:13px">🎯 开发作战信息 <span class="small muted">（固定 4 项 · 打开客户就能看到）</span></div>
      <div class="row2">
        <div class="field"><label>① 开发阶段</label>
          <select id="f-dev-stage">${STAGES.map(s => `<option ${v.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>② 开发钩子 <span class="small muted">（为什么现在联系他）</span></label>
          <input id="f-dev-hook" type="text" value="${esc(v.devHook || '')}" placeholder="如：近期在招采购、刚上架 Ford 新款、展会新客户">
        </div>
      </div>
      <div class="field"><label>③ 开发思路 <span class="small muted">（整体打法：先找谁、主打什么、报价策略）</span></label>
        <textarea id="f-dev-strategy" placeholder="整体打法、先联系谁、主打哪个产品、报价策略…">${esc(v.devStrategy || '')}</textarea>
      </div>
      <div class="field"><label>④ 下一步动作 <span class="small muted">（下一次具体做什么）</span></label>
        <input id="f-next-action" type="text" value="${esc(v.nextAction || '')}" placeholder="如：发报价单、寄样、确认 OE 号">
      </div>
    </div>
    <div class="card card-pad mt12" style="background:var(--panel-2)">
      <div class="card-title" style="font-size:13px">🔧 产品匹配 <span class="small muted">（客户产品 ↔ 昊威型号 ↔ OE，可多条）</span></div>
      <div id="f-pm">${pms}</div>
      <button class="btn sm mt8" id="f-add-pm" type="button">＋ 添加产品匹配</button>
    </div>
    <div class="field"><label>标签</label>
      <div class="tag-input" id="f-tags">${tags}<input id="f-tag-input" type="text" placeholder="输入后回车添加" style="width:140px"></div>
    </div>
    <div class="field"><label>联系人</label>
      <div id="f-contacts">${contacts}</div>
      <button class="btn sm mt8" id="f-add-contact">＋ 添加联系人</button>
    </div>
  `, { title: c ? '编辑客户' : '新增客户', foot: true });

  const foot = $('#modal-foot');
  foot.innerHTML = `<button class="btn ghost" data-close>取消</button><button class="btn primary" id="f-save">保存</button>`;
  $all('[data-close]', foot).forEach(b => b.addEventListener('click', closeModal));

  const tagArr = (v.tags || []).slice();
  function refreshTags() {
    $('#f-tags').innerHTML = tagArr.map(t => `<span class="chip" data-tag="${esc(t)}">${esc(t)} <button data-deltag>×</button></span>`).join('') + '<input id="f-tag-input" type="text" placeholder="回车添加" style="width:140px">';
    bindTagInput();
  }
  function bindTagInput() {
    const ti = $('#f-tag-input');
    ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const val = ti.value.trim(); if (val && !tagArr.includes(val)) { tagArr.push(val); refreshTags(); } } });
    $all('[data-deltag]').forEach(b => b.addEventListener('click', () => { tagArr.splice(tagArr.indexOf(b.parentElement.dataset.tag), 1); refreshTags(); }));
  }
  bindTagInput();

  // AI 解析填充：识别 ChatGPT 风格的 JSON（company_name / country_region / contact / tags 等）
  $('#f-ai-parse').addEventListener('click', () => {
    const raw = $('#f-ai-json').value.trim();
    if (!raw) { toast('提示', '请先粘贴 ChatGPT 的 JSON', 'warn'); return; }
    let obj = null;
    // 尝试 1：直接解析
    try { obj = JSON.parse(raw); } catch (e) {}
    // 尝试 2：从文本中提取 ```json ... ``` 或 第一个 {...}
    if (!obj) {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
      if (m) { try { obj = JSON.parse(m[1]); } catch (e) {} }
    }
    if (!obj || typeof obj !== 'object') { toast('解析失败', '未找到合法 JSON，请检查格式', 'err'); return; }
    const set = (id, val) => { const el = $('#' + id); if (el && val != null && val !== '' && !el.value) el.value = val; };
    const setIf = (id, val) => { const el = $('#' + id); if (el && val != null && val !== '') el.value = val; };
    // 顶层字段（兼容多种命名风格）
    setIf('f-name', obj.company_name || obj.name || obj.companyName);
    setIf('f-country', obj.country_region || obj.country || obj.countryRegion);
    setIf('f-industry', obj.industry);
    setIf('f-website', obj.website || obj.url || obj.homepage);
    setIf('f-owner', obj.owner);
    setIf('f-value', obj.estimated_value != null ? obj.estimated_value : obj.value);
    setIf('f-source', obj.source || obj.source_channel || obj.leadSource);
    setIf('f-channel', obj.source_channel || obj.channel);
    setIf('f-shopurl', obj.store_listing_url || obj.shopUrl || obj.shop_url);
    if (obj.followup_days || obj.followUpDays) { setIf('f-follow-every', obj.followup_days || obj.followUpDays); }
    if (obj.last_followup_date || obj.lastFollowUp) { setIf('f-last-follow', obj.last_followup_date || obj.lastFollowUp); }
    if (obj.oem_number) { const el = $('#f-oem-number'); if (el && !el.value) el.value = obj.oem_number; }
    if (obj.oem_fit_brands) { setIf('f-oem-fit', obj.oem_fit_brands); }
    if (obj.market_main_brands) { setIf('f-market-brands', obj.market_main_brands); }
    // 开发作战信息（新字段，兼容 dev_hook / development_hook 两种命名）
    setIf('f-dev-hook', obj.development_hook || obj.dev_hook || obj.hook || obj.devHook || obj.why_now || obj.开发钩子);
    setIf('f-next-action', obj.next_action || obj.nextAction || obj.next_step || obj.下一步动作);
    setIf('f-dev-strategy', obj.development_strategy || obj.dev_strategy || obj.strategy || obj.devStrategy || obj.approach || obj.开发思路);
    // 开发阶段（如果在 STAGES 里能匹配上就自动选；两个下拉都要同步，否则保存时会被旧值覆盖）
    const stageRaw = obj.development_stage || obj.stage || obj.dev_stage || obj.开发阶段;
    if (stageRaw) {
      const st = String(stageRaw).trim();
      const hit = STAGES.find(s => s === st || st.includes(s) || s.includes(st));
      if (hit) { ['f-stage', 'f-dev-stage'].forEach(id => { const el = $('#' + id); if (el) el.value = hit; }); }
    }
    // 客户评级（A+/A/B/C）—— 独立 customer_grade 字段，兼容多种命名
    const ratingRaw = obj.customer_grade || obj.rating || obj.customer_rating || obj.grade || obj.level || obj.客户评级 || obj.评级;
    if (ratingRaw) {
      const rr = String(ratingRaw).trim().toUpperCase().replace('＋', '+');
      let hitR = RATINGS.find(r => r === rr);
      if (!hitR) {
        // 兼容 "A+ 战略客户" / "Grade A" / "A级" 这类写法
        const m2 = rr.replace(/\s+/g, '').match(/^(A\+|A|B|C|D)/);
        if (m2 && RATINGS.includes(m2[1])) hitR = m2[1];
      }
      if (hitR) { const el = $('#f-rating'); if (el) { el.value = hitR; if (typeof updPreview === 'function') updPreview(); } }
    }
    // 标签
    if (Array.isArray(obj.tags)) {
      obj.tags.forEach(t => { if (typeof t === 'string' && !tagArr.includes(t)) tagArr.push(t); });
      refreshTags();
    }
    // 联系人：统一用 extractContactsFrom，支持 contacts/contact（单复数）、各种字段名
    const contacts = extractContactsFrom(obj);
    if (contacts.length) {
      const box = $('#f-contacts');
      if (box) {
        box.innerHTML = '';
        contacts.forEach(k => {
          const tmp = document.createElement('div');
          tmp.innerHTML = contactRow(k);
          box.appendChild(tmp.firstElementChild);
        });
        $all('#f-contacts > div').forEach(bindContact);
      }
    }
    // 产品匹配（多条）
    const pms = extractProductMatchesFrom(obj);
    if (pms.length) {
      const box = $('#f-pm');
      if (box) {
        box.innerHTML = '';
        pms.forEach(m => {
          const tmp = document.createElement('div');
          tmp.innerHTML = productMatchRow(m);
          box.appendChild(tmp.firstElementChild);
        });
        $all('#f-pm > div').forEach(bindProductMatch);
      }
    }
    const filled = ['f-name', 'f-country', 'f-website', 'f-industry'].filter(id => $('#' + id) && $('#' + id).value).length;
    toast('✓ 已填充', `共 ${filled} 个核心字段 + ${tagArr.length} 标签` +
      (contacts.length ? ` + ${contacts.length} 个联系人` : '') +
      (pms.length ? ` + ${pms.length} 条产品匹配` : ''), 'ok');
  });

  $('#f-add-contact').addEventListener('click', () => {
    const box = $('#f-contacts');
    const tmp = document.createElement('div'); tmp.innerHTML = contactRow({}); box.appendChild(tmp.firstElementChild);
    bindContact(box.lastElementChild);
  });
  $all('#f-contacts > div').forEach(bindContact);

  // 产品匹配：添加 / 删除
  $('#f-add-pm').addEventListener('click', () => {
    const box = $('#f-pm');
    const tmp = document.createElement('div'); tmp.innerHTML = productMatchRow({}); box.appendChild(tmp.firstElementChild);
    bindProductMatch(box.lastElementChild);
  });
  $all('#f-pm > div').forEach(bindProductMatch);

  // 阶段双向同步：基本信息区的 #f-stage 与作战区的 #f-dev-stage 保持一致
  const sTop = $('#f-stage'), sWar = $('#f-dev-stage');
  if (sTop && sWar) {
    sWar.value = sTop.value;
    sTop.addEventListener('change', () => { sWar.value = sTop.value; });
    sWar.addEventListener('change', () => { sTop.value = sWar.value; });
  }

  // 评级/周期变化时实时更新预览
  const updPreview = () => {
    const r = $('#f-rating').value;
    const fe = parseInt($('#f-follow-every').value, 10) || 0;
    const txt = fe ? fe + '天（自定义）' : (r ? ratingDays(r) + '天（评级' + r + '）' : (state.settings.followUpDays || 14) + '天（默认）');
    const pv = $('#f-follow-preview'); if (pv) pv.textContent = txt;
  };
  const ratingEl = $('#f-rating');
  if (ratingEl) ratingEl.addEventListener('change', updPreview);
  const feEl = $('#f-follow-every');
  if (feEl) feEl.addEventListener('input', updPreview);

  $('#f-save').addEventListener('click', () => {
    const name = $('#f-name').value.trim();
    if (!name) { toast('缺少名称', '请填写公司名称', 'err'); return; }
    const website = $('#f-website').value.trim();
    const shopUrl = $('#f-shopurl').value.trim();
    // 新建时才查重（编辑自身不算重复）
    if (!c) {
      const dup = findDupCustomer(name, website, shopUrl);
      if (dup && !confirm(`已存在同名/同网址/同店铺客户「${dup.name}」，仍要再新建一个吗？`)) return;
    }
    const contacts = $all('#f-contacts > div').map(row => ({
      name: ($('[data-c="name"]', row) || {}).value ? $('[data-c="name"]', row).value.trim() : '',
      title: ($('[data-c="title"]', row) || {}).value ? $('[data-c="title"]', row).value.trim() : '',
      email: ($('[data-c="email"]', row) || {}).value ? $('[data-c="email"]', row).value.trim() : '',
      phone: ($('[data-c="phone"]', row) || {}).value ? $('[data-c="phone"]', row).value.trim() : '',
      role: ($('[data-c="role"]', row) || {}).value ? $('[data-c="role"]', row).value.trim() : '',
      priority: ($('[data-c="prio"]', row) || {}).value ? $('[data-c="prio"]', row).value.trim() : '',
      credibility: ($('[data-c="cred"]', row) || {}).value ? $('[data-c="cred"]', row).value.trim() : '',
      linkedin: ($('[data-c="linkedin"]', row) || {}).value ? $('[data-c="linkedin"]', row).value.trim() : ''
    })).filter(k => k.name || k.email || k.phone || k.linkedin);
    const gradeVal = ($('#f-rating') && $('#f-rating').value) || '';
    const data = {
      name, website, country: $('#f-country').value.trim(),
      industry: $('#f-industry').value.trim(),
      stage: ($('#f-dev-stage') ? $('#f-dev-stage').value : $('#f-stage').value),
      owner: $('#f-owner').value.trim(),
      value: ($('#f-value').value.trim() ? (parseFloat($('#f-value').value) || 0) : ''),       source: $('#f-source').value.trim(),
      channel: $('#f-channel').value.trim(), shopUrl, cooperating: $('#f-cooperating').checked,
      rating: gradeVal,
      customerGrade: gradeVal,   // 独立评级字段（与 rating 同值，便于按等级筛选）
      followUpEvery: parseInt($('#f-follow-every').value, 10) || 0,
      lastFollowUp: ($('#f-last-follow') ? $('#f-last-follow').value : (c && c.lastFollowUp) || ''),
      contacts, tags: tagArr,
      leadSource: ($('#f-lead-source') ? $('#f-lead-source').value.trim() : (c && c.leadSource) || ''),
      oemNumber: ($('#f-oem-number') ? $('#f-oem-number').value.trim() : (c && c.oemNumber) || ''),
      oemFitBrands: ($('#f-oem-fit') ? $('#f-oem-fit').value.trim() : (c && c.oemFitBrands) || ''),
      marketMainBrands: ($('#f-market-brands') ? $('#f-market-brands').value.trim() : (c && c.marketMainBrands) || ''),
      devHook: ($('#f-dev-hook') ? $('#f-dev-hook').value.trim() : (c && c.devHook) || ''),
      coreProductMatch: (c && c.coreProductMatch) || '',   // 旧字段保留（不展示，仅兼容历史数据）
      nextAction: ($('#f-next-action') ? $('#f-next-action').value.trim() : (c && c.nextAction) || ''),
      devStrategy: ($('#f-dev-strategy') ? $('#f-dev-strategy').value.trim() : (c && c.devStrategy) || ''),
      productMatches: collectProductMatches()
    };
    if (c) { Object.assign(c, data, { updatedAt: nowISO() }); toast('已更新', name, 'ok'); }
    else { state.customers.push(Object.assign({ id: uid(), notes: [], aiReport: null, createdAt: nowISO(), updatedAt: nowISO(), lastFollowUp: '', fit: '', fitReason: '', matchReason: '', leadSource: '', oemNumber: '', oemFitBrands: '', marketMainBrands: '', productMatches: [], customerGrade: '', devHook: '', devStrategy: '', nextAction: '' }, data)); toast('已新增', name, 'ok'); }
    persistAll(); closeModal(); renderCrm();
  });
}

function contactRow(k) {
  const sel = (attr, opts, cur) => `<select data-c="${attr}"><option value="">—</option>${opts.map(o => {
    const val = Array.isArray(o) ? o[0] : o; const lab = Array.isArray(o) ? o[1] : o;
    return `<option value="${esc(val)}" ${cur === val ? 'selected' : ''}>${esc(lab)}</option>`;
  }).join('')}</select>`;
  return `<div class="contact-block">
    <div class="row2">
      <input data-c="name" type="text" placeholder="姓名" value="${esc(k.name || '')}">
      <input data-c="title" type="text" placeholder="职位" value="${esc(k.title || '')}">
    </div>
    <div class="row2">
      <input data-c="email" type="text" placeholder="邮箱" value="${esc(k.email || '')}">
      <input data-c="phone" type="text" placeholder="电话" value="${esc(k.phone || '')}">
    </div>
    <div class="row3">
      ${sel('role', CONTACT_ROLES, k.role || '')}
      ${sel('prio', CONTACT_PRIORITY, k.priority || '')}
      ${sel('cred', CONTACT_CREDIBILITY, k.credibility || '')}
    </div>
    <div class="row2">
      <input data-c="linkedin" type="text" placeholder="LinkedIn 链接 / 用户名" value="${esc(k.linkedin || '')}">
      <button type="button" class="btn sm danger contact-del" title="删除该联系人">✕ 删除</button>
    </div>
  </div>`;
}
function bindContact(row) {
  const del = row.querySelector('.contact-del');
  if (del) del.addEventListener('click', () => { row.remove(); });
}

// ---------- 产品匹配（多条，同联系人结构）----------
function productMatchRow(m) {
  const sel = (attr, opts, cur) => `<select data-m="${attr}"><option value="">—</option>${opts.map(o =>
    `<option value="${esc(o)}" ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return `<div class="contact-block pm-block">
    <div class="row2">
      <input data-m="customer_product" type="text" placeholder="客户产品（如 Prime Guard PDF76160）" value="${esc(m.customerProduct || m.customer_product || '')}">
      <input data-m="hwa_product" type="text" placeholder="昊威产品（如 HWA-068）" value="${esc(m.hwaProduct || m.hwa_product || '')}">
    </div>
    <div class="row3">
      <input data-m="oe" type="text" placeholder="OE 号（如 FD-4615 / BC3Z9N184B）" value="${esc(m.oe || '')}">
      ${sel('match_type', MATCH_TYPES, m.matchType || m.match_type || '')}
      ${sel('priority', RATINGS, m.priority || '')}
    </div>
    <div>
      <button type="button" class="btn sm danger pm-del" title="删除该条">✕ 删除</button>
    </div>
  </div>`;
}
function bindProductMatch(row) {
  const del = row.querySelector('.pm-del');
  if (del) del.addEventListener('click', () => { row.remove(); });
}
function collectProductMatches() {
  return $all('#f-pm > div').map(row => ({
    customerProduct: (($('[data-m="customer_product"]', row) || {}).value || '').trim(),
    hwaProduct: (($('[data-m="hwa_product"]', row) || {}).value || '').trim(),
    oe: (($('[data-m="oe"]', row) || {}).value || '').trim(),
    matchType: (($('[data-m="match_type"]', row) || {}).value || '').trim(),
    priority: (($('[data-m="priority"]', row) || {}).value || '').trim()
  })).filter(m => m.customerProduct || m.hwaProduct || m.oe);
}
// 从 AI / ChatGPT 返回的顶层对象里抽取产品匹配（支持数组、单对象、"A ↔ B / OE" 字符串）
function extractProductMatchesFrom(raw) {
  const out = [];
  const normType = v => {
    if (!v) return '';
    const s = String(v).trim();
    const hit = MATCH_TYPES.find(t => t === s || s.includes(t) || t.includes(s));
    return hit || s;
  };
  const normPrio = v => {
    if (!v) return '';
    const s = String(v).trim().toUpperCase().replace('＋', '+');
    const hit = RATINGS.find(r => r === s);
    if (hit) return hit;
    const m3 = s.replace(/\s+/g, '').match(/^(A\+|A|B|C|D)/);
    return (m3 && RATINGS.includes(m3[1])) ? m3[1] : s;
  };
  const pick = o => {
    if (o == null) return;
    if (typeof o === 'string') {
      let parts = o.split(/[→↔>|=]+/).map(s => s.trim()).filter(Boolean);
      // "客户产品 ↔ HWA-068 / FD-4615"：后半段含 / 时，再把 OE 拆出来
      if (parts.length === 2 && parts[1].indexOf('/') >= 0) {
        const t = parts[1].split('/').map(s => s.trim()).filter(Boolean);
        parts = [parts[0], t[0], t.slice(1).join(' / ')];
      }
      out.push({ customerProduct: parts[0] || o.trim(), hwaProduct: parts[1] || '', oe: parts[2] || '', matchType: '', priority: '' });
      return;
    }
    if (Array.isArray(o)) { o.forEach(pick); return; }
    if (typeof o === 'object') {
      const cp = o.customer_product || o.customerProduct || o.customer_product_name || o.client_product || o.product || o.客户产品 || '';
      const hp = o.hwa_product || o.hwaProduct || o.hwa_model || o.our_product || o.our_model || o.昊威产品 || o.昊威型号 || '';
      const oe = o.oe || o.oe_number || o.oeNumber || o.oem || o.oem_number || o.OE || o.oe号 || '';
      if (!cp && !hp && !oe) return;
      out.push({
        customerProduct: String(cp), hwaProduct: String(hp), oe: String(oe),
        matchType: normType(o.match_type || o.matchType || o.type || o.匹配类型 || ''),
        priority: normPrio(o.priority || o.prio || o.优先级 || '')
      });
    }
  };
  const src = raw.product_matches || raw.productMatches || raw.product_match || raw.matches || raw.products_matched || raw.产品匹配;
  // 兼容：顶层只有 core_product_match 字符串时也拆成一条
  const alt = raw.core_product_match || raw.coreProductMatch || raw.product_match_summary || raw.核心产品匹配;
  if (src) pick(src);
  if (!out.length && alt) pick(alt);
  return out;
}
// 从 AI 背调结果里抽出「评级 + 开发作战信息 + 产品匹配」，直接落到客户上
function warFieldsFromResearch(r) {
  if (!r || typeof r !== 'object') return {};
  const out = {};
  const g = String(r.customer_grade || r.customerGrade || '').trim().toUpperCase().replace('＋', '+');
  if (g && RATINGS.includes(g)) { out.customerGrade = g; out.rating = g; }
  const st = String(r.development_stage || r.stage || '').trim();
  if (st) { const hit = STAGES.find(s => s === st || st.includes(s)); if (hit) out.stage = hit; }
  ['devHook|development_hook|dev_hook', 'devStrategy|development_strategy|dev_strategy', 'nextAction|next_action']
    .forEach(spec => {
      const [key, ...alts] = spec.split('|');
      for (const a of alts) { if (r[a] != null && String(r[a]).trim()) { out[key] = String(r[a]).trim(); return; } }
    });
  const pms = extractProductMatchesFrom(r);
  if (pms.length) out.productMatches = pms;
  return out;
}

// 客户评级：独立 customer_grade 字段，向下兼容老的 rating 字段
function custGrade(c) { return (c && (c.customerGrade || c.rating)) || ''; }
// 评级徽章的 CSS 后缀：A+ → g-Aplus（避免 "+" 出现在 class 名里）
function ratingBadgeClass(g) { return 'g-' + String(g || '').replace(/\+/g, 'plus').replace(/[^a-zA-Z0-9]/g, '') || 'g-none'; }

function openCustomerDetail(id) {
  const c = state.customers.find(x => x.id === id);
  if (!c) return;
  const contacts = (c.contacts && c.contacts.length) ? c.contacts.slice().sort((a, b) => {
    const ord = { 'P1': 0, 'P2': 1, 'P3': 2 };
    return (ord[a.priority] != null ? ord[a.priority] : 9) - (ord[b.priority] != null ? ord[b.priority] : 9);
  }).map(k => `<div class="contact-detail">
    <div class="contact-detail-head">
      <strong>${esc(k.name || '—')}</strong>
      ${k.priority ? `<span class="badge ${PRIO_CLASS[k.priority] || 'b-tag'}">${esc(PRIO_LABEL[k.priority] || k.priority)}</span>` : ''}
      ${k.role ? `<span class="badge b-tag">${esc(k.role)}</span>` : ''}
      ${k.credibility ? `<span class="badge ${CRED_CLASS[k.credibility] || 'b-tag'}">${esc(k.credibility)}</span>` : ''}
    </div>
    <div class="small muted">${esc(k.title || '职位未填')}</div>
    <div class="small" style="margin-top:4px">
      ${k.email ? `<a href="mailto:${esc(k.email)}" style="color:var(--primary)">✉ ${esc(k.email)}</a>` : ''}
      ${k.phone ? `<span style="margin-left:${k.email ? '10px' : '0'}">☎ ${esc(k.phone)}</span>` : ''}
      ${k.linkedin ? `<span style="margin-left:10px"><a href="${esc(/^https?:/.test(k.linkedin) ? k.linkedin : 'https://www.linkedin.com/in/' + k.linkedin)}" target="_blank" style="color:var(--primary)">🔗 LinkedIn</a></span>` : ''}
      ${!k.email && !k.phone && !k.linkedin ? '<span class="muted">暂无联系方式</span>' : ''}
    </div>
  </div>`).join('') : '<div class="muted small">暂无联系人</div>';
  const notes = (c.notes && c.notes.length) ? c.notes.slice().reverse().map(n => `<div class="note-item"><div class="meta">${fmtDate(n.date)}</div>${esc(n.text)}</div>`).join('') : '<div class="muted small">暂无跟进记录</div>';
  // 产品匹配（多条）→「我们能卖他什么」
  const _pms = (c.productMatches && c.productMatches.length) ? c.productMatches : [];
  const pmBlock = _pms.length ? `<div class="card card-pad mt16">
      <div class="card-title">🔧 产品匹配 <span class="small muted">（客户产品 ↔ 昊威型号 ↔ OE）</span></div>
      <div class="pm-table-wrap"><table class="pm-table">
        <thead><tr><th>客户产品</th><th>昊威产品</th><th>OE 号</th><th>匹配类型</th><th>优先级</th></tr></thead>
        <tbody>${_pms.map(m => `<tr>
          <td>${esc(m.customerProduct || '—')}</td>
          <td>${m.hwaProduct ? `<b style="color:var(--primary)">${esc(m.hwaProduct)}</b>` : '—'}</td>
          <td class="mono">${esc(m.oe || '—')}</td>
          <td>${m.matchType ? `<span class="badge ${MATCH_CLASS[m.matchType] || 'b-tag'}">${esc(m.matchType)}</span>` : '—'}</td>
          <td>${m.priority ? `<span class="badge b-rating">${esc(m.priority)}</span>` : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : '';
  const report = c.aiReport ? `<div class="card card-pad mt16"><div class="card-title">🤖 AI 背调报告</div>
    ${c.aiReport.overview ? `<div class="small"><b>概况：</b>${esc(c.aiReport.overview)}</div>` : ''}
    ${c.aiReport.strengths ? `<div class="small mt8"><b>优势：</b>${esc(c.aiReport.strengths)}</div>` : ''}
    ${c.aiReport.risks ? `<div class="small mt8"><b>风险：</b>${esc(c.aiReport.risks)}</div>` : ''}
    ${c.aiReport.suggestedApproach ? `<div class="small mt8"><b>建议：</b>${esc(c.aiReport.suggestedApproach)}</div>` : ''}
  </div>` : '';

  showModal(`
    <div class="flex between items-center mb12">
      <div><h3 style="font-size:18px;margin:0">${esc(c.name)}</h3>
        <div class="muted small mt8">${esc(c.country || '')} · ${esc(c.industry || '')} · 来源：${esc(c.source || '—')}</div></div>
      <div class="flex items-center gap8">
        ${custGrade(c) ? `<span class="badge b-rating">⭐ ${esc(custGrade(c))}</span>` : ''}
        ${c.cooperating ? `<span class="badge b-coop">🤝 合作</span>` : ''}
        ${c.fit ? `<span class="badge ${fitClass(c.fit)}">${esc(c.fit)}</span>` : ''}
        <span class="badge ${STAGE_CLASS[c.stage] || 'b-tag'}">${esc(c.stage)}</span>
      </div>
    </div>
    ${c.cooperating ? `<div class="coop-banner ok">🤝 此客户已是我方合作客户（成交 / 合作中），无需重复开发。如需重新评估可点底部「取消合作」。</div>` : ''}
    <div class="kv">
      <span class="k">官网</span><span>${c.website ? `<a href="${esc(c.website)}" target="_blank" style="color:var(--primary)">${esc(c.website)}</a>` : '—'}</span>
      <span class="k">来源渠道</span><span>${esc(c.channel || '—')}</span>
      ${c.shopUrl ? `<span class="k">店铺链接</span><span><a href="${esc(c.shopUrl)}" target="_blank" style="color:var(--primary)">${esc(c.shopUrl)}</a></span>` : ''}
      ${c.leadSource ? `<span class="k">AI 线索来源</span><span>${esc(c.leadSource)}</span>` : ''}
      ${c.oemNumber ? `<span class="k">OEM 号</span><span>${esc(c.oemNumber)}</span>` : ''}
      ${c.oemFitBrands ? `<span class="k">适配品牌/车型</span><span>${esc(c.oemFitBrands)}</span>` : ''}
      ${c.marketMainBrands ? `<span class="k">市场主流品牌</span><span>${esc(c.marketMainBrands)}</span>` : ''}
      <span class="k">负责人</span><span>${esc(c.owner || '—')}</span>
      <span class="k">客户评级</span><span>${custGrade(c) ? `<span class="badge b-rating">⭐ ${esc(custGrade(c))}</span> <span class="muted small">（每 ${ratingDays(custGrade(c))} 天跟进）</span>` : '<span class="muted">未评级</span>'}</span>
      <span class="k">预估价值</span><span>${c.value ? fmtNum(c.value) : '—'}</span>
      <span class="k">最近跟进</span><span>${esc(c.lastFollowUp || '—')}</span>
      <span class="k">下次跟进</span><span>${isFollowUpDue(c) ? `<span class="badge b-due">🔔 需跟进${followUpInfo(c).daysOverdue ? ' · 逾期 ' + followUpInfo(c).daysOverdue + ' 天' : ''}</span>` : (followUpInfo(c).next ? esc(followUpInfo(c).next) : '—')}</span>
      <span class="k">创建时间</span><span>${fmtDate(c.createdAt)}</span>
    </div>
    ${c.tags && c.tags.length ? `<div class="pill-list mt12">${c.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${c.fit ? `<div class="card card-pad mt16"><div class="card-title">🎯 AI 潜力判定</div>
      <div class="small"><span class="badge ${fitClass(c.fit)}">${esc(c.fit)}</span></div>
      ${c.fitReason ? `<div class="small mt8"><b>判定依据：</b>${esc(c.fitReason)}</div>` : ''}
      ${c.matchReason ? `<div class="small mt8"><b>匹配理由：</b>${esc(c.matchReason)}</div>` : ''}
    </div>` : ''}
    ${report}
    <div class="card card-pad mt16" style="background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(16,185,129,0.04))">
      <div class="card-title">🎯 开发作战信息</div>
      <div class="war-grid">
        <div class="war-item">
          <div class="war-k">① 开发阶段</div>
          <div class="war-v"><span class="badge ${STAGE_CLASS[c.stage] || 'b-tag'}">${esc(c.stage || '—')}</span></div>
        </div>
        <div class="war-item">
          <div class="war-k">② 开发钩子</div>
          <div class="war-v">${c.devHook ? esc(c.devHook) : '<span class="muted">未填写</span>'}</div>
        </div>
        <div class="war-item war-span">
          <div class="war-k">③ 开发思路</div>
          <div class="war-v pre">${c.devStrategy ? esc(c.devStrategy) : '<span class="muted">未填写</span>'}</div>
        </div>
        <div class="war-item war-span">
          <div class="war-k">④ 下一步动作</div>
          <div class="war-v act">${c.nextAction ? esc(c.nextAction) : '<span class="muted">未填写</span>'}</div>
        </div>
      </div>
      ${c.coreProductMatch ? `<div class="small mt8 muted"><b>历史核心匹配：</b>${esc(c.coreProductMatch)}</div>` : ''}
    </div>
    ${pmBlock}
    <div class="card card-pad mt16">
      <div class="card-title">联系人 <span class="small muted">（按 P1 → P2 → P3 排序）</span></div>${contacts}
    </div>
    <div class="card card-pad mt16">
      <div class="card-title">跟进记录</div>
      <div id="d-notes">${notes}</div>
      <div class="row2 mt12">
        <input id="d-note" type="text" placeholder="添加一条跟进备注…">
        <input id="d-follow" type="date" value="${esc(c.lastFollowUp || '')}" style="max-width:160px">
      </div>
      <button class="btn sm primary mt8" id="d-addnote">添加备注</button>
      <button class="btn sm mt8" id="d-marktoday">✓ 标记今天已跟进</button>
    </div>
    <div class="row2 mt16">
      <div class="field" style="margin:0"><label>变更阶段</label>
        <select id="d-stage">${STAGES.map(s => `<option ${c.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="flex items-center gap8" style="align-self:end">
        <button class="btn ${c.cooperating ? '' : 'primary'}" id="d-coop">${c.cooperating ? '取消合作' : '🤝 标记合作'}</button>
        <button class="btn" id="d-typical">🧬 分析典型客户</button>
        <button class="btn" id="d-edit">编辑资料</button>
        <button class="btn danger" id="d-del">删除</button>
      </div>
    </div>
  `, { title: '客户详情', foot: false, wide: true });

  $('#d-addnote').addEventListener('click', () => {
    const txt = $('#d-note').value.trim();
    if (!txt) return;
    c.notes = c.notes || [];
    c.notes.push({ date: nowISO(), text: txt });
    c.lastFollowUp = $('#d-follow').value || c.lastFollowUp;
    c.updatedAt = nowISO();
    persistAll();
    $('#d-notes').innerHTML = c.notes.slice().reverse().map(n => `<div class="note-item"><div class="meta">${fmtDate(n.date)}</div>${esc(n.text)}</div>`).join('');
    $('#d-note').value = '';
    renderCrmTable();
    toast('已添加备注', '', 'ok');
  });
  $('#d-stage').addEventListener('change', e => { c.stage = e.target.value; c.updatedAt = nowISO(); persistAll(); renderCrmTable(); toast('阶段已更新', c.stage, 'ok'); });
  $('#d-marktoday').addEventListener('click', () => {
    c.lastFollowUp = todayStr(); c.updatedAt = nowISO(); persistAll();
    openCustomerDetail(c.id); renderCrmTable();
    toast('已标记跟进', c.name + ' · ' + c.lastFollowUp, 'ok');
  });
  $('#d-edit').addEventListener('click', () => openCustomerForm(c.id));
  $('#d-typical').addEventListener('click', () => analyzeTypical(c));
  $('#d-coop').addEventListener('click', () => {
    c.cooperating = !c.cooperating; c.updatedAt = nowISO();
    persistAll(); openCustomerDetail(c.id); renderCrmTable();
    toast(c.cooperating ? '已标记为合作客户' : '已取消合作标记', c.name, 'ok');
  });
  $('#d-del').addEventListener('click', () => {
    if (!confirm(`确定删除客户「${c.name}」？\n删除后会同步到云端，其他设备登录同一账号时也会消失。此操作不可撤销。`)) return;
    const r = deleteCustomers([c.id]);
    closeModal(); renderCrm();
    toast('已删除 ' + c.name, r.synced ? '已从云端同步删除' : (r.pending ? '离线中，待联网后同步删除' : ''), 'ok');
  });
}

function analyzeTypical(c) {
  const info = [
    '公司名称：' + (c.name || ''),
    '国家/地区：' + (c.country || ''),
    '行业：' + (c.industry || ''),
    '供应链角色/阶段：' + (c.stage || ''),
    '来源渠道：' + (c.channel || ''),
    '官网：' + (c.website || ''),
    '店铺链接：' + (c.shopUrl || ''),
    '适配品牌/车型：' + (c.oemFitBrands || ''),
    'OEM 号：' + (c.oemNumber || ''),
    '标签：' + (c.tags || []).join(', '),
    '预估价值：' + (c.value || ''),
    '潜力判定：' + (c.fit || '') + (c.fitReason ? ('（' + c.fitReason + '）') : ''),
    '匹配理由：' + (c.matchReason || ''),
    '跟进备注：' + (c.notes || []).slice(-3).map(n => n.text).join('；')
  ].filter(x => x.split('：')[1]).join('\n');
  const userMsg = '以下是一位典型客户的信息，请分析其画像并给出找相似客户的搜索方向：\n' + info;
  showModal('<div class="empty"><div class="big">⏳</div>AI 正在分析典型客户画像…</div>', { title: '分析典型客户', foot: false });
  callAI([{ role: 'system', content: SYS_TYPICAL }, { role: 'user', content: userMsg }], { temperature: 0.5, maxTokens: 1200 })
    .then(raw => {
      const obj = parseJson(raw);
      if (!obj || (!obj.summary && !obj.searchSuggestion)) throw new Error('AI 未返回有效画像');
      const t = obj.traits || {};
      const traitRows = [['行业', t.industry], ['国家/地区', t.country], ['经营品类', t.productType], ['规模', t.scale], ['供应链角色', t.role], ['主要渠道', t.channel], ['采购信号', t.buyingSignals]]
        .filter(r => r[1]).map(r => `<div class="kv"><span class="k">${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('');
      const ss = obj.searchSuggestion || {};
      showModal(`
        <div class="card card-pad mb12"><div class="card-title">🧬 典型客户画像</div>
          <div class="small"><b>概括：</b>${esc(obj.summary || '')}</div>
          ${traitRows ? `<div class="mt12">${traitRows}</div>` : ''}
          ${obj.whyGood ? `<div class="small mt12"><b>为什么值得复制：</b>${esc(obj.whyGood)}</div>` : ''}
        </div>
        <div class="card card-pad mb12"><div class="card-title">🔍 据此找相似客户的搜索方向</div>
          <div class="small">产品/品类：<b>${esc(ss.product || '')}</b></div>
          <div class="small mt8">市场：<b>${esc(ss.market || '')}</b> · 行业：<b>${esc(ss.industry || '')}</b> · 客户类型：<b>${esc(ss.type || '')}</b></div>
          ${ss.extra ? `<div class="small mt8">补充：<b>${esc(ss.extra)}</b></div>` : ''}
        </div>
        <div class="flex gap8">
          <button class="btn primary" id="ty-find">🔍 用此画像开发相似客户</button>
          <button class="btn ghost" data-close>关闭</button>
        </div>
      `, { title: '典型客户画像', foot: false, wide: true });
      const bindClose = () => $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
      bindClose();
      $('#ty-find').addEventListener('click', () => {
        const ss2 = obj.searchSuggestion || {};
        const typeVal = (ss2.type && ss2.type.indexOf('零售') >= 0) ? 'retailer'
          : (ss2.type && (ss2.type.indexOf('批发') >= 0 || ss2.type.indexOf('分销') >= 0)) ? 'distributor' : 'importer';
        state.leadForm = {
          mode: 'product',
          product: ss2.product || (c.industry || ''),
          market: ss2.market || (c.country || ''),
          industry: ss2.industry || (c.industry || ''),
          count: '8',
          type: typeVal,
          channel: '',
          extra: ss2.extra || ('参考典型客户：' + (c.name || '') + (t.role ? ('，角色：' + t.role) : '')),
          oem: '', oemFit: ''
        };
        closeModal();
        state.view = 'lead';
        render();
        setTimeout(() => { const btn = document.getElementById('lead-run'); if (btn) btn.click(); }, 30);
      });
      // 存一份到客户资料，便于回看
      c.typicalProfile = obj; persistAll();
    })
    .catch(e => {
      showModal(`<div class="empty"><div class="big">⚠</div>${esc(e.message || '分析失败')}</div><div style="margin-top:12px"><button class="btn primary" data-close>关闭</button></div>`, { title: '分析失败', foot: false });
      $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    });
}

// =========================================================
// 日历模块（节日问候 + Todo 待办提醒）
// =========================================================
// 数据模型：
//   state.calendar = { todos: [{id, text, date, done, prio, note}], customHolidays: [{id, m, d, name, regions, note, year?}] }
//   内置节日 BUILTIN_HOLIDAYS 为静态库，按公历月日匹配（部分按"预计/第几个周X"标注，仅作提醒参考）
const CAL_MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const CAL_WEEK = ['日','一','二','三','四','五','六'];

// 计算某年某月第几个周X的具体日期，若不存在返回 null（如第5个周日）
function nthWeekdayDate(y, m, which, dow) {
  // dow: 0=周日...6=周六；which: 1..5
  const first = new Date(y, m - 1, 1);
  const firstDow = first.getDay();
  let diff = (dow - firstDow + 7) % 7;
  const day = 1 + diff + (which - 1) * 7;
  const d = new Date(y, m - 1, day);
  if (d.getMonth() !== m - 1) return null;
  return day;
}
// 判断日期是否命中某个内置节日（处理"第几个周X"和固定月日）
function matchHoliday(h, y, m, d) {
  if (typeof h.d === 'number' && h.d >= 1 && h.d <= 31 && h.m === m) {
    // 固定月日
    if (d === h.d) return true;
  }
  // "第几个周X"格式：如 { m, nthWeek, dow } 或内置里用 note 标注不精确处理
  if (h.m === m && h.nthWeek && h.nthWeek >= 1 && h.nthWeek <= 5 && h.dow !== undefined) {
    const day = nthWeekdayDate(y, m, h.nthWeek, h.dow);
    if (day === d) return true;
  }
  return false;
}
// 扩展内置节日库，为"第几个周X"的节日补上准确年份日期匹配规则
function expandBuiltin() {
  // 对几个美国浮动节日补上 nthWeek/dow 规则（在 renderCalendar 时用 matchHoliday 计算）
  const extra = [
    { m: 1, nthWeek: 3, dow: 1, name: '马丁·路德·金日', regions: '美国', emoji: '✊', note: 'MLK Day（1月第3个周一）' },
    { m: 2, nthWeek: 3, dow: 1, name: '总统日', regions: '美国', emoji: '🇺🇸', note: "Presidents' Day（2月第3个周一）" },
    { m: 5, nthWeek: 5, dow: 1, name: '阵亡将士纪念日', regions: '美国', emoji: '🪖', note: 'Memorial Day（5月最后周一）' },
    { m: 9, nthWeek: 1, dow: 1, name: '劳动节', regions: '美国/加拿大', emoji: '🛠️', note: 'Labor Day（9月第1个周一）' },
    { m: 11, nthWeek: 4, dow: 4, name: '感恩节', regions: '美国', emoji: '🦃', note: 'Thanksgiving（11月第4个周四）' }
  ];
  // 合并：内置库里已有同名的，用 extra 覆盖（补 nthWeek/dow）
  const map = new Map();
  BUILTIN_HOLIDAYS.forEach(h => { const k = h.m + '-' + h.name; map.set(k, Object.assign({}, h)); });
  extra.forEach(h => { const k = h.m + '-' + h.name; const base = map.get(k) || {}; map.set(k, Object.assign({}, base, h)); });
  return Array.from(map.values());
}

// 计算某年某月某日是周几偏移（0=周日）
function dayOfWeek(y, m, d) { return new Date(y, m - 1, d).getDay(); }

// 当月所有"节日"（内置 + 自定义 + 到期 Todo），用于日历格渲染
function calDayItems(y, m, d) {
  const items = [];
  const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const holidays = expandBuiltin().concat(state.calendar.customHolidays || []);
  holidays.forEach(h => {
    if (matchHoliday(h, y, m, d)) {
      items.push({ type: 'holiday', name: h.name, regions: h.regions || '', emoji: h.emoji || '🎉', note: h.note || '', custom: !!(h.id && h.custom) });
    }
  });
  // Todo：按日期匹配（date 字段为 YYYY-MM-DD），不含已完成的
  (state.calendar.todos || []).forEach(t => {
    if (t.date && t.date.slice(0,10) === dateStr) {
      items.push({ type: 'todo', text: t.text, id: t.id, done: !!t.done, prio: t.prio || 0 });
    }
  });
  return items;
}

// 判断某天是否有"需要弹窗提醒"的事件（今天）
function calTodayEvents() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  return calDayItems(y, m, d);
}

// 打开时弹窗提醒：今天有节日或到期 Todo 则弹窗（每个日期会话内只弹一次）
function calCheckNotify() {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    if (state.calDoneNotified && state.calDoneNotified[dateStr]) return;
    const items = calTodayEvents();
    if (!items.length) return;
    const hol = items.filter(i => i.type === 'holiday');
    const todos = items.filter(i => i.type === 'todo');
    const rows = [];
    hol.forEach(h => rows.push(`<div class="cal-notify-row">${h.emoji || '🎉'} <b>${esc(h.name)}</b> <span class="muted">${esc(h.regions || '')}</span><div class="small muted">${esc(h.note || '')}${h.note && h.note.includes('预计') ? ' — 建议核对具体日期' : ''}</div></div>`));
    todos.forEach(t => {
      const orig = (state.calendar.todos || []).find(x => x.id === t.id);
      const cust = orig && orig.custId && (state.customers || []).find(x => x.id === orig.custId);
      rows.push(`<div class="cal-notify-row">${t.done ? '✅' : '📌'} <b>${esc(t.text)}</b> ${cust ? `<span class="cal-notify-cust">👤 ${esc(cust.name)}</span>` : ''} <span class="small ${t.prio ? 'warn' : 'muted'}">${t.prio === 1 ? '重要' : t.prio === 2 ? '紧急' : ''}</span></div>`);
    });
    const title = hol.length ? (hol[0].emoji + ' ' + hol[0].name) : '📌 待办提醒';
    showModal(`<div class="cal-notify">${rows.join('')}</div>
      <div class="flex gap8 mt12" style="justify-content:flex-end">
        ${todos.length ? `<button class="btn primary" id="cal-notify-goto">去日历处理</button>` : ''}
        <button class="btn" data-close>知道了</button>
      </div>`, { title: '🔔 ' + title + (hol.length ? ' · 记得给客户发节日问候' : ''), foot: false });
    $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    const gotoBtn = $('#cal-notify-goto');
    if (gotoBtn) gotoBtn.addEventListener('click', () => { closeModal(); state.view = 'calendar'; render(); });
    if (!state.calDoneNotified) state.calDoneNotified = {};
    state.calDoneNotified[dateStr] = true;
  } catch (e) {}
}

// 渲染日历视图
function renderCalendar() {
  const now = new Date();
  const y = (state.calMonth && state.calMonth.y) ? state.calMonth.y : now.getFullYear();
  const m = (state.calMonth && state.calMonth.m) ? state.calMonth.m : now.getMonth() + 1;
  // 边界处理
  const firstDay = new Date(y, m - 1, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const viewStr = `${y}-${String(m).padStart(2,'0')}`;

  // 该月所有待办 & 节日（用于统计）
  const todosInMonth = (state.calendar.todos || []).filter(t => t.date && t.date.slice(0,7) === viewStr);
  const openTodos = todosInMonth.filter(t => !t.done);
  const doneTodos = todosInMonth.filter(t => t.done);
  // 全部未完成待办（列表区用）
  const allOpenTodos = (state.calendar.todos || []).filter(t => !t.done);
  // 全部已完成待办（折叠展示，避免"事项消失"的错觉）
  const allDoneTodos = (state.calendar.todos || []).filter(t => t.done);

  // 生成日历格
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = calDayItems(y, m, d);
    const isToday = ds === todayStr;
    const isWeekend = (dayOfWeek(y, m, d) === 0 || dayOfWeek(y, m, d) === 6);
    const holNames = items.filter(i => i.type === 'holiday').map(i => i.emoji + i.name).join('<br>');
    const todoDots = items.filter(i => i.type === 'todo');
    const hasTodo = todoDots.length > 0;
    const hasOpenTodo = todoDots.some(t => !t.done);
    let dotHtml = '';
    if (holNames) dotHtml += `<div class="cal-hol">${holNames}</div>`;
    if (hasTodo) dotHtml += `<div class="cal-dots">${todoDots.map(t => t.done ? '✅' : '📌').join(' ')}${todoDots.filter(t=>!t.done).length ? `<span class="cal-dot-count">${todoDots.filter(t=>!t.done).length}</span>` : ''}</div>`;
    cells += `<div class="cal-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" data-date="${ds}">
      <div class="cal-dnum">${d}</div>
      <div class="cal-events">${dotHtml}</div>
    </div>`;
  }

  // 侧边列表：本月节日 + 待办
  const holList = expandBuiltin().concat(state.calendar.customHolidays || []).filter(h => {
    // 判断该节日的公历参考月是否落在当前月
    if (h.m === m) return true;
    return false;
  }).sort((a, b) => (a.d || 99) - (b.d || 99));

  const todoListHtml = allOpenTodos.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).map(t => `
    <div class="cal-todo-item ${t.prio ? 'prio' + t.prio : ''}" data-todo="${t.id}">
      <label class="check" style="flex:1;min-width:0">
        <input type="checkbox" class="cal-todo-done" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="cal-todo-text">${esc(t.text)}${t.custId ? `<a class="cal-todo-cust" data-cust="${esc(t.custId)}" title="打开客户跟进记录">👤 ${esc(t.custName || '客户')}</a>` : ''}</span>
      </label>
      <span class="cal-todo-date">${t.date ? t.date.slice(5) : '未设'}</span>
      <button class="icon-btn sm cal-todo-edit" data-id="${t.id}" title="编辑">✎</button>
      <button class="icon-btn sm cal-todo-del" data-id="${t.id}" title="删除">✕</button>
    </div>`).join('') || '<div class="empty small">暂无待办，点击右上角"添加待办"</div>';

  // 已完成待办列表（折叠展示，倒序 = 最近完成的在最上）
  const doneListHtml = allDoneTodos.slice().sort((a, b) => (b.doneAt || b.updatedAt || '').localeCompare(a.doneAt || a.updatedAt || '')).map(t => `
    <div class="cal-todo-item done ${t.prio ? 'prio' + t.prio : ''}" data-todo="${t.id}">
      <label class="check" style="flex:1;min-width:0">
        <input type="checkbox" class="cal-todo-done" data-id="${t.id}" checked>
        <span class="cal-todo-text" style="text-decoration:line-through;opacity:.6">${esc(t.text)}${t.custId ? `<a class="cal-todo-cust" data-cust="${esc(t.custId)}" title="打开客户跟进记录">👤 ${esc(t.custName || '客户')}</a>` : ''}</span>
      </label>
      <span class="cal-todo-date">${t.date ? t.date.slice(5) : '未设'}</span>
      <button class="icon-btn sm cal-todo-edit" data-id="${t.id}" title="编辑">✎</button>
      <button class="icon-btn sm cal-todo-del" data-id="${t.id}" title="删除">✕</button>
    </div>`).join('') || '<div class="empty small">暂无已完成事项</div>';

  // 本月自定义节日
  const customInMonth = (state.calendar.customHolidays || []).filter(h => h.m === m);

  main.innerHTML = `
  <div class="page-head">
    <div><h2>日历</h2><div class="sub">目标市场节日问候 + Todo 待办提醒</div></div>
    <div class="flex gap8">
      <button class="btn primary" id="cal-add-todo">+ 添加待办</button>
      <button class="btn" id="cal-add-holiday">+ 自定义节日</button>
    </div>
  </div>

  <div class="cal-layout">
    <div class="cal-main">
      <div class="card card-pad">
        <div class="card-title">
          <span class="cal-title">${y}年 ${CAL_MONTHS[m-1]}</span>
          <span class="flex gap8">
            <button class="btn sm" id="cal-prev">‹ 上月</button>
            <button class="btn sm" id="cal-now">今月</button>
            <button class="btn sm" id="cal-next">下月 ›</button>
          </span>
        </div>
        <div class="cal-grid">
          ${CAL_WEEK.map(w => `<div class="cal-whead">${w}</div>`).join('')}
          ${cells}
        </div>
        <div class="cal-legend mt8 small muted">
          🎉 节日问候 &nbsp; 📌 待办事项 &nbsp; <span class="today-legend">●</span> 今天
        </div>
      </div>
    </div>

    <div class="cal-side">
      <div class="card card-pad mb12">
        <div class="card-title">📌 待办事项
          <button class="btn sm primary" id="cal-add-todo-side">添加</button>
        </div>
        <div class="cal-todo-list">${todoListHtml}</div>
        <div class="small muted mt8">本月：${openTodos.length} 未完成 · ${doneTodos.length} 已完成</div>
        ${allDoneTodos.length ? `<details class="cal-done-details" ${state.calDoneOpen ? 'open' : ''}>
          <summary class="cal-done-summary">✅ 已完成（${allDoneTodos.length}）<span class="muted small">点击展开</span></summary>
          <div class="cal-todo-list cal-done-list">${doneListHtml}</div>
        </details>` : ''}
      </div>

      <div class="card card-pad mb12">
        <div class="card-title">🎉 ${CAL_MONTHS[m-1]}节日
          <button class="btn sm" id="cal-add-holiday-side">自定义</button>
        </div>
        <div class="cal-hol-list">
          ${holList.map(h => `<div class="cal-hol-item"><span>${h.emoji || '🎉'}</span><b>${esc(h.name)}</b><span class="muted small">${esc(h.regions || '')}</span>${h.id ? `<button class="icon-btn sm cal-hol-del" data-id="${h.id}" title="删除">✕</button>` : ''}</div>`).join('') || '<div class="empty small">本月无内置节日，可点"自定义"添加</div>'}
        </div>
      </div>

      <div class="card card-pad">
        <div class="card-title">💡 节日问候小贴士</div>
        <div class="small muted" style="line-height:1.7">
          在客户所在国的重要节日（圣诞节、感恩节、开斋节、宋干节等）前 1–2 天发送问候邮件，能显著提升客户粘性。可在 <a href="#" data-go="crm">客户管理</a> 中按国家筛选客户，集中发送。<br><br>
          <b>注意：</b>中东节日（开斋节/宰牲节）按伊斯兰历每年浮动，内置为"预计"日期，请发送前核对当年确切日期。
        </div>
      </div>
    </div>
  </div>`;

  // ---- 事件绑定 ----
  const setMonth = (ny, nm) => {
    if (nm < 1) { nm = 12; ny--; } else if (nm > 12) { nm = 1; ny++; }
    state.calMonth = { y: ny, m: nm };
    renderCalendar();
  };
  $('#cal-prev').addEventListener('click', () => setMonth(y, m - 1));
  $('#cal-next').addEventListener('click', () => setMonth(y, m + 1));
  $('#cal-now').addEventListener('click', () => { state.calMonth = { y: now.getFullYear(), m: now.getMonth() + 1 }; renderCalendar(); });

  // 点击某天 → 查看当天详情（含新增待办快捷入口）
  $all('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const ds = cell.dataset.date;
      const items = calDayItems(Number(ds.slice(0,4)), Number(ds.slice(5,7)), Number(ds.slice(8,10)));
      if (!items.length) { calAddTodo(ds); return; }
      openCalDay(ds);
    });
  });

  // 添加待办
  const addTodoBind = (btn) => btn && btn.addEventListener('click', () => calAddTodo(viewStr + '-01'));
  addTodoBind($('#cal-add-todo'));
  addTodoBind($('#cal-add-todo-side'));

  // 自定义节日
  const addHolBind = (btn) => btn && btn.addEventListener('click', () => calAddHoliday(y, m));
  addHolBind($('#cal-add-holiday'));
  addHolBind($('#cal-add-holiday-side'));

  // 待办操作：勾选 / 编辑 / 删除
  $all('.cal-todo-done').forEach(cb => cb.addEventListener('change', () => {
    const t = state.calendar.todos.find(x => x.id === cb.dataset.id);
    if (t) {
      const wasDone = t.done;
      t.done = cb.checked;
      t.doneAt = cb.checked ? nowISO() : '';
      t.updatedAt = nowISO();
      // 勾选完成 + 关联了客户 → 自动往客户跟进记录追加备注（仅首次完成时写入，取消后再勾选不重复）
      if (cb.checked && !wasDone && t.custId && !t.custNotedAt) {
        noteTodoToCustomer(t);
      }
      persistAll(); syncCal();
    }
    renderCalendar();
  }));
  $all('.cal-todo-edit').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); calAddTodo(null, b.dataset.id); }));
  $all('.cal-todo-del').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const t = state.calendar.todos.find(x => x.id === b.dataset.id);
    if (!t) return;
    if (confirm('确定删除待办「' + t.text + '」？')) {
      state.calendar.todos = state.calendar.todos.filter(x => x.id !== b.dataset.id);
      persistAll(); syncCal(); renderCalendar();
    }
  }));
  // 待办关联客户标签 → 打开客户跟进记录
  $all('.cal-todo-cust').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const cid = a.dataset.cust;
    if (cid && (state.customers || []).find(x => x.id === cid)) openCustomerDetail(cid);
    else toast('提示', '该客户已不存在或已被删除', 'warn');
  }));
  // 自定义节日删除
  $all('.cal-hol-del').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const h = (state.calendar.customHolidays || []).find(x => x.id === b.dataset.id);
    if (!h) return;
    if (confirm('删除自定义节日「' + h.name + '」？')) {
      state.calendar.customHolidays = state.calendar.customHolidays.filter(x => x.id !== b.dataset.id);
      persistAll(); syncCal(); renderCalendar();
    }
  }));
}

// 打开某天的详情弹窗（显示当天节日 + 待办）
function openCalDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const items = calDayItems(y, m, d);
  const dateLabel = `${y}年${m}月${d}日`;
  const holRows = items.filter(i => i.type === 'holiday').map(h => `
    <div class="cal-day-row">${h.emoji || '🎉'} <b>${esc(h.name)}</b> <span class="muted small">${esc(h.regions || '')}</span>
      <div class="small muted">${esc(h.note || '')}${h.note && h.note.includes('预计') ? ' — 请核对当年日期' : ''}</div>
    </div>`).join('') || '<div class="empty small">当天无节日</div>';
  const todoRows = items.filter(i => i.type === 'todo').map(t => `
    <div class="cal-day-row">${t.done ? '✅' : '📌'} <b>${esc(t.text)}</b> <span class="small ${t.prio ? 'warn' : 'muted'}">${t.prio === 1 ? '重要' : t.prio === 2 ? '紧急' : ''}</span></div>`).join('') || '<div class="empty small">当天无待办</div>';
  showModal(`<div class="cal-day">
    <div class="cal-day-section"><div class="card-title" style="margin-bottom:8px">🎉 节日</div>${holRows}</div>
    <div class="cal-day-section"><div class="card-title" style="margin-bottom:8px">📌 待办</div>${todoRows}
      <button class="btn sm mt8" id="cal-day-add-todo">+ 给这天添加待办</button>
    </div>
  </div>`, { title: dateLabel, foot: false });
  $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  $('#cal-day-add-todo').addEventListener('click', () => { closeModal(); calAddTodo(dateStr); });
}

// 添加/编辑待办弹窗
// 待办完成时，向关联客户追加跟进备注
function noteTodoToCustomer(t) {
  try {
    const c = (state.customers || []).find(x => x.id === t.custId);
    if (!c) return;
    const doneDate = toDateStr(new Date());
    let txt = `✅ 待办完成：${t.text}`;
    if (t.date) txt += `（原定 ${t.date.slice(0,10)}）`;
    if (t.note) txt += `｜备注：${t.note}`;
    txt += `｜完成于 ${doneDate}`;
    c.notes = c.notes || [];
    c.notes.push({ date: nowISO(), text: txt, fromTodo: true, todoId: t.id, todoDoneAt: doneDate });
    c.lastFollowUp = toDateStr(new Date());
    c.updatedAt = nowISO();
    t.custNotedAt = nowISO(); // 防重复备注
    persistAll();
    toast('已完成并记入客户跟进记录', c.name, 'ok');
  } catch (e) {}
}

// 添加/编辑待办弹窗
function calAddTodo(defaultDate, editId) {
  const t = editId ? (state.calendar.todos.find(x => x.id === editId) || null) : null;
  const d = t ? (t.date || '') : (defaultDate || '');
  // datalist 候选：value 用客户名称，便于按名称搜索匹配（国别作辅助提示）
  const custOpts = (state.customers || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => `<option value="${esc(c.name)}">${esc(c.country ? '📍' + c.country : '')}${esc(c.industry || '')}${c.cooperating ? ' [已合作]' : ''}</option>`).join('');
  showModal(`
    <div class="field"><label>待办内容 <span class="req">*</span></label><input id="ct-text" type="text" value="${esc(t ? t.text : '')}" placeholder="如：给美国客户发感恩节问候"></div>
    <div class="row2">
      <div class="field"><label>日期 <span class="req">*</span></label><input id="ct-date" type="date" value="${esc(d.slice(0,10))}"></div>
      <div class="field"><label>优先级</label>
        <select id="ct-prio">
          <option value="0" ${!t || !t.prio ? 'selected' : ''}>普通</option>
          <option value="1" ${t && t.prio === 1 ? 'selected' : ''}>重要</option>
          <option value="2" ${t && t.prio === 2 ? 'selected' : ''}>紧急</option>
        </select>
      </div>
    </div>
    <div class="field"><label>关联客户 <span class="muted small">（输入客户名称搜索，可选；完成后自动备注到该客户跟进记录）</span></label>
      <input id="ct-cust" list="ct-cust-list" placeholder="输入客户名称搜索，或从下拉选择…" value="${esc(t && t.custId ? (t.custName || '') : '')}" autocomplete="off">
      <input type="hidden" id="ct-cust-id" value="${esc(t && t.custId ? t.custId : '')}">
      <datalist id="ct-cust-list">${custOpts}</datalist>
      <div class="small muted mt4">已关联：<span id="ct-cust-display">${t && t.custName ? esc(t.custName) : '未关联客户'}</span></div>
    </div>
    <div class="field"><label>备注</label><textarea id="ct-note" placeholder="可选">${esc(t ? (t.note || '') : '')}</textarea></div>
    <div class="help" style="margin-top:6px">到期当天打开应用会弹窗提醒；勾选完成时，若已关联客户，将自动在客户 CRM 的「跟进记录」里追加一条备注。</div>
  `, { title: editId ? '编辑待办' : '添加待办' });
  $('#modal-foot').innerHTML = `<button class="btn" data-close>取消</button><button class="btn primary" id="ct-save">保存</button>`;
  $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  $('#ct-save').addEventListener('click', () => {
    const text = $('#ct-text').value.trim();
    const date = $('#ct-date').value;
    const prio = Number($('#ct-prio').value || 0);
    // 关联客户：datalist 用"客户名称"作为候选值，输入名称后按名称精确匹配；同时兼容隐藏的 id（若用户未改则沿用）
    const custNameInput = $('#ct-cust').value.trim();
    let custId = '';
    let custName = '';
    if (custNameInput) {
      const matched = (state.customers || []).find(c => c.name === custNameInput);
      if (matched) { custId = matched.id; custName = matched.name; }
      else {
        // 名称不精确匹配时，尝试用已保存的隐藏 id（编辑未改名场景）
        const hid = $('#ct-cust-id').value;
        const hidCust = hid ? (state.customers.find(c => c.id === hid) || null) : null;
        if (hidCust && hidCust.name === custNameInput) { custId = hid; custName = hidCust.name; }
        else toast('提示', '未找到客户「' + custNameInput + '」，请从下拉列表中选择', 'warn');
      }
    }
    const note = $('#ct-note').value.trim();
    if (!text) { toast('提示', '请输入待办内容', 'warn'); return; }
    if (!date) { toast('提示', '请选择日期', 'warn'); return; }
    if (editId) {
      const x = state.calendar.todos.find(x => x.id === editId);
      if (x) { x.text = text; x.date = date; x.prio = prio; x.custId = custId; x.custName = custName; x.note = note; x.updatedAt = nowISO(); }
    } else {
      state.calendar.todos.push({ id: uid(), text, date, prio, custId, custName, note, done: false, createdAt: nowISO(), updatedAt: nowISO() });
    }
    persistAll(); syncCal();
    closeModal(); renderCalendar();
    toast(editId ? '待办已更新' : '待办已添加', '', 'ok');
  });
}

// 添加自定义节日弹窗
function calAddHoliday(y, m) {
  showModal(`
    <div class="field"><label>节日名称 <span class="req">*</span></label><input id="ch-name" type="text" placeholder="如：XX国独立日"></div>
    <div class="row2">
      <div class="field"><label>月份 <span class="req">*</span></label><select id="ch-m">${CAL_MONTHS.map((mn, i) => `<option value="${i+1}" ${(i+1)===m ? 'selected' : ''}>${i+1}月 ${mn}</option>`).join('')}</select></div>
      <div class="field"><label>日期 <span class="req">*</span></label><input id="ch-d" type="number" min="1" max="31" placeholder="1-31"></div>
    </div>
    <div class="field"><label>覆盖国家/地区</label><input id="ch-regions" type="text" placeholder="如：美国、加拿大"></div>
    <div class="field"><label>备注</label><input id="ch-note" type="text" placeholder="如：记得发圣诞问候"></div>
  `, { title: '添加自定义节日' });
  $('#modal-foot').innerHTML = `<button class="btn" data-close>取消</button><button class="btn primary" id="ch-save">保存</button>`;
  $all('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  $('#ch-save').addEventListener('click', () => {
    const name = $('#ch-name').value.trim();
    const mm = Number($('#ch-m').value);
    const dd = Number($('#ch-d').value);
    const regions = $('#ch-regions').value.trim();
    const note = $('#ch-note').value.trim();
    if (!name) { toast('提示', '请输入节日名称', 'warn'); return; }
    if (!dd || dd < 1 || dd > 31) { toast('提示', '请输入有效日期(1-31)', 'warn'); return; }
    state.calendar.customHolidays.push({ id: uid(), m: mm, d: dd, name, regions, note, custom: true, createdAt: nowISO() });
    persistAll(); syncCal();
    closeModal(); renderCalendar();
    toast('节日已添加', name, 'ok');
  });
}

// 同步日历数据到云端（接入 CloudBase）
function syncCal() {
  // 关键：每次日历数据变化都刷新本地 updatedAt，避免云端旧数据覆盖本地新待办
  state.calendar.updatedAt = nowISO();
  try { if (window.__ftCloud && window.__ftCloud.pushCalendar) window.__ftCloud.pushCalendar(); } catch (e) {}
}

// 同步配置数据到云端（公司画像 + API Key + 连接配置，跨设备）
function syncSettings() {
  try { if (window.__ftCloud && window.__ftCloud.pushSettings) window.__ftCloud.pushSettings(); } catch (e) {}
}

// 应用云端拉取到的配置到本地（公司画像 / API Key / 连接配置）
// 云端配置比本地新时，由 pg-sync 的 onSettings 回调触发
function applyCloudSettings(remoteCfg) {
  try {
    if (!remoteCfg || typeof remoteCfg !== 'object') return;
    // 保护用户本地的新增字段：ratingDays/followUpDays 不应被云端旧数据覆盖
    // 用本地和远程中"非空对象"较完整的一份（ratingDays/followUpDays 字段特殊处理）
    const local = state.settings || {};
    const merged = Object.assign({}, local, remoteCfg);
    // 合并 ratingDays：取两边都有 key 的较新值（这里都用"非空"优先，避免云端空对象清掉本地自定义）
    if (remoteCfg.ratingDays || local.ratingDays) {
      const lr = local.ratingDays || {};
      const rr = remoteCfg.ratingDays || {};
      const ratingDaysMerged = Object.assign({}, lr, rr);
      // 如果云端把某个评级的值"故意清空"了（值为 0/空），保留本地
      RATINGS.forEach(r => {
        const rv = rr[r];
        if (rv == null || rv === '' || rv === 0) {
          if (lr[r] != null) ratingDaysMerged[r] = lr[r];
        }
      });
      merged.ratingDays = ratingDaysMerged;
    }
    state.settings = merged;
    // 回写 localStorage，让其他页面也能读取
    try {
      const cur = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      Object.assign(cur, remoteCfg);
      // 同步合并后的 ratingDays
      if (merged.ratingDays) cur.ratingDays = merged.ratingDays;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cur));
    } catch (e) {}
    // 应用主题（如果云端改了主题）
    applyTheme(state.settings.theme);
    updateAiStatus();
    // 通知连接模块更新环境 ID（如果云端有连接配置且本地未连接）
    if (remoteCfg.cloudEnvId && window.__ftCloud) {
      const cur = window.__ftCloud.getConfig();
      if (!cur.envId) {
        try {
          window.__ftCloud.saveConfig(remoteCfg.cloudEnvId, remoteCfg.cloudRegion || 'ap-shanghai');
          // 本地自动连接，从而开始同步数据（客户/日历/待办）
          window.__ftCloud.connect().then(r => {
            if (r.ok && window.__ftCloud.startPolling) window.__ftCloud.startPolling();
          });
        } catch (e) {}
      }
    }
    // 刷新当前展示页（dash/crm/calendar），让画像/连接状态生效
    if (state.view === 'dashboard' || state.view === 'crm' || state.view === 'calendar' || state.view === 'settings') {
      state._skipScrollReset = true;
      render();
    }
  } catch (e) {}
}

// =========================================================
// 设置
// =========================================================
function renderSettings() {
  const s = state.settings;
  const p = state.settings.profile || {};
  main.innerHTML = `
  <div class="page-head"><div><h2>设置</h2><div class="sub">配置大模型 API、填写我方公司画像、管理本地数据</div></div></div>

  <div class="card card-pad mb12">
    <div class="card-title">我方公司画像
      <button class="btn sm primary" id="st-ai-profile" style="margin-left:auto">🤖 AI 分析我的公司</button>
    </div>
    <div class="row2">
      <div class="field"><label>公司名称</label><input id="pf-name" type="text" value="${esc(p.name)}" placeholder="如：深圳市 XXX 科技有限公司"></div>
      <div class="field"><label>官网 / 网店</label><input id="pf-website" type="url" value="${esc(p.website)}" placeholder="https://..."></div>
    </div>
    <div class="field"><label>主营产品</label><textarea id="pf-products" placeholder="一行一个或逗号分隔，如：太阳能灯、户外家具">${esc(p.products)}</textarea></div>
    <div class="row2">
      <div class="field"><label>我们的优势</label><textarea id="pf-advantages" placeholder="如：价格优势、交期快、有 CE 认证、可定制…">${esc(p.advantages)}</textarea></div>
      <div class="field"><label>我们的畅销品</label><textarea id="pf-bestsellers" placeholder="如：折叠桌、露营椅…">${esc(p.bestSellers)}</textarea></div>
    </div>
    <div class="flex gap8 wrap">
      <button class="btn primary" id="pf-save">保存画像</button>
      <span class="muted small" style="align-self:center">画像只用于让 AI 更精准地匹配、判断客户——不投喂训练、不上传云端。</span>
    </div>
    <div id="pf-msg" class="help" style="margin-top:8px"></div>
  </div>

  <div class="grid cols-2">
    <div class="card card-pad">
      <div class="card-title">大模型 API 与搜索引擎</div>
      <div class="field"><label>模型服务商（一键切换）</label>
        <select id="st-provider">
          <option value="custom" ${!s.provider || s.provider === 'custom' ? 'selected' : ''}>自定义</option>
          <option value="deepseek" ${s.provider === 'deepseek' ? 'selected' : ''}>DeepSeek（默认·便宜）</option>
          <option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>OpenAI / ChatGPT</option>
        </select>
      </div>
      <div class="help" id="st-provider-hint"></div>
      <div class="field"><label>API Base URL</label><input id="st-base" type="text" value="${esc(s.apiBase)}"></div>
      <div class="field"><label>API Key <span class="req">*</span></label><input id="st-key" type="password" value="${esc(s.apiKey)}" placeholder="sk-..."></div>
      <div class="row2">
        <div class="field"><label>模型</label><input id="st-model" type="text" value="${esc(s.model)}" placeholder="gpt-4o"></div>
        <div class="field"><label>温度</label><input id="st-temp" type="number" step="0.1" min="0" max="1" value="${s.temperature}"></div>
      </div>
      <div class="divider"></div>
      <div class="field"><label>搜索引擎 <span class="small muted">（Web 版仅支持 Tavily / Google，数据保存在浏览器本地）</span></label>
        <select id="st-search-engine">
          <option value="none" ${s.searchEngine === 'none' ? 'selected' : ''}>不启用（AI 仅基于训练数据，可能编造）</option>
          <option value="tavily" ${(!s.searchEngine || s.searchEngine === 'tavily') ? 'selected' : ''}>Tavily（推荐·免费 1000 次/月·邮箱注册）</option>
          <option value="google" ${s.searchEngine === 'google' ? 'selected' : ''}>Google Custom Search（免费 100 次/天·需 API Key）</option>
          <option value="duckduckgo" disabled style="color:#999">DuckDuckGo（⚠ Web 版不可用，需 Electron 桌面版）</option>
          <option value="brave" disabled style="color:#999">Brave（⚠ Web 版不可用，需 Electron 桌面版）</option>
          <option value="bing" disabled style="color:#999">Bing（⚠ Web 版不可用，需 Electron 桌面版）</option>
        </select>
        <div class="help" style="color:var(--warn);margin-top:4px">💡 Web 版运行在浏览器中，受 CORS 限制无法直连 DuckDuckGo/Brave/Bing。推荐使用 <b>Tavily</b>（免费、CORS 友好、效果好）。</div>
      </div>
      <div id="st-duck-fields" style="display:${s.searchEngine === 'duckduckgo' ? 'block' : 'none'}">
        <div class="help" style="color:var(--danger)">⚠ DuckDuckGo 直连需要 Electron 桌面版，Web 浏览器版无法使用（受 CORS 限制）。请切换到 Tavily。</div>
      </div>
      <div id="st-tavily-fields" style="display:${s.searchEngine === 'tavily' ? 'block' : 'none'}">
        <div class="field"><label>Tavily API Key <span class="small muted">（到 tavily.com 邮箱注册免费拿，无需信用卡）</span></label><input id="st-tavily-key" type="password" value="${esc(s.searchTavilyKey)}" placeholder="tvly-..."></div>
      </div>
      <div id="st-google-fields" style="display:${s.searchEngine === 'google' ? 'block' : 'none'}">
        <div class="field"><label>Google API Key</label><input id="st-google-key" type="password" value="${esc(s.searchGoogleKey)}" placeholder="AIzaSy..."></div>
        <div class="field"><label>Search Engine ID (cx)</label><input id="st-google-cx" type="text" value="${esc(s.searchGoogleCx)}" placeholder="0123456789abcdef:xxxxxx"></div>
      </div>
      <div id="st-bing-fields" style="display:${s.searchEngine === 'bing' ? 'block' : 'none'}">
        <div class="field"><label>Bing API Key</label><input id="st-bing-key" type="password" value="${esc(s.searchBingKey)}" placeholder="..."></div>
      </div>
      <div id="st-brave-fields" style="display:${s.searchEngine === 'brave' ? 'block' : 'none'}">
        <div class="field"><label>Brave Search API Key <span class="small muted">（api.search.brave.com，需绑卡）</span></label><input id="st-brave-key" type="password" value="${esc(s.searchBraveKey)}" placeholder="BSA..."></div>
      </div>
      <label class="check mt8"><input type="checkbox" id="st-strict" ${s.strictLeadMode !== false ? 'checked' : ''}> 启用严格模式：只保存来源可验证或有真实联系方式的线索到 CRM</label>
      <label class="check mt8"><input type="checkbox" id="st-enrich" ${s.enrichContacts !== false ? 'checked' : ''}> 抓取结果页联系方式：自动打开搜索结果网站正文，提取真实邮箱/电话填入线索（关闭则只靠搜索摘要）</label>
      <div class="flex gap8 mt8">
        <button class="btn primary" id="st-save">保存配置</button>
        <button class="btn" id="st-test">测试连接</button>
        <button class="btn" id="st-test-search">测试搜索</button>
      </div>
      <div id="st-msg" class="help" style="margin-top:10px"></div>
      <div class="help">支持 OpenAI / DeepSeek / 通义千问(兼容模式) / 智谱 等 OpenAI 兼容接口。Key 仅保存在本机用户目录，不会上传。</div>
      <div class="help" style="margin-top:6px"><b>为什么必须配置搜索引擎？</b> 大模型不能真正联网，只会基于训练数据"编故事"。配置搜索引擎后，程序会先用真实搜索拿到真实网页，再让 AI 整理，source 必须是真实 URL，从而根治编造公司/网址的问题。<b>没有信用卡也能用：</b>选 <b>DuckDuckGo 直连</b>（零配置、免 Key 免注册）即可直接搜；或选 <b>Tavily</b>（tavily.com 邮箱注册免费 1000 次/月、无需信用卡）。Brave 旧档已取消，现在需绑卡。</div>
    </div>
    <div class="card card-pad">
      <div class="card-title">数据管理</div>
      <div class="field"><label>客户数据</label>
        <div class="flex gap8 wrap">
          <button class="btn" id="st-export">导出 JSON</button>
          <button class="btn" id="st-import">导入 JSON</button>
          <button class="btn" id="st-trash">🗑 回收站（${Object.keys(state.trash || {}).length}）</button>
          <button class="btn danger" id="st-clear">清空全部</button>
        </div>
        <div class="help" style="margin-top:6px">删除的客户会在回收站保留 30 天，期间可一键恢复（恢复后会重新同步到云端）。</div>
      </div>
      <div class="divider"></div>
      <div class="field"><label>外观</label>
        <div class="flex gap8">
          <button class="btn" id="st-theme">切换 ${s.theme === 'dark' ? '浅色' : '深色'}主题</button>
          <span class="muted small" style="align-self:center">当前：${s.theme === 'dark' ? '深色' : '浅色'}</span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="small muted">
        客户数：${state.customers.length} · 市场分析：${state.marketAnalyses.length} · AI 调用：${state.aiHistory.length}
      </div>
    </div>
    <div class="card card-pad">
      <div class="card-title">🔔 跟进提醒</div>
      <div class="field"><label>默认跟进周期（天）</label><input id="st-followup-days" type="number" min="1" max="365" value="${s.followUpDays || 14}"></div>
      <div class="field"><label>各评级对应的跟进频率（天）<span class="small muted">（可调，越重要的客户频率越高）</span></label>
        <div class="row4">
          ${RATINGS.map(r => `<div class="field"><label>⭐${r}</label><input type="number" min="1" max="365" data-st-rating="${r}" value="${(s.ratingDays && s.ratingDays[r]) != null ? s.ratingDays[r] : RATING_DAYS_DEFAULT[r]}"></div>`).join('')}
        </div>
      </div>
      <div class="help">超过周期未跟进的客户会在「客户管理」标红提醒，并可一键筛选「仅看需跟进」。**终态（成交/不匹配/暂缓）**和"已合作"客户不计入提醒；"无回复"仍会计入（需继续跟进）。**优先级**：每客户自定义 > 评级频率 > 全局默认。</div>
    </div>
    <!-- Supabase 免费云同步卡片（推荐，最简单） -->
    <div class="card card-pad" style="border:2px solid var(--success,#16a34a);border-left:6px solid var(--success,#16a34a)">
      <div class="card-title">⚡ 多端实时同步（Supabase · 免费推荐）</div>
      <div class="help" style="margin-bottom:12px"><b>手机 + 电脑实时同步，最简单方案。</b>免费注册 Supabase（supabase.com），新建项目后在控制台拿 2 个东西：<b>Project URL</b> 和 <b>anon public key</b>，填到下面点连接即可。首次还需在 Supabase 的 SQL Editor 运行一段建表脚本（见《Supabase接入指南》）。</div>
      <div class="field"><label>Project URL <span class="small muted">（如 https://xxxx.supabase.co）</span></label><input id="sb-url" type="text" value="${esc(window.__ftSupabaseCloud ? window.__ftSupabaseCloud.getConfig().url : '')}" placeholder="https://xxxx.supabase.co"></div>
      <div class="field"><label>anon public key <span class="small muted">（Project Settings → API → anon public）</span></label><input id="sb-key" type="text" value="${esc(window.__ftSupabaseCloud ? window.__ftSupabaseCloud.getConfig().key : '')}" placeholder="eyJhbGciOiJ..."></div>
      <div class="flex gap8 wrap mt8" style="margin-top:12px">
        <button class="btn primary" id="sb-connect">🔗 连接 Supabase</button>
        <button class="btn" id="sb-push">☝️ 上传到云端</button>
        <button class="btn" id="sb-pull">👇 从云端拉取</button>
        <button class="btn" id="sb-disconnect">断开</button>
      </div>
      <div id="sb-msg" class="help" style="margin-top:10px"></div>
      <div id="sb-status" class="help" style="margin-top:6px;color:var(--muted)">未连接</div>
      <div class="divider"></div>
    </div>
    <div class="card card-pad" style="border:2px solid var(--primary,#4f46e5);border-left:6px solid var(--primary,#4f46e5)">
      <div class="card-title">⚡ 多端实时同步（CloudBase 腾讯云）</div>
      <div class="help" style="margin-bottom:12px">这是<b>手机 + 电脑实时同步</b>的方案：数据存腾讯云数据库，各端自动同步，改动秒级生效，无需导来导去。<br>配置方法见《腾讯云CloudBase设置指南》，只需填环境 ID 并点"连接"。</div>
      <div class="field"><label>CloudBase 环境 ID</label><input id="st-cb-env" type="text" value="${esc(window.__ftCloud ? window.__ftCloud.getConfig().envId : '')}" placeholder="如 your-app-xxxx"></div>
      <div class="field"><label>地域 <span class="small muted">（默认上海 ap-shanghai）</span></label><input id="st-cb-region" type="text" value="${esc(window.__ftCloud ? window.__ftCloud.getConfig().region : 'ap-shanghai')}" placeholder="ap-shanghai"></div>
      <div class="flex gap8 wrap mt8" style="margin-top:12px">
        <button class="btn primary" id="st-cb-connect">🔗 连接云端</button>
        <button class="btn" id="st-cb-push">☝️ 上传到云端</button>
        <button class="btn" id="st-cb-pull">👇 从云端拉取</button>
        <button class="btn" id="st-cb-disconnect">断开</button>
      </div>
      <div id="st-cb-msg" class="help" style="margin-top:10px"></div>
      <div id="st-cb-status" class="help" style="margin-top:6px;color:var(--muted)">未连接</div>
      <div class="divider"></div>
    </div>
    <div class="card card-pad">
      <div class="card-title">☁️ 多设备云同步（WebDAV，桌面版可用）</div>
      <div class="help" style="margin-bottom:12px">配置 WebDAV 后可将数据上传到云端，实现多设备（电脑/手机）数据共享。<b>推荐坚果云</b>（免费、国内快）：登录坚果云 → 设置 → 第三方管理 → 添加应用 → 获取账号密码（非登录密码）。填入后点"测试连接"，成功即可一键同步。</div>
      <div class="field"><label>WebDAV URL <span class="small muted">（如：https://dav.jianguoyun.com/dav/外贸工作台/）</span></label><input id="st-webdav-url" type="text" value="${esc(s.webdavUrl || '')}" placeholder="https://dav.jianguoyun.com/dav/外贸工作台/"></div>
      <div class="row2">
        <div class="field"><label>WebDAV 用户名</label><input id="st-webdav-user" type="text" value="${esc(s.webdavUser || '')}" placeholder="坚果云账号或应用密码用户名"></div>
        <div class="field"><label>WebDAV 密码</label><input id="st-webdav-pass" type="password" value="${esc(s.webdavPass || '')}" placeholder="应用密码（非登录密码）"></div>
      </div>
      <div class="flex gap8 wrap mt8" style="margin-top:12px">
        <button class="btn" id="st-webdav-test">测试连接</button>
        <button class="btn primary" id="st-webdav-upload">☁️ 上传到云端</button>
        <button class="btn" id="st-webdav-download">📥 从云端下载</button>
      </div>
      <div id="st-webdav-msg" class="help" style="margin-top:10px"></div>
      <div class="divider"></div>
      <div class="field"><label>自动同步 <span class="small muted">（开启后每次保存/修改数据时自动上传）</span></label>
        <select id="st-webdav-auto">
          <option value="off" ${(s.webdavAuto || 'off') === 'off' ? 'selected' : ''}>关闭</option>
          <option value="on" ${s.webdavAuto === 'on' ? 'selected' : ''}>开启（每次操作后自动上传）</option>
        </select>
      </div>
      <div id="st-webdav-status" class="help" style="margin-top:6px">${s.webdavLastSync ? `上次同步：${s.webdavLastSync}` : '尚未同步'}</div>
    </div>
  </div>`;

  $('#st-save').addEventListener('click', async () => {
    const cfg = {
      provider: $('#st-provider').value,
      apiBase: $('#st-base').value.trim() || 'https://api.deepseek.com/v1',
      apiKey: $('#st-key').value.trim(),
      model: $('#st-model').value.trim() || 'deepseek-chat',
      temperature: parseFloat($('#st-temp').value) || 0.7,
      theme: state.settings.theme,
      searchEngine: $('#st-search-engine').value,
      searchGoogleKey: $('#st-google-key').value.trim(),
      searchGoogleCx: $('#st-google-cx').value.trim(),
      searchBingKey: $('#st-bing-key').value.trim(),
      searchBraveKey: $('#st-brave-key').value.trim(),
      searchTavilyKey: $('#st-tavily-key').value.trim(),
      strictLeadMode: $('#st-strict').checked,
      enrichContacts: $('#st-enrich').checked,
      followUpDays: parseInt($('#st-followup-days').value, 10) || 14,
      ratingDays: Object.assign({}, RATING_DAYS_DEFAULT, $all('[data-st-rating]').reduce((a, el) => { a[el.dataset.stRating] = parseInt(el.value, 10) || RATING_DAYS_DEFAULT[el.dataset.stRating] || 14; return a; }, {})),
      webdavUrl: $('#st-webdav-url').value.trim(),
      webdavUser: $('#st-webdav-user').value.trim(),
      webdavPass: $('#st-webdav-pass').value.trim(),
      webdavAuto: $('#st-webdav-auto').value,
      webdavLastSync: state.settings.webdavLastSync || ''
    };
    const r = await setConfigWeb(cfg);
    if (r.ok) { state.settings = r.config; updateAiStatus(); toast('已保存', '配置已写入本机', 'ok'); syncSettings(); render(); const m = $('#st-msg'); if (m) { m.textContent = '✓ 配置已保存（含评级跟进频率）'; m.style.color = 'var(--success)'; } }
    else toast('保存失败', '', 'err');
  });

  // 搜索引擎下拉切换：显示对应输入框
  $('#st-search-engine').addEventListener('change', () => {
    const engine = $('#st-search-engine').value;
    $('#st-duck-fields').style.display = engine === 'duckduckgo' ? 'block' : 'none';
    $('#st-tavily-fields').style.display = engine === 'tavily' ? 'block' : 'none';
    $('#st-google-fields').style.display = engine === 'google' ? 'block' : 'none';
    $('#st-bing-fields').style.display = engine === 'bing' ? 'block' : 'none';
    $('#st-brave-fields').style.display = engine === 'brave' ? 'block' : 'none';
  });

  // 模型服务商一键切换（DeepSeek / ChatGPT），同时给出提示
  function applyProvider(preset) {
    const hint = $('#st-provider-hint');
    if (preset === 'openai') {
      $('#st-base').value = 'https://api.openai.com/v1';
      if (!$('#st-model').value || /deepseek/i.test($('#st-model').value) || !$('#st-model').value.trim()) $('#st-model').value = 'gpt-4o';
      hint.innerHTML = '✓ 选了 OpenAI / ChatGPT。请填入你的 <b>OpenAI API Key</b>（到 platform.openai.com 申请，付费按量计费，效果通常更稳更懂语境）。<br><span class="warn">注意：你发的 chatgpt.com 对话分享链接无法直接接入——app 调用的是 OpenAI 的 API，不是网页聊天。</span>';
    } else if (preset === 'deepseek') {
      $('#st-base').value = 'https://api.deepseek.com/v1';
      if (!$('#st-model').value || /gpt|openai/i.test($('#st-model').value) || !$('#st-model').value.trim()) $('#st-model').value = 'deepseek-chat';
      hint.innerHTML = '✓ DeepSeek：便宜、速度快，适合批量获客与常规分析。';
    } else {
      hint.innerHTML = '自定义：手动填写 API Base 与模型（兼容任何 OpenAI 格式接口，如 Azure OpenAI、本地 Ollama、硅基流动等）。';
    }
  }
  applyProvider($('#st-provider').value);
  $('#st-provider').addEventListener('change', e => applyProvider(e.target.value));

  $('#st-test-search').addEventListener('click', async () => {
    const btn = $('#st-test-search'); btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span> 测试中…';
    const engine = $('#st-search-engine').value;
    const r = await webSearchBrowser('foreign trade workbench test', { engine });
    if (r.ok) { $('#st-msg').textContent = `✓ 搜索正常：${(r.items || []).length} 条结果` + (r.fallback ? `（${r.fallbackNote || '已回退到 Tavily'}）` : ''); $('#st-msg').style.color = 'var(--success)'; toast('搜索测试成功', `返回 ${(r.items || []).length} 条结果`, 'ok'); }
    else { $('#st-msg').textContent = '✗ ' + r.error; $('#st-msg').style.color = 'var(--danger)'; toast('搜索测试失败', r.error, 'err'); }
    btn.disabled = false; btn.innerHTML = '测试搜索';
  });

  $('#pf-save').addEventListener('click', async () => {
    const profile = {
      name: $('#pf-name').value.trim(),
      website: $('#pf-website').value.trim(),
      products: $('#pf-products').value.trim(),
      advantages: $('#pf-advantages').value.trim(),
      bestSellers: $('#pf-bestsellers').value.trim()
    };
    const r = await setConfigWeb({ profile });
    if (r.ok) {
      state.settings = r.config;
      toast('已保存', '公司画像已写入本机', 'ok');
      const m = $('#pf-msg'); m.textContent = '✓ 公司画像已保存'; m.style.color = 'var(--success)';
      syncSettings();
    } else toast('保存失败', '', 'err');
  });

  $('#st-ai-profile').addEventListener('click', async () => {
    const name = $('#pf-name').value.trim();
    const website = $('#pf-website').value.trim();
    const products = $('#pf-products').value.trim();
    if (!name && !website && !products) { toast('先填点信息', '请至少填写公司名称 / 官网 / 产品之一', 'err'); return; }
    const btn = $('#st-ai-profile'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 分析中…';
    try {
      const userMsg = `请分析以下公司并提炼优势与畅销品：\n公司名称：${name || '—'}\n官网：${website || '—'}\n主营产品：${products || '—'}`;
      const raw = await callAI([{ role: 'system', content: SYS_PROFILE }, { role: 'user', content: userMsg }], { temperature: 0.6, maxTokens: 900 });
      const r = parseJson(raw);
      if (!r || typeof r !== 'object') throw new Error('模型未返回有效结果');
      const adv = Array.isArray(r.advantages) ? r.advantages.join('\n') : (r.advantages || '');
      const bs = Array.isArray(r.bestSellers) ? r.bestSellers.join('\n') : (r.bestSellers || '');
      $('#pf-advantages').value = adv;
      $('#pf-bestsellers').value = bs;
      const m = $('#pf-msg'); m.textContent = '✓ AI 已生成优势与畅销品，确认无误后点「保存画像」'; m.style.color = 'var(--success)';
      toast('分析完成', '已填入优势与畅销品，请确认后保存', 'ok');
    } catch (e) {
      const m = $('#pf-msg'); m.textContent = '✗ ' + e.message; m.style.color = 'var(--danger)';
      toast('分析失败', e.message, 'err');
    } finally { btn.disabled = false; btn.innerHTML = '🤖 AI 分析我的公司'; }
  });

  $('#st-test').addEventListener('click', async () => {
    const btn = $('#st-test'); btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span> 测试中…';
    try {
      const r = await callAI([{ role: 'user', content: '只用一句话回复：连接正常' }], { temperature: 0, maxTokens: 30 });
      $('#st-msg').textContent = '✓ 连接成功：' + r.slice(0, 40); $('#st-msg').style.color = 'var(--success)';
      toast('连接成功', '', 'ok');
    } catch (e) { $('#st-msg').textContent = '✗ ' + e.message; $('#st-msg').style.color = 'var(--danger)'; toast('连接失败', e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '测试连接'; }
  });

  $('#st-export').addEventListener('click', async () => {
    const data = { customers: state.customers, aiHistory: state.aiHistory, marketAnalyses: state.marketAnalyses, exportedAt: nowISO() };
    const r = await exportDataWeb(data);
    if (r.ok) toast('已导出', r.filePath, 'ok');
    else if (!r.canceled) toast('导出失败', r.error || '', 'err');
  });

  $('#st-import').addEventListener('click', async () => {
    const r = await importDataWeb();
    if (!r.ok) { if (!r.canceled) toast('导入失败', r.error || '', 'err'); return; }
    const d = r.data || {};
    if (!Array.isArray(d.customers)) { toast('格式错误', '文件不包含 customers 数组', 'err'); return; }
    if (!confirm(`将导入 ${d.customers.length} 个客户，覆盖当前数据，确定继续？`)) return;
    state.customers = d.customers;
    state.aiHistory = Array.isArray(d.aiHistory) ? d.aiHistory : [];
    state.marketAnalyses = Array.isArray(d.marketAnalyses) ? d.marketAnalyses : [];
    persistAll(); toast('导入完成', `${state.customers.length} 个客户`, 'ok'); render();
  });

  const trashBtn = $('#st-trash');
  if (trashBtn) trashBtn.addEventListener('click', () => openTrash());
  $('#st-clear').addEventListener('click', () => {
    if (!confirm('将清空全部客户、市场分析与 AI 记录，且无法恢复，确定？')) return;
    state.customers = []; state.aiHistory = []; state.marketAnalyses = [];
    persistAll(); toast('已清空', '', 'ok'); render();
  });

  $('#st-theme').addEventListener('click', async () => {
    const theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    const r = await setConfigWeb({ theme });
    if (r.ok) { state.settings = r.config; applyTheme(theme); render(); }
  });

  // ---------- WebDAV 云同步 ----------
  const webdavMsg = () => $('#st-webdav-msg');
  const webdavStatus = () => $('#st-webdav-status');
  function getWebdavConfig() {
    return {
      url: ($('#st-webdav-url').value || '').trim().replace(/\/+$/, ''),
      user: $('#st-webdav-user').value.trim(),
      pass: $('#st-webdav-pass').value.trim()
    };
  }
  async function webdavRequest(method, path, body) {
    const cfg = getWebdavConfig();
    if (!cfg.url || !cfg.user || !cfg.pass) throw new Error('请先填写 WebDAV URL、用户名和密码');
    const fullUrl = cfg.url + path;
    const headers = { 'Authorization': 'Basic ' + btoa(cfg.user + ':' + cfg.pass) };
    if (body) headers['Content-Type'] = 'application/json; charset=utf-8';
    const res = await fetch(fullUrl, { method, headers, body: body || undefined });
    if (res.status === 401 || res.status === 403) throw new Error('认证失败：请检查用户名和密码（坚果云需用"应用密码"，非登录密码）');
    if (res.status === 404) throw new Error('路径不存在：请确认 WebDAV URL 正确（末尾需带 /）');
    if (res.status >= 400) throw new Error(`WebDAV 错误 (${res.status})`);
    return res;
  }
  $('#st-webdav-test').addEventListener('click', async () => {
    const btn = $('#st-webdav-test'); btn.disabled = true; btn.textContent = '测试中…';
    webdavMsg().textContent = '';
    try {
      await webdavRequest('PROPFIND', '', '<?xml version="1.0"?><a:propfind xmlns:a="DAV:"><a:prop><a:resourcetype/></a:prop></a:propfind>');
      webdavMsg().innerHTML = '<span style="color:var(--success)">✓ 连接成功！WebDAV 可用。</span>';
    } catch (e) { webdavMsg().innerHTML = '<span style="color:var(--danger)">✗ ' + esc(e.message) + '</span>'; }
    finally { btn.disabled = false; btn.textContent = '测试连接'; }
  });
  $('#st-webdav-upload').addEventListener('click', async () => {
    const btn = $('#st-webdav-upload'); btn.disabled = true; btn.textContent = '上传中…';
    webdavMsg().textContent = '';
    try {
      const data = JSON.stringify({ customers: state.customers, aiHistory: state.aiHistory, marketAnalyses: state.marketAnalyses, exportedAt: nowISO(), _v: 2 });
      await webdavRequest('PUT', '/ft_data.json', data);
      const ts = new Date().toLocaleString('zh-CN');
      state.settings.webdavLastSync = ts;
      webdavStatus().textContent = `上次同步：${ts}（上传）`;
      webdavMsg().innerHTML = '<span style="color:var(--success)">✓ 已上传到云端！其他设备可「从云端下载」获取最新数据。</span>';
      persistAll();
    } catch (e) { webdavMsg().innerHTML = '<span style="color:var(--danger)">✗ 上传失败：' + esc(e.message) + '</span>'; }
    finally { btn.disabled = false; btn.textContent = '☁️ 上传到云端'; }
  });
  $('#st-webdav-download').addEventListener('click', async () => {
    const btn = $('#st-webdav-download'); btn.disabled = true; btn.textContent = '下载中…';
    webdavMsg().textContent = '';
    try {
      const res = await webdavRequest('GET', '/ft_data.json');
      const text = await res.text();
      const d = JSON.parse(text);
      if (!Array.isArray(d.customers)) throw new Error('云端数据格式异常');
      if (!confirm(`将从云端下载 ${d.customers.length} 个客户，合并到当前数据。确定？`)) return;
      // 合并策略：以云端为准，但保留本地新增的
      const cloudIds = new Set(d.customers.map(c => c.id));
      const localNew = state.customers.filter(c => !cloudIds.has(c.id));
      state.customers = [...d.customers, ...localNew];
      state.aiHistory = Array.isArray(d.aiHistory) ? d.aiHistory : [];
      state.marketAnalyses = Array.isArray(d.marketAnalyses) ? d.marketAnalyses : [];
      const ts = new Date().toLocaleString('zh-CN');
      state.settings.webdavLastSync = ts;
      webdavStatus().textContent = `上次同步：${ts}（下载）`;
      persistAll(); toast('同步完成', `已下载 ${d.customers.length} 个客户${localNew.length ? '，保留本地新增 ' + localNew.length + ' 个' : ''}`, 'ok');
      render();
      webdavMsg().innerHTML = '<span style="color:var(--success)">✓ 已从云端下载并合并数据。</span>';
    } catch (e) { webdavMsg().innerHTML = '<span style="color:var(--danger)">✗ 下载失败：' + esc(e.message) + '</span>'; }
    finally { btn.disabled = false; btn.textContent = '📥 从云端下载'; }
  });
  // ---- CloudBase 实时同步事件绑定 ----
  const cbEnvEl = $('#st-cb-env');
  const cbRegionEl = $('#st-cb-region');
  const cbMsgEl = () => $('#st-cb-msg');
  const cbStatusEl = () => $('#st-cb-status');
  function cbUiStatus(txt, type) {
    const el = cbStatusEl(); if (!el) return;
    el.innerHTML = txt;
    el.style.color = type === 'ok' ? 'var(--success)' : type === 'err' ? 'var(--danger)' : 'var(--muted)';
  }
  // 初始化显示当前连接状态
  if (window.__ftCloud) {
    const st = window.__ftCloud.getState();
    if (st.connected) cbUiStatus(`✅ 已连接（${st.envId}）· 上次同步：${st.lastSync || '—'}`, 'ok');
    else if (st.lastError) cbUiStatus(`⚠ ${st.lastError}`, 'err');
    else cbUiStatus('未连接', '');
  }
  // 连接按钮
  const cbConn = $('#st-cb-connect');
  if (cbConn) cbConn.addEventListener('click', async () => {
    const env = (cbEnvEl && cbEnvEl.value.trim()) || '';
    const region = (cbRegionEl && cbRegionEl.value.trim()) || 'ap-shanghai';
    if (!env) { cbMsgEl().innerHTML = '<span style="color:var(--danger)">✗ 请先填写环境 ID</span>'; return; }
    if (window.__ftCloud) {
      window.__ftCloud.saveConfig(env, region);
      cbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在连接云端…</span>';
      cbConn.disabled = true; cbConn.textContent = '连接中…';
      const r = await window.__ftCloud.connect();
      cbConn.disabled = false; cbConn.textContent = '🔗 连接云端';
      if (r.ok) {
        window.__ftCloud.startPolling();
        // 把环境 ID 存入 settings，随云端同步，让其他设备自动获取连接配置
        try {
          const cur = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
          cur.cloudEnvId = env; cur.cloudRegion = region;
          localStorage.setItem(CONFIG_KEY, JSON.stringify(cur));
          state.settings = Object.assign({}, state.settings, { cloudEnvId: env, cloudRegion: region });
          syncSettings();
        } catch (e) {}
        cbMsgEl().innerHTML = '<span style="color:var(--success)">✓ 已连接并完成首次同步！数据已上传云端，其他设备登录后自动同步。</span>';
        cbUiStatus(`✅ 已连接（${env}）· 上次同步：${window.__ftCloud.getState().lastSync}`, 'ok');
      } else {
        cbMsgEl().innerHTML = '<span style="color:var(--danger)">✗ ' + esc(r.error || '连接失败') + '</span>';
        cbUiStatus(`⚠ 连接失败`, 'err');
      }
    }
  });
  // 上传
  const cbPush = $('#st-cb-push');
  if (cbPush) cbPush.addEventListener('click', async () => {
    if (!window.__ftCloud) return;
    cbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在上传…</span>';
    const r = await window.__ftCloud.pushAll();
    cbMsgEl().innerHTML = r.ok ? '<span style="color:var(--success)">✓ 已上传到云端</span>' : '<span style="color:var(--danger)">✗ ' + esc(r.error) + '</span>';
  });
  // 拉取
  const cbPull = $('#st-cb-pull');
  if (cbPull) cbPull.addEventListener('click', async () => {
    if (!window.__ftCloud) return;
    cbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在拉取…</span>';
    const r = await window.__ftCloud.pullAll();
    cbMsgEl().innerHTML = r.ok ? '<span style="color:var(--success)">✓ 已从云端拉取 ' + (r.count||0) + ' 个客户并合并</span>' : '<span style="color:var(--danger)">✗ ' + esc(r.error) + '</span>';
    if (r.ok) { render(); }
  });
  // 断开
  const cbDisc = $('#st-cb-disconnect');
  if (cbDisc) cbDisc.addEventListener('click', () => {
    if (window.__ftCloud) window.__ftCloud.disconnect();
    cbUiStatus('未连接', '');
    cbMsgEl().innerHTML = '<span style="color:var(--muted)">已断开云端连接</span>';
  });
  // ---- Supabase 实时同步事件绑定（推荐方案） ----
  const sbUrlEl = $('#sb-url');
  const sbKeyEl = $('#sb-key');
  const sbMsgEl = () => $('#sb-msg');
  const sbStatusEl = () => $('#sb-status');
  function sbUiStatus(txt, type) {
    const el = sbStatusEl(); if (!el) return;
    el.innerHTML = txt;
    el.style.color = type === 'ok' ? 'var(--success)' : type === 'err' ? 'var(--danger)' : 'var(--muted)';
  }
  if (window.__ftSupabaseCloud) {
    const st = window.__ftSupabaseCloud.getState();
    if (st.connected) sbUiStatus(`✅ 已连接 · 上次同步：${st.lastSync || '—'}`, 'ok');
    else if (st.lastError) sbUiStatus(`⚠ ${st.lastError}`, 'err');
    else sbUiStatus('未连接', '');
  }
  const sbConn = $('#sb-connect');
  if (sbConn) sbConn.addEventListener('click', async () => {
    const url = (sbUrlEl && sbUrlEl.value.trim()) || '';
    const key = (sbKeyEl && sbKeyEl.value.trim()) || '';
    if (!url || !key) { sbMsgEl().innerHTML = '<span style="color:var(--danger)">✗ 请填写 Supabase URL 和 anon key</span>'; return; }
    if (window.__ftSupabaseCloud) {
      window.__ftSupabaseCloud.saveConfig(url, key);
      sbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在连接 Supabase…</span>';
      sbConn.disabled = true; sbConn.textContent = '连接中…';
      const r = await window.__ftSupabaseCloud.connect(url, key);
      sbConn.disabled = false; sbConn.textContent = '🔗 连接 Supabase';
      if (r.ok) {
        window.__ftSupabaseCloud.startPolling();
        sbMsgEl().innerHTML = '<span style="color:var(--success)">✓ 已连接并完成首次同步！数据已上传云端，其他设备填同样的 URL+Key 后自动同步。</span>';
        sbUiStatus(`✅ 已连接 · 上次同步：${window.__ftSupabaseCloud.getState().lastSync}`, 'ok');
      } else {
        sbMsgEl().innerHTML = '<span style="color:var(--danger)">✗ ' + esc(r.error || '连接失败') + '</span>';
        sbUiStatus(`⚠ 连接失败`, 'err');
      }
    }
  });
  const sbPush = $('#sb-push');
  if (sbPush) sbPush.addEventListener('click', async () => {
    if (!window.__ftSupabaseCloud) return;
    sbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在上传…</span>';
    const r = await window.__ftSupabaseCloud.pushAll();
    sbMsgEl().innerHTML = r.ok ? '<span style="color:var(--success)">✓ 已上传到云端</span>' : '<span style="color:var(--danger)">✗ ' + esc(r.error) + '</span>';
  });
  const sbPull = $('#sb-pull');
  if (sbPull) sbPull.addEventListener('click', async () => {
    if (!window.__ftSupabaseCloud) return;
    sbMsgEl().innerHTML = '<span style="color:var(--muted)">⏳ 正在拉取…</span>';
    const r = await window.__ftSupabaseCloud.pullAll();
    sbMsgEl().innerHTML = r.ok ? '<span style="color:var(--success)">✓ 已从云端拉取 ' + (r.count||0) + ' 个客户并合并</span>' : '<span style="color:var(--danger)">✗ ' + esc(r.error) + '</span>';
    if (r.ok) { render(); }
  });
  const sbDisc = $('#sb-disconnect');
  if (sbDisc) sbDisc.addEventListener('click', () => {
    if (window.__ftSupabaseCloud) window.__ftSupabaseCloud.disconnect();
    sbUiStatus('未连接', '');
    sbMsgEl().innerHTML = '<span style="color:var(--muted)">已断开 Supabase</span>';
  });
  // 保存 WebDAV 配置到 settings
  const origSaveHandler = null; // we hook into st-save below
}

// ---------- 主题 / 状态 ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}
function updateAiStatus() {
  const el = $('#ai-status');
  if (!el) return;
  if (state.settings.apiKey) { el.textContent = 'AI：已配置 ✓'; el.className = 'ai-status ok'; }
  else { el.textContent = 'AI：未配置'; el.className = 'ai-status bad'; }
}

// =========================================================
// 初始化
// =========================================================
async function init() {
  main = $('#main');
  pageTitleEl = $('#page-title');

  // 读取配置（含 API Key，保存在本机）
  try { const cfg = await getConfigWeb(); if (cfg) state.settings = Object.assign({}, DEFAULT_SETTINGS, cfg); } catch (e) { /* ignore */ }
  applyTheme(state.settings.theme);
  updateAiStatus();

  // 本地数据
  state.customers = loadLS(LS.customers, []);
  state.aiHistory = loadLS(LS.aiHistory, []);
  state.marketAnalyses = loadLS(LS.marketAnalyses, []);
  state.calendar = Object.assign({ todos: [], customHolidays: [] }, loadLS(LS.calendar, { todos: [], customHolidays: [] }));
  // 删除墓碑 + 回收站：上次删掉的客户，防止云端同步把它们拉回来，并留出恢复机会
  state.tombstones = loadLS(LS.tombstones, {}) || {};
  state.trash = loadLS(LS.trash, {}) || {};
  state.pendingDeletes = [];
  const pruned = pruneTombstones();
  // 墓碑里的客户一律不出现在列表里（含本轮刚清理前遗留的）
  const tombIds = Object.keys(state.tombstones);
  if (tombIds.length) state.customers = state.customers.filter(c => !state.tombstones[c.id]);
  if (pruned) saveLS(LS.tombstones, state.tombstones);

  // 暴露给 CloudBase 实时同步模块
  window.__ftState = state;
  // 注册配置同步回调：从云端拉到新配置时，应用公司画像/API Key/连接配置
  if (window.__ftCloud && window.__ftCloud.onSettings) {
    window.__ftCloud.onSettings((remoteCfg) => applyCloudSettings(remoteCfg));
  }
  if (window.__ftSupabaseCloud && window.__ftSupabaseCloud.onSettings) {
    window.__ftSupabaseCloud.onSettings((remoteCfg) => applyCloudSettings(remoteCfg));
  }
  // 同步刷新策略：
  // 仅对纯数据展示页（工作台 dashboard、客户管理 crm、日历 calendar）做后台刷新。
  // 智能开发/深度背调/市场分析页有进行中的 AI 任务和结果展示，
  // 设置页有表单输入，这些页面一旦整页重渲染会清空结果或输入内容，
  // 因此一律跳过，避免"内容秒消失"。
  window.__ftRefreshUI = () => {
    try {
      // 只刷新纯展示页，其余页面跳过，防止清空背调结果/表单输入
      if (state.view !== 'dashboard' && state.view !== 'crm' && state.view !== 'calendar') return;
      // 有弹窗打开时也跳过
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot && modalRoot.innerHTML && modalRoot.innerHTML.trim().length > 0) return;
      // 刷新但不重置滚动
      state._skipScrollReset = true;
      render();
    } catch (e) {}
  };

  // 导航
  $all('.nav-item').forEach(a => a.addEventListener('click', () => { state.view = a.dataset.view; render(); }));

  // 全局搜索 → 客户管理（命中已合作客户时提醒）
  const gs = $('#global-search');
  let lastCoopToast = '';
  gs.addEventListener('input', e => {
    state.crmSearch = e.target.value;
    if (state.view !== 'crm') { state.view = 'crm'; render(); }
    else { renderCrmTable(); updateCoopBanner(); }
    const q = state.crmSearch.trim();
    if (q.length >= 2) {
      const k = normKey(q);
      const hit = state.customers.some(c => c.cooperating && (normKey(c.name).includes(k) || normKey(c.country).includes(k) || normKey(c.industry).includes(k) || normKey(c.website).includes(k) || normKey(c.shopUrl).includes(k)));
      if (hit && lastCoopToast !== q) { lastCoopToast = q; toast('⚠ 提醒', '搜索命中已合作客户，无需重复开发', 'warn'); }
      else if (!hit) lastCoopToast = '';
    } else lastCoopToast = '';
  });

  // 主题快捷切换
  $('#theme-toggle').addEventListener('click', async () => {
    const theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    const r = await setConfigWeb({ theme });
    if (r.ok) { state.settings = r.config; applyTheme(theme); render(); }
  });

  // 移动端汉堡菜单
  const sidebar = $('#sidebar');
  const overlay = $('#sidebar-overlay');
  const menuBtn = $('#menu-toggle');
  function openSidebar() { if (sidebar && overlay) { sidebar.classList.add('open'); overlay.classList.add('show'); } }
  function closeSidebar() { if (sidebar && overlay) { sidebar.classList.remove('open'); overlay.classList.remove('show'); } }
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);
  // 点击导航项后自动关闭侧边栏（移动端）
  $all('.nav-item').forEach(a => a.addEventListener('click', () => { closeSidebar(); }));

  // 打开时弹窗提醒：今天有节日或到期 Todo 则提醒（仅在首次打开/进入时触发一次）
  window.__ftNotifyCalendar = calCheckNotify;
  // 页面加载完成后再弹（等 UI 渲染好）
  setTimeout(calCheckNotify, 800);

  render();
}

document.addEventListener('DOMContentLoaded', init);
