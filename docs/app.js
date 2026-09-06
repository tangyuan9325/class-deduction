/* ============================================================
 * 班级量化考核管理系统 · GitHub Pages 在线版 v1.2.0
 * 架构（参照 classroom-seat-arranger）：
 *   - GitHub Pages 静态托管，无后端服务器
 *   - 数据持久化：所有数据存于仓库 docs/data/db.json，
 *     通过 GH_TOKEN 调用 GitHub Contents API 读写（提交到仓库）
 *   - 实时同步：多端轮询仓库最新数据，操作即写回，near-real-time
 * v1.2.0 安全与稳定性升级：
 *   - PBKDF2 加盐密码（修复"哈希即密码"），旧账号登录自动迁移
 *   - 敏感操作二次密码验证、操作审计日志
 *   - API 配额优化（ETag/304 + 页面可见性暂停轮询 + 自适应间隔）
 *   - 并发写记录级合并（不再整库覆盖）
 *   - CSV 注入与 XSS 修复、移动端适配
 * ============================================================ */
'use strict';

// ---------- 配置 ----------
const SYNC = {
  owner: 'tangyuan9325',
  repo: 'class-deduction',
  branch: 'main',
  path: 'docs/data/db.json',
  rawBase: 'https://raw.githubusercontent.com',
  apiBase: 'https://api.github.com'
};
const pagesUrl = `https://${SYNC.owner}.github.io/${SYNC.repo}/`;
const APP_VERSION = '1.2.0';
const DB_VERSION = 4;
const PBKDF2_ITER = 600000;

// ---------- 全局状态 ----------
let S = null;          // 完整数据对象（db.json）
let me = null;         // 当前会话 {id, username, real_name, role, remember}
let curView = 'dashboard';
let lastSavedAt = '';
let dirty = false;
let writeQueue = Promise.resolve();
let isWriting = false;
let stateETag = '';    // v1.2.0：上次 ETag（配额优化）
let lastSha = '';      // v1.2.0：上次 sha（配额优化）

