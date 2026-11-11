/* ============================================================
 * 视图渲染 v1.4.20261111
 * 依赖 app.js 的 S / me / UI / 工具函数
 * ============================================================ */
'use strict';

// ---------- 查询 ----------
function allRecords(){ return (S.records||[]).filter(r=>!r.revoked); }
function recordsOf(userId, range){
  let rs = allRecords();
  if(userId) rs = rs.filter(r=>r.user_id===userId);
  if(range) rs = rs.filter(r=>inRange(fmtDate(r.record_date), range[0], range[1]));
  return rs;
}
function sumScore(rs){ return rs.reduce((a,r)=>a+(r.score||0),0); }
function sumNeg(rs){ return rs.filter(r=>r.score<0).reduce((a,r)=>a+r.score,0); }
function sumPos(rs){ return rs.filter(r=>r.score>0).reduce((a,r)=>a+r.score,0); }
function byCategory(rs){
  const o = {};
  ALL_CATS.forEach(c=>o[c]=0);
  rs.forEach(r=>{ o[r.category] = (o[r.category]||0) + (r.score||0); });
  return o;
}
function topStudents(rs, n, bonus){
  const map = {};
  rs.forEach(r=>{
    if(bonus ? r.score>0 : r.score<0) map[r.user_name] = (map[r.user_name]||0) + (r.score||0);
  });
  const arr = Object.entries(map).sort((a,b)=> bonus ? b[1]-a[1] : a[1]-b[1]);
  return arr.slice(0, n||5);
}
function studentsList(){
  return (S.users||[]).filter(u=>u.role==='student').sort((a,b)=>(a.id||0)-(b.id||0));
}
function userName(id){
  const u = (S.users||[]).find(x=>x.id===id);
  return u ? (u.real_name||u.username) : ('#'+id);
}
function fmtScore(v){
  const n = Number(v)||0;
  return (n>0?'+':'')+n;
}
function pageHead(o){
  return `<div class="page-head">
    <div>
      ${o.eyebrow?`<div class="page-eyebrow">${esc(o.eyebrow)}</div>`:''}
      <h1 class="page-title">${esc(o.title)}</h1>
      ${o.sub?`<div class="page-sub">${o.sub}</div>`:''}
    </div>
    ${o.actions?`<div class="head-acts">${o.actions}</div>`:''}
  </div>`;
}
function emptyBlock(title, text){
  return `<div class="empty"><b>${esc(title)}</b>${esc(text||'')}</div>`;
}
function statCard(k, v, opts){
  const o = opts||{};
  return `<div class="stat">
    <div class="k">${esc(k)}</div>
    <div class="v ${o.cls||''}">${esc(String(v))}</div>
    ${o.m?`<div class="m">${esc(o.m)}</div>`:''}
  </div>`;
}

// ---------- 视图分发 ----------
function renderView(){
  const main = $('main');
  if(!main) return;
  switch(curView){
    case 'summary': renderSummary(main); break;
    case 'student-summary': renderStudentSummary(main); break;
    case 'record-create': renderRecordCreate(main, false); break;
    case 'bonus-create': renderRecordCreate(main, true); break;
    case 'records': renderRecords(main); break;
    case 'personal': renderPersonal(main); break;
    case 'users': renderUsers(main); break;
    case 'feedback': renderFeedback(main); break;
    case 'about': renderAbout(main); break;
    default: renderDashboard(main);
  }
}

// ============================================================
// 班级看板
// ============================================================
function trendChart(rs){
  const days = [];
  const today = new Date();
  for(let i=13;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); days.push(fmtDate(d)); }
  const vals = days.map(d=>sumScore(rs.filter(r=>isSameDay(r.record_date,d))));
  const maxAbs = Math.max(1, ...vals.map(Math.abs));
  const todayStr0 = fmtDate(today);
  const cols = vals.map((v,i)=>{
    const h = Math.round(Math.abs(v)/maxAbs*82);
    const isToday = days[i]===todayStr0;
    return `<div class="cbar${isToday?' today':''}" title="${days[i]} · 净分 ${fmtScore(v)}">
      <div style="height:92px;display:flex;align-items:flex-end;justify-content:center;width:100%">
        <div class="up" style="height:${v>0?h:0}px"></div>
      </div>
      <div style="height:92px;display:flex;align-items:flex-start;justify-content:center;width:100%">
        <div class="dn" style="height:${v<0?h:0}px"></div>
      </div>
    </div>`;
  }).join('');
  const labels = days.map((d,i)=>`<span>${i%2===0?d.slice(5):''}</span>`).join('');
  const peak = Math.max(...vals.map(Math.abs));
  const todayVal = vals[vals.length-1];
  const allZero = vals.every(v=>v===0);
  return {html:`
    <div class="chart">
      <div class="chart-grid"><i></i><i></i><i></i></div>
      ${allZero ? '<div class="chart-empty">近 14 天没有记录</div>' : `<div class="chart-bars">${cols}</div>`}
    </div>
    <div class="chart-x">${labels}</div>`, peak, todayVal, allZero};
}
function renderDashboard(main){
  if(!canViewStats()){ main.innerHTML = pageHead({title:'班级看板'}) + emptyBlock('没有查看权限','请联系班主任开通「查看班级」权限。'); return; }
  const rs = allRecords();
  const [ws, we] = weekRange();
  const weekRs = rs.filter(r=>inRange(fmtDate(r.record_date), ws, we));
  const totalD = sumNeg(rs), totalB = sumPos(rs);
  const chart = trendChart(rs);
  const byCat = byCategory(rs);
  const maxCat = Math.max(1, ...Object.values(byCat).map(Math.abs));
  const cats = ALL_CATS.map(c=>{
    const v = byCat[c]||0;
    const w = Math.round(Math.abs(v)/maxCat*100);
    return `<div class="cat-row">
      <div class="cat-name">${esc(c)}</div>
      <div class="cat-track"><div class="cat-fill ${v>0?'pos':v<0?'neg':''}" style="width:${w}%"></div></div>
      <div class="cat-val ${v>0?'pos':v<0?'neg':''}">${fmtScore(v)}</div>
    </div>`;
  }).join('');

  const recent = rs.slice().sort((a,b)=>String(b.record_date).localeCompare(String(a.record_date)) || (b.id||0)-(a.id||0)).slice(0,8);
  const recentRows = recent.length ? recent.map(r=>`<tr>
      <td class="num muted">${fmtDate(r.record_date).slice(5)}</td>
      <td>${esc(r.user_name)}</td>
      <td><span class="tag ${r.category==='加分'?'green':''}">${esc(r.category)}</span></td>
      <td><div class="cell-wrap">${esc(r.subject_or_item)}${r.reason?`<span class="muted"> · ${esc(r.reason)}</span>`:''}</div></td>
      <td class="num ${r.score>0?'pos':'neg'}">${fmtScore(r.score)}</td>
    </tr>`).join('') : `<tr><td colspan="5">${emptyBlock('本学期还没有记录','录入的扣分与加分都会出现在这里。')}</td></tr>`;

  const topD = topStudents(rs, 5, false);
  const topB = topStudents(rs, 5, true);
  const rankList = (arr, pos)=>{
    if(!arr.length) return `<div class="empty" style="padding:20px 0">暂无数据</div>`;
    return `<div class="rank-list">${arr.map(([n,v],i)=>`<div class="rank-row">
      <div class="rank-no">${String(i+1).padStart(2,'0')}</div>
      <div class="rank-name">${esc(n)}</div>
      <div class="rank-val ${pos?'pos':'neg'}">${fmtScore(v)}</div>
    </div>`).join('')}</div>`;
  };

  main.innerHTML = pageHead({
    eyebrow:`2026 学年 · 第 ${weekNumOf(todayStr())} 周`,
    title:'班级看板',
    sub:`在册 ${studentsList().length} 人 · 本学期记录 ${rs.length} 条 · 本周 ${weekRs.length} 条`,
    actions: ALL_CATS.filter(c=>c!=='加分' && canEnter(me.role,c)).length
      ? `<button class="btn" data-go="record-create">${icon('minus',15)}录入扣分</button>` : ''
  }) + `
  <div class="grid g-stats" style="margin-bottom:16px">
    ${statCard('累计扣分', totalD, {cls:'neg', m:'本学期全部记录'})}
    ${statCard('累计加分', fmtScore(totalB), {cls:totalB>0?'pos':'', m:'本学期全部记录'})}
    ${statCard('净分', fmtScore(totalD+totalB), {cls:(totalD+totalB)<0?'neg':((totalD+totalB)>0?'pos':''), m:'扣分与加分相抵'})}
    ${statCard('记录条数', rs.length, {m:'本周 '+weekRs.length+' 条'})}
  </div>
  <div class="grid g-main" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">近 14 天净分</div>
          <div class="card-note">${chart.allZero?'暂无记录':`波动峰值 ${chart.peak} · 今日 ${fmtScore(chart.todayVal)}`}</div>
        </div>
        <div class="chart-key">
          <span><i style="background:#8d8578"></i>正值</span>
          <span><i style="background:rgba(163,58,43,.55)"></i>负值</span>
          <span><i style="background:var(--accent)"></i>今天</span>
        </div>
      </div>
      ${chart.html}
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">类别分布</div><div class="card-note">本学期</div></div>
      ${cats}
    </div>
  </div>
  <div class="grid g-main">
    <div class="card" style="padding:0;overflow:hidden">
      <div class="card-head" style="padding:18px 20px 0;margin-bottom:12px">
        <div class="card-title">最近记录</div>
        ${canViewRecords()?`<button class="link" data-go="records">查看全部</button>`:''}
      </div>
      <div class="table-wrap" style="border:none;border-radius:0">
        <table><thead><tr><th>日期</th><th>学生</th><th>类别</th><th>项目与原因</th><th class="num">分值</th></tr></thead>
        <tbody>${recentRows}</tbody></table>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><div class="card-title">扣分最多</div><div class="card-note">前 5 名</div></div>
        ${rankList(topD, false)}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">加分最多</div><div class="card-note">前 5 名</div></div>
        ${rankList(topB, true)}
      </div>
    </div>
  </div>`;
  main.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
}

