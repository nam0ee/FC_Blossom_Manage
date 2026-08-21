function makeImportedDb(){
 return {dataVersion:DATA_VERSION,members:JSON.parse(JSON.stringify(defaultMembers)),sessions:JSON.parse(JSON.stringify(importedSessions)),memberStatus:JSON.parse(JSON.stringify(importedMemberStatus)),roles:JSON.parse(JSON.stringify(roleDefaults)),roleLogs:JSON.parse(JSON.stringify(importedRoleLogs)),hallOfFame:JSON.parse(JSON.stringify(hallDefaults)),legacyAttendanceTotals:JSON.parse(JSON.stringify(legacyAttendanceTotals)),winnerPeriods:JSON.parse(JSON.stringify(winnerPeriodDefaults)),winnerHistory:JSON.parse(JSON.stringify(winnerHistoryDefaults)),importedExcel:true};
}

function migrateDb(data){
  const fresh=makeImportedDb();
  if(!data) return fresh;
  if(data.dataVersion===DATA_VERSION){ if(!Array.isArray(data.members)) data.members=JSON.parse(JSON.stringify(defaultMembers)); return data; }
  // 2026-01-05~2026-08-13 구간은 이번에 복원한 엑셀 원본을 기준으로 교체하고,
  // 그 이후 웹에서 입력한 기록은 그대로 보존한다.
  const later=(data.sessions||[]).filter(s=>s.date>'2026-08-13');
  data.members=Array.isArray(data.members)?data.members:JSON.parse(JSON.stringify(defaultMembers));
  data.sessions=[...JSON.parse(JSON.stringify(importedSessions)),...later].sort((a,b)=>a.date.localeCompare(b.date));
  data.memberStatus={...JSON.parse(JSON.stringify(importedMemberStatus)),...(data.memberStatus||{})};
  fixedZeroFeeMembers.forEach(n=>{data.memberStatus[n]={type:'임원진'};});
  data.roles=data.roles||JSON.parse(JSON.stringify(roleDefaults));
  const oldLogs=data.roleLogs||[];
  const byId=new Map([...JSON.parse(JSON.stringify(importedRoleLogs)),...oldLogs].map(x=>[x.id||`${x.date}|${x.role}|${x.member}`,x]));
  data.roleLogs=[...byId.values()];
  data.hallOfFame=data.hallOfFame||JSON.parse(JSON.stringify(hallDefaults));
  data.legacyAttendanceTotals=JSON.parse(JSON.stringify(legacyAttendanceTotals));
  data.winnerPeriods=data.winnerPeriods||JSON.parse(JSON.stringify(winnerPeriodDefaults));
  data.winnerHistory=data.winnerHistory||JSON.parse(JSON.stringify(winnerHistoryDefaults));
  data.importedExcel=true;
  data.dataVersion=DATA_VERSION;
  return data;
}

const KEY='club_attendance_v7_2026_rules';
let db = migrateDb(JSON.parse(localStorage.getItem(KEY)||'null') || makeImportedDb());
localStorage.setItem(KEY,JSON.stringify(db));
if(!Array.isArray(db.members)) db.members=JSON.parse(JSON.stringify(defaultMembers));
let members=db.members;
if(!db.memberStatus) db.memberStatus={};
if(!db.roles) db.roles=JSON.parse(JSON.stringify(roleDefaults));
if(!db.roleLogs) db.roleLogs=[];
if(!db.hallOfFame) db.hallOfFame=JSON.parse(JSON.stringify(hallDefaults));
if(!db.legacyAttendanceTotals) db.legacyAttendanceTotals=JSON.parse(JSON.stringify(legacyAttendanceTotals));
if(!db.winnerPeriods) db.winnerPeriods=JSON.parse(JSON.stringify(winnerPeriodDefaults));
if(!db.winnerHistory) db.winnerHistory=JSON.parse(JSON.stringify(winnerHistoryDefaults));
let cloudReady = false;
const BACKUP_KEY=KEY+'_auto_backups';
function makeBackupSnapshot(){
  return {savedAt:new Date().toISOString(),data:JSON.stringify(db)};
}
function recordLocalBackup(){
  try{
    const arr=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]');
    arr.push(makeBackupSnapshot());
    while(arr.length>3)arr.shift();
    localStorage.setItem(BACKUP_KEY,JSON.stringify(arr));
  }catch(e){ console.warn('로컬 백업 저장 실패',e); }
}
let hasUnsavedChanges=false;
function persist(){
  hasUnsavedChanges=true;
  setSyncState('⚠ 저장되지 않은 변경사항 있음');
}
function saveAllChanges(){
  recordLocalBackup();
  localStorage.setItem(KEY,JSON.stringify(db));
  const stamp=()=>new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  setSyncState('저장 중...');
  if(window.google && google.script && google.script.run){
    google.script.run
      .withSuccessHandler(()=>{ cloudReady=true; hasUnsavedChanges=false; setSyncState('✅ 저장 완료 '+stamp()); })
      .withFailureHandler(err=>{ hasUnsavedChanges=false; setSyncState('⚠ 클라우드 저장 실패 · 이 브라우저에는 저장됨 '+stamp()); alert('클라우드 저장에 실패했습니다. 인터넷 연결을 확인해주세요.'); })
      .saveDatabase(JSON.stringify(db));
  }else{
    hasUnsavedChanges=false;
    setSyncState('✅ 이 브라우저에 저장 완료 '+stamp());
  }
}

