/* ============================================================
 * 班级量化考核管理系统 · GitHub Pages 在线版 v1.3.0
 * 架构（参照 classroom-seat-arranger，v1.3.0 数据库拆分）：
 *   - GitHub Pages 静态托管，无后端服务器
 *   - 数据持久化：多文件存储于仓库 docs/data/
 *       accounts.json      —— 账号控制库（用户/角色/权限/性别/已读日志）
 *       records.json       —— 扣分/加分记录库 + 操作审计日志
 *       feedback.json      —— 意见反馈库
 *       users/<账号>/pwd.json —— 每用户独立密码文件
 *     通过 GH_TOKEN 调用 GitHub Contents API 读写（提交到仓库）
 *   - 实时同步：多端轮询（Pages CDN + raw 源站双通道，无 API 配额消耗）
 *   - v1.3.0 功能更新：
 *       · 学科老师账号（语文老师/英语老师），首登强制改密
 *       · 看板账号更名「看板」，可查看扣分明细，密码自助修改
 *       · 扣分记录全面显示原因（含备注），无备注显示「无备注」
 *       · 所有扣分/加分类别新增「其它」，选「其它」必填备注
 *       · 数据库拆分多文件，读写更高效
 *       · 「暂存-递交更新」：加/减分与账号修改先暂存，确认后统一递交
 *       · 按 2706 名单修复学生性别
 * ============================================================ */
'use strict';

// ---------- 配置 ----------
const SYNC = {
  owner: 'tangyuan9325',
  repo: 'class-deduction',
  branch: 'main',
  dataDir: 'docs/data',
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com'
};
const pagesUrl = `https://${SYNC.owner}.github.io/${SYNC.repo}/`;
const APP_VERSION = '1.3.0';
const DB_VERSION = 5;
const PBKDF2_ITER = 600000;
const F_ACCOUNTS = `${SYNC.dataDir}/accounts.json`;
const F_RECORDS   = `${SYNC.dataDir}/records.json`;
const F_FEEDBACK  = `${SYNC.dataDir}/feedback.json`;
const pwdPath = uname => `${SYNC.dataDir}/users/${uname}/pwd.json`;

// 扣分/加分类别字典（v1.3.0：各小类新增「其它」）
const DICT = {
  deduct: [
    {name:'学习', items:['语文','数学','英语','物理','化学','技术','地理','历史','生物','政治','其它']},
    {name:'寝室', items:['地未拖','灯未关','垃圾未倒','地不干净','熄灯后聊天','床铺不整','物品摆放乱','其它']},
    {name:'日常', items:['迟到','卫生','纪律','其它']},
    {name:'两操', items:['早操迟到','早操缺席','课间操违纪','眼保健操','跑操秩序','其它']}
  ],
  bonus: ['助人为乐','学习进步','卫生优秀','纪律良好','比赛获奖','班级贡献','好人好事','其它']
};

// ---------- 全局状态 ----------
let S = {                       // 内存数据（多域合并视图）
  users: [],                    // 账号控制（无密码）
  records: [],
  audit: [],
  feedback: [],
  seen_changelog: {},
  meta: {version:APP_VERSION, semester_start:'2026-09-01', changelog:[]},
  pwdCache: {},                 // username -> 密码记录串
  t: {accounts:'', records:'', feedback:''}   // 各域最新时间戳
};
let me = null;                  // 当前会话
let curView = 'dashboard';
let lastSavedAt = '';
let isWriting = false;
let busy = false;
// v1.3.0：暂存-递交
let pending = {records:null, accounts:null, pwd:null};
let pendingCount = 0;
const PENDING_KEY = 'cm_pending_v5';
const CACHE_KEY = n => 'cm_cache_'+n;