// ============================================================
// 周与学期小结
// ============================================================
function renderSummary(main){
  const st = UI.summary;
  const canClass = canViewStats();
  if(!canClass && st.scope==='class') st.scope = 'personal';
  if(!isStaff()) st.user = me.real_name || me.username;

  const range = st.period==='week' ? weekRange() : [S.meta.semester_start||'2026-09-01', todayStr()];
  let targetUid = null;
  if(st.scope==='personal'){
    targetUid = isStaff()
      ? (((S.users||[]).find(u=>u.role!=='viewer' && (u.username===st.user || u.real_name===st.user)) || {}).id || null)
      : me.id;
  }
  const rs = targetUid ? recordsOf(targetUid, range) : (st.scope==='personal' ? [] : recordsOf(null, range));
  const totalD = sumNeg(rs), totalB = sumPos(rs), net = totalD+totalB;
  const byCat = byCategory(rs);
  const catEntries = ALL_CATS.map(c=>[c, byCat[c]||0]).filter(([,v])=>v!==0).sort((a,b)=>a[1]-b[1]);
  const maxCat = Math.max(1, ...catEntries.map(x=>Math.abs(x[1])));
  const topD = topStudents(rs, 5, false);
  const topB = topStudents(rs, 5, true);
  const head = st.period==='week'
    ? `第 ${weekNumOf(todayStr())} 周 · ${range[0]} 至 ${range[1]}`
    : `本学期 · ${range[0]} 起`;
  const scopeName = st.scope==='class' ? '全班' : (targetUid ? userName(targetUid) : (st.user||'该学生'));

  let verdict = '';
  if(!rs.length) verdict = '本周期没有记录，表现平稳。';
  else if(net>0) verdict = `净分为 ${fmtScore(net)}，加分多于扣分。`;
  else if(net===0) verdict = '扣分与加分相抵，净分为 0。';
  else verdict = `净分为 ${net}，扣分多于加分。`;
  const parts = [];
  if(catEntries.length){
    parts.push('分项上，' + catEntries.slice().reverse().map(([k,v])=>`${k} ${fmtScore(v)}`).join('，') + '。');
  }
  if(topD.length) parts.push('扣分集中在 ' + topD.map(([n,v])=>`${n}（${v}）`).join('、') + '。');
  if(topB.length) parts.push('加分来自 ' + topB.map(([n,v])=>`${n}（+${v}）`).join('、') + '。');

  const catRows = catEntries.length ? catEntries.slice().reverse().map(([k,v])=>`<div class="cat-row">
      <div class="cat-name">${esc(k)}</div>
      <div class="cat-track"><div class="cat-fill ${v>0?'pos':'neg'}" style="width:${Math.round(Math.abs(v)/maxCat*100)}%"></div></div>
      <div class="cat-val ${v>0?'pos':'neg'}">${fmtScore(v)}</div>
    </div>`).join('') : emptyBlock('本周期无分项','');

  const rankRows = (arr, pos)=>arr.length ? arr.map(([n,v],i)=>`<div class="rank-row">
      <div class="rank-no">${String(i+1).padStart(2,'0')}</div>
      <div class="rank-name">${esc(n)}</div>
      <div class="rank-val ${pos?'pos':'neg'}">${fmtScore(v)}</div>
    </div>`).join('') : `<div class="empty" style="padding:16px 0">无</div>`;

  main.innerHTML = pageHead({
    eyebrow:`第 ${weekNumOf(todayStr())} 周`,
    title:'周与学期小结',
    sub:'按班级或个人生成一段可以直接发给家长的小结',
    actions:`<button class="btn ghost sm" id="btnSumExport">${icon('download',14)}导出 CSV</button>`
  }) + `
  <div class="card" style="padding:14px 18px;margin-bottom:16px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      ${canClass?`<div class="seg" id="segScope">
        <button data-v="class" class="${st.scope==='class'?'on':''}">班级小结</button>
        <button data-v="personal" class="${st.scope==='personal'?'on':''}">个人小结</button>
      </div>`:''}
      <div class="seg" id="segPeriod">
        <button data-v="week" class="${st.period==='week'?'on':''}">本周</button>
        <button data-v="semester" class="${st.period==='semester'?'on':''}">本学期</button>
      </div>
      ${st.scope==='personal' ? (isStaff()
        ? `<input id="sumUser" placeholder="学生账号或姓名" value="${esc(st.user)}" style="width:200px">
           <button class="btn ghost sm" id="btnSumFind">查找</button>`
        : `<span class="hint">本人 · ${esc(me.real_name||me.username)}</span>`) : ''}
      <span class="hint" style="margin-left:auto">${esc(head)}</span>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">${esc(scopeName)}的小结</div>
      <div class="card-note">${esc(head)}</div>
    </div>
    <div style="border-left:2px solid var(--line2);padding-left:18px;margin:4px 0 2px">
      <p style="font-family:var(--serif);font-size:15.5px;line-height:2;color:var(--ink)">${esc(verdict)}${parts.length?esc(parts.join('')):''}</p>
    </div>
  </div>
  <div class="grid g-stats" style="margin:16px 0">
    ${statCard('累计扣分', totalD, {cls:'neg'})}
    ${statCard('累计加分', fmtScore(totalB), {cls:totalB>0?'pos':''})}
    ${statCard('净分', fmtScore(net), {cls:net<0?'neg':(net>0?'pos':'')})}
    ${statCard('记录条数', rs.length)}
  </div>
  <div class="grid g-2">
    <div class="card">
      <div class="card-head"><div class="card-title">分项明细</div><div class="card-note">按类别合计</div></div>
      ${catRows}
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">排行</div><div class="card-note">前 5 名</div></div>
      <div class="card-note" style="margin-bottom:4px">扣分最多</div>
      ${rankRows(topD, false)}
      <div class="card-note" style="margin:14px 0 4px">加分最多</div>
      ${rankRows(topB, true)}
    </div>
  </div>`;

  const sc = main.querySelector('#segScope');
  if(sc) sc.querySelectorAll('button').forEach(b=>b.onclick=()=>{ st.scope=b.dataset.v; renderSummary(main); });
  main.querySelector('#segPeriod').querySelectorAll('button').forEach(b=>b.onclick=()=>{ st.period=b.dataset.v; renderSummary(main); });
  const si = main.querySelector('#sumUser');
  if(si){
    si.onkeydown = e=>{ if(e.key==='Enter'){ st.user = si.value.trim(); renderSummary(main); } };
    const btn = main.querySelector('#btnSumFind');
    if(btn) btn.onclick = ()=>{ st.user = si.value.trim(); renderSummary(main); };
  }
  main.querySelector('#btnSumExport').onclick = ()=>{
    const rows = [['日期','学生','类别','项目','分值','原因']];
    rs.slice().sort((a,b)=>String(a.record_date).localeCompare(String(b.record_date)))
      .forEach(r=>rows.push([fmtDate(r.record_date), r.user_name, r.category, r.subject_or_item, r.score, r.reason||'']));
    downloadCSV(`小结_${scopeName}_${range[0]}.csv`, rows);
  };
}