window.addEventListener('beforeunload',e=>{if(hasUnsavedChanges){e.preventDefault();e.returnValue='';}});

function setSyncState(msg){
  const el=document.getElementById('syncState'); if(el) el.textContent=msg;
}
function loadCloud(){
  if(!(window.google && google.script && google.script.run)){ setSyncState('로컬 모드'); return; }
  setSyncState('클라우드 불러오는 중...');
  google.script.run
    .withSuccessHandler(raw=>{
      try{
        if(raw){ const remote=JSON.parse(raw); if(Array.isArray(remote.sessions)){ if((remote.sessions||[]).length===0 && !remote.importedExcel){ db=makeImportedDb(); members=db.members||defaultMembers; persist(); } else { db=migrateDb(remote); members=db.members||defaultMembers; localStorage.setItem(KEY,JSON.stringify(db)); } if(!db.memberStatus) db.memberStatus={}; if(!db.roles) db.roles=JSON.parse(JSON.stringify(roleDefaults)); if(!db.roleLogs) db.roleLogs=[];
if(!db.hallOfFame) db.hallOfFame=JSON.parse(JSON.stringify(hallDefaults));
if(!db.legacyAttendanceTotals) db.legacyAttendanceTotals=JSON.parse(JSON.stringify(legacyAttendanceTotals)); if(!db.winnerPeriods) db.winnerPeriods=JSON.parse(JSON.stringify(winnerPeriodDefaults)); if(!db.winnerHistory) db.winnerHistory=JSON.parse(JSON.stringify(winnerHistoryDefaults)); localStorage.setItem(KEY,JSON.stringify(db)); } }
        cloudReady=true; setSyncState('클라우드 연결됨'); renderAll();
      }catch(e){ setSyncState('데이터 읽기 오류'); renderAll(); }
    })
    .withFailureHandler(err=>{ setSyncState('클라우드 연결 실패 - 로컬 모드'); renderAll(); })
    .getDatabase();
}
function renderAll(){ renderMemberStatus(); renderRoles(); renderRoleLogs(); renderAttendanceMatrix(); renderCalendar(); renderSessions(); renderWinnerPeriods(); renderWinnerHistory(); renderWinner(); renderFees(); renderHallOfFame(); renderLegacyAttendance(); }

function renderLegacyAttendance(){
 const el=document.getElementById('legacyAttendanceSummary'); if(!el)return;
 const data=db.legacyAttendanceTotals||legacyAttendanceTotals;
 el.innerHTML=members.filter(n=>(data[n]||0)>0).sort((a,b)=>(data[b]||0)-(data[a]||0)).map(n=>`<div class="role-card"><b>${n}</b><div style="margin-top:5px"><span class="pill">누적 ${data[n]||0}회</span></div></div>`).join('');
}