// ---------- 工具 ----------
const $ = id => document.getElementById(id);
let toastTimer = null;
function toast(msg, err=false){
  const t = $('toast');
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
// ---------- PBKDF2 密码（v1.2.0：修复"哈希即凭证"，哈希不可逆向） ----------
function b64ToBuf(b64){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function bufToB64(buf){ let bin=''; const u=new Uint8Array(buf); for(let i=0;i<u.length;i++) bin+=String.fromCharCode(u[i]); return btoa(bin); }
function randB64(len){ const u=new Uint8Array(len); crypto.getRandomValues(u); return bufToB64(u); }
async function pbkdf2Derive(pass, saltB64, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:b64ToBuf(saltB64), iterations:iter, hash:'SHA-256'}, key, 256);
  return bufToB64(bits);
}
// 生成新的密码存储记录：pbkdf2$迭代次数$盐$哈希（盐与哈希均为 base64）
async function makePwdRecord(pass){
  const salt = randB64(16);
  const h = await pbkdf2Derive(pass, salt, PBKDF2_ITER);
  return 'pbkdf2$'+PBKDF2_ITER+'$'+salt+'$'+h;
}
// 校验密码：返回 {ok, legacy}；legacy=true 表示旧版 SHA-256 记录（需自动升级）
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
// CSV 注入防护：以 = + - @ 开头的值前置单引号
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
function isSameDay(a,b){
  return fmtDate(a)===fmtDate(b);
}
function weekRange(ref){
  // 返回 [周一, 周日]（以当前周为基准，用于周小结）
  const d = ref ? new Date(ref) : new Date();
  const day = (d.getDay()+6)%7; // 周一=0
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

// ---------- 权限 ----------
const ALL_CATS = ['学习','寝室','日常','两操','加分'];
function isAdmin(){ return me && me.role==='admin'; }
function isTeacher(){ return me && me.role==='teacher'; }
function isStaff(){ return me && (me.role==='admin'||me.role==='teacher'); }
function isViewer(){ return me && me.role==='viewer'; }
function permOf(u){ return (u && u.permissions) || []; }
function canEnter(role, cat){
  if(role==='admin'||role==='teacher') return true;
  if(role==='viewer') return false;
  return permOf(me).includes(cat);
}
function canViewRecords(){
  if(!me) return false;
  return isStaff() || permOf(me).includes('查看扣分记录');
}
function canViewStats(){
  if(!me) return false;
  return isStaff() || isViewer() || permOf(me).includes('查看班级');
}
function canManageUsers(){ return isStaff(); }
function canManageFeedback(){ return isStaff(); }
function roleText(r){ return {admin:'管理员',teacher:'班主任',student:'学生',viewer:'看板账号'}[r]||r; }

// ============================================================
// GitHub 同步层（参照换座位 readModifyWrite）
// ============================================================
function apiUrl(p){ return `${SYNC.apiBase}/repos/${SYNC.owner}/${SYNC.repo}/contents/${p}`; }
function rawUrl(){ return `${SYNC.rawBase}/${SYNC.owner}/${SYNC.repo}/${SYNC.branch}/${SYNC.path}`; }
function pagesStateUrl(){ return `${pagesUrl}data/db.json`; }

async function getStateAPI(){
  // v1.2.0：ETag/If-None-Match —— 数据未变化时返回 304，不消耗 API 配额
  const headers = {Authorization:'Bearer '+GH_TOKEN, 'cache':'no-store'};
  if(stateETag) headers['If-None-Match'] = stateETag;
  const r = await fetch(apiUrl(SYNC.path), {headers});
  if(r.status===304){ return {unchanged:true, sha:lastSha, state:null}; }
  if(!r.ok){ const d=await r.json().catch(()=>({})); throw new Error(d.message||('读取失败 '+r.status)); }
  stateETag = r.headers.get('ETag') || stateETag;
  const d = await r.json();
  lastSha = d.sha;
  return {sha: d.sha, state: JSON.parse(decodeURIComponent(escape(atob(d.content))))};
}
async function fetchRawState(){
  const sources=[
    ()=>fetch(pagesStateUrl()+'?cb='+Date.now(),{cache:'no-store'}),
    ()=>fetch(rawUrl()+'?cb='+Date.now(),{cache:'no-store'})
  ];
  let best=null;
  for(const f of sources){
    try{ const r=await f(); if(r.ok){ const j=await r.json(); if(j && j.version){ if(!best || (j.updated_at||'')>(best.updated_at||'')) best=j; } } }catch(e){}
  }
  return best;
}
function normalizeState(st){
  st.version = st.version || DB_VERSION;
  if(!st.meta) st.meta = {version:APP_VERSION, semester_start:'2026-09-01', changelog:[]};
  if(!Array.isArray(st.users)) st.users=[];
  if(!Array.isArray(st.records)) st.records=[];
  if(!Array.isArray(st.feedback)) st.feedback=[];
  if(!Array.isArray(st.audit)) st.audit=[];
  if(!st.seen_changelog) st.seen_changelog={};
  if(!st.dictionary) st.dictionary = {
    deduct: [
      {name:'学习', items:['语文','数学','英语','物理','化学','技术','地理','历史','生物','政治']},
      {name:'寝室', items:['地未拖','灯未关','垃圾未倒','地不干净','熄灯后聊天','床铺不整','物品摆放乱']},
      {name:'日常', items:['迟到','卫生','纪律','其它']},
      {name:'两操', items:['早操迟到','早操缺席','课间操违纪','眼保健操','跑操秩序']}
    ],
    bonus: ['助人为乐','学习进步','卫生优秀','纪律良好','比赛获奖','班级贡献','好人好事','其它加分']
  };
  if(!st.updated_at) st.updated_at=new Date().toISOString();
  return st;
}
// 记录操作审计（v1.2.0）：仅追加，最长保留 500 条
function audit(action, detail){
  if(!me) return;
  S.audit.push({t:new Date().toISOString(), u:me.username, a:action, d:detail||''});
  if(S.audit.length>500) S.audit = S.audit.slice(-500);
}
// v1.2.0：记录级合并 —— 以本地快照 next 为准，但保留服务器端新增/并发修改的
// records / feedback / users / seen_changelog，避免多端互相覆盖
function mergeState(base, next){
  const merged = normalizeState(JSON.parse(JSON.stringify(base)));
  // users 按 id 并集，next 优先
  const uMap = new Map(merged.users.map(u=>[u.id,u]));
  (next.users||[]).forEach(u=>uMap.set(u.id,u));
  merged.users = Array.from(uMap.values());
  // records 按 id 并集，next 优先
  const rMap = new Map(merged.records.map(r=>[r.id,r]));
  (next.records||[]).forEach(r=>rMap.set(r.id,r));
  merged.records = Array.from(rMap.values());
  // feedback 按 id 并集，next 优先
  const fMap = new Map(merged.feedback.map(f=>[f.id,f]));
  (next.feedback||[]).forEach(f=>fMap.set(f.id,f));
  merged.feedback = Array.from(fMap.values());
  // seen_changelog 并集
  merged.seen_changelog = Object.assign({}, merged.seen_changelog, next.seen_changelog||{});
  // 元数据/字典/审计以 next 为准（next 含最新审计；服务器端审计若更新以服务器为准则合并去重）
  merged.meta = next.meta || merged.meta;
  merged.dictionary = next.dictionary || merged.dictionary;
  merged.audit = (next.audit||[]).concat(merged.audit||[]).filter((v,i,a)=>a.findIndex(x=>x.t===v.t && x.a===v.a && x.u===v.u)===-1).slice(-600);
  merged.version = DB_VERSION;
  return merged;
}
function applyState(st){
  S = normalizeState(st);
  lastSavedAt = S.updated_at || '';
}
async function writeState(next, action, detail){
  // v1.2.0：read-merge-write + 409 重试；记录级合并避免多端覆盖
  for(let attempt=0; attempt<6; attempt++){
    let cur;
    try{ cur=await getStateAPI(); }catch(e){ throw e; }
    if(cur.unchanged){ cur = {sha: lastSha, state: S}; }
    const merged = mergeState(cur.state, next);
    merged.updated_at = new Date().toISOString();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged))));
    const body = {message:'update '+new Date().toLocaleString('zh-CN'), content, sha: cur.sha};
    const r = await fetch(apiUrl(SYNC.path), {method:'PUT', headers:{Authorization:'Bearer '+GH_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if(r.ok){ stateETag=''; applyState(merged); return merged; }
    if(r.status===409){ continue; }
    const d=await r.json().catch(()=>({}));
    throw new Error(d.message||('写入失败 '+r.status));
  }
  throw new Error('并发写入冲突，请重试');
}
// 队列化写入，避免并发冲突；action/detail 记录审计日志
function save(action, detail){
  if(!S) return Promise.resolve();
  if(action && me) audit(action, detail);
  const snapshot = JSON.parse(JSON.stringify(S));
  const p = writeQueue.then(()=>writeState(snapshot, action, detail)).catch(e=>{ toast('保存失败：'+e.message, true); });
  writeQueue = p.catch(()=>{});
  return p;
}

// ============================================================
// 认证
// ============================================================
function saveSession(){ const k = me.remember?'cm_session':'cm_session_tmp'; (me.remember?localStorage:sessionStorage).setItem(k, JSON.stringify({username:me.username, remember:me.remember})); }
function clearSession(){ localStorage.removeItem('cm_session'); sessionStorage.removeItem('cm_session_tmp'); }
async function doLogin(){
  const username=$('loginUser').value.trim();
  const pass=$('loginPass').value;
  const remember = document.querySelector('input[name=remember]:checked').value==='1';
  $('loginErr').textContent='';
  if(!username||!pass){ $('loginErr').textContent='请输入账号和密码'; return; }
  const u = (S.users||[]).find(x=>x.username===username);
  if(!u){ $('loginErr').textContent='账号不存在'; return; }
  const v = await verifyPwd(pass, u.pass);
  if(!v.ok){ $('loginErr').textContent='密码错误'; return; }
  me = {id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember};
  saveSession();
  // v1.2.0：旧版 SHA-256 账号登录成功后自动升级为 PBKDF2 加盐哈希
  if(v.legacy){
    try{
      const nu = (S.users||[]).find(x=>x.id===me.id);
      nu.pass = await makePwdRecord(pass);
      await save('升级密码哈希', username);
    }catch(e){ /* 升级失败不阻断登录，下次再试 */ }
  }
  $('loginView').classList.add('hide');
  $('appView').classList.remove('hide');
  renderAll();
  // 首次进入更新日志
  if(!S.seen_changelog[u.username]){
    showChangelog();
  }
  if(u.must_change && u.role==='student'){
    openChangePass(true);
  }
}
function logout(){
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
  m.push({key:'record-create', ico:'➖', label:'录入扣分', show:()=> canEnter(me.role,'学习')||canEnter(me.role,'寝室')||canEnter(me.role,'日常')||canEnter(me.role,'两操')});
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
}

// ============================================================
// 轮询实时同步（v1.2.0：配额优化）
// ============================================================
let lastPollApplied = '';
let pollingTimer = null;
let pollingTimerApi = null;
let pageHidden = false;
function updateSyncLabel(){
  const t=lastSavedAt?new Date(lastSavedAt).toLocaleTimeString('zh-CN'):'';
  $('syncText').textContent = '实时同步 · 更新于 '+(t||'—');
}
async function applyIfNew(st){
  if(st && st.version && (st.updated_at||'') > lastSavedAt && !isWriting && !dirty){
    applyState(st);
    if(me){
      // 当前用户被删则退出
      const u=(S.users||[]).find(x=>x.id===me.id);
      if(!u){ logout(); return; }
      me.permissions = u.permissions||[];
      me.real_name=u.real_name; me.role=u.role;
    }
    renderAll();
  }
}
async function poll(){
  if(pageHidden) return;
  try{
    const st = await fetchRawState();
    await applyIfNew(st);
  }catch(e){}
}
async function pollAPI(){
  if(pageHidden) return;
  try{
    // 带 ETag：304 不消耗配额；仅在 CDN 轮询显示无更新时仍需权威确认（低频）
    const {state} = await getStateAPI();
    await applyIfNew(state);
  }catch(e){}
}
function startPolling(){
  // 快速：Pages CDN（无配额），8s；仅当前台可见
  pollingTimer = setInterval(poll, 8000);
  // 慢速权威：API 带 ETag（304 不扣配额），30s
  pollingTimerApi = setInterval(pollAPI, 30000);
  // 页面隐藏时暂停轮询，回到前台立即同步一次 —— 节省配额与流量
  document.addEventListener('visibilitychange', ()=>{
    pageHidden = document.hidden;
    if(!pageHidden){ poll(); pollAPI(); }
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
  await save();
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
// 敏感操作二次密码验证（v1.2.0）
// 用户管理类操作（新建/删除用户、改权限、重置密码）前需再次输入当前密码
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
      const ok = await verifyPwd($('passInput').value, ((S.users||[]).find(u=>u.id===me.id)||{}).pass);
      if(!ok.ok){ $('passErr').textContent='密码错误，请重试'; return; }
      done(true);
    };
    $('passInput').onkeydown=e=>{ if(e.key==='Enter') $('btnPassOk').click(); };
  });
}

// ============================================================
// 移动端菜单（v1.2.0）
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
  // 移动端：点击菜单项后自动收起
  document.addEventListener('click', e=>{
    if(e.target.closest && e.target.closest('.menu-item') && window.innerWidth<=768) closeMenu();
  });
}
