/* ============================================================
 * 视图渲染与业务逻辑（依赖 app.js 的 S/me/save 等）
 * ============================================================ */
'use strict';

// ---------- 数据查询助手 ----------
function allRecords(){ return (S.records||[]).filter(r=>!r.revoked); }
function recordsOf(userId, range){ 
  let rs = allRecords();
  if(userId) rs = rs.filter(r=>r.user_id===userId);
  if(range) rs = rs.filter(r=> inRange(fmtDate(r.record_date), range[0], range[1]));
  return rs;
}
function sumScore(rs, cat){ const c = cat? rs.filter(r=>r.category===cat) : rs; return c.reduce((a,r)=>a+(r.score||0),0); }
function byCategory(rs){ const o={}; (S.dictionary.deduct||[]).forEach(d=>o[d.name]=0); o['加分']=0; rs.forEach(r=>{ o[r.category]=(o[r.category]||0)+(r.score||0); }); return o; }
function topStudents(rs, n, bonus){
  const map={};
  rs.forEach(r=>{ if(bonus ? r.score>0 : r.score<0){ map[r.user_name]=(map[r.user_name]||0)+(r.score||0); } });
  const arr=Object.entries(map).sort((a,b)=> a[1]-b[1]);
  if(bonus) arr.reverse();
  return arr.slice(0,n||5);
}
function studentsList(){ return (S.users||[]).filter(u=>u.role==='student'); }
function userName(id){ const u=(S.users||[]).find(x=>x.id===id); return u?u.real_name||u.username:('#'+id); }
function catColor(cat){ return {学习:'#58a6ff',寝室:'#bc8cff',日常:'#d29922',两操:'#f85149',加分:'#3fb950'}[cat]||'#768390'; }