const koreaHolidays2026={
  '2026-01-01':'신정',
  '2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴',
  '2026-03-01':'삼일절','2026-03-02':'삼일절 대체공휴일',
  '2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'부처님오신날 대체공휴일',
  '2026-06-03':'전국동시지방선거','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-08-17':'광복절 대체공휴일',
  '2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴',
  '2026-10-03':'개천절','2026-10-05':'개천절 대체공휴일','2026-10-09':'한글날',
  '2026-12-25':'성탄절'
};
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function familyDayForMonth(y,m){
  const d=new Date(y,m-1,21), dow=d.getDay();
  let diff;
  if(dow===6) diff=-1; else if(dow===0) diff=-2; else diff=5-dow;
  d.setDate(d.getDate()+diff);return isoLocal(d);
}
function familyEveForMonth(y,m){const f=new Date(familyDayForMonth(y,m)+'T00:00:00');f.setDate(f.getDate()-1);return isoLocal(f)}
function autoDayInfo(date){
  const holiday=koreaHolidays2026[date];
  const [y,m]=date.split('-').map(Number);
  const famEve=familyEveForMonth(y,m);
  if(holiday)return {type:'holiday',label:holiday,noTraining:true};
  if(date===famEve)return {type:'family',label:'패밀리데이',noTraining:true,familyDay:familyDayForMonth(y,m)};
  return null;
}
function effectiveDayInfo(date){
  const s=attendanceSession(date), auto=autoDayInfo(date);
  if(s?.status==='train')return {status:'train',label:s.instructor?'강사 훈련':'훈련',session:s,auto};
  if(s?.status==='cancel')return {status:'cancel',label:s.memo||auto?.label||'훈련 취소',session:s,auto};
  if(auto?.noTraining)return {status:'cancel',label:auto.label,session:null,auto};
  return {status:'open',label:'',session:null,auto:null};
}
function isNoTraining(date){return effectiveDayInfo(date).status==='cancel'}
function today(){const d=new Date();return d.toISOString().slice(0,10)}
let calendarCursor=new Date();
function init(){
  sessionDate.value=today(); if(document.getElementById('sessionInstructor'))sessionInstructor.checked=false; if(document.getElementById('attendanceMatrixMonth')) attendanceMatrixMonth.value=today().slice(0,7); if(document.getElementById('roleMatrixMonth')) roleMatrixMonth.value=today().slice(0,7);
  const y=new Date().getFullYear(); feePeriod.innerHTML=[1,3,5,7,9,11].map(m=>`<option value="${y}-${String(m).padStart(2,'0')}">${y}년 ${m}~${m+1}월</option>`).join('');
  const nowM=new Date().getMonth()+1; const start=nowM%2===0?nowM-1:nowM; feePeriod.value=`${y}-${String(start).padStart(2,'0')}`;
  renderAll();
  loadCloud();
}

