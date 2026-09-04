/* ============================================================
 * 班级量化考核管理系统 · GitHub Pages 在线版 v1.1.0
 * 架构（参照 classroom-seat-arranger）：
 *   - GitHub Pages 静态托管，无后端服务器
 *   - 数据持久化：所有数据存于仓库 docs/data/db.json，
 *     通过 GH_TOKEN 调用 GitHub Contents API 读写（提交到仓库）
 *   - 实时同步：多端轮询仓库最新数据，操作即写回，near-real-time
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
const APP_VERSION = '1.1.0';

// ---------- 全局状态 ----------
let S = null;          // 完整数据对象（db.json）
let me = null;         // 当前会话 {id, username, real_name, role, remember}
let curView = 'dashboard';
let lastSavedAt = '';
let dirty = false;
let writeQueue = Promise.resolve();
let isWriting = false;

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
  const r = await fetch(apiUrl(SYNC.path), {headers:{Authorization:'Bearer '+GH_TOKEN}, cache:'no-store'});
  if(!r.ok){ const d=await r.json().catch(()=>({})); throw new Error(d.message||('读取失败 '+r.status)); }
  const d = await r.json();
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
  st.version = st.version||3;
  if(!st.meta) st.meta = {version:APP_VERSION, semester_start:'2026-09-01', changelog:[]};
  if(!Array.isArray(st.users)) st.users=[];
  if(!Array.isArray(st.records)) st.records=[];
  if(!Array.isArray(st.feedback)) st.feedback=[];
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
function applyState(st){
  S = normalizeState(st);
  lastSavedAt = S.updated_at || '';
}
async function writeState(next){
  // read-modify-write with 409 retry
  for(let attempt=0; attempt<6; attempt++){
    let cur;
    try{ cur=await getStateAPI(); }catch(e){ throw e; }
    const merged = normalizeState(cur.state);
    // 将本次变更合并：next 是完整对象，直接覆盖但保留服务器端其他并发字段
    // 简单策略：以 next 为最新完整快照（本地在写前已是最新轮询状态），仅保留服务器端 records 之外并发无冲突字段
    Object.assign(merged, next);
    merged.updated_at = new Date().toISOString();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged))));
    const body = {message:'update '+new Date().toLocaleString('zh-CN'), content, sha: cur.sha};
    const r = await fetch(apiUrl(SYNC.path), {method:'PUT', headers:{Authorization:'Bearer '+GH_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if(r.ok){ applyState(merged); return merged; }
    if(r.status===409){ continue; }
    const d=await r.json().catch(()=>({}));
    throw new Error(d.message||('写入失败 '+r.status));
  }
  throw new Error('并发写入冲突，请重试');
}
// 队列化写入，避免并发冲突
function save(){
  if(!S) return Promise.resolve();
  const snapshot = JSON.parse(JSON.stringify(S));
  const p = writeQueue.then(()=>writeState(snapshot)).catch(e=>{ toast('保存失败：'+e.message, true); });
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
  const hash = await sha256hex(pass);
  if(hash!==u.pass){ $('loginErr').textContent='密码错误'; return; }
  me = {id:u.id, username:u.username, real_name:u.real_name, role:u.role, permissions:u.permissions||[], remember};
  saveSession();
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
  m.push({key:'dashboard', ico:'📊', label:'班级看板', show:()=>true});
  m.push({key:'summary', ico:'📝', label:'周/学期小结', show:()=>true});
  m.push({key:'student-summary', ico:'📋', label:'同学扣分汇总', show:()=>true});
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
// 轮询实时同步
// ============================================================
let lastPollApplied = '';
function updateSyncLabel(){
  const t=lastSavedAt?new Date(lastSavedAt).toLocaleTimeString('zh-CN'):'';
  $('syncText').textContent = '实时同步 · 更新于 '+(t||'—');
}
async function poll(){
  try{
    const st = await fetchRawState();
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
  }catch(e){}
}
function startPolling(){
  setInterval(poll, 5000);       // 快速（raw/Pages，无配额）
  setInterval(async ()=>{        // 慢速权威（API 带 token）
    try{ const {state}=await getStateAPI(); if(state && (state.updated_at||'')>lastSavedAt && !isWriting && !dirty){ applyState(state); if(me){const u=(S.users||[]).find(x=>x.id===me.id); if(!u){logout();return;} me.permissions=u.permissions||[]; me.real_name=u.real_name; me.role=u.role;} renderAll(); } }catch(e){}
  }, 20000);
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
// 事件绑定
// ============================================================
function bindEvents(){
  $('btnLogin').onclick=doLogin;
  $('loginPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  $('btnLogout').onclick=logout;
  $('btnChgPass').onclick=()=>openChangePass(false);
  $('btnChangelogOk').onclick=markChangelogSeen;
}
