function roleOptions(){
  const set=new Set(['조끼','음료수','영상','경기리뷰/골어시 기록','경기리뷰/골어시 기록 & 사진','사진','인스타 관리','회장/일정공지/투표','총무','주장','부주장']);
  Object.values(db.roles||{}).forEach(r=>{if(r.role&& !['-','휴식','(교대)'].includes(r.role))set.add(r.role)}); return [...set];
}
function renderRoles(){
  if(!db.roles)db.roles=JSON.parse(JSON.stringify(roleDefaults));
  roleRows.innerHTML=members.map(name=>{const r=db.roles[name]||{role:'',star:false,note:''};return `<tr><td>${name}</td><td><input type="checkbox" ${r.star?'checked':''} onchange="setRole('${esc(name)}','star',this.checked)"></td><td><input type="text" value="${(r.role||'').replaceAll('&','&amp;').replaceAll('"','&quot;')}" onchange="setRole('${esc(name)}','role',this.value)"></td><td><input type="text" value="${(r.note||'').replaceAll('&','&amp;').replaceAll('"','&quot;')}" onchange="setRole('${esc(name)}','note',this.value)"></td></tr>`}).join('');
  if(document.getElementById('roleFilter')) roleFilter.innerHTML='<option value="">조끼+음료수 전체</option>'+performanceRoles.map(x=>`<option>${x}</option>`).join('');
  if(document.getElementById('personFilter')) personFilter.innerHTML='<option value="">전체 사람</option>'+members.map(x=>`<option>${x}</option>`).join('');
  renderRoleCheck();
}
function setRole(name,key,val){if(!db.roles[name])db.roles[name]={role:'',star:false,note:''};db.roles[name][key]=val;persist();renderRoles();renderRoleLogs()}
function assignedForRole(role){return Object.entries(db.roles||{}).filter(([n,r])=>r.role===role).map(([name,r])=>({name,star:!!r.star,note:r.note||''}))}
function roleLogFor(date,role,member){return (db.roleLogs||[]).find(x=>x.date===date&&x.role===role&&x.member===member)}
let roleMatrixView='single';
function setRoleMatrixView(v){roleMatrixView=v;document.getElementById('roleViewSingle')?.classList.toggle('active',v==='single');document.getElementById('roleViewAll')?.classList.toggle('active',v==='all');if(document.getElementById('roleMatrixRole'))roleMatrixRole.style.display=v==='single'?'inline-block':'none';renderRoleMatrix()}
function matrixDates(ym){
  const [y,m]=ym.split('-').map(Number), out=new Set();
  const last=new Date(y,m,0).getDate();
  for(let d=1;d<=last;d++){const dt=new Date(y,m-1,d);if(dt.getDay()===1||dt.getDay()===4)out.add(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`)}
  (db.sessions||[]).filter(x=>x.date.startsWith(ym)).forEach(x=>out.add(x.date));
  (db.roleLogs||[]).filter(x=>x.date.startsWith(ym)).forEach(x=>out.add(x.date));
  return [...out].sort();
}
function shortDate(ds){const d=new Date(ds+'T00:00:00');const wd=['일','월','화','수','목','금','토'][d.getDay()];return `${d.getMonth()+1}/${d.getDate()}<br><span class="muted">${wd}</span>`}
function roleMatrixPeople(role){return assignedForRole(role).map(p=>p.name)}
function matrixCellHtml(date,role,member){const eff=effectiveDayInfo(date);if(eff.status==='cancel')return `<td class="matrix-cell" style="background:#eee;color:#888;cursor:not-allowed" title="${eff.label}">훈련없음</td>`;const log=roleLogFor(date,role,member);const cls=log?(log.done?'donecell':'todocell'):'';const val=log?(log.done?'✓':'✕'):'';return `<td class="matrix-cell ${cls}" title="클릭: 완료/미완료/해제" onclick="cycleRoleCell('${date}','${esc(role)}','${esc(member)}')">${val}</td>`}
function cycleRoleCell(date,role,member){
  if(isNoTraining(date))return;
  if(!db.roleLogs)db.roleLogs=[];const i=db.roleLogs.findIndex(x=>x.date===date&&x.role===role&&x.member===member);
  if(i<0)db.roleLogs.push({id:Date.now()+Math.random(),date,role,member,done:true,memo:''});
  else if(db.roleLogs[i].done===true)db.roleLogs[i].done=false;
  else db.roleLogs.splice(i,1);
  db.roleLogs.sort((a,b)=>b.date.localeCompare(a.date));persist();renderRoleMatrix();renderRoleLogs();
}
function renderRoleMatrix(){
  const monthEl=document.getElementById('roleMatrixMonth'), wrap=document.getElementById('roleMatrixWrap');if(!monthEl||!wrap)return;
  const ym=monthEl.value||today().slice(0,7);monthEl.value=ym;const dates=matrixDates(ym);const roles=performanceRoles.filter(r=>assignedForRole(r).length);
  if(document.getElementById('roleMatrixRole')){
    const prev=roleMatrixRole.value;roleMatrixRole.innerHTML=roles.map(r=>`<option value="${r.replaceAll('&','&amp;').replaceAll('"','&quot;')}">${r}</option>`).join('');
    if(roles.includes(prev))roleMatrixRole.value=prev;
  }
  const headDates=dates.map(d=>{const eff=effectiveDayInfo(d);return `<th class="${eff.status==='cancel'?'todocell':''}">${shortDate(d)}${eff.status==='cancel'?`<br><span class="muted">${eff.label}</span>`:''}</th>`}).join('');
  let body='';
  if(roleMatrixView==='single'){
    const role=roleMatrixRole?.value||roles[0]||'';const people=roleMatrixPeople(role);
    body=people.map(member=>{const r=db.roles[member]||{};const logs=dates.filter(d=>!isNoTraining(d)).map(d=>roleLogFor(d,role,member));const done=logs.filter(x=>x?.done===true).length,todo=logs.filter(x=>x?.done===false).length;return `<tr><td class="sticky1">${r.star?'<span class="star">★</span> ':''}<b>${member}</b></td>${dates.map(d=>matrixCellHtml(d,role,member)).join('')}<td class="totalcol done">${done}</td><td class="totalcol todo">${todo}</td></tr>`}).join('');
    wrap.innerHTML=`<table class="matrix"><thead><tr><th class="sticky1">${role||'역할'}</th>${headDates}<th>완료</th><th>미완료</th></tr></thead><tbody>${body||'<tr><td class="muted">담당자가 없습니다.</td></tr>'}</tbody></table>`;
    roleMatrixInfo.textContent=`${ym} · ${role||'역할 없음'} · 담당 ${people.length}명 · 날짜 ${dates.length}개`;
  }else{
    const rows=[];roles.forEach(role=>assignedForRole(role).forEach(p=>rows.push({role,member:p.name,star:p.star})));
    body=rows.map(row=>{const logs=dates.filter(d=>!isNoTraining(d)).map(d=>roleLogFor(d,row.role,row.member));const done=logs.filter(x=>x?.done===true).length,todo=logs.filter(x=>x?.done===false).length;return `<tr><td class="sticky1"><b>${row.role}</b></td><td class="sticky2">${row.star?'<span class="star">★</span> ':''}${row.member}</td>${dates.map(d=>matrixCellHtml(d,row.role,row.member)).join('')}<td class="totalcol done">${done}</td><td class="totalcol todo">${todo}</td></tr>`}).join('');
    wrap.innerHTML=`<table class="matrix"><thead><tr><th class="sticky1">역할</th><th class="sticky2">담당자</th>${headDates}<th>완료</th><th>미완료</th></tr></thead><tbody>${body}</tbody></table>`;
    roleMatrixInfo.textContent=`${ym} · 전체 역할 ${roles.length}개 · 배정 ${rows.length}건 · 날짜 ${dates.length}개`;
  }
  renderRoleSummaryMonth();
}
function renderRoleSummaryMonth(){
  const box=document.getElementById('roleSummary');if(!box)return;const ym=document.getElementById('roleMatrixMonth')?.value||today().slice(0,7);const monthly=(db.roleLogs||[]).filter(x=>x.date.startsWith(ym)&&!isNoTraining(x.date));
  box.innerHTML=performanceRoles.filter(r=>assignedForRole(r).length).map(role=>{const done=monthly.filter(x=>x.role===role&&x.done).length,todo=monthly.filter(x=>x.role===role&&!x.done).length;return `<div class="role-card"><b>${role}</b><div style="margin-top:6px"><span class="pill">완료 ${done}</span> <span class="pill">미완료 ${todo}</span></div></div>`}).join('');
}
function deleteRoleLog(id){if(!confirm('이 역할 수행 기록을 삭제할까요?'))return;db.roleLogs=db.roleLogs.filter(x=>String(x.id)!==String(id));persist();renderRoleMatrix();renderRoleLogs()}
function renderRoleLogs(){
 if(!db.roleLogs)db.roleLogs=[]; const rf=document.getElementById('roleFilter')?.value||'', pf=document.getElementById('personFilter')?.value||'';
 const rows=[...db.roleLogs].filter(x=>performanceRoles.includes(x.role)&&(!rf||x.role===rf)&&(!pf||x.member===pf)).sort((a,b)=>b.date.localeCompare(a.date)||a.role.localeCompare(b.role)).slice(0,300); roleLogRows.innerHTML=rows.length?rows.map(x=>`<tr><td>${x.date}</td><td>${x.role}</td><td>${x.member}</td><td class="${x.done?'done':'todo'}">${x.done?'완료':'미완료'}</td><td>${x.memo||''}</td><td><button onclick="deleteRoleLog('${x.id}')">삭제</button></td></tr>`).join(''):'<tr><td colspan="6" class="muted">조건에 맞는 역할 수행 기록이 없습니다.</td></tr>';
 renderRoleSummaryMonth();
}
function renderRoleCheck(){renderRoleMatrix()}