function showMainPane(id,btn){document.querySelectorAll('.main-pane').forEach(x=>x.classList.remove('active'));document.querySelectorAll('#mainNav button').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');btn.classList.add('active');if(id==='attendancePane')renderAttendanceMatrix();if(id==='rolePane')renderRoleMatrix();if(id==='winnerFeePane'){renderWinner();renderFees();}if(id==='hofPane')renderHallOfFame();}
function showTab(id,btn){const set=btn.closest('.tabset');set.querySelectorAll('.tabpane').forEach(x=>x.classList.remove('active'));set.querySelectorAll('.tabbtn').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');btn.classList.add('active');if(id==='calendarTab')renderCalendar();if(id==='inputTab')renderAttendanceMatrix();if(id==='roleLogTab')renderRoleMatrix();}
function moveCalendar(delta){calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+delta,1);renderCalendar();}
function moveRoleMonth(delta){
  const el=document.getElementById('roleMatrixMonth'); if(!el)return;
  const base=el.value?new Date(el.value+'-01T00:00:00'):new Date();
  base.setMonth(base.getMonth()+delta); el.value=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`; renderRoleMatrix();
}
function moveWinnerPeriod(delta){
  const el=document.getElementById('winnerPeriodSelect'); if(!el||!el.options.length)return;
  const idx=Math.max(0,Math.min(el.options.length-1,el.selectedIndex+delta)); el.selectedIndex=idx; renderWinner();
}
function moveFeePeriod(delta){
  const el=document.getElementById('feePeriod'); if(!el||!el.options.length)return;
  const idx=Math.max(0,Math.min(el.options.length-1,el.selectedIndex+delta)); el.selectedIndex=idx; renderFees();
}
function renderCalendar(){
  const y=calendarCursor.getFullYear(), m=calendarCursor.getMonth(); calendarTitle.textContent=`${y}년 ${m+1}월`;
  const first=new Date(y,m,1).getDay(), last=new Date(y,m+1,0).getDate();
  const heads=['일','월','화','수','목','금','토'].map(d=>`<div class="dow">${d}</div>`).join(''); let cells='';
  for(let i=0;i<first;i++)cells+='<div class="day empty"></div>';
  for(let d=1;d<=last;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const s=attendanceSession(ds), eff=effectiveDayInfo(ds), auto=autoDayInfo(ds);
    const cls=eff.status==='train'?' train':eff.status==='cancel'?' cancel':''; const td=ds===today()?' today':'';
    let info='';
    if(eff.status==='train') info=`<div class="badge">${s?.instructor?'🎓 강사 ·':'훈련 ·'} ${s?.attendees?.length||0}명</div>`;
    else if(eff.status==='cancel') info=`<div class="badge">${auto?.type==='holiday'?'🇰🇷 ':auto?.type==='family'?'🏠 ':''}${eff.label}</div>`;
    cells+=`<div class="day${cls}${td}" onclick="openCalendarDate('${ds}')"><div class="daynum">${d}</div>${info}</div>`;
  }
  calendarGrid.innerHTML=heads+cells;
}
function openCalendarDate(ds){
  const s=attendanceSession(ds), auto=autoDayInfo(ds);
  sessionDate.value=ds;
  sessionStatus.value=s?.status||(auto?.noTraining?'cancel':'train');
  const rawMemo=s?.memo||'';
  sessionMemo.value=rawMemo==='2026 기존 출석 엑셀 재검증본'?'':(rawMemo||(auto?.label||''));
  if(document.getElementById('sessionInstructor')) sessionInstructor.checked=!!s?.instructor;
  const list=document.getElementById('calendarAttendeeList');
  if(list){
    const names=(s?.attendees||[]);
    list.innerHTML=names.length?names.map(n=>`<div class="role-card"><b>${baseName(n)}</b>${s?.instructor?'<div class="small" style="margin-top:4px">🎓 1.5점</div>':''}</div>`).join(''):'<div class="muted">출석자가 없습니다.</div>';
  }
  if(document.getElementById('attendanceMatrixMonth')) attendanceMatrixMonth.value=ds.slice(0,7);
  if(document.getElementById('calendarDateDialog')) calendarDateDialog.showModal();
}
function goAttendanceFromCalendar(){
  const ds=sessionDate.value; if(document.getElementById('calendarDateDialog')?.open) calendarDateDialog.close();
  if(document.getElementById('attendanceMatrixMonth')) attendanceMatrixMonth.value=ds.slice(0,7);
  showTab('inputTab',document.querySelector('#attendanceTabs .tabbtn')); renderAttendanceMatrix();
}
function renderMemberStatus(){
  memberStatusRows.innerHTML=members.map((name,i)=>{const st=db.memberStatus[name]||{};return `<tr><td><b>${name}</b></td><td><select onchange="setMemberStatus('${esc(name)}','type',this.value)"><option value="" ${!st.type?'selected':''}>일반</option><option value="임원진" ${st.type==='임원진'?'selected':''}>임원진</option><option value="출장(파견)" ${st.type==='출장(파견)'?'selected':''}>출장(파견)</option><option value="부상" ${st.type==='부상'?'selected':''}>부상</option><option value="기타" ${st.type==='기타'?'selected':''}>기타</option></select></td><td><button class="danger" onclick="removeMember('${esc(name)}')">삭제</button></td></tr>`}).join('');
}
function esc(s){return s.replaceAll('\\','\\\\').replaceAll("'","\\'")}
function addMember(){const input=document.getElementById('newMemberName');const name=(input?.value||'').trim();if(!name)return alert('회원 이름을 입력해주세요.');if(members.includes(name))return alert('이미 등록된 회원입니다.');members.push(name);db.members=members;db.memberStatus[name]={type:''};db.roles[name]={role:'',star:false,note:''};persist();input.value='';renderAll();alert(name+' 회원이 추가 대기 상태입니다. 회원 변경 저장을 눌러주세요.');}
function removeMember(name){if(fixedZeroFeeMembers.includes(name)){if(!confirm(name+' 님은 임원진 0원 고정 대상입니다. 회원 목록에서 삭제하시겠습니까? 과거 기록은 유지됩니다.'))return;}else if(!confirm(name+' 님을 현재 회원 목록에서 삭제할까요? 과거 출석/역할 기록은 유지됩니다.'))return;members=members.filter(x=>x!==name);db.members=members;persist();renderAll();}
function setMemberStatus(name,key,val){if(!db.memberStatus[name])db.memberStatus[name]={type:''};db.memberStatus[name].type=val||'';persist();renderFees();}
function zeroFeeStatus(name, periodStart, periodEnd){if(fixedZeroFeeMembers.includes(name))return '임원진(0원 고정)';const st=db.memberStatus[name];return st&&st.type?st.type:null;}
