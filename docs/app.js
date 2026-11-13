/* ============================================================
 * 班级量化考核 · 在线版 v1.4.20261111
 * GitHub Pages 静态托管，数据以 JSON 存于仓库 docs/data/
 *   accounts.json            账号、角色、权限、已读版本
 *   records.json             扣分/加分记录 + 审计
 *   feedback.json            意见反馈
 *   users/<账号>/pwd.json     每用户独立密码（PBKDF2-SHA256 60 万次）
 *
 * 写入安全（v1.4）：
 *   写令牌不再以任何可逆形式出现在仓库里，而是 AES-GCM 密文，
 *   密钥由「写入口令」经 PBKDF2 派生。没有口令的访客只能读。
 * ============================================================ */
'use strict';

// ---------- 配置 ----------
const SYNC = {
  owner: 'tangyuan9325',
  repo: 'class-deduction',
  branch: 'main',
  dataDir: 'docs/data',
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
  maxWritesPerHour: 40
};
const APP_VERSION = '1.4.20261113';
const DB_VERSION = 5;
const PBKDF2_ITER = 600000;
const F_ACCOUNTS = `${SYNC.dataDir}/accounts.json`;
const F_RECORDS  = `${SYNC.dataDir}/records.json`;
const F_FEEDBACK = `${SYNC.dataDir}/feedback.json`;
const pwdPath = uname => `${SYNC.dataDir}/users/${uname}/pwd.json`;

const RELEASE_NOTES = [
  '开屏动画改为随主题换色：浅色米白、深色深灰，徽标与光晕同步换色',
  '开屏结束后，右下角出现占屏幕四分之三的巨型玻璃徽标，鼠标移入有跟随高光',
  '登录时徽标由半透明升为顶层不透明，再沿弧线归位到左上角',
  '字体只保留 JetBrains Mono 与原神两档，宋体彻底移除，默认等宽',
  '深浅色切换与字体切换合并为同一组控件，侧栏折叠时仍可切换主题'
];

// 扣分/加分类别字典
const DICT = {
  deduct: [
    {name:'学习', items:['语文','数学','英语','物理','化学','技术','地理','历史','生物','政治','其它']},
    {name:'寝室', items:['地未拖','灯未关','垃圾未倒','地不干净','熄灯后聊天','床铺不整','物品摆放乱','其它']},
    {name:'日常', items:['迟到','卫生','纪律','其它']},
    {name:'两操', items:['早操迟到','早操缺席','课间操违纪','眼保健操','跑操秩序','其它']}
  ],
  bonus: ['助人为乐','学习进步','卫生优秀','纪律良好','比赛获奖','班级贡献','好人好事','其它']
};
const ALL_CATS = ['学习','寝室','日常','两操','加分'];

// ---------- 状态 ----------
let S = {
  users: [], records: [], audit: [], feedback: [], seen_changelog: {},
  meta: {version:APP_VERSION, semester_start:'2026-09-01', changelog:[]},
  pwdCache: {}, t: {accounts:'', records:'', feedback:''},
  dirtyUsers: new Set(), deletedUsers: new Set()
};
let me = null;
let curView = 'dashboard';
let lastSavedAt = '';
let busy = false;
let dataReady = false;
let ghToken = '';                 // 仅内存 + 本标签页 sessionStorage
let pending = {records:null, accounts:null, pwd:null};
let pendingCount = 0;
let writeTimes = [];
let staleData = false;
const PENDING_KEY = 'cm_pending_v6';
const SESSION_TMP = 'cm_session_tmp';
const SESSION_LONG = 'cm_session';
const GH_SESSION = 'cm_gh_session';
const CACHE_KEY = n => 'cm_cache_' + n;

// 视图局部状态（轮询重绘后保留）
const UI = {
  records: {cat:'', kw:'', page:1, size:20},
  stuSum: {period:'daily'},
  summary: {scope:'class', period:'week', user:''},
  create: {selected:new Set(), search:''}
};