// ============================================================
// 同学扣分汇总
// ============================================================
function renderStudentSummary(main){
  if(!canViewStats()){ main.innerHTML = pageHead({title:'同学扣分汇总'}) + emptyBlock('没有查看权限',''); return; }
  const st = UI.stuSum;
  const range = st.period==='daily' ? [todayStr(), todayStr()]
    : st.period==='weekly' ? weekRange() : monthRange();
  const rows = studentsList().map(u=>{
    const rs = (S.records||[]).filter(r=>!r.revoked && r.user_id===u.id && inRange(fmtDate(r.record_date), range[0], range[1]));
    const d = sumNeg(rs), b = sumPos(rs);
    const pts = {};
    rs.filter(r=>r.score<0).forEach(r=>{
      const k = r.subject_or_item || r.category;
      pts[k] = (pts[k]||0) + (r.score||0);
    });
    const topPts = Object.entries(pts).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([k,v])=>`${k} ${v}`);
    return {u, d, b, n:rs.length, pts:topPts};
  }).filter(x=>x.n>0).sort((a,b)=>a.d-b.d);

  const periodName = {daily:'今日', weekly:'本周', monthly:'本月'}[st.period];
  main.innerHTML = pageHead({
    eyebrow:`${range[0]}${range[0]===range[1]?'':' 至 '+range[1]}`,
    title:'同学扣分汇总',
    sub:`${periodName}有记录的学生，按扣分从多到少排列`,
    actions:`<button class="btn ghost sm" id="btnExpSS">${icon('download',14)}导出 CSV</button>`
  }) + `
  <div style="margin-bottom:16px"><div class="seg" id="segPeriod">
    <button data-v="daily" class="${st.period==='daily'?'on':''}">每日</button>
    <button data-v="weekly" class="${st.period==='weekly'?'on':''}">每周</button>
    <button data-v="monthly" class="${st.period==='monthly'?'on':''}">每月</button>
  </div></div>
  <div class="table-wrap">
    <table class="wide">
      <thead><tr><th>学号</th><th>姓名</th><th class="num">扣分</th><th class="num">加分</th><th class="num">净分</th><th class="num">记录</th><th>主要扣分点</th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>`<tr>
        <td class="num muted">${esc(String(r.u.username).replace('stu',''))}</td>
        <td>${esc(r.u.real_name)}</td>
        <td class="num neg">${r.d||0}</td>
        <td class="num pos">${r.b?'+'+r.b:'0'}</td>
        <td class="num ${r.d+r.b<0?'neg':'pos'}">${fmtScore(r.d+r.b)}</td>
        <td class="num muted">${r.n}</td>
        <td class="muted" style="font-size:12.5px">${r.pts.length?esc(r.pts.join('、')):'—'}</td>
      </tr>`).join('') : `<tr><td colspan="7">${emptyBlock(periodName+'没有扣分记录','所有人都没有记录，可以换个周期看看。')}</td></tr>`}</tbody>
    </table>
  </div>`;
  main.querySelector('#segPeriod').querySelectorAll('button').forEach(b=>b.onclick=()=>{ st.period=b.dataset.v; renderStudentSummary(main); });
  main.querySelector('#btnExpSS').onclick = ()=>{
    const out = [['学号','姓名','扣分','加分','净分','记录数','主要扣分点']];
    rows.forEach(r=>out.push([String(r.u.username).replace('stu',''), r.u.real_name, r.d, r.b, r.d+r.b, r.n, r.pts.join('；')]));
    downloadCSV(`扣分汇总_${range[0]}.csv`, out);
  };
}