// ---------- 视图分发 ----------
function renderView(){
  const main=$('main');
  main.innerHTML='';
  switch(curView){
    case 'dashboard': renderDashboard(main); break;
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
function statCards(main, rs, title){
  const totalD = rs.filter(r=>r.score<0).reduce((a,r)=>a+r.score,0);
  const totalB = rs.filter(r=>r.score>0).reduce((a,r)=>a+r.score,0);
  const days = new Set(rs.map(r=>fmtDate(r.record_date))).size;
  main.innerHTML += `
  <div class="stats">
    <div class="stat"><div class="lbl">${title}累计扣分</div><div class="val red">${totalD}</div></div>
    <div class="stat"><div class="lbl">${title}累计加分</div><div class="val green">+${totalB}</div></div>
    <div class="stat"><div class="lbl">${title}净分</div><div class="val ${totalD+totalB<0?'red':'green'}">${totalD+totalB}</div></div>
    <div class="stat"><div class="lbl">记录总数</div><div class="val blue">${rs.length}</div></div>
    <div class="stat"><div class="lbl">记录天数</div><div class="val purple">${days}</div></div>
  </div>`;
  return {totalD, totalB};
}
function renderDashboard(main){
  if(!canViewStats()){ main.innerHTML='<div class="empty">无查看班级权限</div>'; return; }
  const rs = allRecords();
  statCards(main, rs, '');
  // 分类分布 + 近14天趋势
  const byCat = byCategory(rs);
  const catRows = Object.entries(byCat).sort((a,b)=>a[1]-b[1]);
  const maxAbs = Math.max(1, ...catRows.map(x=>Math.abs(x[1])));
  let catHtml = catRows.map(([k,v])=>`
    <div class="topbar"><div class="rank rN" style="font-size:12px">${k}</div>
      <div class="bar"><i style="width:${Math.abs(v)/maxAbs*100}%;background:${catColor(k)}"></i></div>
      <div class="num" style="color:${v>0?'var(--green)':v<0?'var(--red)':'var(--text2)'}">${v>0?'+':''}${v}</div></div>`).join('');
  // 近14天趋势
  const days=[]; const today=new Date();
  for(let i=13;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); days.push(fmtDate(d)); }
  const dayScores = days.map(d=>{ const s=rs.filter(r=>isSameDay(r.record_date,d)).reduce((a,r)=>a+(r.score||0),0); return s; });
  const maxD = Math.max(1, ...dayScores.map(Math.abs));
  const trendHtml = days.map((d,i)=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="font-size:11px;color:${dayScores[i]>0?'var(--green)':dayScores[i]<0?'var(--red)':'var(--text3)'}">${dayScores[i]>0?'+':''}${dayScores[i]}</div>
      <div style="height:80px;display:flex;align-items:flex-end"><div style="width:14px;border-radius:4px;height:${Math.max(2,Math.abs(dayScores[i])/maxD*80)}px;background:${dayScores[i]>=0?'var(--green)':'var(--red)'}"></div></div>
      <div style="font-size:10px;color:var(--text3)">${d.slice(5)}</div>
    </div>`).join('');
  const topD = topStudents(rs, 5, false);
  const topB = topStudents(rs, 5, true);
  const topHtml = (arr, negative)=>(arr.length? arr.map(([n,v],i)=>`
    <div class="topbar"><div class="rank ${i<3?'r'+(i+1):'rN'}">${i+1}</div><div style="flex:1">${esc(n)}</div>
    <div class="num" style="color:${negative?'var(--red)':'var(--green)'}">${v}</div></div>`).join('') : '<div class="empty" style="padding:16px">暂无数据</div>');
  main.innerHTML += `
  <div class="grid2">
    <div class="card"><div class="card-title">类别分布</div>${catHtml}</div>
    <div class="card"><div class="card-title">近14天趋势</div><div style="display:flex;gap:6px;align-items:flex-end">${trendHtml}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-title">扣分最多 TOP5</div>${topHtml(topD,true)}</div>
    <div class="card"><div class="card-title">加分最多 TOP5</div>${topHtml(topB,false)}</div>
  </div>`;
}

// ============================================================
// 周/学期小结
// ============================================================
let sumScope='class', sumPeriod='week', sumUserId='', sumDate='';
function renderSummary(main){
  const staff=isStaff();
  const canClass=canViewStats();
  if(!canClass && sumScope==='class') sumScope='personal';
  if(!staff){ sumUserId = me.real_name || me.username; }
  main.innerHTML = `
  <div class="page-head"><div>
    <div class="page-title">周/学期小结</div>
    <div class="page-sub">${canClass?'班级或本人':'本人'}的一周 / 一学期表现总结</div>
  </div></div>
  <div class="toolbar">
    ${canClass? `<div class="tabs" id="sumScopeTabs">
      <button class="${sumScope==='class'?'on':''}" data-v="class">班级小结</button>
      <button class="${sumScope==='personal'?'on':''}" data-v="personal">个人小结</button>
    </div>` : ''}
    <div class="tabs">
      <button class="${sumPeriod==='week'?'on':''}" data-v="week">本周</button>
      <button class="${sumPeriod==='semester'?'on':''}" data-v="semester">本学期</button>
    </div>
    ${sumScope==='personal' ? (staff ? `<input id="sumUserId" placeholder="输入学生账号或姓名" value="${esc(sumUserId)}" style="width:180px">` : `<span class="hint" style="align-self:center">本人：${esc(me.real_name||me.username)}</span>`) : ''}
    <button class="btn mini" id="btnSumDate">本周(截至今天)</button>
  </div>
  <div id="sumBody"><div class="empty">加载中…</div></div>`;
  const tabs = canClass ? main.querySelectorAll('#sumScopeTabs button') : [];
  tabs.forEach(b=>b.onclick=()=>{ sumScope=b.dataset.v; renderSummary(main); });
  const periodTabs = canClass ? main.querySelectorAll('.tabs')[1].querySelectorAll('button') : main.querySelectorAll('.tabs')[0].querySelectorAll('button');
  periodTabs.forEach(b=>b.onclick=()=>{ sumPeriod=b.dataset.v; renderSummary(main); });
  const ui = main.querySelector('#sumUserId');
  if(ui) ui.onchange=()=>{ sumUserId=ui.value.trim(); renderSummary(main); };
  main.querySelector('#btnSumDate').onclick=()=>renderSummary(main);
  // 计算
  const range = sumPeriod==='week' ? weekRange() : [S.meta.semester_start||'2026-01-01', todayStr()];
  const targetUid = sumScope==='personal'
    ? (staff ? ((S.users||[]).find(u=>u.role!=='viewer' && (u.username===sumUserId || u.real_name===sumUserId)) || {}).id : me.id)
    : null;
  const rs = recordsOf(targetUid, range);
  const weekNo = weekNumOf(todayStr());
  const head = sumPeriod==='week' ? `第 ${weekNo} 周（${range[0]} ~ ${range[1]}）` : `本学期（${range[0]} ~ ${todayStr()}）`;
  const scopeName = sumScope==='class' ? '全班' : (targetUid? userName(targetUid) : '该学生');
  const body = main.querySelector('#sumBody');
  const totalD = rs.filter(r=>r.score<0).reduce((a,r)=>a+r.score,0);
  const totalB = rs.filter(r=>r.score>0).reduce((a,r)=>a+r.score,0);
  const byCat = byCategory(rs);
  const catRows = Object.entries(byCat).filter(([k,v])=>v!==0).sort((a,b)=>a[1]-b[1]);
  const topD = topStudents(rs,5,false), topB = topStudents(rs,5,true);
  body.innerHTML = `
  <div class="card"><div class="card-title">${esc(scopeName)} · ${esc(head)} · 小结</div>
    <div class="stats">
      <div class="stat"><div class="lbl">累计扣分</div><div class="val red">${totalD}</div></div>
      <div class="stat"><div class="lbl">累计加分</div><div class="val green">+${totalB}</div></div>
      <div class="stat"><div class="lbl">净分</div><div class="val ${totalD+totalB<0?'red':'green'}">${totalD+totalB}</div></div>
      <div class="stat"><div class="lbl">记录数</div><div class="val blue">${rs.length}</div></div>
    </div>
    <div style="font-size:13px;color:var(--text2);line-height:1.9">
      ${rs.length===0 ? '本周期暂无扣分/加分记录，表现良好，请继续保持。' :
        `本${sumPeriod==='week'?'周':'学期'}累计扣分 ${totalD} 分、加分 +${totalB} 分，净分 ${totalD+totalB} 分。
         ${catRows.map(([k,v])=>(v<0?'扣分':'加分')+'集中在「'+esc(k)+'」('+v+'分)').join('；')}。
         ${topD.length? '主要扣分：'+topD.map(([n,v])=>esc(n)+'('+v+')').join('、')+'。':''}
         ${topB.length? '主要加分：'+topB.map(([n,v])=>esc(n)+'(+'+v+')').join('、')+'。':''}`}
    </div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-title">分项明细</div>
      ${catRows.length? catRows.map(([k,v])=>`<div class="topbar"><div class="rank rN" style="font-size:12px">${k}</div><div class="bar"><i style="width:${Math.min(100,Math.abs(v)/Math.max(1,Math.max(...catRows.map(x=>Math.abs(x[1]))))*100)}%;background:${catColor(k)}"></i></div><div class="num" style="color:${v>0?'var(--green)':'var(--red)'}">${v>0?'+':''}${v}</div></div>`).join('') : '<div class="empty">无数据</div>'}
    </div>
    <div class="card"><div class="card-title">TOP5 排行（扣分 / 加分）</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:6px">扣分最多</div>
      ${topD.length? topD.map(([n,v],i)=>`<div class="topbar"><div class="rank ${i<3?'r'+(i+1):'rN'}">${i+1}</div><div style="flex:1">${esc(n)}</div><div class="num" style="color:var(--red)">${v}</div></div>`).join('') : '<div class="empty" style="padding:10px">无</div>'}
      <div style="font-size:12px;color:var(--text3);margin:10px 0 6px">加分最多</div>
      ${topB.length? topB.map(([n,v],i)=>`<div class="topbar"><div class="rank ${i<3?'r'+(i+1):'rN'}">${i+1}</div><div style="flex:1">${esc(n)}</div><div class="num" style="color:var(--green)">+${v}</div></div>`).join('') : '<div class="empty" style="padding:10px">无</div>'}
    </div>
  </div>`;
}

// ============================================================
// 同学扣分汇总（日/周/月）
// ============================================================
let ssPeriod='daily';
function renderStudentSummary(main){
  if(!canViewStats()){ main.innerHTML='<div class="empty">无查看班级权限</div>'; return; }
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">同学扣分汇总</div><div class="page-sub">按日 / 周 / 月查看每个同学的扣分点总结</div></div></div>
  <div class="toolbar">
    <div class="tabs">
      <button class="${ssPeriod==='daily'?'on':''}" data-v="daily">每日</button>
      <button class="${ssPeriod==='weekly'?'on':''}" data-v="weekly">每周</button>
      <button class="${ssPeriod==='monthly'?'on':''}" data-v="monthly">每月</button>
    </div>
    <button class="btn mini" id="btnExportSS">导出 CSV</button>
  </div>
  <div class="card" style="padding:0">
    <div class="table-wrap"><table>
      <thead><tr><th>学号</th><th>姓名</th><th>扣分总数</th><th>加分总数</th><th>净分</th><th>记录数</th><th>主要扣分点</th></tr></thead>
      <tbody id="ssBody"></tbody>
    </table></div>
  </div>`;
  main.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ ssPeriod=b.dataset.v; renderStudentSummary(main); });
  const range = ssPeriod==='daily' ? [todayStr(), todayStr()]
    : ssPeriod==='weekly' ? weekRange() : monthRange();
  const rows = studentsList().map(u=>{
    const rs = (S.records||[]).filter(r=>!r.revoked && r.user_id===u.id && inRange(fmtDate(r.record_date), range[0], range[1]));
    const d = rs.filter(r=>r.score<0).reduce((a,r)=>a+r.score,0);
    const b = rs.filter(r=>r.score>0).reduce((a,r)=>a+r.score,0);
    // 扣分点聚合
    const pts={};
    rs.filter(r=>r.score<0).forEach(r=>{ const k=r.category+'/'+(r.subject_or_item||''); pts[k]=(pts[k]||0)+(r.score||0); });
    const topPts = Object.entries(pts).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([k,v])=>`${k}(${v})`);
    return {u, d, b, n:rs.length, pts:topPts};
  }).filter(x=>x.n>0).sort((a,b)=>a.d-b.d);
  const tb = main.querySelector('#ssBody');
  tb.innerHTML = rows.length ? rows.map(r=>`
    <tr><td>${esc(r.u.username.replace('stu',''))}</td><td>${esc(r.u.real_name)}</td>
    <td style="color:var(--red)">${r.d}</td><td style="color:var(--green)">+${r.b}</td>
    <td style="color:${r.d+r.b<0?'var(--red)':'var(--green)'}">${r.d+r.b}</td><td>${r.n}</td>
    <td style="font-size:12px;color:var(--text2)">${r.pts.length? esc(r.pts.join('、')) : '—'}</td></tr>`).join('')
    : '<tr><td colspan="7"><div class="empty">本周期暂无扣分记录</div></td></tr>';
  main.querySelector('#btnExportSS').onclick=()=>{
    const lines=[['学号','姓名','扣分总数','加分总数','净分','记录数','主要扣分点'].join(',')];
    rows.forEach(r=>lines.push([csvSafe(r.u.username.replace('stu','')),csvSafe(r.u.real_name),r.d,'+'+r.b,r.d+r.b,r.n,'"'+csvSafe(r.pts.join('；'))+'"'].join(',')));
    const blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='同学扣分汇总_'+range[0]+'.csv'; a.click();
  };
}