// ---------- 工具 ----------
const $ = id => document.getElementById(id);
let toastTimer = null;
function toast(msg, err=false){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.className='toast', 2600);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sha256hex(str){
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    .then(buf => Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''));
}
// ---------- PBKDF2 密码 ----------
function b64ToBuf(b64){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function bufToB64(buf){ let bin=''; const u=new Uint8Array(buf); for(let i=0;i<u.length;i++) bin+=String.fromCharCode(u[i]); return btoa(bin); }
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
    const parts = String(stored).split('$');
    if(parts.length!==4) return {ok:false};
    const iter = parseInt(parts[1],10)||PBKDF2_ITER;
    const h = await pbkdf2Derive(pass, parts[2], iter);
    return {ok: h===parts[3], legacy:false};
  }
  const h = await sha256hex(pass);
  return {ok: h===stored, legacy:true};
}
function csvSafe(v){
  const s = String(v==null?'':v);
  return /^[=+\-@\t\r]/.test(s) ? "'"+s : s;
}
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
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
function inRange(dateStr, start, end){ return dateStr>=start && dateStr<=end; }
function weekNumOf(dateStr){
  const sem = S.meta.semester_start || '2026-09-01';
  const t0=new Date(sem), t1=new Date(dateStr);
  return Math.max(1, Math.floor((t1-t0)/6048e5)+1);
}
function monthRange(ref){
  const d = ref?new Date(ref):new Date();
  const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  const e = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return [s, fmtDate(e)];
}

// ---------- 权限（v1.3.0：学科老师按 permissions 限定类别） ----------
const ALL_CATS = ['学习','寝室','日常','两操','加分'];
function isAdmin(){ return me && me.role==='admin'; }
function isTeacher(){ return me && me.role==='teacher'; }
function isStaff(){ return me && (me.role==='admin'||me.role==='teacher'); }
function isViewer(){ return me && me.role==='viewer'; }
function permOf(u){ return (u && u.permissions) || []; }
function teacherUnrestricted(){ return isTeacher() && permOf(me).length===0; }
function canEnter(role, cat){
  if(role==='admin') return true;
  if(role==='viewer') return false;
  if(role==='teacher'){ const p=permOf(me); return p.length===0 || p.includes('全部') || p.includes(cat); }
  return permOf(me).includes(cat);
}
function canViewRecords(){
  if(!me) return false;
  return isAdmin() || teacherUnrestricted() || permOf(me).includes('查看扣分记录');
}
function canViewStats(){
  if(!me) return false;
  return isStaff() || isViewer() || permOf(me).includes('查看班级');
}
function canManageUsers(){ return isAdmin(); }
function canManageFeedback(){ return isStaff(); }
// 撤销记录权限：管理员 / 有任一录入权限者（看板等只读账号不可撤销）
function canRevoke(){
  if(isAdmin()) return true;
  const p=me.permissions||[];
  if(p.length===0) return false;
  return ALL_CATS.filter(c=>c!=='加分').some(c=>p.includes(c)) || p.includes('加分');
}
function roleText(r){ return {admin:'管理员',teacher:'老师',student:'学生',viewer:'看板账号'}[r]||r; }

// ============================================================
// GitHub 同步层（多文件）
// ============================================================
function apiFileUrl(p){ return `${SYNC.apiBase}/repos/${SYNC.owner}/${SYNC.repo}/contents/${p}`; }
function rawFileUrl(p){ return `${SYNC.rawBase}/${SYNC.owner}/${SYNC.repo}/${SYNC.branch}/${p}`; }
function pagesFileUrl(p){ return `${pagesUrl}${p}`; }