// ============================================================
// 录入扣分 / 加分
// ============================================================
function renderRecordCreate(main, isBonus){
  const canCats = isBonus ? (canEnter(me.role,'加分')?['加分']:[]) : ALL_CATS.filter(c=>c!=='加分' && canEnter(me.role,c));
  if(!canCats.length){ main.innerHTML = pageHead({title:isBonus?'录入加分':'录入扣分'}) + emptyBlock('没有录入权限','请联系班主任分配类别权限。'); return; }
  const dict = isBonus ? DICT.bonus : (DICT.deduct.find(d=>d.name===canCats[0])||{items:[]}).items;
  const selected = UI.create.selected;
  const q = UI.create.search || '';

  main.innerHTML = pageHead({
    eyebrow:'暂存后统一递交',
    title:isBonus?'录入加分':'录入扣分',
    sub:isBonus?'选择加分项目与分值，勾选学生后暂存':'按类别与项目批量录入，扣分按负数累计'
  }) + `
  <div class="card" style="margin-bottom:16px">
    <div class="form-grid">
      ${isBonus?'':`<div class="fld"><label for="rcCat">类别</label><select id="rcCat">${canCats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>`}
      <div class="fld"><label for="rcItem">${isBonus?'加分项目':'项目'}</label><select id="rcItem">${dict.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
      <div class="fld"><label for="rcScore">分值</label><input id="rcScore" type="number" value="${isBonus?'2':'1'}" min="1" max="50" step="1" inputmode="numeric"></div>
      <div class="fld"><label for="rcDate">日期</label><input id="rcDate" type="date" value="${todayStr()}" max="${todayStr()}"></div>
    </div>
    <div class="fld" style="margin-top:14px">
      <label for="rcReason">原因与备注</label>
      <input id="rcReason" placeholder="选择「其它」时必须填写，例如：熄灯后讲话" maxlength="80">
    </div>
    <div class="hint" style="margin-top:2px">${isBonus?'分值填正数，计入加分统计':'分值填正数，系统按负数累计'} · 每条记录可追溯录入人与时间</div>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;flex-wrap:wrap;border-bottom:1px solid var(--line2)">
      <div style="font-size:13.5px;font-weight:600">选择学生</div>
      <span class="hint">已选 <span class="num" id="rcCount">${selected.size}</span> 人</span>
      <div class="searchbox" style="margin-left:auto;width:200px">
        ${icon('search',14)}
        <input id="rcSearch" placeholder="姓名或学号" value="${esc(q)}">
      </div>
      <button class="btn ghost sm" id="btnRcAll">全选</button>
      <button class="btn sm" id="btnRcSubmit">暂存录入</button>
    </div>
    <div class="table-wrap picker" style="border:none;border-radius:0">
      <table><thead><tr>
        <th style="width:44px"><input type="checkbox" id="rcAll" aria-label="全选"></th>
        <th>学号</th><th>姓名</th><th>性别</th>
      </tr></thead><tbody id="rcBody"></tbody></table>
    </div>
  </div>`;

  const students = studentsList();
  const body = main.querySelector('#rcBody');
  const countEl = main.querySelector('#rcCount');
  const drawRows = ()=>{
    const kw = (UI.create.search||'').trim();
    const list = kw ? students.filter(s=>(s.real_name||'').includes(kw) || String(s.username).includes(kw)) : students;
    body.innerHTML = list.length ? list.map(s=>`<tr>
      <td><input type="checkbox" class="rc-chk" data-id="${s.id}" ${selected.has(s.id)?'checked':''} aria-label="选择 ${esc(s.real_name)}"></td>
      <td class="num muted">${esc(String(s.username).replace('stu',''))}</td>
      <td>${esc(s.real_name)}</td>
      <td class="muted">${esc(s.gender||'男')}</td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyBlock('没有匹配的学生','换个关键词试试。')}</td></tr>`;
    body.querySelectorAll('.rc-chk').forEach(c=>{
      c.onchange = ()=>{
        const id = Number(c.dataset.id);
        if(c.checked) selected.add(id); else selected.delete(id);
        countEl.textContent = selected.size;
        main.querySelector('#rcAll').checked = list.length>0 && list.every(s=>selected.has(s.id));
      };
    });
    main.querySelector('#rcAll').checked = list.length>0 && list.every(s=>selected.has(s.id));
  };
  drawRows();
  main.querySelector('#rcSearch').oninput = e=>{ UI.create.search = e.target.value; drawRows(); };
  main.querySelector('#btnRcAll').onclick = ()=>{
    const kw = (UI.create.search||'').trim();
    const list = kw ? students.filter(s=>(s.real_name||'').includes(kw) || String(s.username).includes(kw)) : students;
    const allOn = list.length>0 && list.every(s=>selected.has(s.id));
    list.forEach(s=>{ if(allOn) selected.delete(s.id); else selected.add(s.id); });
    countEl.textContent = selected.size;
    drawRows();
  };
  const catSel = main.querySelector('#rcCat');
  const itemSel = main.querySelector('#rcItem');
  if(catSel){
    catSel.onchange = ()=>{
      const items = (DICT.deduct.find(d=>d.name===catSel.value)||{items:[]}).items;
      itemSel.innerHTML = items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    };
  }
  main.querySelector('#btnRcSubmit').onclick = async ()=>{
    if(!selected.size){ toast('先勾选学生', true); return; }
    const item = itemSel.value;
    const score = parseInt(main.querySelector('#rcScore').value, 10);
    if(!Number.isInteger(score) || score<1 || score>50){ toast('分值需为 1 到 50 的整数', true); return; }
    const reason = main.querySelector('#rcReason').value.trim();
    if(item==='其它' && !reason){ toast('选择「其它」时需要填写原因', true); return; }
    const date = main.querySelector('#rcDate').value || todayStr();
    if(date > todayStr()){ toast('日期不能晚于今天', true); return; }
    const cat = isBonus ? '加分' : catSel.value;
    const base = Date.now()*100;
    const newRecords = [];
    let i = 0;
    for(const uid of selected){
      const u = (S.users||[]).find(x=>x.id===uid);
      if(!u) continue;
      newRecords.push({
        id: base + (i++), user_id:uid, user_name:u.real_name||u.username,
        category:cat, subject_or_item:item, score: cat==='加分'?score:-score,
        reason, record_date:date, created_at:nowISO(), revoked:false,
        created_by: me ? me.username : '', reason_code:''
      });
    }
    S.records = S.records || [];
    newRecords.forEach(r=>S.records.push(r));
    stageRecordsAdd(newRecords);
    const n = newRecords.length;
    selected.clear();
    toast(`已暂存 ${n} 条${isBonus?'加分':'扣分'}，点右下角递交`);
    renderRecordCreate(main, isBonus);
  };
}

// ============================================================
// 扣分记录
// ============================================================
function renderRecords(main){
  if(!canViewRecords()){ main.innerHTML = pageHead({title:'扣分记录'}) + emptyBlock('没有查看权限',''); return; }
  const st = UI.records;
  let rs = allRecords().slice().sort((a,b)=>String(b.record_date||'').localeCompare(String(a.record_date||'')) || (b.id||0)-(a.id||0));
  if(st.cat) rs = rs.filter(r=>r.category===st.cat);
  if(st.kw){
    const kw = st.kw;
    rs = rs.filter(r=>String(r.user_name||'').includes(kw) || String(r.subject_or_item||'').includes(kw) || String(r.reason||'').includes(kw));
  }
  const total = rs.length;
  const maxPage = Math.max(1, Math.ceil(total/st.size));
  if(st.page > maxPage) st.page = maxPage;
  const rows = rs.slice((st.page-1)*st.size, st.page*st.size);

  main.innerHTML = pageHead({
    eyebrow:`共 ${total} 条`,
    title:'扣分记录',
    sub:'全部扣分与加分记录，可按类别和关键词筛选',
    actions:`<button class="btn ghost sm" id="btnExp">${icon('download',14)}导出 CSV</button>`
  }) + `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <select id="flCat" style="width:132px"><option value="">全部类别</option>${ALL_CATS.map(c=>`<option value="${esc(c)}" ${c===st.cat?'selected':''}>${esc(c)}</option>`).join('')}</select>
    <div class="searchbox" style="width:240px">${icon('search',14)}<input id="flKw" placeholder="姓名、项目或原因" value="${esc(st.kw)}"></div>
    <button class="btn ghost sm" id="flGo">查询</button>
    ${st.kw||st.cat?`<button class="link" id="flClear">清除筛选</button>`:''}
    <span class="hint" style="margin-left:auto">第 ${st.page} / ${maxPage} 页</span>
  </div>
  <div class="table-wrap">
    <table class="wide">
      <thead><tr><th>日期</th><th>学生</th><th>类别</th><th>项目</th><th class="num">分值</th><th>原因与备注</th><th>记录人</th><th style="width:74px"></th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>`<tr>
        <td class="num muted">${fmtDate(r.record_date)}</td>
        <td>${esc(r.user_name)}</td>
        <td><span class="tag ${r.category==='加分'?'green':''}">${esc(r.category)}</span></td>
        <td>${esc(r.subject_or_item)}</td>
        <td class="num ${r.score>0?'pos':'neg'}">${fmtScore(r.score)}</td>
        <td class="muted" style="font-size:12.5px"><div class="cell-wrap">${r.reason?esc(r.reason):'—'}</div></td>
        <td class="muted" style="font-size:12.5px">${esc(r.created_by||'—')}</td>
        <td>${canRevoke()?`<button class="btn danger sm" data-revoke="${r.id}">撤销</button>`:''}</td>
      </tr>`).join('') : `<tr><td colspan="8">${emptyBlock('没有符合条件的记录','调整筛选条件再试。')}</td></tr>`}</tbody>
    </table>
  </div>
  <div class="pager">
    <button class="btn ghost sm" id="pgPrev" ${st.page<=1?'disabled':''}>${icon('left',14)}上一页</button>
    <span class="num">${st.page} / ${maxPage}</span>
    <button class="btn ghost sm" id="pgNext" ${st.page>=maxPage?'disabled':''}>下一页${icon('right',14)}</button>
  </div>`;

  main.querySelector('#flCat').onchange = e=>{ st.cat = e.target.value; st.page = 1; renderRecords(main); };
  main.querySelector('#flGo').onclick = ()=>{ st.kw = main.querySelector('#flKw').value.trim(); st.page = 1; renderRecords(main); };
  main.querySelector('#flKw').onkeydown = e=>{ if(e.key==='Enter'){ st.kw = e.target.value.trim(); st.page = 1; renderRecords(main); } };
  const clr = main.querySelector('#flClear');
  if(clr) clr.onclick = ()=>{ st.cat=''; st.kw=''; st.page=1; renderRecords(main); };
  main.querySelector('#pgPrev').onclick = ()=>{ if(st.page>1){ st.page--; renderRecords(main); } };
  main.querySelector('#pgNext').onclick = ()=>{ if(st.page<maxPage){ st.page++; renderRecords(main); } };
  main.querySelector('#btnExp').onclick = ()=>{
    const out = [['日期','学生','类别','项目','分值','原因','记录人']];
    rs.forEach(r=>out.push([fmtDate(r.record_date), r.user_name, r.category, r.subject_or_item, r.score, r.reason||'', r.created_by||'']));
    downloadCSV(`扣分记录_${todayStr()}.csv`, out);
  };
  main.querySelectorAll('[data-revoke]').forEach(b=>b.onclick = async ()=>{
    const id = Number(b.dataset.revoke);
    const y = await askConfirm('撤销后该条记录不再计入统计，记录本身仍保留可追溯。','撤销记录','撤销');
    if(!y) return;
    const r = (S.records||[]).find(x=>x.id===id);
    if(!r) return;
    r.revoked = true;
    stageRecordsRevoke(id);
    toast('已暂存撤销，点右下角递交');
    renderRecords(main);
  });
}

// ============================================================
// 个人统计
// ============================================================
function renderPersonal(main){
  const rs = recordsOf(me.id).slice().sort((a,b)=>String(b.record_date||'').localeCompare(String(a.record_date||'')));
  const totalD = sumNeg(rs), totalB = sumPos(rs);
  const byCat = byCategory(rs);
  const catEntries = ALL_CATS.map(c=>[c, byCat[c]||0]).filter(([,v])=>v!==0);
  main.innerHTML = pageHead({
    eyebrow:roleText(me.role),
    title:'个人统计',
    sub:`${me.real_name||me.username} · 本学期累计`,
    actions:''
  }) + `
  <div class="grid g-stats" style="margin-bottom:16px">
    ${statCard('累计扣分', totalD, {cls:'neg'})}
    ${statCard('累计加分', fmtScore(totalB), {cls:totalB>0?'pos':''})}
    ${statCard('净分', fmtScore(totalD+totalB), {cls:(totalD+totalB)<0?'neg':((totalD+totalB)>0?'pos':'')})}
    ${statCard('记录条数', rs.length)}
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>日期</th><th>类别</th><th>项目</th><th class="num">分值</th><th>原因与备注</th></tr></thead>
      <tbody>${rs.length ? rs.map(r=>`<tr>
        <td class="num muted">${fmtDate(r.record_date)}</td>
        <td><span class="tag ${r.category==='加分'?'green':''}">${esc(r.category)}</span></td>
        <td>${esc(r.subject_or_item)}</td>
        <td class="num ${r.score>0?'pos':'neg'}">${fmtScore(r.score)}</td>
        <td class="muted" style="font-size:12.5px">${r.reason?esc(r.reason):'—'}</td>
      </tr>`).join('') : `<tr><td colspan="5">${emptyBlock('还没有你的记录','本学期没有扣分与加分记录。')}</td></tr>`}</tbody>
    </table>
  </div>
  ${catEntries.length?`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="card-title">我的分项</div></div>
    ${catEntries.map(([k,v])=>`<div class="cat-row"><div class="cat-name">${esc(k)}</div>
      <div class="cat-track"><div class="cat-fill ${v>0?'pos':'neg'}" style="width:${Math.min(100,Math.abs(v)/Math.max(1,...catEntries.map(x=>Math.abs(x[1])))*100)}%"></div></div>
      <div class="cat-val ${v>0?'pos':'neg'}">${fmtScore(v)}</div></div>`).join('')}
  </div>`:''}`;
}

// ============================================================
// 用户管理
// ============================================================
function renderUsers(main){
  if(!canManageUsers()){ main.innerHTML = pageHead({title:'用户管理'}) + emptyBlock('没有权限','仅管理员可以管理账号。'); return; }
  const users = (S.users||[]).slice().sort((a,b)=>{
    const rank = {admin:0,teacher:1,viewer:2,student:3};
    return (rank[a.role]||9)-(rank[b.role]||9) || (a.id||0)-(b.id||0);
  });
  const permText = u=>{
    const p = u.permissions||[];
    if(u.role==='admin') return '<span class="muted">全部</span>';
    if(u.role==='teacher' && !p.length) return '<span class="muted">全部类别</span>';
    if(!p.length) return '<span class="muted">只读</span>';
    return esc(p.join('、'));
  };
  main.innerHTML = pageHead({
    eyebrow:`${users.length} 个账号`,
    title:'用户管理',
    sub:'新建、授权与重置密码，改动暂存后统一递交',
    actions:`<button class="btn" id="btnAddUser">${icon('plus',15)}新建学生</button>`
  }) + `
  <div class="table-wrap">
    <table class="wide">
      <thead><tr><th>账号</th><th>姓名</th><th>性别</th><th>角色</th><th>权限</th><th style="width:190px">操作</th></tr></thead>
      <tbody>${users.map(u=>`<tr>
        <td class="num muted">${esc(u.username)}</td>
        <td>${esc(u.real_name)}</td>
        <td class="muted">${u.role==='student'?(u.gender||'男'):'—'}</td>
        <td><span class="tag ${u.role==='admin'?'red':u.role==='teacher'?'blue':''}">${roleText(u.role)}</span></td>
        <td class="muted" style="font-size:12.5px">${permText(u)}</td>
        <td>${u.role==='admin' ? '<span class="muted" style="font-size:12px">—</span>' : `
          ${u.role!=='viewer'?`<button class="btn ghost sm" data-perm="${u.id}">权限</button>`:''}
          <button class="btn ghost sm" data-reset="${u.id}">重置密码</button>
          ${u.role==='student'?`<button class="btn danger sm" data-del="${u.id}">删除</button>`:''}`}
        </td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;

  main.querySelector('#btnAddUser').onclick = ()=>openUserDialog(null);
  main.querySelectorAll('[data-perm]').forEach(b=>b.onclick=()=>openPermDialog(Number(b.dataset.perm)));
  main.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async ()=>{
    const u = (S.users||[]).find(x=>x.id===Number(b.dataset.reset));
    if(!u) return;
    if(!await ensureUnlocked()) return;
    const y = await askConfirm(`将「${u.real_name}」的密码重置为一次性临时密码？对方首次登录后需要修改。`,'重置密码','重置');
    if(!y) return;
    const temp = genTempPwd();
    const np = await makePwdRecord(temp);
    S.pwdCache[u.username] = np;
    u.must_change = true;
    markUserDirty(u);
    stageAccountPwd(u.username, np);
    stageAccountUpsert(u);
    showTempPwd(u, temp);
    renderUsers(main);
  });
  main.querySelectorAll('[data-del]').forEach(b=>b.onclick=async ()=>{
    const u = (S.users||[]).find(x=>x.id===Number(b.dataset.del));
    if(!u) return;
    if(!await ensureUnlocked()) return;
    const ok = await requirePass('删除学生账号前，请确认是本人操作。');
    if(!ok) return;
    const y = await askConfirm(`删除学生「${u.real_name}」？其历史记录会保留。`,'删除用户','删除');
    if(!y) return;
    S.users = S.users.filter(x=>x.id!==u.id);
    S.deletedUsers.add(u.username);
    stageAccountDelete(u.username);
    toast('已暂存删除，点右下角递交');
    renderUsers(main);
  });
}
function genTempPwd(){
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const u = new Uint8Array(8);
  crypto.getRandomValues(u);
  return Array.from(u).map(b=>chars[b%chars.length]).join('');
}
function showTempPwd(u, temp){
  const d = document.createElement('div');
  d.className = 'mask';
  d.innerHTML = `<div class="dialog narrow">
    <h3>临时密码</h3>
    <div class="dsub">${esc(u.real_name)}（${esc(u.username)}）的新临时密码，只显示这一次。请当面或私下转告，首次登录会要求修改。</div>
    <div class="code-line"><code>${esc(temp)}</code><button class="btn ghost sm" data-copy>复制</button></div>
    <div class="hint">递交后生效。</div>
    <div class="dlg-btns"><button class="btn" data-close>知道了</button></div>
  </div>`;
  document.body.appendChild(d);
  d.querySelector('[data-copy]').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(temp); toast('已复制'); }catch(e){ toast('复制失败，请手动记下', true); }
  };
  d.querySelector('[data-close]').onclick = ()=>d.remove();
  d.onclick = e=>{ if(e.target===d) d.remove(); };
}
function openUserDialog(existing){
  const d = document.createElement('div');
  d.className = 'mask';
  d.innerHTML = `<div class="dialog narrow">
    <h3>${existing?'编辑学生':'新建学生'}</h3>
    <div class="dsub">${existing?'修改姓名。':'登录账号为 stu 加学号，初始密码为随机临时密码。'}</div>
    <div class="fld"><label for="udName">姓名</label><input id="udName" value="${existing?esc(existing.real_name):''}" maxlength="20"></div>
    <div class="fld"><label for="udNo">学号</label><input id="udNo" value="${existing?esc(String(existing.username).replace('stu','')):''}" ${existing?'disabled':''} inputmode="numeric" maxlength="4"></div>
    <div class="fld"><label for="udGender">性别</label>
      <select id="udGender"><option value="男">男</option><option value="女" ${existing&&existing.gender==='女'?'selected':''}>女</option></select></div>
    <div class="dlg-btns"><button class="btn ghost" data-cancel>取消</button><button class="btn" data-ok>暂存</button></div>
  </div>`;
  document.body.appendChild(d);
  const close = ()=>d.remove();
  d.querySelector('[data-cancel]').onclick = close;
  d.onclick = e=>{ if(e.target===d) close(); };
  d.querySelector('[data-ok]').onclick = async ()=>{
    if(!await ensureUnlocked()) return;
    const name = d.querySelector('#udName').value.trim();
    const no = d.querySelector('#udNo').value.trim();
    const gender = d.querySelector('#udGender').value;
    if(!name){ toast('请填写姓名', true); return; }
    if(existing){
      existing.real_name = name;
      existing.gender = gender;
      markUserDirty(existing);
      stageAccountUpsert(existing);
      toast('已暂存修改');
      close(); renderUsers($('main'));
      return;
    }
    if(!/^\d{2,4}$/.test(no)){ toast('学号应为 2 到 4 位数字', true); return; }
    const uname = 'stu'+no;
    if((S.users||[]).some(u=>u.username===uname)){ toast('该学号已存在', true); return; }
    const maxId = Math.max(0, ...(S.users||[]).map(u=>u.id||0));
    const nu = {id:maxId+1, username:uname, real_name:name, role:'student', class_id:1, must_change:true, gender, permissions:[]};
    const temp = genTempPwd();
    const np = await makePwdRecord(temp);
    S.users.push(nu);
    S.pwdCache[uname] = np;
    markUserDirty(nu);
    stageAccountUpsert(nu);
    stageAccountPwd(uname, np);
    close();
    showTempPwd(nu, temp);
    renderUsers($('main'));
    toast('已暂存新建');
  };
}
function openPermDialog(uid){
  const u = (S.users||[]).find(x=>x.id===uid);
  if(!u || u.role==='admin') return;
  const cur = new Set(u.permissions||[]);
  const opts = ['学习','寝室','日常','两操','加分','查看班级','查看扣分记录'];
  const isTeacherRole = u.role==='teacher';
  const d = document.createElement('div');
  d.className = 'mask';
  d.innerHTML = `<div class="dialog">
    <h3>分配权限</h3>
    <div class="dsub">${esc(u.real_name)}（${esc(u.username)}）· ${roleText(u.role)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${opts.map(o=>`<span class="pill-check ${cur.has(o)?'on':''}" data-o="${esc(o)}">${esc(o)}</span>`).join('')}
    </div>
    <div class="hint" style="margin-top:14px">${isTeacherRole
      ? '老师不勾选任何类别时默认拥有全部录入权限；勾选后仅限所选类别。'
      : '「加分」是独立权限；「查看班级」开放看板、小结与汇总；「查看扣分记录」开放全量明细。'}</div>
    <div class="dlg-btns"><button class="btn ghost" data-cancel>取消</button><button class="btn" data-ok>暂存</button></div>
  </div>`;
  document.body.appendChild(d);
  d.querySelectorAll('.pill-check').forEach(p=>p.onclick=()=>{
    const o = p.dataset.o;
    if(cur.has(o)) cur.delete(o); else cur.add(o);
    p.classList.toggle('on');
  });
  const close = ()=>d.remove();
  d.querySelector('[data-cancel]').onclick = close;
  d.onclick = e=>{ if(e.target===d) close(); };
  d.querySelector('[data-ok]').onclick = async ()=>{
    u.permissions = Array.from(cur);
    if(u.id===me.id) me.permissions = u.permissions;
    markUserDirty(u);
    stageAccountUpsert(u);
    toast('已暂存权限修改');
    close(); renderUsers($('main'));
  };
}