// ---------- 工具 ----------
const $ = id => document.getElementById(id);
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
let toastTimer = null;
function toast(msg, err=false){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.className=''; }, 3200);
}
const sleep = ms => new Promise(r=>setTimeout(r, ms));
function nowISO(){ return new Date().toISOString(); }
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDate(s){
  if(!s) return '';
  if(s instanceof Date) return s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0');
  return String(s).slice(0,10);
}
function isSameDay(a,b){ return fmtDate(a)===fmtDate(b); }
function weekRange(ref){
  const d = ref ? new Date(ref) : new Date();
  const day = (d.getDay()+6)%7;
  const mon = new Date(d); mon.setDate(d.getDate()-day);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return [fmtDate(mon), fmtDate(sun)];
}
function monthRange(ref){
  const d = ref ? new Date(ref) : new Date();
  const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  const e = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return [s, fmtDate(e)];
}
function inRange(dateStr, start, end){ return dateStr>=start && dateStr<=end; }
function weekNumOf(dateStr){
  const sem = S.meta.semester_start || '2026-09-01';
  const t0 = new Date(sem), t1 = new Date(dateStr);
  return Math.max(1, Math.floor((t1-t0)/6048e5)+1);
}
function fmtTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d)) return '—';
  const now = new Date();
  const same = d.toDateString()===now.toDateString();
  return (same?'':(String(d.getMonth()+1)+'月'+d.getDate()+'日 '))+
    String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function csvSafe(v){
  let s = String(v==null?'':v);
  if(/^[=+\-@\t\r]/.test(s)) s = "'"+s;
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function downloadCSV(name, rows){
  const body = rows.map(r=>r.map(csvSafe).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF'+body], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}

// ---------- 图标（16px / 1.5 描边） ----------
const ICONS = {
  dash:'<rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/>',
  note:'<path d="M15 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11l4-4V4a1 1 0 0 0-1-1z"/><path d="M15 21v-4h4"/><path d="M8 8h7M8 12h7M8 16h4"/>',
  board:'<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11"/>',
  minus:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  plus:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  left:'<path d="M15 18l-6-6 6-6"/>',
  right:'<path d="M9 18l6-6-6-6"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  key:'<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13L20 3M16 7l3 3M13.5 9.5l2.5 2.5"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  check:'<path d="M20 6L9 17l-5-5"/>'
};
function icon(n, size){
  const s = size || 16;
  return `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
}

// ---------- 编码与密码 ----------
function b64ToBuf(b64){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function bufToB64(buf){ let bin=''; const u=new Uint8Array(buf); for(let i=0;i<u.length;i++) bin+=String.fromCharCode(u[i]); return btoa(bin); }
function utf8ToB64(str){
  const u = new TextEncoder().encode(str);
  let bin = '';
  for(let i=0;i<u.length;i+=0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i+0x8000));
  return btoa(bin);
}
function b64ToUtf8(b64){
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
function randB64(len){ const u=new Uint8Array(len); crypto.getRandomValues(u); return bufToB64(u); }
async function pbkdf2Derive(pass, saltB64, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:b64ToBuf(saltB64), iterations:iter, hash:'SHA-256'}, key, 256);
  return bufToB64(bits);
}
async function makePwdRecord(pass){
  const salt = randB64(16);
  const h = await pbkdf2Derive(pass, salt, PBKDF2_ITER);
  return 'pbkdf2$'+PBKDF2_ITER+'$'+salt+'$'+h;
}
async function verifyPwd(pass, stored){
  if(!stored) return {ok:false};
  if(String(stored).startsWith('pbkdf2$')){
    const p = String(stored).split('$');
    if(p.length!==4) return {ok:false};
    const iter = parseInt(p[1],10)||PBKDF2_ITER;
    const h = await pbkdf2Derive(pass, p[2], iter);
    return {ok: h===p[3], legacy:false};
  }
  // 旧版无盐 SHA-256，登录成功后自动升级
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
  const hex = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return {ok: hex===stored, legacy:true};
}
function pwdProblem(pass, username){
  if(!pass || pass.length<8) return '密码至少 8 位';
  if(/^\d+$/.test(pass) && pass.length<10) return '纯数字密码至少 10 位';
  if(pass==='12345678'||pass==='123456789'||pass==='password') return '这个密码太常见，请换一个';
  if(username && pass.toLowerCase()===String(username).toLowerCase()) return '密码不能与账号相同';
  return '';
}

// ---------- 写入令牌保管库 ----------
function vaultBlob(){
  try{ return (typeof GH_VAULT!=='undefined' && GH_VAULT && GH_VAULT.ct) ? GH_VAULT : null; }
  catch(e){ return null; }
}
async function deriveAesKey(pass, saltB64, iter){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:b64ToBuf(saltB64), iterations:iter, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, false, ['decrypt']
  );
}
async function openVault(pass){
  const v = vaultBlob();
  if(!v) throw new Error('未配置写令牌');
  const key = await deriveAesKey(pass, v.salt, v.iter||PBKDF2_ITER);
  let pt;
  try{
    pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64ToBuf(v.iv)}, key, b64ToBuf(v.ct));
  }catch(e){
    throw new Error('口令不正确');
  }
  const token = new TextDecoder().decode(pt).trim();
  if(!/^github_pat_[A-Za-z0-9_]+$|^ghp_[A-Za-z0-9]+$/.test(token)) throw new Error('令牌格式异常');
  return token;
}
// 生成新的保管库（仅用于管理员在本机更换令牌）
async function sealVault(token, pass){
  const salt = randB64(16), iv = randB64(12);
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:b64ToBuf(salt), iterations:PBKDF2_ITER, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, false, ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv:b64ToBuf(iv)}, key, new TextEncoder().encode(token));
  return {v:1, alg:'AES-GCM', iter:PBKDF2_ITER, salt, iv, ct:bufToB64(ct), created:nowISO()};
}
function isStaff(){ return !!me && (me.role==='admin' || me.role==='teacher'); }
function isAdmin(){ return !!me && me.role==='admin'; }
function isTeacher(){ return !!me && me.role==='teacher'; }
function isViewer(){ return !!me && me.role==='viewer'; }
function permOf(u){ return (u && u.permissions) || []; }
function canViewRecords(){
  if(!me) return false;
  return isAdmin() || (isTeacher() && permOf(me).length===0) || permOf(me).includes('查看扣分记录');
}
function canViewStats(){
  if(!me) return false;
  return isStaff() || isViewer() || permOf(me).includes('查看班级');
}
function canManageUsers(){ return isAdmin(); }
function canManageFeedback(){ return isStaff(); }
function canEnter(role, cat){
  if(role==='admin') return true;
  if(role==='viewer') return false;
  if(role==='teacher'){ const p=permOf(me); return p.length===0 || p.includes('全部') || p.includes(cat); }
  return permOf(me).includes(cat);
}
function canRevoke(){
  if(isAdmin()) return true;
  if(!me) return false;
  const p = me.permissions || [];
  return ALL_CATS.some(c=>p.includes(c));
}
// 能写入的角色口径：管理员、老师，或被授予任意录入类别的学生
function canUnlockWrite(){
  if(!me) return false;
  if(isAdmin() || isTeacher()) return true;
  if(isViewer()) return false;
  return ALL_CATS.some(c=>canEnter(me.role, c));
}
function canWrite(){ return canUnlockWrite() && !!ghToken; }
function roleText(r){ return {admin:'管理员',teacher:'老师',student:'学生',viewer:'看板'}[r]||r; }

// ============================================================
// GitHub 读写
// ============================================================
function apiFileUrl(p){ return `${SYNC.apiBase}/repos/${SYNC.owner}/${SYNC.repo}/contents/${p}`; }
function rawFileUrl(p){ return `${SYNC.rawBase}/${SYNC.owner}/${SYNC.repo}/${SYNC.branch}/${p}`; }
function authHeaders(){
  if(!ghToken) throw new Error('WRITE_LOCKED');
  return {Authorization:'Bearer '+ghToken, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'};
}
async function apiGetFile(p){
  const r = await fetch(apiFileUrl(p), {headers:authHeaders(), cache:'no-store'});
  if(r.status===404) return {sha:null, data:null};
  if(!r.ok){
    const d = await r.json().catch(()=>({}));
    throw new Error(r.status===401||r.status===403 ? '写令牌无效或已过期' : (d.message||('读取失败 '+r.status)));
  }
  const d = await r.json();
  let data = null;
  try{ data = JSON.parse(b64ToUtf8(d.content)); }catch(e){ data = null; }
  return {sha:d.sha, data};
}
function assertWritablePath(p){
  if(!p || p.includes('..') || p.startsWith('/')) throw new Error('非法的写入路径');
  if(p!=='docs/data' && !p.startsWith('docs/data/')) throw new Error('非法的写入路径');
}
function guardWrite(){
  if(!canUnlockWrite()) throw new Error('该账号未被授予录入权限');
  if(!ghToken) throw new Error('WRITE_LOCKED');
  const now = Date.now();
  writeTimes = writeTimes.filter(t=>now-t < 3600000);
  if(writeTimes.length >= SYNC.maxWritesPerHour) throw new Error('写入过于频繁，请稍后再试');
  writeTimes.push(now);
}
async function apiUpdateFile(p, mutator, msg){
  assertWritablePath(p);
  guardWrite();
  for(let attempt=0; attempt<4; attempt++){
    const cur = await apiGetFile(p);
    let next;
    try{ next = await mutator(cur.data); }
    catch(e){ throw e; }
    const body = {message:msg, content:utf8ToB64(JSON.stringify(next))};
    if(cur.sha) body.sha = cur.sha;
    const r = await fetch(apiFileUrl(p), {
      method:'PUT',
      headers:Object.assign({'Content-Type':'application/json'}, authHeaders()),
      body:JSON.stringify(body)
    });
    if(r.ok) return next;
    if(r.status===409 || r.status===422){ await sleep(240*(attempt+1)); continue; }
    const d = await r.json().catch(()=>({}));
    throw new Error(r.status===401||r.status===403 ? '写令牌无权写入此仓库' : (d.message||('写入失败 '+r.status)));
  }
  throw new Error('并发写入冲突，请稍后重试');
}

// ---------- 只读通道（不消耗 API 配额） ----------
function relDataPath(p){ return p.replace(/^docs\/data\//,''); }
function fetchTimeout(url, ms){
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), ms||6000);
  return fetch(url, {cache:'no-store', signal:ctl.signal}).finally(()=>clearTimeout(timer));
}
async function tryJson(url, ms){
  try{
    const r = await fetchTimeout(url, ms||6000);
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
}
async function fetchRawFile(p, withRaw){
  const rel = relDataPath(p);
  const tasks = [tryJson('./data/'+rel+'?cb='+Date.now())];
  if(withRaw !== false) tasks.push(tryJson(rawFileUrl(p)+'?cb='+Date.now()));
  const arr = await Promise.all(tasks);
  let best = null;
  arr.forEach(j=>{
    if(j && j.version && (!best || (j.t||'') > (best.t||''))) best = j;
  });
  return best;
}
async function fetchRawPwd(p){
  const rel = relDataPath(p);
  const arr = await Promise.all([
    tryJson('./data/'+rel+'?cb='+Date.now()),
    tryJson(rawFileUrl(p)+'?cb='+Date.now(), 3000)
  ]);
  let best = null;
  arr.forEach(j=>{
    if(j && j.pass && (!best || (j.updated_at||'') > (best.updated_at||''))) best = j;
  });
  return best;
}

// ---------- 合并 ----------
function dedupAudit(arr){
  const seen = new Set();
  return (arr||[]).filter(v=>{
    if(!v) return false;
    const k = v.t+'|'+v.a+'|'+v.u+'|'+(v.d||'');
    if(seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(-600);
}
function mergeAccounts(remote){
  const list = remote.users || [];
  const map = new Map((S.users||[]).map(u=>[u.username,u]));
  list.forEach(u=>{
    if(S.deletedUsers.has(u.username)) return;
    if(S.dirtyUsers.has(u.username)) return;
    map.set(u.username, u);
  });
  S.users = Array.from(map.values()).sort((a,b)=>(a.id||0)-(b.id||0));
  S.seen_changelog = Object.assign({}, S.seen_changelog, remote.seen_changelog||{});
  if(remote.meta){
    S.meta = Object.assign({}, S.meta, remote.meta, {changelog: remote.meta.changelog || S.meta.changelog});
  }
  if(remote.t) S.t.accounts = remote.t;
}
function mergeRecords(remote){
  const map = new Map((S.records||[]).map(r=>[r.id,r]));
  (remote.records||[]).forEach(r=>{
    const old = map.get(r.id);
    map.set(r.id, old ? Object.assign({}, old, r, {revoked: !!(old.revoked||r.revoked)}) : r);
  });
  if(pending.records){
    (pending.records.adds||[]).forEach(r=>map.set(r.id,r));
    (pending.records.revokes||[]).forEach(id=>{ const r=map.get(id); if(r) r.revoked=true; });
  }
  S.records = Array.from(map.values());
  S.audit = dedupAudit([...(remote.audit||[]), ...(S.audit||[])]);
  if(remote.t) S.t.records = remote.t;
}
function mergeFeedback(remote){
  const map = new Map((S.feedback||[]).map(f=>[f.id,f]));
  (remote.feedback||[]).forEach(f=>{
    const old = map.get(f.id);
    map.set(f.id, old ? Object.assign({}, old, f) : f);
  });
  S.feedback = Array.from(map.values());
  if(remote.t) S.t.feedback = remote.t;
}
function refreshMe(){
  if(!me) return;
  const u = (S.users||[]).find(x=>x.username===me.username);
  if(!u){ logout(true); return; }
  me.permissions = u.permissions||[];
  me.real_name = u.real_name;
  me.role = u.role;
  me.id = u.id;
}
function applyRemote(st){
  if(!st) return false;
  let changed = false;
  if(st.accounts && st.accounts.t && st.accounts.t!==S.t.accounts){ mergeAccounts(st.accounts); changed=true; }
  if(st.records && st.records.t && st.records.t!==S.t.records){ mergeRecords(st.records); changed=true; }
  if(st.feedback && st.feedback.t && st.feedback.t!==S.t.feedback && canManageFeedback()){ mergeFeedback(st.feedback); changed=true; }
  if(changed){
    lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
    refreshMe();
    updateSyncLabel();
  }
  return changed;
}

// ---------- 本地缓存 ----------
function cacheSave(domain, data){
  try{ localStorage.setItem(CACHE_KEY(domain), JSON.stringify({t:data.t, data})); }catch(e){}
}
function cacheLoad(domain){
  try{
    const raw = localStorage.getItem(CACHE_KEY(domain));
    if(!raw) return null;
    const o = JSON.parse(raw);
    return (o && o.data && o.data.version) ? o.data : null;
  }catch(e){ return null; }
}

// ============================================================
// 写域
// ============================================================
function markUserDirty(u){
  if(!u) return;
  S.dirtyUsers.add(u.username);
}
async function writeRecordsDomain(auditEntries){
  const t = nowISO();
  const u = me ? me.username : 'system';
  const fresh = (auditEntries||[]).map(a=>({t, u, a:a.action, d:a.detail||''}));
  const next = await apiUpdateFile(F_RECORDS, remote=>{
    const map = new Map();
    ((remote && remote.records) || []).forEach(r=>map.set(r.id,r));
    (S.records||[]).forEach(r=>{
      const old = map.get(r.id);
      map.set(r.id, old ? Object.assign({}, old, {revoked: !!(old.revoked||r.revoked)}) : r);
    });
    const audit = dedupAudit([...((remote && remote.audit)||[]), ...(S.audit||[]), ...fresh]);
    return {version:DB_VERSION, t, records:Array.from(map.values()), audit};
  }, 'record: '+u+' '+((auditEntries||[]).map(a=>a.action).join(', ')||'更新'));
  S.records = next.records;
  S.audit = next.audit;
  S.t.records = t;
  cacheSave('records', next);
  lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
  updateSyncLabel();
}
async function writeAccountsDomain(){
  const t = nowISO();
  const next = await apiUpdateFile(F_ACCOUNTS, remote=>{
    const map = new Map();
    ((remote && remote.users) || []).forEach(x=>map.set(x.username,x));
    (S.users||[]).forEach(x=>{
      if(S.dirtyUsers.has(x.username) || !map.has(x.username)) map.set(x.username,x);
    });
    S.deletedUsers.forEach(n=>map.delete(n));
    const users = Array.from(map.values()).sort((a,b)=>(a.id||0)-(b.id||0));
    return {
      version:DB_VERSION, t, users,
      seen_changelog:Object.assign({}, (remote&&remote.seen_changelog)||{}, S.seen_changelog),
      meta:Object.assign({}, (remote&&remote.meta)||{}, S.meta)
    };
  }, 'account: '+(me?me.username:'system')+' 更新账号库');
  S.users = next.users;
  S.t.accounts = t;
  S.dirtyUsers.clear();
  S.deletedUsers.clear();
  cacheSave('accounts', next);
  lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
  updateSyncLabel();
}
async function writeFeedbackDomain(){
  const t = nowISO();
  const next = await apiUpdateFile(F_FEEDBACK, remote=>{
    const map = new Map();
    ((remote && remote.feedback) || []).forEach(f=>map.set(f.id,f));
    (S.feedback||[]).forEach(f=>map.set(f.id,f));
    return {version:DB_VERSION, t, feedback:Array.from(map.values())};
  }, 'feedback: '+(me?me.username:'system'));
  S.feedback = next.feedback;
  S.t.feedback = t;
  cacheSave('feedback', next);
  lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
  updateSyncLabel();
}
async function writePwdFile(username, passRecord){
  assertWritablePath(pwdPath(username));
  guardWrite();
  const body = {
    message:'pwd: '+username+' 更新密码',
    content:utf8ToB64(JSON.stringify({version:DB_VERSION, pass:passRecord, updated_at:nowISO()}))
  };
  const cur = await apiGetFile(pwdPath(username)).catch(()=>({sha:null}));
  if(cur && cur.sha) body.sha = cur.sha;
  const r = await fetch(apiFileUrl(pwdPath(username)), {
    method:'PUT',
    headers:Object.assign({'Content-Type':'application/json'}, authHeaders()),
    body:JSON.stringify(body)
  });
  if(!r.ok){
    const d = await r.json().catch(()=>({}));
    throw new Error(d.message||('密码写入失败 '+r.status));
  }
}

// ============================================================
// 暂存
// ============================================================
function persistPending(){
  try{ localStorage.setItem(PENDING_KEY, JSON.stringify({pending, pendingCount})); }catch(e){}
}
function loadPending(){
  try{
    const o = JSON.parse(localStorage.getItem(PENDING_KEY)||'null');
    if(o && o.pending){ pending = o.pending; pendingCount = o.pendingCount||0; }
  }catch(e){ pending = {records:null, accounts:null, pwd:null}; }
}
function countPending(){
  let n = 0;
  if(pending.records) n += (pending.records.adds||[]).length + (pending.records.revokes||[]).length;
  if(pending.accounts) n += (pending.accounts.upserts||[]).length + (pending.accounts.deletes||[]).length + Object.keys(pending.accounts.pwdMap||{}).length;
  if(pending.pwd) n += 1;
  return n;
}
function updatePendingUI(){
  pendingCount = countPending();
  const fab = $('pendingFab');
  if(!fab) return;
  fab.classList.toggle('hide', pendingCount===0);
  $('pendingCnt').textContent = pendingCount;
  updateSyncLabel();
}
function stageRecordsAdd(records){
  pending.records = pending.records || {adds:[], revokes:[]};
  (records||[]).forEach(r=>pending.records.adds.push(r));
  persistPending(); updatePendingUI();
}
function stageRecordsRevoke(id){
  pending.records = pending.records || {adds:[], revokes:[]};
  if(!pending.records.revokes.includes(id)) pending.records.revokes.push(id);
  persistPending(); updatePendingUI();
}
function stageAccountUpsert(user){
  markUserDirty(user);
  pending.accounts = pending.accounts || {upserts:[], deletes:[], pwdMap:{}};
  pending.accounts.upserts = (pending.accounts.upserts||[]).filter(u=>u.username!==user.username);
  pending.accounts.upserts.push(JSON.parse(JSON.stringify(user)));
  pending.accounts.deletes = (pending.accounts.deletes||[]).filter(n=>n!==user.username);
  persistPending(); updatePendingUI();
}
function stageAccountDelete(username){
  pending.accounts = pending.accounts || {upserts:[], deletes:[], pwdMap:{}};
  if(!pending.accounts.deletes.includes(username)) pending.accounts.deletes.push(username);
  pending.accounts.upserts = (pending.accounts.upserts||[]).filter(u=>u.username!==username);
  delete pending.accounts.pwdMap[username];
  persistPending(); updatePendingUI();
}
function stageAccountPwd(username, passRecord){
  pending.accounts = pending.accounts || {upserts:[], deletes:[], pwdMap:{}};
  pending.accounts.pwdMap[username] = passRecord;
  persistPending(); updatePendingUI();
}
function stageSelfPwd(passRecord){
  pending.pwd = {username: me ? me.username : '', pass: passRecord};
  persistPending(); updatePendingUI();
}
function pendingSummary(){
  const lines = [];
  if(pending.records){
    (pending.records.adds||[]).forEach(r=>lines.push('录入'+(r.category==='加分'?'加分':'扣分')+' · '+r.user_name+' · '+r.subject_or_item+(r.reason?('（'+r.reason+'）'):'')));
    (pending.records.revokes||[]).forEach(id=>lines.push('撤销记录 #'+id));
  }
  if(pending.accounts){
    (pending.accounts.upserts||[]).forEach(u=>lines.push('账号变更 · '+u.username+'（'+u.real_name+'）'));
    (pending.accounts.deletes||[]).forEach(n=>lines.push('删除用户 · '+n));
    Object.keys(pending.accounts.pwdMap||{}).forEach(n=>lines.push('重置密码 · '+n));
  }
  if(pending.pwd) lines.push('修改密码 · '+pending.pwd.username);
  return lines;
}
async function commitPending(){
  if(pendingCount===0) return;
  $('pendingMask').classList.add('hide');
  if(!await ensureUnlocked()) return;
  const hasAcc = !!(pending.accounts && ((pending.accounts.upserts||[]).length || (pending.accounts.deletes||[]).length || Object.keys(pending.accounts.pwdMap||{}).length));
  if(hasAcc){
    const ok = await requirePass('递交账号与密码变更前，请再次确认是你本人操作。');
    if(!ok){ toast('已取消递交'); return; }
  }
  if(busy) return;
  busy = true;
  const fab = $('pendingFab'); if(fab) fab.classList.add('busy');
  const summary = pendingSummary();
  const auditEntries = [];
  if(pending.records){
    (pending.records.adds||[]).forEach(r=>auditEntries.push({action:r.category==='加分'?'录入加分':'录入扣分', detail:r.user_name+' '+r.subject_or_item}));
    (pending.records.revokes||[]).forEach(id=>auditEntries.push({action:'撤销记录', detail:String(id)}));
  }
  if(pending.accounts){
    (pending.accounts.upserts||[]).forEach(u=>auditEntries.push({action:'修改账号', detail:u.username}));
    (pending.accounts.deletes||[]).forEach(n=>auditEntries.push({action:'删除用户', detail:n}));
    Object.keys(pending.accounts.pwdMap||{}).forEach(n=>auditEntries.push({action:'重置密码', detail:n}));
  }
  if(pending.pwd) auditEntries.push({action:'修改密码', detail:pending.pwd.username});
  try{
    const tasks = [writeRecordsDomain(auditEntries)];
    if(pending.accounts){
      tasks.push(writeAccountsDomain());
      for(const [uname, pass] of Object.entries(pending.accounts.pwdMap||{})) tasks.push(writePwdFile(uname, pass));
    }
    if(pending.pwd){
      tasks.push(writePwdFile(pending.pwd.username, pending.pwd.pass));
      if(!pending.accounts){
        const self = (S.users||[]).find(u=>u.username===pending.pwd.username);
        if(self) markUserDirty(self);
        tasks.push(writeAccountsDomain());
      }
    }
    await Promise.all(tasks);
    pending = {records:null, accounts:null, pwd:null};
    persistPending(); updatePendingUI();
    toast('已递交 '+summary.length+' 项更新');
    renderAll();
  }catch(e){
    toast(errText(e), true);
  }finally{
    busy = false;
    if(fab) fab.classList.remove('busy');
  }
}
function errText(e){
  const m = e && e.message ? e.message : String(e);
  if(m==='WRITE_LOCKED') return '写入未解锁，请先输入写入口令';
  if(/Failed to fetch|NetworkError/.test(m)) return '网络不可用，请检查连接后重试';
  return m;
}

// ============================================================
// 会话与登录
// ============================================================
const WEAK_DEFAULT = '123456';
function saveSession(){
  if(!me) return;
  const exp = Date.now() + (me.remember ? 7*864e5 : 12*36e5);
  const payload = JSON.stringify({username:me.username, remember:me.remember, exp});
  try{
    if(me.remember) localStorage.setItem(SESSION_LONG, payload);
    else sessionStorage.setItem(SESSION_TMP, payload);
  }catch(e){}
}
function clearSession(){
  try{ localStorage.removeItem(SESSION_LONG); }catch(e){}
  try{ sessionStorage.removeItem(SESSION_TMP); }catch(e){}
}
function readSession(){
  let sv = null;
  try{ sv = JSON.parse(localStorage.getItem(SESSION_LONG)||'null'); }catch(e){}
  if(!sv){ try{ sv = JSON.parse(sessionStorage.getItem(SESSION_TMP)||'null'); }catch(e){} }
  if(!sv || !sv.username) return null;
  if(sv.exp && Date.now() > sv.exp){ clearSession(); return null; }
  return sv;
}
async function loadPwd(username){
  if(S.pwdCache[username]) return S.pwdCache[username];
  try{
    const st = await fetchRawPwd(pwdPath(username));
    if(st && st.pass){ S.pwdCache[username] = st.pass; return st.pass; }
  }catch(e){}
  return null;
}
async function doLogin(){
  const username = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  const remember = $('loginRemember').checked;
  $('loginErr').textContent = '';
  if(!username || !pass){ $('loginErr').textContent = '请输入账号和密码'; return; }
  if(!dataReady){ $('loginErr').textContent = '账号数据还在加载，请稍候再试'; return; }
  if(!S.users.length){ $('loginErr').textContent = '没能加载账号数据，请刷新页面'; return; }
  const u = (S.users||[]).find(x=>x.username===username);
  const stored = u ? await loadPwd(username) : null;
  const v = stored ? await verifyPwd(pass, stored) : {ok:false};
  if(!u || !v.ok){
    $('loginErr').textContent = '账号或密码不正确';
    return;
  }
  me = {id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember};
  saveSession();
  if(v.legacy){
    try{
      const np = await makePwdRecord(pass);
      S.pwdCache[username] = np;
      if(ghToken) await writePwdFile(username, np);
    }catch(e){ /* 升级失败不阻断登录 */ }
  }
  $('loginView').classList.add('hide');
  $('appView').classList.remove('hide');
  document.body.classList.remove('login-mode');
  document.body.classList.add('in-app');
  curView = canViewStats() ? 'dashboard' : 'personal';
  renderAll();
  // 首次登录优先设置密码，更新日志放到之后；等徽标归位再弹，避免挡住动画
  const afterLogin = ()=>{
    if(u.must_change && u.role!=='admin') openChangePass(true);
    else if(!seenCurrentRelease(u.username)) showChangelog();
  };
  if(window.CMBrand) window.CMBrand.flyToSlot().then(afterLogin, afterLogin);
  else afterLogin();
  if(ghToken) toast('已登录，写入已解锁');
}
function logout(silent){
  if(!silent && pendingCount>0){
    askConfirm('有 '+pendingCount+' 项未递交的更改，退出后会丢失。', '退出登录').then(y=>{
      if(y) doLogout();
    });
    return;
  }
  doLogout();
}
function doLogout(){
  me = null;
  clearSession();
  lockWrite(true);
  $('appView').classList.add('hide');
  $('loginView').classList.remove('hide');
  document.body.classList.add('login-mode');
  document.body.classList.remove('in-app');
  $('loginPass').value = '';
  if(window.CMBrand) window.CMBrand.reset();
}
function restoreSession(){
  const sv = readSession();
  if(!sv) return false;
  const u = (S.users||[]).find(x=>x.username===sv.username);
  if(!u){ clearSession(); return false; }
  me = {id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember:!!sv.remember};
  $('loginView').classList.add('hide');
  $('appView').classList.remove('hide');
  document.body.classList.remove('login-mode');
  document.body.classList.add('in-app');
  curView = canViewStats() ? 'dashboard' : 'personal';
  renderAll();
  if(window.CMBrand) window.CMBrand.hide();
  return true;
}

// ============================================================
// 写入解锁
// ============================================================
function lockWrite(silent){
  ghToken = '';
  try{ sessionStorage.removeItem(GH_SESSION); }catch(e){}
  updateLockUI();
  if(!silent) toast('写入已锁定，本设备需要重新输入口令');
}
function restoreWrite(){
  try{
    const t = sessionStorage.getItem(GH_SESSION);
    if(t && /^github_pat_|^ghp_/.test(t)) ghToken = t;
  }catch(e){}
  updateLockUI();
}
function updateLockUI(){
  const b = $('btnLock');
  if(!b) return;
  if(ghToken){
    b.textContent = '写入已解锁';
    b.style.color = 'var(--accent)';
  }else{
    b.textContent = '解锁写入';
    b.style.color = '';
  }
  renderNet();
}
function openUnlock(){
  return new Promise(res=>{
    const mask = $('unlockMask');
    $('unlockPass').value = '';
    $('unlockErr').textContent = '';
    mask.classList.remove('hide');
    setTimeout(()=>$('unlockPass').focus(), 30);
    const done = v=>{
      mask.classList.add('hide');
      $('btnUnlockOk').onclick = null;
      $('btnUnlockNo').onclick = null;
      $('unlockPass').onkeydown = null;
      res(v);
    };
    const submit = async ()=>{
      const pass = $('unlockPass').value;
      if(!pass){ $('unlockErr').textContent = '请输入写入口令'; return; }
      $('btnUnlockOk').disabled = true;
      try{
        const t = await openVault(pass);
        ghToken = t;
        try{ sessionStorage.setItem(GH_SESSION, t); }catch(e){}
        updateLockUI();
        done(true);
      }catch(e){
        $('unlockErr').textContent = e.message || '解锁失败';
      }finally{
        $('btnUnlockOk').disabled = false;
      }
    };
    $('btnUnlockOk').onclick = submit;
    $('btnUnlockNo').onclick = ()=>done(false);
    $('unlockPass').onkeydown = e=>{ if(e.key==='Enter') submit(); };
  });
}
async function ensureUnlocked(){
  if(!canUnlockWrite()){ toast('该账号未被授予录入权限', true); return false; }
  if(ghToken) return true;
  const ok = await openUnlock();
  return !!ok;
}

// ============================================================
// 导航与渲染
// ============================================================
function menuDefs(){
  return [
    {key:'dashboard', ico:'dash', label:'班级看板', show:()=>canViewStats()},
    {key:'summary', ico:'note', label:'周与学期小结', show:()=>true},
    {key:'student-summary', ico:'board', label:'同学扣分汇总', show:()=>canViewStats()},
    {key:'record-create', ico:'minus', label:'录入扣分', show:()=>ALL_CATS.filter(c=>c!=='加分' && canEnter(me.role,c)).length>0},
    {key:'bonus-create', ico:'plus', label:'录入加分', show:()=>canEnter(me.role,'加分')},
    {key:'records', ico:'list', label:'扣分记录', show:()=>canViewRecords()},
    {key:'personal', ico:'user', label:'个人统计', show:()=>true},
    {key:'feedback', ico:'chat', label:'意见反馈', show:()=>true},
    {key:'users', ico:'users', label:'用户管理', show:()=>canManageUsers()},
    {key:'about', ico:'info', label:'关于与部署', show:()=>true}
  ].filter(x=>x.show());
}
function nav(key){
  if(pendingCount>0 && (curView==='record-create'||curView==='bonus-create') && key!==curView){
    UI.create.selected = new Set();
  }
  curView = key;
  renderMenu();
  renderViewSafe(true);
  closeMenu();
}
// views.js 与 app.js 并行解析，首屏可能在视图函数就绪前触发渲染，这里做一次等待
let viewAnimating = false;
function renderViewSafe(animate){
  const paint = ()=>renderView();
  if(typeof renderView !== 'function'){
    if(renderViewSafe._t) return;
    renderViewSafe._t = setTimeout(()=>{ renderViewSafe._t = 0; renderViewSafe(animate); }, 40);
    return;
  }
  const main = $('main');
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(!animate || !main || reduce || viewAnimating){ paint(); return; }
  viewAnimating = true;
  main.classList.add('is-leaving');
  setTimeout(()=>{
    paint();
    main.classList.remove('is-leaving');
    main.classList.add('is-entering');
    void main.offsetWidth;               // 强制回流，让起始态生效
    requestAnimationFrame(()=>{
      main.classList.remove('is-entering');
      setTimeout(()=>{ viewAnimating = false; }, 200);
    });
  }, 120);
}
// ---------- 侧边栏折叠 ----------
const SIDE_KEY = 'cm_side';
function sideMini(){ return !!(document.getElementById('appView')||{}).classList?.contains('side-mini'); }
function applySide(mini){
  const app = $('appView');
  if(!app) return;
  app.classList.toggle('side-mini', !!mini);
  const b = $('btnSideToggle');
  if(b){
    b.setAttribute('aria-pressed', mini ? 'true' : 'false');
    b.title = mini ? '展开侧边栏' : '收起侧边栏';
    b.setAttribute('aria-label', b.title);
  }
  syncAvatar();
}
function syncAvatar(){
  const av = $('meAvatar');
  if(!av) return;
  const nm = me ? (me.real_name || me.username || '') : '';
  av.textContent = nm ? nm.slice(0,1) : '·';
}
function toggleSide(){
  const app = $('appView');
  if(!app) return;
  const mini = !app.classList.contains('side-mini');
  applySide(mini);
  try{ localStorage.setItem(SIDE_KEY, mini ? '1' : '0'); }catch(e){}
}
function initSide(){
  let mini = false;
  try{ mini = localStorage.getItem(SIDE_KEY) === '1'; }catch(e){}
  applySide(mini);
}

// ---------- 递交通道检测 ----------
const NET_URL = 'https://api.github.com/rate_limit';
let netState = 'checking';
let netMs = 0;
let netTimer = 0;
let netAt = 0;
function netInfo(){
  if(netState === 'checking') return {dot:'dot off', text:'检测网络…', long:'正在检测 GitHub 递交通道…', bad:false};
  if(netState === 'ok'){
    const slow = netMs >= 1500;
    return {dot:'dot',
            text: ghToken ? 'GitHub 可递交' : 'GitHub 可递交 · 需解锁',
            long: slow ? 'GitHub 通道正常，但当前网络较慢' : 'GitHub 通道正常，可以递交扣分',
            bad:false};
  }
  return {dot:'dot bad', text:'GitHub 不可达', long:'连不上 GitHub，暂时只能查看，不能递交', bad:true};
}
function renderNet(){
  const i = netInfo();
  const t = $('netText');
  if(t){
    const d = t.querySelector('.dot'); if(d) d.className = i.dot;
    const l = t.querySelector('.net-label');
    if(l){ l.textContent = i.text; l.classList.toggle('bad', i.bad); }
  }
  const n = $('netLine');
  if(n){
    const d = n.querySelector('.dot'); if(d) d.className = i.dot;
    const l = n.querySelector('.net-text');
    if(l){ l.textContent = i.long; l.classList.toggle('bad', i.bad); }
  }
}
async function checkNet(){
  if(typeof navigator !== 'undefined' && navigator.onLine === false){
    netState = 'block'; netMs = 0; renderNet(); return;
  }
  if(netState !== 'ok'){ netState = 'checking'; renderNet(); }
  const t0 = (window.performance || Date).now();
  try{
    const r = await fetchTimeout(NET_URL + '?t=' + Date.now(), 5000);
    netState = r.ok ? 'ok' : 'block';
  }catch(e){
    netState = 'block';
  }
  netMs = Math.round((window.performance || Date).now() - t0);
  netAt = Date.now();
  renderNet();
  clearTimeout(netTimer);
  netTimer = setTimeout(()=>{ if(!document.hidden) checkNet(); }, 180000);
}

function renderMenu(){
  const menu = $('menu');
  const defs = menuDefs();
  menu.innerHTML = defs.map(d=>`
    <div class="menu-item${curView===d.key?' active':''}" data-key="${d.key}" role="link" tabindex="0" title="${esc(d.label)}">
      ${icon(d.ico)}<span>${esc(d.label)}</span>
    </div>`).join('');
  menu.querySelectorAll('.menu-item').forEach(el=>{
    el.onclick = ()=>nav(el.dataset.key);
    el.onkeydown = e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); nav(el.dataset.key); } };
  });
  const nm = me ? (me.real_name||me.username) : '';
  $('whoami').textContent = nm;
  const rt = $('roleTag');
  const rtText = me ? roleText(me.role) : '';
  rt.textContent = rtText;
  rt.style.display = (rtText && rtText !== nm) ? '' : 'none';
  $('brandMeta').textContent = 'v'+APP_VERSION;
  syncAvatar();
  updateLockUI();
}
function renderAll(){
  renderMenu();
  renderViewSafe(false);
  updateSyncLabel();
  updatePendingUI();
}
function viewIsBusy(){
  if(document.querySelector('.mask:not(.hide)')) return true;
  const el = document.activeElement;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
function updateSyncLabel(){
  const el = $('syncText');
  if(!el) return;
  const t = lastSavedAt ? fmtTime(lastSavedAt) : '';
  const state = pendingCount>0 ? 'warn' : (lastSavedAt ? '' : 'off');
  el.innerHTML = `<span class="dot ${state}"></span><span>${pendingCount>0
    ? ('待递交 '+pendingCount+' 项')
    : (t ? ('已同步 · '+t) : '同步中')}</span>`;
}
function showRefreshChip(){
  staleData = true;
  const chip = $('refreshChip');
  if(!chip) return;
  chip.classList.remove('hide');
  chip.innerHTML = '有新的记录 '+icon('refresh',14);
  chip.onclick = ()=>{
    chip.classList.add('hide');
    staleData = false;
    renderAll();
  };
}

// ============================================================
// 轮询
// ============================================================
let pollingTimer = null;
async function poll(){
  if(document.hidden || busy || !S.users.length) return;
  try{
    const [acc, rec] = await Promise.all([fetchRawFile(F_ACCOUNTS), fetchRawFile(F_RECORDS)]);
    let changed = false;
    if(acc && acc.t && acc.t!==S.t.accounts){ mergeAccounts(acc); cacheSave('accounts', acc); changed = true; }
    if(rec && rec.t && rec.t!==S.t.records){ mergeRecords(rec); cacheSave('records', rec); changed = true; }
    if(changed){
      lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
      refreshMe();
      if(!me) return;
      if(viewIsBusy()) showRefreshChip();
      else { if(staleData){ $('refreshChip').classList.add('hide'); staleData=false; } renderAll(); }
      updateSyncLabel();
      renderLoginPreview();
    }
  }catch(e){ /* 轮询失败静默重试 */ }
}
function startPolling(){
  if(pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(poll, 10000);
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden) poll();
  });
}

// ============================================================
// 更新日志
// ============================================================
function seenCurrentRelease(username){
  return S.seen_changelog[username]===APP_VERSION;
}
function showChangelog(){
  const notes = RELEASE_NOTES;
  $('changelogTitle').textContent = '更新到 v'+APP_VERSION;
  $('changelogList').innerHTML = notes.map(n=>`<li>${esc(n)}</li>`).join('');
  $('changelogMask').classList.remove('hide');
  $('btnChangelogOk').onclick = async ()=>{
    $('changelogMask').classList.add('hide');
    if(!me) return;
    S.seen_changelog[me.username] = APP_VERSION;
    try{
      if(ghToken) await writeAccountsDomain();
      else cacheSave('accounts', {version:DB_VERSION, t:S.t.accounts, users:S.users, seen_changelog:S.seen_changelog, meta:S.meta});
    }catch(e){ /* 已读状态写失败不影响使用 */ }
  };
}

// ============================================================
// 通用对话框
// ============================================================
function askConfirm(msg, title, okText){
  return new Promise(res=>{
    $('confirmTitle').textContent = title || '请确认';
    $('confirmMsg').textContent = msg;
    $('btnConfirmOk').textContent = okText || '确定';
    $('confirmMask').classList.remove('hide');
    const done = v=>{
      $('confirmMask').classList.add('hide');
      $('btnConfirmOk').onclick = null;
      $('btnConfirmNo').onclick = null;
      res(v);
    };
    $('btnConfirmOk').onclick = ()=>done(true);
    $('btnConfirmNo').onclick = ()=>done(false);
  });
}
function requirePass(msg){
  return new Promise(res=>{
    const mask = $('passMask');
    $('passMsg').textContent = msg || '请输入当前密码以确认操作。';
    $('passInput').value = '';
    $('passErr').textContent = '';
    mask.classList.remove('hide');
    setTimeout(()=>$('passInput').focus(), 30);
    const done = v=>{
      mask.classList.add('hide');
      $('btnPassOk').onclick = null;
      $('btnPassNo').onclick = null;
      $('passInput').onkeydown = null;
      res(v);
    };
    $('btnPassNo').onclick = ()=>done(false);
    $('btnPassOk').onclick = async ()=>{
      const stored = me ? (S.pwdCache[me.username] || await loadPwd(me.username)) : null;
      const ok = await verifyPwd($('passInput').value, stored);
      if(!ok.ok){ $('passErr').textContent = '密码不正确'; return; }
      done(true);
    };
    $('passInput').onkeydown = e=>{ if(e.key==='Enter') $('btnPassOk').click(); };
  });
}
function openPendingDialog(){
  if(pendingCount===0) return;
  const list = pendingSummary();
  $('pendingTotal').textContent = list.length;
  $('pendingList').innerHTML = list.map(x=>`<li>${esc(x)}</li>`).join('');
  $('pendingMask').classList.remove('hide');
  $('btnPendingOk').onclick = ()=>commitPending();
  $('btnPendingNo').onclick = ()=>{ $('pendingMask').classList.add('hide'); };
  $('btnPendingDiscard').onclick = async ()=>{
    const y = await askConfirm('放弃全部 '+pendingCount+' 项暂存更改？','放弃暂存','放弃');
    if(!y) return;
    pending = {records:null, accounts:null, pwd:null};
    persistPending(); updatePendingUI();
    $('pendingMask').classList.add('hide');
    await poll();
    const [acc, rec] = await Promise.all([fetchRawFile(F_ACCOUNTS), fetchRawFile(F_RECORDS)]);
    if(acc) mergeAccounts(acc);
    if(rec) mergeRecords(rec);
    renderAll();
    toast('已放弃暂存更改');
  };
}

// ============================================================
// 移动端菜单
// ============================================================
function toggleMenu(force){
  const app = $('appView');
  const open = force!==undefined ? force : !app.classList.contains('menu-open');
  app.classList.toggle('menu-open', open);
}
function closeMenu(){ toggleMenu(false); }

// ============================================================
// 登录页真实数字（不含姓名）
// ============================================================
function renderLoginPreview(){
  const rs = (S.records||[]).filter(r=>!r.revoked);
  const [ws, we] = weekRange();
  const week = rs.filter(r=>inRange(fmtDate(r.record_date), ws, we));
  const net = rs.reduce((a,r)=>a+(r.score||0),0);
  const stu = (S.users||[]).filter(u=>u.role==='student').length;
  const set = (id, v)=>{ const el=$(id); if(el) el.textContent = v; };
  set('leadWeek', week.length);
  set('leadStudents', stu);
  set('leadNet', (net>0?'+':'')+net);
}

// ============================================================
// 事件绑定与启动
// ============================================================
function bindEvents(){
  $('btnLogin').onclick = doLogin;
  $('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  $('loginUser').addEventListener('keydown', e=>{ if(e.key==='Enter') $('loginPass').focus(); });
  $('btnLogout').onclick = ()=>logout(false);
  $('btnChgPass').onclick = ()=>openChangePass(false);
  $('btnLock').onclick = async ()=>{
    if(ghToken){
      const y = await askConfirm('锁定后本设备需要重新输入写入口令才能录入。','锁定写入','锁定');
      if(y) lockWrite();
      return;
    }
    if(!canUnlockWrite()){ toast('该账号未被授予录入权限', true); return; }
    const ok = await openUnlock();
    if(ok) toast('写入已解锁');
  };
  initSide();
  $('btnSideToggle').onclick = toggleSide;
  $('meAvatar').onclick = ()=>{ applySide(false); try{ localStorage.setItem(SIDE_KEY,'0'); }catch(e){} };
  $('netText').onclick = ()=>checkNet();
  $('btnNetRetry').onclick = ()=>checkNet();
  window.addEventListener('online', ()=>checkNet());
  window.addEventListener('offline', ()=>{ netState='block'; netMs=0; renderNet(); });
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && Date.now() - netAt > 120000) checkNet();
  });
  checkNet();
  $('btnBurger').innerHTML = icon('menu', 18);
  $('btnBurger').onclick = ()=>toggleMenu();
  $('menuBackdrop').onclick = ()=>closeMenu();
  $('pendingFab').onclick = ()=>openPendingDialog();
  $('refreshChip').classList.add('hide');
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      const open = document.querySelector('.mask:not(.hide)');
      if(open && open.id!=='passMask' && open.id!=='unlockMask') open.classList.add('hide');
      closeMenu();
    }
  });
}
function defaultState(){
  return {
    users:[], records:[], audit:[], feedback:[], seen_changelog:{},
    meta:{version:APP_VERSION, semester_start:'2026-09-01', changelog:[]},
    pwdCache:{}, t:{accounts:'', records:'', feedback:''},
    dirtyUsers:new Set(), deletedUsers:new Set()
  };
}
function applyLocal(domain, data){
  if(!data || !data.version) return;
  if(domain==='accounts'){
    S.users = data.users||[];
    S.seen_changelog = data.seen_changelog||{};
    S.meta = Object.assign(S.meta, data.meta||{});
    S.t.accounts = data.t||'';
  }else if(domain==='records'){
    S.records = data.records||[];
    S.audit = data.audit||[];
    S.t.records = data.t||'';
  }else if(domain==='feedback'){
    S.feedback = data.feedback||[];
    S.t.feedback = data.t||'';
  }
}
(async function boot(){
  document.body.classList.add('login-mode');
  bindEvents();
  restoreWrite();
  loadPending();
  updatePendingUI();
  $('leadVer').textContent = 'v'+APP_VERSION;
  $('brandMeta').textContent = 'v'+APP_VERSION;
  const lb = $('btnLogin');
  if(lb){ lb.disabled = true; lb.textContent = '正在加载'; }
  // 兜底：网络异常时也不要让登录按钮一直不可用
  setTimeout(()=>{
    if(dataReady) return;
    dataReady = true;
    const b = $('btnLogin');
    if(b){ b.disabled = false; b.textContent = '登录'; }
  }, 9000);

  const ca = cacheLoad('accounts'), cr = cacheLoad('records'), cf = cacheLoad('feedback');
  applyLocal('accounts', ca); applyLocal('records', cr); applyLocal('feedback', cf);
  if(ca && cr) lastSavedAt = Math.max(S.t.accounts, S.t.records, S.t.feedback||'');
  renderLoginPreview();

  try{
    // 首屏先读同源 CDN，raw 源站交给首轮轮询补最新，避免拖慢打开速度
    const [acc, rec, fb] = await Promise.all([fetchRawFile(F_ACCOUNTS, false), fetchRawFile(F_RECORDS, false), fetchRawFile(F_FEEDBACK, false)]);
    if(acc && acc.t && acc.t!==S.t.accounts){ applyLocal('accounts', acc); cacheSave('accounts', acc); }
    if(rec && rec.t && rec.t!==S.t.records){ applyLocal('records', rec); cacheSave('records', rec); }
    if(fb && fb.t && fb.t!==S.t.feedback){ applyLocal('feedback', fb); cacheSave('feedback', fb); }
    if(acc || rec) lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
  }catch(e){ /* 离线时用缓存 */ }

  if(!S.users.length && !S.records.length) S = defaultState();
  renderLoginPreview();
  dataReady = true;
  const loginBtn = $('btnLogin');
  if(loginBtn){ loginBtn.disabled = false; loginBtn.textContent = '登录'; }

  if(!restoreSession()){
    $('loginView').classList.remove('hide');
    $('appView').classList.add('hide');
  }else{
    startPolling();
    poll();
  }
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && me) startPolling(); });
})();