// ============================================================
// 录入扣分 / 加分
// ============================================================
function renderRecordCreate(main, isBonus){
  const canCats = isBonus ? ['加分'] : ALL_CATS.filter(c=>c!=='加分' && canEnter(me.role,c));
  if(!canCats.length){ main.innerHTML='<div class="empty">没有录入权限</div>'; return; }
  const dict = isBonus ? (S.dictionary.bonus||[]) : (S.dictionary.deduct||[]).map(d=>({name:d.name, items:d.items}));
  const defCat = canCats[0];
  const defItems = isBonus ? dict : (dict.find(d=>d.name===defCat)||{items:[]}).items;
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">${isBonus?'录入加分':'录入扣分'}</div><div class="page-sub">${isBonus?'需「加分」权限':'勾选学生，按项目批量录入'}</div></div></div>
  <div class="card">
    <div class="form-row">
      <div class="fld"><label>${isBonus?'加分项目':'类别'}</label>
        ${isBonus? `<select id="rcItem">${dict.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>`
          : `<select id="rcCat">${canCats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>`}
      </div>
      ${isBonus?'':`<div class="fld"><label>项目</label><select id="rcItem"></select></div>`}
      <div class="fld"><label>分值</label><input id="rcScore" type="number" value="${isBonus?'2':'1'}" min="1" max="50" style="width:110px"></div>
      <div class="fld"><label>记录日期</label><input id="rcDate" type="date" value="${todayStr()}"></div>
    </div>
    <div class="fld"><label>原因/说明</label><input id="rcReason" placeholder="例如：作业未交 / 数学竞赛获奖"></div>
    <div class="hint" style="margin:4px 0 10px">${isBonus?'加分填正数，将计入该生加分统计':'扣分填正数，系统按负数累计'}</div>
  </div>
  <div class="card">
    <div class="card-title" style="justify-content:space-between"><span>选择学生（已选 <span id="rcCount">0</span> 人）</span>
      <span style="display:flex;gap:8px"><input id="rcSearch" placeholder="搜索姓名/学号" style="width:180px"><button class="btn" id="btnRcSubmit">提交</button></span></div>
    <div class="table-wrap"><table>
      <thead><tr><th style="width:40px"><input type="checkbox" id="rcAll"></th><th>学号</th><th>姓名</th><th>性别</th></tr></thead>
      <tbody id="rcBody"></tbody>
    </table></div>
  </div>`;
  const students = studentsList();
  const body = main.querySelector('#rcBody');
  const selected = new Set();
  const renderRows = (kw)=>{
    const list = kw ? students.filter(s=>(s.real_name||'').includes(kw)||s.username.includes(kw)) : students;
    body.innerHTML = list.map(s=>`
      <tr><td><input type="checkbox" class="rc-chk" value="${s.id}" ${selected.has(s.id)?'checked':''}></td>
      <td>${esc(s.username.replace('stu',''))}</td><td>${esc(s.real_name)}</td>
      <td><span class="tag ${s.gender==='女'?'purple':'blue'}">${s.gender||'男'}</span></td></tr>`).join('');
    body.querySelectorAll('.rc-chk').forEach(c=>c.onchange=()=>{ if(c.checked) selected.add(+c.value); else selected.delete(+c.value); main.querySelector('#rcCount').textContent=selected.size; });
  };
  renderRows('');
  main.querySelector('#rcAll').onchange=e=>{ const all=e.target.checked; students.forEach(s=>{ if(all) selected.add(s.id); }); if(!all) selected.clear(); body.querySelectorAll('.rc-chk').forEach(c=>c.checked=all); main.querySelector('#rcCount').textContent=selected.size; };
  main.querySelector('#rcSearch').oninput=e=>renderRows(e.target.value.trim());
  const rcCat = main.querySelector('#rcCat');
  const rcItem = main.querySelector('#rcItem');
  if(rcCat){
    const itemsOf = ()=> (dict.find(d=>d.name===rcCat.value)||{items:[]}).items;
    rcItem.innerHTML = itemsOf().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    rcCat.onchange=()=>{ rcItem.innerHTML = itemsOf().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(''); };
  }
  main.querySelector('#btnRcSubmit').onclick=async()=>{
    if(!selected.size){ toast('请先勾选学生', true); return; }
    const item = isBonus ? main.querySelector('#rcItem').value : rcItem.value;
    const score = parseInt(main.querySelector('#rcScore').value)||0;
    if(score<=0){ toast('分值必须为正数', true); return; }
    const reason = main.querySelector('#rcReason').value.trim();
    const date = main.querySelector('#rcDate').value || todayStr();
    const cat = isBonus ? '加分' : rcCat.value;
    isWriting=true; dirty=true;
    try{
      S.records = S.records || [];
      for(const uid of selected){
        const u=(S.users||[]).find(x=>x.id===uid);
        S.records.push({id:Date.now()+Math.floor(Math.random()*999), user_id:uid, user_name:u?u.real_name:'#'+uid, category:cat, subject_or_item:item, score:cat==='加分'?score:-score, reason, record_date:date, created_at:new Date().toISOString(), revoked:false});
      }
      await save(isBonus?'录入加分':'录入扣分', selected.size+'人');
      toast(`已为 ${selected.size} 名学生录入${isBonus?'加分':'扣分'} ✓`);
      renderAll();
    }catch(e){ toast('提交失败：'+e.message, true); }
    finally{ isWriting=false; dirty=false; }
  };
}

// ============================================================
// 扣分记录
// ============================================================
function renderRecords(main){
  if(!canViewRecords()){ main.innerHTML='<div class="empty">无查看扣分记录权限</div>'; return; }
  let cat='', kw='', page=1, size=20;
  const draw=()=>{
    let rs=allRecords().slice().sort((a,b)=>b.record_date.localeCompare(a.record_date));
    if(cat) rs=rs.filter(r=>r.category===cat);
    if(kw) rs=rs.filter(r=>r.user_name.includes(kw)||r.subject_or_item.includes(kw)||(r.reason||'').includes(kw));
    const total=rs.length;
    const rows=rs.slice((page-1)*size, page*size);
    main.innerHTML = `
    <div class="page-head"><div><div class="page-title">扣分记录</div><div class="page-sub">全部记录 · 实时同步</div></div>
      <button class="btn mini" id="btnExp">导出 CSV</button></div>
    <div class="toolbar">
      <select id="flCat"><option value="">全部类别</option>${ALL_CATS.map(c=>`<option value="${esc(c)}" ${c===cat?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <input id="flKw" placeholder="搜索姓名/项目/原因" value="${esc(kw)}" style="width:200px">
      <button class="btn mini" id="flGo">查询</button>
      <span class="hint">共 ${total} 条</span>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>学生</th><th>类别</th><th>项目</th><th>分值</th><th>原因</th><th>记录人</th><th>操作</th></tr></thead>
      <tbody>${rows.length? rows.map(r=>`
        <tr><td>${fmtDate(r.record_date)}</td><td>${esc(r.user_name)}</td>
        <td><span class="tag ${r.category==='加分'?'green':'blue'}">${esc(r.category)}</span></td>
        <td>${esc(r.subject_or_item)}</td>
        <td style="color:${r.score>0?'var(--green)':'var(--red)'};font-weight:600">${r.score>0?'+':''}${r.score}</td>
        <td>${esc(r.reason||'')}</td><td>${esc(r.created_by||'')}</td>
        <td><button class="btn mini danger" data-revoke="${r.id}">撤销</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">暂无记录</div></td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button class="btn mini ghost" id="pgPrev" ${page<=1?'disabled':''}>上一页</button>
      <span>${page}</span>
      <button class="btn mini ghost" id="pgNext" ${page*size>=total?'disabled':''}>下一页</button>
    </div></div>`;
    main.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{
      const id=+b.dataset.revoke;
      const y=await askConfirm('确认撤销这条记录？');
      if(!y) return;
      const r=(S.records||[]).find(x=>x.id===id);
      if(r){ r.revoked=true; await save('撤销记录', r.id); toast('已撤销 ✓'); draw(); renderAll(); }
    });
    main.querySelector('#flCat').onchange=e=>{ cat=e.target.value; page=1; draw(); };
    main.querySelector('#flGo').onclick=()=>{ kw=main.querySelector('#flKw').value.trim(); page=1; draw(); };
    main.querySelector('#flKw').addEventListener('keydown',e=>{ if(e.key==='Enter'){ kw=main.querySelector('#flKw').value.trim(); page=1; draw(); }});
    main.querySelector('#pgPrev').onclick=()=>{ if(page>1){page--; draw();} };
    main.querySelector('#pgNext').onclick=()=>{ if(page*size<total){page++; draw();} };
    main.querySelector('#btnExp').onclick=()=>{
      const lines=[['日期','学生','类别','项目','分值','原因'].join(',')];
      rs.forEach(r=>lines.push([csvSafe(fmtDate(r.record_date)),csvSafe(r.user_name),csvSafe(r.category),csvSafe(r.subject_or_item),r.score,csvSafe(r.reason||'')].join(',')));
      const blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='扣分记录_'+todayStr()+'.csv'; a.click();
    };
  };
  draw();
}

// ============================================================
// 个人统计
// ============================================================
function renderPersonal(main){
  const rs = recordsOf(me.id).slice().sort((a,b)=>b.record_date.localeCompare(a.record_date));
  const totalD=rs.filter(r=>r.score<0).reduce((a,r)=>a+r.score,0);
  const totalB=rs.filter(r=>r.score>0).reduce((a,r)=>a+r.score,0);
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">个人统计</div><div class="page-sub">${esc(me.real_name)} · ${roleText(me.role)}</div></div></div>
  <div class="stats">
    <div class="stat"><div class="lbl">我的累计扣分</div><div class="val red">${totalD}</div></div>
    <div class="stat"><div class="lbl">我的累计加分</div><div class="val green">+${totalB}</div></div>
    <div class="stat"><div class="lbl">我的净分</div><div class="val ${totalD+totalB<0?'red':'green'}">${totalD+totalB}</div></div>
    <div class="stat"><div class="lbl">记录数</div><div class="val blue">${rs.length}</div></div>
  </div>
  <div class="card" style="padding:0"><div class="table-wrap"><table>
    <thead><tr><th>日期</th><th>类别</th><th>项目</th><th>分值</th><th>原因</th></tr></thead>
    <tbody>${rs.length? rs.map(r=>`<tr><td>${fmtDate(r.record_date)}</td><td><span class="tag ${r.category==='加分'?'green':'blue'}">${esc(r.category)}</span></td><td>${esc(r.subject_or_item)}</td><td style="color:${r.score>0?'var(--green)':'var(--red)'}">${r.score>0?'+':''}${r.score}</td><td>${esc(r.reason||'')}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty">暂无个人记录</div></td></tr>'}</tbody>
  </table></div></div>`;
}

// ============================================================
// 用户管理
// ============================================================
function renderUsers(main){
  if(!canManageUsers()){ main.innerHTML='<div class="empty">无权限</div>'; return; }
  const students=studentsList();
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">用户管理</div><div class="page-sub">创建账号 · 分配权限 · 重置密码</div></div>
    <button class="btn" id="btnAddUser">+ 新建学生</button></div>
  <div class="card" style="padding:0"><div class="table-wrap"><table>
    <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>录入权限</th><th>操作</th></tr></thead>
    <tbody>
      ${(S.users||[]).map(u=>{
        const p=u.permissions||[];
        return `<tr><td>${esc(u.username)}</td><td>${esc(u.real_name)}</td>
        <td><span class="tag ${u.role==='admin'?'red':u.role==='teacher'?'yellow':u.role==='viewer'?'blue':'green'}">${roleText(u.role)}</span></td>
        <td style="font-size:12px">${u.role==='student' ? (p.length? p.join('、') : '<span class="hint">无</span>') : '全部'}</td>
        <td>${u.role==='student'? `<button class="btn mini" data-perm="${u.id}">权限</button> <button class="btn mini ghost" data-reset="${u.id}">重置密码</button> <button class="btn mini danger" data-del="${u.id}">删除</button>` : ''}</td></tr>`;
      }).join('')}
    </tbody>
  </table></div></div>`;
  main.querySelector('#btnAddUser').onclick=()=>openUserDialog(null, students, main);
  main.querySelectorAll('[data-perm]').forEach(b=>b.onclick=()=>openPermDialog(+b.dataset.perm, main));
  main.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{
    const u=(S.users||[]).find(x=>x.id===+b.dataset.reset);
    const auth=await requirePass();
    if(!auth) return;
    const y=await askConfirm(`将「${u.real_name}」的密码重置为 123456？`);
    if(!y) return;
    u.pass = await makePwdRecord('123456');
    u.must_change = u.role==='student';
    await save('重置密码', u.username); toast('已重置为初始密码 ✓'); renderUsers(main);
  });
  main.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    const u=(S.users||[]).find(x=>x.id===+b.dataset.del);
    const auth=await requirePass();
    if(!auth) return;
    const y=await askConfirm(`删除学生「${u.real_name}」？其记录将保留。`);
    if(!y) return;
    S.users = S.users.filter(x=>x.id!==u.id);
    await save('删除用户', u.username); toast('已删除'); renderUsers(main);
  });
}
function openUserDialog(existing, students, main){
  const d=document.createElement('div'); d.className='mask'; d.id='userDlg';
  d.innerHTML=`<div class="dialog"><h3>${existing?'编辑学生':'新建学生'}</h3>
    <div class="fld"><label>姓名</label><input id="udName" value="${existing?esc(existing.real_name):''}"></div>
    <div class="fld"><label>学号（登录账号为 stu+学号）</label><input id="udNo" value="${existing?esc(existing.username.replace('stu','')):''}" ${existing?'disabled':''}></div>
    <div class="dlg-btns"><button class="btn ghost" id="udCancel">取消</button><button class="btn" id="udOk">保存</button></div></div>`;
  document.body.appendChild(d);
  const close=()=>d.remove();
  d.querySelector('#udCancel').onclick=close;
  d.querySelector('#udOk').onclick=async()=>{
    const name=d.querySelector('#udName').value.trim();
    const no=d.querySelector('#udNo').value.trim();
    if(!name||!no){ toast('请填写姓名和学号', true); return; }
    const uname='stu'+no;
    if(existing){
      const auth=await requirePass(); if(!auth) return;
      existing.real_name=name;
    }else{
      if((S.users||[]).some(u=>u.username===uname)){ toast('该学号已存在', true); return; }
      const auth=await requirePass(); if(!auth) return;
      const maxId=Math.max(0, ...(S.users||[]).map(u=>u.id));
      S.users.push({id:maxId+1, username:uname, pass:await makePwdRecord('123456'), real_name:name, role:'student', class_id:1, must_change:true, gender:null, permissions:[]});
    }
    await save(existing?'编辑学生':'新建学生', uname); toast('已保存 ✓'); close(); renderUsers(main);
  };
}
function openPermDialog(uid, main){
  const u=(S.users||[]).find(x=>x.id===uid);
  const cur=new Set(u.permissions||[]);
  const opts=['学习','寝室','日常','两操','加分','查看班级','查看扣分记录'];
  const d=document.createElement('div'); d.className='mask'; d.id='permDlg';
  d.innerHTML=`<div class="dialog"><h3>分配权限 · ${esc(u.real_name)}</h3>
    <div class="perm-box" id="permBox">${opts.map(o=>`<span class="perm-pill ${cur.has(o)?'on':''}" data-o="${esc(o)}">${esc(o)}</span>`).join('')}</div>
    <div class="hint" style="margin-top:10px">「加分」是 1.1.0 新增的独立权限；勾选「查看班级」可看班级看板/小结/汇总；勾选「查看扣分记录」可看全量扣分明细。</div>
    <div class="dlg-btns"><button class="btn ghost" id="pdCancel">取消</button><button class="btn" id="pdOk">保存</button></div></div>`;
  document.body.appendChild(d);
  d.querySelectorAll('.perm-pill').forEach(p=>p.onclick=()=>{ const o=p.dataset.o; if(cur.has(o)) cur.delete(o); else cur.add(o); p.classList.toggle('on'); });
  const close=()=>d.remove();
  d.querySelector('#pdCancel').onclick=close;
  d.querySelector('#pdOk').onclick=async()=>{
    const auth=await requirePass(); if(!auth) return;
    u.permissions=[...cur];
    if(uid===me.id) me.permissions=u.permissions;
    await save('修改权限', u.username); toast('权限已保存 ✓'); close(); renderUsers(main);
  };
}