// ============================================================
// 意见反馈
// ============================================================
function renderFeedback(main){
  const staff = canManageFeedback();
  const list = (S.feedback||[]).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const statusTag = s=> s==='resolved' ? '<span class="tag green">已处理</span>'
    : s==='processing' ? '<span class="tag blue">处理中</span>' : '<span class="tag red">待处理</span>';

  main.innerHTML = pageHead({
    eyebrow: staff?`${list.length} 条`:'',
    title:'意见反馈',
    sub:'对系统的建议、遇到的问题、希望增加的功能'
  }) + `
  ${staff?`<div class="card" style="margin-bottom:16px">
    <div class="fld"><label for="fbContent">意见建议</label>
      <textarea id="fbContent" rows="4" maxlength="1000" placeholder="写下你的建议或遇到的问题"></textarea></div>
    <div class="form-grid" style="margin-top:12px">
      <div class="fld"><label for="fbContact">联系方式（选填）</label><input id="fbContact" maxlength="60" placeholder="手机号、微信或邮箱"></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
      <button class="btn" id="btnFbSubmit">提交反馈</button>
      <span class="hint">提交后老师可在下方处理</span>
    </div>
  </div>`: `<div class="card" style="margin-bottom:16px">
    <div class="card-title" style="margin-bottom:6px">反馈由老师代为提交</div>
    <div class="hint">为了避免公开写权限，学生的意见请交给班主任。也可以直接在
      <a href="https://github.com/tangyuan9325/class-deduction/issues" target="_blank" rel="noopener">GitHub Issues</a> 留言。</div>
  </div>`}
  ${staff?`<div class="table-wrap">
    <table>
      <thead><tr><th>提交人</th><th>内容</th><th>联系方式</th><th>状态</th><th>时间</th><th style="width:150px">处理</th></tr></thead>
      <tbody>${list.length ? list.map(f=>`<tr>
        <td>${esc(f.user_name)}</td>
        <td class="muted" style="font-size:12.5px"><div class="cell-wrap" title="${esc(f.content)}">${esc(f.content)}</div></td>
        <td class="muted" style="font-size:12.5px">${esc(f.contact||'—')}</td>
        <td>${statusTag(f.status)}</td>
        <td class="num muted">${fmtDate(f.created_at)}</td>
        <td>
          <button class="btn ghost sm" data-fb="${f.id}" data-st="processing">处理中</button>
          <button class="btn ghost sm" data-fb="${f.id}" data-st="resolved">已处理</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="6">${emptyBlock('还没有反馈','老师提交后显示在这里。')}</td></tr>`}</tbody>
    </table>
  </div>`:''}`;

  const btn = main.querySelector('#btnFbSubmit');
  if(btn) btn.onclick = async ()=>{
    const content = main.querySelector('#fbContent').value.trim();
    if(content.length<4){ toast('请把问题写清楚一点', true); return; }
    if(!await ensureUnlocked()) return;
    S.feedback = S.feedback || [];
    S.feedback.push({
      id: Date.now()*100 + Math.floor(Math.random()*99),
      user_id: me.id, user_name: me.real_name||me.username, user_role: me.role,
      content, contact: main.querySelector('#fbContact').value.trim(),
      status:'open', created_at: nowISO(), updated_at: nowISO()
    });
    try{
      await writeFeedbackDomain();
      toast('反馈已提交');
      renderFeedback(main);
    }catch(e){ toast(errText(e), true); }
  };
  main.querySelectorAll('[data-fb]').forEach(b=>b.onclick = async ()=>{
    const f = (S.feedback||[]).find(x=>x.id===Number(b.dataset.fb));
    if(!f) return;
    if(!await ensureUnlocked()) return;
    f.status = b.dataset.st;
    f.updated_at = nowISO();
    try{ await writeFeedbackDomain(); toast('状态已更新'); renderFeedback(main); }
    catch(e){ toast(errText(e), true); }
  });
}

// ============================================================
// 关于与部署
// ============================================================
function renderAbout(main){
  const cloneCmd = `git clone https://github.com/${SYNC.owner}/${SYNC.repo}.git`;
  main.innerHTML = pageHead({
    eyebrow:'v'+APP_VERSION,
    title:'关于与部署',
    sub:'源码托管在 GitHub，可以克隆到本机或自建服务器运行'
  }) + `
  <div class="grid g-2">
    <div class="card">
      <div class="card-head"><div class="card-title">版本</div><div class="card-note">${esc(APP_VERSION)}</div></div>
      <ul class="notes">${RELEASE_NOTES.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><div class="card-title">克隆与运行</div></div>
        <div class="code-line"><code>${esc(cloneCmd)}</code><button class="btn ghost sm" id="btnCopy">复制</button></div>
        <div class="hint">进入目录后执行 <code>go build -o class-deduction ./cmd &amp;&amp; ./class-deduction</code>，访问 <code>http://localhost:8080</code>。需要 Go 1.21 以上。</div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">数据存储</div></div>
        <div class="hint" style="line-height:1.9">
          在线版把数据放在仓库里：<code>docs/data/accounts.json</code>、<code>records.json</code>、<code>feedback.json</code>，密码按账号单独存放于 <code>docs/data/users/</code>，使用 PBKDF2-SHA256 60 万次迭代加盐。<br>
          同步走 Pages CDN 与 raw 源站双通道，不消耗 API 配额；写入走 GitHub Contents API。
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><div class="card-title">写入安全</div><div class="card-note">${ghToken?'本设备已解锁':'本设备已锁定'}</div></div>
    <div class="hint" style="line-height:1.9">
      GitHub 写令牌以 AES-GCM 密文保存在 <code>docs/gh-token.js</code>，密钥由写入口令经 PBKDF2 派生，公开源码中不含可用凭据。
      没有口令的访客只能浏览；录入、修改账号、提交反馈都需要先解锁。解锁状态只保存在当前标签页，关闭浏览器即失效。
    </div>
    ${isAdmin()?`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="btn ghost sm" id="btnRotate">更换写令牌或口令</button>
      <button class="btn ghost sm" id="btnLockNow">立即锁定本设备</button>
    </div>`:''}
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><div class="card-title">许可</div></div>
    <div class="hint">本项目以 <a href="https://github.com/${SYNC.owner}/${SYNC.repo}/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a> 开源。页面风格参考
      <a href="https://github.com/heydamir/unslop" target="_blank" rel="noopener">unslop</a>（Damir Sokolovsky，CC BY 4.0）的设计方法。</div>
  </div>`;

  main.querySelector('#btnCopy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(cloneCmd); toast('已复制克隆命令'); }
    catch(e){ toast('复制失败，请手动选择', true); }
  };
  const rot = main.querySelector('#btnRotate');
  if(rot) rot.onclick = openRotateDialog;
  const lk = main.querySelector('#btnLockNow');
  if(lk) lk.onclick = ()=>lockWrite();
}
function openRotateDialog(){
  const d = document.createElement('div');
  d.className = 'mask';
  d.innerHTML = `<div class="dialog">
    <h3>更换写令牌或口令</h3>
    <div class="dsub">生成新的 <code>gh-token.js</code>，用它替换仓库里的同名文件并提交。旧口令随即失效。</div>
    <div class="fld"><label for="rtToken">GitHub 细粒度令牌</label><input id="rtToken" placeholder="github_pat_..." autocomplete="off"></div>
    <div class="fld"><label for="rtPass">新写入口令（至少 12 位）</label><input id="rtPass" type="password" autocomplete="new-password"></div>
    <div class="fld"><label for="rtPass2">再输一次</label><input id="rtPass2" type="password" autocomplete="new-password"></div>
    <div class="err" id="rtErr"></div>
    <div class="hint">令牌只在本机浏览器内加密，不会发送到任何第三方。建议只授予本仓库 Contents 读写权限并设置有效期。</div>
    <div class="dlg-btns"><button class="btn ghost" data-cancel>取消</button><button class="btn" data-ok>生成文件</button></div>
  </div>`;
  document.body.appendChild(d);
  const close = ()=>d.remove();
  d.querySelector('[data-cancel]').onclick = close;
  d.onclick = e=>{ if(e.target===d) close(); };
  d.querySelector('[data-ok]').onclick = async ()=>{
    const token = d.querySelector('#rtToken').value.trim();
    const p1 = d.querySelector('#rtPass').value, p2 = d.querySelector('#rtPass2').value;
    const err = d.querySelector('#rtErr');
    err.textContent = '';
    if(!/^github_pat_[A-Za-z0-9_]{20,}$|^ghp_[A-Za-z0-9]{20,}$/.test(token)){ err.textContent = '令牌格式不正确'; return; }
    if(p1.length<12){ err.textContent = '口令至少 12 位'; return; }
    if(p1!==p2){ err.textContent = '两次输入不一致'; return; }
    try{
      const blob = await sealVault(token, p1);
      const content = '/* 写入令牌保管库：AES-GCM 密文，密钥由写入口令派生。请勿在此处放明文。 */\\n' +
        'var GH_VAULT = ' + JSON.stringify(blob) + ';\\n';
      const file = new Blob([content], {type:'text/javascript'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'gh-token.js';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      close();
      toast('已生成 gh-token.js，请替换后提交');
    }catch(e){ err.textContent = e.message||'生成失败'; }
  };
}

// ============================================================
// 修改密码
// ============================================================
function openChangePass(force){
  const d = document.createElement('div');
  d.className = 'mask';
  d.innerHTML = `<div class="dialog narrow">
    <h3>${force?'请先修改初始密码':'修改密码'}</h3>
    <div class="dsub">${force?'临时密码只用于首次登录，修改后才能继续使用。':'修改后其他设备需要重新登录。'}</div>
    <div class="fld"><label for="cpOld">当前密码</label><input id="cpOld" type="password" autocomplete="current-password"></div>
    <div class="fld"><label for="cpNew">新密码</label><input id="cpNew" type="password" autocomplete="new-password"></div>
    <div class="fld"><label for="cpNew2">确认新密码</label><input id="cpNew2" type="password" autocomplete="new-password"></div>
    <div class="err" id="cpErr"></div>
    <div class="hint">至少 8 位，建议字母与数字混合；纯数字需 10 位以上。</div>
    <div class="dlg-btns"><button class="btn ghost" data-cancel>${force?'稍后再说':'取消'}</button><button class="btn" data-ok>${force?'保存并生效':'暂存修改'}</button></div>
  </div>`;
  document.body.appendChild(d);
  const close = ()=>d.remove();
  d.querySelector('[data-cancel]').onclick = close;
  d.onclick = e=>{ if(e.target===d) close(); };
  d.querySelector('[data-ok]').onclick = async ()=>{
    const err = d.querySelector('#cpErr');
    err.textContent = '';
    const stored = S.pwdCache[me.username] || await loadPwd(me.username);
    const v = await verifyPwd(d.querySelector('#cpOld').value, stored);
    if(!v.ok){ err.textContent = '当前密码不正确'; return; }
    const n1 = d.querySelector('#cpNew').value, n2 = d.querySelector('#cpNew2').value;
    const prob = pwdProblem(n1, me.username);
    if(prob){ err.textContent = prob; return; }
    if(n1!==n2){ err.textContent = '两次输入不一致'; return; }
    if(n1===d.querySelector('#cpOld').value){ err.textContent = '新密码不能与旧密码相同'; return; }
    const np = await makePwdRecord(n1);
    S.pwdCache[me.username] = np;
    const u = (S.users||[]).find(x=>x.id===me.id);
    if(force){
      if(!await ensureUnlocked()) return;
      try{
        if(u){ u.must_change = false; markUserDirty(u); }
        if(pending.accounts){
          pending.accounts.pwdMap = pending.accounts.pwdMap || {};
          pending.accounts.pwdMap[me.username] = np;
          persistPending(); updatePendingUI();
        }
        await writePwdFile(me.username, np);
        if(u) await writeAccountsDomain();
        toast('密码已修改');
        close();
      }catch(e){ err.textContent = errText(e); }
    }else{
      if(u && u.must_change){ u.must_change = false; markUserDirty(u); stageAccountUpsert(u); }
      stageSelfPwd(np);
      toast('已暂存，点右下角递交后生效');
      close();
    }
  };
}