// API 读单个文件：{sha, data, etag}
async function apiGetFile(p){
  const headers = {Authorization:'Bearer '+GH_TOKEN};
  const r = await fetch(apiFileUrl(p), {headers, cache:'no-store'});
  if(r.status===304){ return {sha:null, data:null, unchanged:true}; }
  if(!r.ok){ const d=await r.json().catch(()=>({})); throw new Error(d.message||('读取失败 '+r.status)); }
  const d = await r.json();
  return {sha: d.sha, data: JSON.parse(decodeURIComponent(escape(atob(d.content))))};
}
// API 写单个文件（read-merge-write 由调用方负责数据合并；此处带 409 重试）
async function apiPutFile(p, data, msg){
  for(let attempt=0; attempt<6; attempt++){
    const cur = await apiGetFile(p).catch(()=>({sha:null, data:null}));
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const body = {message: msg||('update '+new Date().toLocaleString('zh-CN')), content, sha: cur.sha||undefined};
    const r = await fetch(apiFileUrl(p), {method:'PUT', headers:{Authorization:'Bearer '+GH_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if(r.ok) return;
    if(r.status===409) continue;
    const d = await r.json().catch(()=>({}));
    throw new Error(d.message||('写入失败 '+r.status));
  }
  throw new Error('并发写入冲突，请重试');
}
// 本地相对路径 + raw 源站双通道读取较新版本（不消耗 API 配额；部署于 Pages 时相对路径即 CDN）
async function fetchRawFile(p){
  const rel = p.replace(/^docs\/data\//,'');
  const sources=[
    ()=>fetch('./data/'+rel+'?cb='+Date.now(),{cache:'no-store'}),
    ()=>fetch(rawFileUrl(p)+'?cb='+Date.now(),{cache:'no-store'})
  ];
  let best=null;
  for(const f of sources){
    try{
      const r=await f();
      if(r.ok){
        const j=await r.json();
        if(j && j.version){ if(!best || (j.t||'')>(best.t||'')) best=j; }
      }
    }catch(e){}
  }
  return best;
}
// 密码文件读取（无 version 字段，按 updated_at 取较新）
async function fetchRawPwd(p){
  const rel = p.replace(/^docs\/data\//,'');
  const sources=[
    ()=>fetch('./data/'+rel+'?cb='+Date.now(),{cache:'no-store'}),
    ()=>fetch(rawFileUrl(p)+'?cb='+Date.now(),{cache:'no-store'})
  ];
  let best=null;
  for(const f of sources){
    try{
      const r=await f();
      if(r.ok){
        const j=await r.json();
        if(j && j.pass){ if(!best || (j.updated_at||'')>(best.updated_at||'')) best=j; }
      }
    }catch(e){}
  }
  return best;
}

// ---------- 域合并 ----------
function dedupAudit(arr){
  return (arr||[]).filter((v,i,a)=>a.findIndex(x=>x.t===v.t && x.a===v.a && x.u===v.u)===i);
}
function mergeAccounts(remote){
  // 本地有未递交的账号修改时，用户列表以本地为准；否则远程为准
  const hasPendingAcc = !!(pending.accounts && (pending.accounts.upserts.length||pending.accounts.deletes.length));
  if(!hasPendingAcc){
    const map = new Map((S.users||[]).map(u=>[u.username,u]));
    (remote.users||[]).forEach(u=>map.set(u.username,u));
    S.users = Array.from(map.values());
  }
  S.seen_changelog = Object.assign({}, remote.seen_changelog||{}, S.seen_changelog);
  if(remote.meta){ S.meta = Object.assign({}, S.meta, remote.meta, {changelog: remote.meta.changelog || S.meta.changelog}); }
  if(remote.t) S.t.accounts = remote.t;
}
function mergeRecords(remote){
  const rMap = new Map((S.records||[]).map(r=>[r.id,r]));
  (remote.records||[]).forEach(r=>rMap.set(r.id,r));
  // 本地未递交保护
  if(pending.records){
    (pending.records.adds||[]).forEach(r=>rMap.set(r.id,r));
    (pending.records.revokes||[]).forEach(id=>{ const r=rMap.get(id); if(r) r.revoked=true; });
  }
  S.records = Array.from(rMap.values());
  S.audit = dedupAudit([...(remote.audit||[]), ...(S.audit||[])]).slice(-600);
  if(remote.t) S.t.records = remote.t;
}
function mergeFeedback(remote){
  const fMap = new Map((S.feedback||[]).map(f=>[f.id,f]));
  (remote.feedback||[]).forEach(f=>fMap.set(f.id,f));
  S.feedback = Array.from(fMap.values());
  if(remote.t) S.t.feedback = remote.t;
}
function refreshMe(){
  if(!me) return;
  const u=(S.users||[]).find(x=>x.username===me.username);
  if(!u){ logout(); return; }
  me.permissions = u.permissions||[];
  me.real_name = u.real_name; me.role = u.role;
}
function applyRemote(st){
  if(!st) return false;
  let changed=false;
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

// 本地缓存（提速：秒开 + 减少轮询渲染）
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
// 写域（read-merge-write）；auditEntries 仅并入 records.json
// ============================================================
function nowISO(){ return new Date().toISOString(); }
async function writeDomain(domain, auditEntries){
  const t = nowISO();
  let data;
  if(domain==='records'){
    data = {version:DB_VERSION, t, records:S.records||[], audit:S.audit||[]};
    if(auditEntries && auditEntries.length){
      const u = me ? me.username : 'system';
      data.audit = dedupAudit([...data.audit, ...auditEntries.map(a=>({t, u, a:a.action, d:a.detail||''}))]).slice(-500);
    }
    S.audit = data.audit; S.t.records = t;
  }else if(domain==='accounts'){
    data = {version:DB_VERSION, t, users:S.users||[], seen_changelog:S.seen_changelog||{}, meta:S.meta||{}};
    S.t.accounts = t;
  }else if(domain==='feedback'){
    data = {version:DB_VERSION, t, feedback:S.feedback||[]};
    S.t.feedback = t;
  }else{ throw new Error('未知域 '+domain); }
  await apiPutFile(domain==='records'?F_RECORDS:domain==='accounts'?F_ACCOUNTS:F_FEEDBACK, data, 'update '+new Date().toLocaleString('zh-CN'));
  cacheSave(domain, data);
  lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
  updateSyncLabel();
}
async function writePwdFile(username, passRecord){
  const data = {version: DB_VERSION, pass: passRecord, updated_at: nowISO()};
  await apiPutFile(pwdPath(username), data, 'update pwd '+username);
}

// ============================================================
// 暂存-递交更新（v1.3.0）
// ============================================================
function persistPending(){
  try{ localStorage.setItem(PENDING_KEY, JSON.stringify({pending, pendingCount})); }catch(e){}
}
function loadPending(){
  try{
    const o = JSON.parse(localStorage.getItem(PENDING_KEY)||'null');
    if(o && o.pending){
      pending = o.pending; pendingCount = o.pendingCount||0;
    }
  }catch(e){}
}
function countPending(){
  let n=0;
  if(pending.records) n += (pending.records.adds||[]).length + (pending.records.revokes||[]).length;
  if(pending.accounts) n += (pending.accounts.upserts||[]).length + (pending.accounts.deletes||[]).length + Object.keys(pending.accounts.pwdMap||{}).length;
  if(pending.pwd) n += 1;
  return n;
}
function updatePendingUI(){
  pendingCount = countPending();
  const fab = $('pendingFab');
  if(!fab) return;
  if(pendingCount>0){
    fab.classList.remove('hide');
    $('pendingCnt').textContent = pendingCount;
  }else{
    fab.classList.add('hide');
  }
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
// 生成暂存操作清单（用于递交确认弹窗）
function pendingSummary(){
  const lines=[];
  if(pending.records){
    (pending.records.adds||[]).forEach(r=>lines.push('录入'+(r.category==='加分'?'加分':'扣分')+'：'+r.user_name+' — '+r.subject_or_item+(r.reason?('（'+r.reason+'）'):'')));
    (pending.records.revokes||[]).forEach(id=>lines.push('撤销记录：#'+id));
  }
  if(pending.accounts){
    (pending.accounts.upserts||[]).forEach(u=>lines.push('账号修改：'+u.username+'（'+u.real_name+'）'));
    (pending.accounts.deletes||[]).forEach(n=>lines.push('删除用户：'+n));
    Object.keys(pending.accounts.pwdMap||{}).forEach(n=>lines.push('重置密码：'+n));
  }
  if(pending.pwd) lines.push('修改密码：'+pending.pwd.username);
  return lines;
}
async function commitPending(){
  if(pendingCount===0) return;
  const hasAcc = !!(pending.accounts && ((pending.accounts.upserts||[]).length||(pending.accounts.deletes||[]).length||Object.keys(pending.accounts.pwdMap||{}).length));
  if(hasAcc){
    const auth = await requirePass();
    if(!auth){ toast('已取消递交', true); return; }
  }
  $('pendingMask').classList.add('hide');
  if(busy) return;
  busy = true;
  const fab=$('pendingFab'); if(fab) fab.classList.add('busy');
  const auditEntries=[];
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
    const tasks=[];
    tasks.push(writeDomain('records', auditEntries));       // 审计统一并入 records.json
    if(pending.accounts){
      tasks.push(writeDomain('accounts'));
      for(const [uname, pass] of Object.entries(pending.accounts.pwdMap||{})) tasks.push(writePwdFile(uname, pass));
    }
    if(pending.pwd){
      tasks.push(writePwdFile(pending.pwd.username, pending.pwd.pass));
      if(!pending.accounts) tasks.push(writeDomain('accounts')); // 同步 must_change 等
    }
    await Promise.all(tasks);
    pending = {records:null, accounts:null, pwd:null};
    persistPending(); updatePendingUI();
    toast('已递交更新 ✓ 共 '+pendingSummary().length+' 项');
    renderAll();
  }catch(e){
    toast('递交失败：'+e.message, true);
  }finally{
    busy=false;
    if(fab) fab.classList.remove('busy');
  }
}

// ============================================================
// 认证
// ============================================================
function saveSession(){ const k = me.remember?'cm_session':'cm_session_tmp'; (me.remember?localStorage:sessionStorage).setItem(k, JSON.stringify({username:me.username, remember:me.remember})); }
function clearSession(){ localStorage.removeItem('cm_session'); sessionStorage.removeItem('cm_session_tmp'); }
async function loadPwd(username){
  if(S.pwdCache[username]) return S.pwdCache[username];
  try{
    const st = await fetchRawPwd(pwdPath(username));
    if(st && st.pass){ S.pwdCache[username]=st.pass; return st.pass; }
  }catch(e){}
  return null;
}
async function doLogin(){
  const username=$('loginUser').value.trim();
  const pass=$('loginPass').value;
  const remember = document.querySelector('input[name=remember]:checked').value==='1';
  $('loginErr').textContent='';
  if(!username||!pass){ $('loginErr').textContent='请输入账号和密码'; return; }
  const u = (S.users||[]).find(x=>x.username===username);
  if(!u){ $('loginErr').textContent='账号不存在'; return; }
  const stored = await loadPwd(username);
  if(!stored){ $('loginErr').textContent='账号数据异常，请联系管理员'; return; }
  const v = await verifyPwd(pass, stored);
  if(!v.ok){ $('loginErr').textContent='密码错误'; return; }
  me = {id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember};
  saveSession();
  // v1.2.0 延续：旧版 SHA-256 账号登录成功自动升级为 PBKDF2（立即写，不入暂存）
  if(v.legacy){
    try{
      const np = await makePwdRecord(pass);
      S.pwdCache[username] = np;
      await writePwdFile(username, np);
      S.audit = dedupAudit([...(S.audit||[]), {t:nowISO(), u:username, a:'升级密码哈希', d:username}]).slice(-500);
    }catch(e){ /* 升级失败不阻断登录，下次再试 */ }
  }
  $('loginView').classList.add('hide');
  $('appView').classList.remove('hide');
  renderAll();
  // 首次进入更新日志
  if(!S.seen_changelog[u.username]){
    showChangelog();
  }
  if(u.must_change && u.role!=='admin'){
    openChangePass(true);
  }
}
function logout(){
  if(pendingCount>0){
    const y = confirm('有 '+pendingCount+' 项未递交的更改，退出后将丢失。确定退出？');
    if(!y) return;
  }
  me=null; clearSession();
  $('appView').classList.add('hide');
  $('loginView').classList.remove('hide');
}
function restoreSession(){
  let sv=null;
  try{ sv = JSON.parse(localStorage.getItem('cm_session')||'null'); }catch(e){}
  if(!sv){ try{ sv = JSON.parse(sessionStorage.getItem('cm_session_tmp')||'null'); }catch(e){} }
  if(!sv) return;
  const u=(S.users||[]).find(x=>x.username===sv.username);
  if(!u){ clearSession(); return; }
  me={id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember:sv.remember};
  $('loginView').classList.add('hide');
  $('appView').classList.remove('hide');
  renderAll();
}

// ============================================================
// 导航
// ============================================================
function menuDefs(){
  const m=[];
  m.push({key:'dashboard', ico:'📊', label:'班级看板', show:()=> canViewStats()});
  m.push({key:'summary', ico:'📝', label:'周/学期小结', show:()=>true});
  m.push({key:'student-summary', ico:'📋', label:'同学扣分汇总', show:()=> canViewStats()});
  m.push({key:'record-create', ico:'➖', label:'录入扣分', show:()=> ALL_CATS.filter(c=>c!=='加分' && canEnter(me.role,c)).length>0});
  m.push({key:'bonus-create', ico:'➕', label:'录入加分', show:()=> canEnter(me.role,'加分')});
  m.push({key:'records', ico:'🗂️', label:'扣分记录', show:()=> canViewRecords()});
  m.push({key:'personal', ico:'👤', label:'个人统计', show:()=>true});
  m.push({key:'feedback', ico:'💬', label:'意见反馈', show:()=>true});
  m.push({key:'about', ico:'ℹ️', label:'关于与克隆', show:()=>true});
  if(canManageUsers()) m.push({key:'users', ico:'👥', label:'用户管理', show:()=>true});
  return m.filter(x=>x.show());
}
function nav(key){
  curView=key;
  document.querySelectorAll('.menu-item').forEach(el=>el.classList.toggle('active', el.dataset.key===key));
  renderView();
}
function renderMenu(){
  const menu=$('menu');
  menu.innerHTML='';
  menuDefs().forEach(d=>{
    const el=document.createElement('div');
    el.className='menu-item'+(curView===d.key?' active':'');
    el.dataset.key=d.key;
    el.innerHTML=`<span class="ico">${d.ico}</span><span>${d.label}</span>`;
    el.onclick=()=>nav(d.key);
    menu.appendChild(el);
  });
  $('whoami').textContent = me.real_name||me.username;
  const rt=$('roleTag');
  rt.textContent=roleText(me.role);
  rt.className='tag '+(me.role==='viewer'?'blue':(me.role==='student'?'green':'yellow'));
  $('brandVer').textContent='v'+APP_VERSION;
  $('brandSub').textContent='v'+APP_VERSION;
}
function renderAll(){
  renderMenu();
  renderView();
  updateSyncLabel();
  updatePendingUI();
}

// ============================================================
// 轮询实时同步（v1.3.0：CDN+raw 双通道，无 API 配额消耗）
// ============================================================
let pollingTimer = null;
let pageHidden = false;
function updateSyncLabel(){
  const t=lastSavedAt?new Date(lastSavedAt).toLocaleTimeString('zh-CN'):'';
  const el=$('syncText'); if(!el) return;
  el.textContent = '实时同步 · 更新于 '+(t||'—')+(pendingCount>0?(' · 待递交 '+pendingCount+' 项'):'');
}
async function poll(){
  if(pageHidden || busy) return;
  try{
    const [acc, rec] = await Promise.all([fetchRawFile(F_ACCOUNTS), fetchRawFile(F_RECORDS)]);
    let changed=false;
    if(acc && acc.t && acc.t!==S.t.accounts){ mergeAccounts(acc); cacheSave('accounts', acc); changed=true; }
    if(rec && rec.t && rec.t!==S.t.records){ mergeRecords(rec); cacheSave('records', rec); changed=true; }
    if(changed){
      lastSavedAt = Math.max(S.t.accounts||'', S.t.records||'', S.t.feedback||'');
      refreshMe(); renderAll();
    }
  }catch(e){}
}
function startPolling(){
  pollingTimer = setInterval(poll, 8000);
  document.addEventListener('visibilitychange', ()=>{
    pageHidden = document.hidden;
    if(!pageHidden) poll();
  });
}

// ============================================================
// 更新日志
// ============================================================
function showChangelog(){
  const list=$('changelogList');
  list.innerHTML='';
  (S.meta.changelog||[]).forEach(c=>{ const li=document.createElement('li'); li.textContent=c; list.appendChild(li); });
  $('changelogMask').classList.remove('hide');
}
async function markChangelogSeen(){
  S.seen_changelog[me.username]=true;
  $('changelogMask').classList.add('hide');
  try{
    // 立即写入账号库（保持多端已读状态），失败不阻断
    await writeDomain('accounts');
  }catch(e){}
}

// ============================================================
// 确认框
// ============================================================
function askConfirm(msg){
  return new Promise(res=>{
    $('confirmMsg').textContent=msg;
    $('confirmMask').classList.remove('hide');
    const done=v=>{ $('confirmMask').classList.add('hide'); $('btnConfirmOk').onclick=null; $('btnConfirmNo').onclick=null; res(v); };
    $('btnConfirmOk').onclick=()=>done(true);
    $('btnConfirmNo').onclick=()=>done(false);
  });
}

// ============================================================
// 敏感操作二次密码验证（v1.2.0 延续）
// ============================================================
function requirePass(){
  return new Promise(async res=>{
    const mask=$('passMask');
    $('passMsg').textContent='为保护账号安全，请再次输入当前密码以确认操作：';
    $('passInput').value='';
    $('passErr').textContent='';
    mask.classList.remove('hide');
    $('passInput').focus();
    const done=v=>{ mask.classList.add('hide'); $('btnPassOk').onclick=null; $('btnPassNo').onclick=null; $('passInput').onkeydown=null; res(v); };
    $('btnPassNo').onclick=()=>done(false);
    $('btnPassOk').onclick=async ()=>{
      const stored = me ? (S.pwdCache[me.username] || await loadPwd(me.username)) : null;
      const ok = await verifyPwd($('passInput').value, stored);
      if(!ok.ok){ $('passErr').textContent='密码错误，请重试'; return; }
      done(true);
    };
    $('passInput').onkeydown=e=>{ if(e.key==='Enter') $('btnPassOk').click(); };
  });
}

// ============================================================
// 移动端菜单
// ============================================================
function toggleMenu(force){
  const app=$('appView');
  const open = force!==undefined ? force : !app.classList.contains('menu-open');
  app.classList.toggle('menu-open', open);
}
function closeMenu(){ toggleMenu(false); }

// ============================================================
// 事件绑定
// ============================================================
function bindEvents(){
  $('btnLogin').onclick=doLogin;
  $('loginPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  $('btnLogout').onclick=logout;
  $('btnChgPass').onclick=()=>openChangePass(false);
  $('btnChangelogOk').onclick=markChangelogSeen;
  const burger=$('btnBurger'); if(burger) burger.onclick=()=>toggleMenu();
  const backdrop=$('menuBackdrop'); if(backdrop) backdrop.onclick=()=>closeMenu();
  const fab=$('pendingFab'); if(fab) fab.onclick=()=>openPendingDialog();
  document.addEventListener('click', e=>{
    if(e.target.closest && e.target.closest('.menu-item') && window.innerWidth<=768) closeMenu();
  });
}

// 暂存递交弹窗
function openPendingDialog(){
  if(pendingCount===0) return;
  const list = pendingSummary();
  $('pendingList').innerHTML = list.map(x=>`<li>${esc(x)}</li>`).join('');
  $('pendingMask').classList.remove('hide');
  $('btnPendingOk').onclick=()=>commitPending();
  $('btnPendingNo').onclick=()=>{ $('pendingMask').classList.add('hide'); };
  $('btnPendingDiscard').onclick=async()=>{
    const y=await askConfirm('确定放弃全部 '+pendingCount+' 项暂存更改？');
    if(!y) return;
    pending={records:null, accounts:null, pwd:null};
    persistPending(); updatePendingUI();
    $('pendingMask').classList.add('hide');
    // 重新从远端拉取覆盖本地
    await poll();
    toast('已放弃暂存更改');
  };
}

// ============================================================
// 启动
// ============================================================
function defaultState(){
  return {
    users:[], records:[], audit:[], feedback:[], seen_changelog:{},
    meta:{version:APP_VERSION, semester_start:'2026-09-01', changelog:[]},
    pwdCache:{}, t:{accounts:'', records:'', feedback:''}
  };
}
function applyLocal(domain, data){
  if(!data || !data.version) return;
  if(domain==='accounts'){ S.users=data.users||[]; S.seen_changelog=data.seen_changelog||{}; S.meta=data.meta||S.meta; S.t.accounts=data.t||''; }
  else if(domain==='records'){ S.records=data.records||[]; S.audit=data.audit||[]; S.t.records=data.t||''; }
  else if(domain==='feedback'){ S.feedback=data.feedback||[]; S.t.feedback=data.t||''; }
}
(async function boot(){
  bindEvents();
  loadPending();
  updatePendingUI();
  // 1) 本地缓存秒开
  const ca = cacheLoad('accounts'), cr = cacheLoad('records'), cf = cacheLoad('feedback');
  applyLocal('accounts', ca); applyLocal('records', cr); applyLocal('feedback', cf);
  if(ca && cr) lastSavedAt = Math.max(S.t.accounts, S.t.records, S.t.feedback||'');
  // 2) 远端最新
  try{
    const [acc, rec, fb] = await Promise.all([
      fetchRawFile(F_ACCOUNTS).then(x=>{ if(x&&x.t&&x.t!==S.t.accounts){ applyLocal('accounts', x); cacheSave('accounts', x);} return x; }),
      fetchRawFile(F_RECORDS).then(x=>{ if(x&&x.t&&x.t!==S.t.records){ applyLocal('records', x); cacheSave('records', x);} return x; }),
      fetchRawFile(F_FEEDBACK).then(x=>{ if(x&&x.t&&x.t!==S.t.feedback){ applyLocal('feedback', x); cacheSave('feedback', x);} return x; })
    ]);
    if(acc||rec) lastSavedAt = Math.max(S.t.accounts, S.t.records, S.t.feedback||'');
  }catch(e){}
  // 3) 无数据兜底
  if(!S.users.length && !S.records.length){
    S = defaultState();
  }
  restoreSession();
  startPolling();
})();