// ============================================================
// 意见反馈
// ============================================================
function renderFeedback(main){
  const admin=canManageFeedback();
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">意见反馈</div><div class="page-sub">对系统的建议、遇到的问题、希望增加的功能</div></div>
    <a href="https://github.com/tangyuan9325/class-deduction/issues" target="_blank" rel="noopener" style="color:var(--accent);font-size:13px;text-decoration:none">在 GitHub Issues 查看全部 →</a></div>
  <div class="card">
    <div class="fld"><label>意见建议</label><textarea id="fbContent" rows="4" style="width:100%;resize:vertical" placeholder="写下你的建议或遇到的问题…" maxlength="2000"></textarea></div>
    <div class="form-row"><div class="fld"><label>联系方式（选填）</label><input id="fbContact" placeholder="手机号 / 微信 / 邮箱"></div></div>
    <button class="btn" id="btnFbSubmit">提交反馈</button>
    <span class="hint" style="margin-left:10px">班主任可查看并处理；必要时可同步为 GitHub Issue</span>
  </div>
  ${admin? `<div class="card"><div class="card-title">反馈处理（老师可见）</div>
    <div class="table-wrap"><table>
      <thead><tr><th>提交人</th><th>内容</th><th>联系方式</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
      <tbody>${(S.feedback||[]).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(f=>`
        <tr><td>${esc(f.user_name)}</td><td style="max-width:260px">${esc(f.content)}</td><td>${esc(f.contact||'')}</td>
        <td><span class="tag ${f.status==='resolved'?'green':f.status==='processing'?'yellow':'red'}">${f.status==='open'?'待处理':f.status==='processing'?'处理中':'已处理'}</span></td>
        <td>${fmtDate(f.created_at)}</td>
        <td><button class="btn mini warn" data-fb="${f.id}" data-st="processing">处理中</button>
        <button class="btn mini success" data-fb="${f.id}" data-st="resolved">已处理</button></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">暂无反馈</div></td></tr>'}
      </tbody></table></div></div>` : ''}`;
  main.querySelector('#btnFbSubmit').onclick=async()=>{
    const content=main.querySelector('#fbContent').value.trim();
    if(!content){ toast('请输入反馈内容', true); return; }
    S.feedback=S.feedback||[];
    S.feedback.push({id:Date.now()+Math.floor(Math.random()*999), user_id:me.id, user_name:me.real_name||me.username, user_role:me.role, content, contact:main.querySelector('#fbContact').value.trim(), status:'open', github_issue_num:0, created_at:new Date().toISOString()});
    await save('提交反馈', me.username); toast('反馈提交成功，感谢你的建议！ ✓'); renderFeedback(main);
  };
  if(admin){
    main.querySelectorAll('[data-fb]').forEach(b=>b.onclick=async()=>{
      const f=(S.feedback||[]).find(x=>x.id===+b.dataset.fb);
      if(f){ f.status=b.dataset.st; await save('处理反馈', f.id); toast('状态已更新 ✓'); renderFeedback(main); }
    });
  }
}

// ============================================================
// 关于与克隆
// ============================================================
function renderAbout(main){
  const cloneCmd=`git clone https://github.com/${SYNC.owner}/${SYNC.repo}.git`;
  main.innerHTML = `
  <div class="page-head"><div><div class="page-title">关于与克隆</div><div class="page-sub">系统源码托管在 GitHub，可克隆到本地自行部署</div></div></div>
  <div class="card"><div class="card-title">克隆仓库</div>
    <div class="code-line"><code>${cloneCmd}</code><button class="btn mini" id="btnCopy">复制命令</button></div>
    <div class="hint">克隆后进入目录：<code style="color:var(--accent)">go build -o class-deduction ./cmd &amp;&amp; ./class-deduction</code>，浏览器访问 <code style="color:var(--accent)">http://localhost:8080</code></div>
  </div>
  <div class="card"><div class="card-title">v1.2.0 更新日志</div>
    <ul class="notes">${(S.meta.changelog||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
  </div>
  <div class="card"><div class="card-title">关于数据存储</div>
    <div class="hint" style="line-height:1.9">本在线版采用「GitHub 仓库即数据库」方案：所有数据保存在本仓库 <code>docs/data/db.json</code>，通过 GitHub API + Token 读写实现跨设备持久化；多端 8s/30s 自适应轮询（ETag 优化配额）实现实时同步。源码中的 Go 后端（Gin+GORM+SQLite）仍保留，供本机/自建服务器使用，功能完全一致。</div>
  </div>`;
  main.querySelector('#btnCopy').onclick=async()=>{
    try{ await navigator.clipboard.writeText(cloneCmd); toast('克隆命令已复制 ✓'); }catch(e){ toast('复制失败，请手动选择复制', true); }
  };
}

// ============================================================
// 修改密码弹窗
// ============================================================
function openChangePass(force){
  const d=document.createElement('div'); d.className='mask'; d.id='cpDlg';
  d.innerHTML=`<div class="dialog"><h3>${force?'首次登录请修改密码':'修改密码'}</h3>
    <div class="fld"><label>当前密码</label><input id="cpOld" type="password"></div>
    <div class="fld"><label>新密码</label><input id="cpNew" type="password"></div>
    <div class="fld"><label>确认新密码</label><input id="cpNew2" type="password"></div>
    <div class="dlg-btns"><button class="btn ghost" id="cpCancel">${force?'取消（暂不修改）':'取消'}</button><button class="btn" id="cpOk">保存</button></div></div>`;
  document.body.appendChild(d);
  const close=()=>d.remove();
  d.querySelector('#cpCancel').onclick=close;
  d.querySelector('#cpOk').onclick=async()=>{
    const u=(S.users||[]).find(x=>x.id===me.id);
    const v=await verifyPwd(d.querySelector('#cpOld').value, u.pass);
    if(!v.ok){ toast('当前密码错误', true); return; }
    const n1=d.querySelector('#cpNew').value, n2=d.querySelector('#cpNew2').value;
    if(n1.length<6){ toast('新密码至少 6 位', true); return; }
    if(n1!==n2){ toast('两次输入不一致', true); return; }
    u.pass=await makePwdRecord(n1);
    u.must_change=false;
    await save('修改密码', me.username); toast('密码已修改 ✓'); close();
  };
}

// ============================================================
// 启动
// ============================================================
(async function boot(){
  bindEvents();
  let ok=false;
  try{ const {state}=await getStateAPI(); applyState(state); ok=true; }catch(e){}
  if(!ok){ try{ const st=await fetchRawState(); if(st && st.version){ applyState(st); ok=true; } }catch(e){} }
  if(!ok){ // 首次无数据：用内置种子
    const seedRes=await fetch('data/db.json',{cache:'no-store'}).catch(()=>null);
    if(seedRes && seedRes.ok){ const st=await seedRes.json(); applyState(st); ok=true; }
  }
  if(!ok){
    applyState({version:DB_VERSION, meta:{version:APP_VERSION, semester_start:'2026-09-01', changelog:[]}, users:[], records:[], feedback:[], audit:[], seen_changelog:{}, updated_at:new Date().toISOString()});
  }
  restoreSession();
  startPolling();
})();
