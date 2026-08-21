function makeImportedDb(){
  return {
    dataVersion: DATA_VERSION,
    members: JSON.parse(JSON.stringify(defaultMembers)),
    sessions: JSON.parse(JSON.stringify(importedSessions)),
    memberStatus: JSON.parse(JSON.stringify(importedMemberStatus)),
    roles: JSON.parse(JSON.stringify(roleDefaults)),
    roleLogs: JSON.parse(JSON.stringify(importedRoleLogs)),
    hallOfFame: JSON.parse(JSON.stringify(hallDefaults)),
    legacyAttendanceTotals: JSON.parse(JSON.stringify(legacyAttendanceTotals)),
    winnerPeriods: JSON.parse(JSON.stringify(winnerPeriodDefaults)),
    winnerHistory: JSON.parse(JSON.stringify(winnerHistoryDefaults)),
    changeHistory: [],
    importedExcel: true
  };
}

function migrateDb(data){
  const fresh = makeImportedDb();

  if(!data) return fresh;

  if(data.dataVersion === DATA_VERSION){
    if(!Array.isArray(data.members)){
      data.members = JSON.parse(JSON.stringify(defaultMembers));
    }

    if(!Array.isArray(data.changeHistory)){
      data.changeHistory = [];
    }

    return data;
  }

  // 2026-01-05 ~ 2026-08-13은 복원한 원본 데이터 사용
  // 이후 웹에서 입력한 기록은 유지
  const later = (data.sessions || [])
    .filter(s => s.date > '2026-08-13');

  data.members = Array.isArray(data.members)
    ? data.members
    : JSON.parse(JSON.stringify(defaultMembers));

  data.sessions = [
    ...JSON.parse(JSON.stringify(importedSessions)),
    ...later
  ].sort((a,b) => a.date.localeCompare(b.date));

  data.memberStatus = {
    ...JSON.parse(JSON.stringify(importedMemberStatus)),
    ...(data.memberStatus || {})
  };

  fixedZeroFeeMembers.forEach(name => {
    data.memberStatus[name] = { type:'임원진' };
  });

  data.roles =
    data.roles ||
    JSON.parse(JSON.stringify(roleDefaults));

  const oldLogs = data.roleLogs || [];

  const byId = new Map(
    [
      ...JSON.parse(JSON.stringify(importedRoleLogs)),
      ...oldLogs
    ].map(x => [
      x.id || `${x.date}|${x.role}|${x.member}`,
      x
    ])
  );

  data.roleLogs = [...byId.values()];

  data.hallOfFame =
    data.hallOfFame ||
    JSON.parse(JSON.stringify(hallDefaults));

  data.legacyAttendanceTotals =
    JSON.parse(JSON.stringify(legacyAttendanceTotals));

  data.winnerPeriods =
    data.winnerPeriods ||
    JSON.parse(JSON.stringify(winnerPeriodDefaults));

  data.winnerHistory =
    data.winnerHistory ||
    JSON.parse(JSON.stringify(winnerHistoryDefaults));

  if(!Array.isArray(data.changeHistory)){
    data.changeHistory = [];
  }

  data.importedExcel = true;
  data.dataVersion = DATA_VERSION;

  return data;
}


/* =========================================================
   기본 DB
========================================================= */

const KEY = 'club_attendance_v7_2026_rules';

let db = migrateDb(
  JSON.parse(localStorage.getItem(KEY) || 'null') ||
  makeImportedDb()
);

if(!Array.isArray(db.members)){
  db.members =
    JSON.parse(JSON.stringify(defaultMembers));
}

let members = db.members;

if(!db.memberStatus) db.memberStatus = {};
if(!db.roles){
  db.roles =
    JSON.parse(JSON.stringify(roleDefaults));
}
if(!db.roleLogs) db.roleLogs = [];
if(!db.hallOfFame){
  db.hallOfFame =
    JSON.parse(JSON.stringify(hallDefaults));
}
if(!db.legacyAttendanceTotals){
  db.legacyAttendanceTotals =
    JSON.parse(JSON.stringify(legacyAttendanceTotals));
}
if(!db.winnerPeriods){
  db.winnerPeriods =
    JSON.parse(JSON.stringify(winnerPeriodDefaults));
}
if(!db.winnerHistory){
  db.winnerHistory =
    JSON.parse(JSON.stringify(winnerHistoryDefaults));
}
if(!Array.isArray(db.changeHistory)){
  db.changeHistory = [];
}


/* =========================================================
   Supabase 설정
========================================================= */

const SUPABASE_URL =
  'https://ycifmorjogyihcdhwvye.supabase.co';

/*
  ↓ 여기에 Supabase
  API Keys > Publishable key > default
  값을 넣으세요.

  service_role / Secret key는 절대 넣지 마세요.
*/
const SUPABASE_KEY = 'sb_publishable_cknai1l2sf54LHXQ-_56vA_zhnoJnIw';

const SUPABASE_TABLE = 'fc_blossom_data';
const SUPABASE_ROW_ID = 1;


async function supabaseLoadDatabase(){

  const url =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?id=eq.${SUPABASE_ROW_ID}` +
    `&select=data,updated_at`;

  const res = await fetch(url,{
    headers:{
      'apikey': SUPABASE_KEY,
      'Accept':'application/json'
    }
  });

  if(!res.ok){
    const text = await res.text();
    throw new Error(
      `Supabase load failed ${res.status}: ${text}`
    );
  }

  const rows = await res.json();

  return rows?.[0]?.data || null;
}


async function supabaseSaveDatabase(data){

  const url =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?id=eq.${SUPABASE_ROW_ID}`;

  const res = await fetch(url,{
    method:'PATCH',
    headers:{
      'apikey': SUPABASE_KEY,
      'Content-Type':'application/json',
      'Prefer':'return=minimal'
    },
    body:JSON.stringify({
      data,
      updated_at:new Date().toISOString()
    })
  });

  if(!res.ok){
    const text = await res.text();
    throw new Error(
      `Supabase save failed ${res.status}: ${text}`
    );
  }
}


/* =========================================================
   저장 / 백업 / 변경이력
========================================================= */

let cloudReady = false;

const BACKUP_KEY =
  KEY + '_auto_backups';

let lastSavedDb =
  JSON.parse(JSON.stringify(db));

let hasUnsavedChanges = false;


function makeBackupSnapshot(){
  return {
    savedAt:new Date().toISOString(),
    data:JSON.stringify(lastSavedDb)
  };
}


function recordLocalBackup(){

  try{

    const arr =
      JSON.parse(
        localStorage.getItem(BACKUP_KEY) || '[]'
      );

    arr.push(makeBackupSnapshot());

    while(arr.length > 3){
      arr.shift();
    }

    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify(arr)
    );

  }catch(e){
    console.warn(
      '로컬 백업 저장 실패',
      e
    );
  }
}


function persist(){

  hasUnsavedChanges = true;

  setSyncState(
    '⚠ 저장되지 않은 변경사항 있음'
  );
}


function getEditorName(){

  let name =
    localStorage.getItem(
      'fc_blossom_editor_name'
    ) || '';

  if(!name){

    name =
      (
        prompt(
          '수정자 이름을 입력해주세요.'
        ) || ''
      ).trim();

    if(name){
      localStorage.setItem(
        'fc_blossom_editor_name',
        name
      );
    }
  }

  return name || '이름없음';
}


function changeEditorName(){

  const oldName =
    localStorage.getItem(
      'fc_blossom_editor_name'
    ) || '';

  const name =
    prompt(
      '수정자 이름을 입력해주세요.',
      oldName
    );

  if(
    name !== null &&
    name.trim()
  ){

    localStorage.setItem(
      'fc_blossom_editor_name',
      name.trim()
    );

    alert(
      '수정자 이름이 ' +
      name.trim() +
      '(으)로 변경되었습니다.'
    );
  }
}


function summarizeChanges(oldDb,newDb){

  const changes = [];


  /* ---------- 출석 / 훈련 ---------- */

  const oldSessions =
    new Map(
      (oldDb.sessions || [])
      .map(x => [x.date,x])
    );

  const newSessions =
    new Map(
      (newDb.sessions || [])
      .map(x => [x.date,x])
    );

  const dates =
    new Set([
      ...oldSessions.keys(),
      ...newSessions.keys()
    ]);


  dates.forEach(date => {

    const oldS =
      oldSessions.get(date);

    const newS =
      newSessions.get(date);


    if(
      JSON.stringify(oldS) ===
      JSON.stringify(newS)
    ){
      return;
    }


    if(!oldS && newS){

      changes.push({
        category:'훈련일정',
        detail:`${date} 기록 추가`
      });

      /*
        새 기록을 만들면서 출석도 같이 들어온 경우
      */
      (newS.attendees || [])
        .forEach(name => {
          changes.push({
            category:'출석',
            detail:
              `${date} ${name} 출석 추가`
          });
        });

      return;
    }


    if(oldS && !newS){

      changes.push({
        category:'훈련일정',
        detail:`${date} 기본값(자동)으로 복귀`
      });

      (oldS.attendees || [])
        .forEach(name => {
          changes.push({
            category:'출석',
            detail:
              `${date} ${name} 출석 기록 삭제`
          });
        });

      return;
    }


    if(
      oldS?.status !==
      newS?.status
    ){

      changes.push({
        category:'훈련일정',
        detail:
          `${date} ` +
          `${oldS?.status || '-'} → ` +
          `${newS?.status || '-'}`
      });
    }


    if(
      !!oldS?.instructor !==
      !!newS?.instructor
    ){

      changes.push({
        category:'강사일',
        detail:
          `${date} ` +
          `${oldS?.instructor ? '강사일' : '일반'} → ` +
          `${newS?.instructor ? '강사일' : '일반'}`
      });
    }


    if(
      (oldS?.memo || '') !==
      (newS?.memo || '')
    ){

      changes.push({
        category:'훈련메모',
        detail:
          `${date} 메모 변경`
      });
    }


    const oldAtt =
      new Set(
        oldS?.attendees || []
      );

    const newAtt =
      new Set(
        newS?.attendees || []
      );


    [...newAtt]
      .filter(
        name => !oldAtt.has(name)
      )
      .forEach(name => {

        changes.push({
          category:'출석',
          detail:
            `${date} ${name} 출석 추가`
        });

      });


    [...oldAtt]
      .filter(
        name => !newAtt.has(name)
      )
      .forEach(name => {

        changes.push({
          category:'출석',
          detail:
            `${date} ${name} 출석 취소`
        });

      });

  });


  /* ---------- 회원상태 ---------- */

  const statusNames =
    new Set([
      ...Object.keys(
        oldDb.memberStatus || {}
      ),
      ...Object.keys(
        newDb.memberStatus || {}
      )
    ]);


  statusNames.forEach(name => {

    const before =
      oldDb.memberStatus?.[name]?.type ||
      '일반';

    const after =
      newDb.memberStatus?.[name]?.type ||
      '일반';


    if(before !== after){

      changes.push({
        category:'회원상태',
        detail:
          `${name} ${before} → ${after}`
      });

    }

  });


  /* ---------- 회원 추가/삭제 ---------- */

  const oldMembers =
    new Set(oldDb.members || []);

  const newMembers =
    new Set(newDb.members || []);


  [...newMembers]
    .filter(
      name => !oldMembers.has(name)
    )
    .forEach(name => {

      changes.push({
        category:'회원',
        detail:`${name} 회원 추가`
      });

    });


  [...oldMembers]
    .filter(
      name => !newMembers.has(name)
    )
    .forEach(name => {

      changes.push({
        category:'회원',
        detail:`${name} 회원 삭제`
      });

    });


  /* ---------- 역할 수행 ---------- */

  if(
    JSON.stringify(
      oldDb.roleLogs || []
    ) !==
    JSON.stringify(
      newDb.roleLogs || []
    )
  ){

    changes.push({
      category:'역할수행',
      detail:
        '조끼/음료수 수행기록 변경'
    });

  }


  /* ---------- 역할 배정 ---------- */

  if(
    JSON.stringify(
      oldDb.roles || {}
    ) !==
    JSON.stringify(
      newDb.roles || {}
    )
  ){

    changes.push({
      category:'역할배정',
      detail:'회원 역할 배정 변경'
    });

  }


  /* ---------- 출석왕 기간 ---------- */

  if(
    JSON.stringify(
      oldDb.winnerPeriods || []
    ) !==
    JSON.stringify(
      newDb.winnerPeriods || []
    )
  ){

    changes.push({
      category:'출석왕',
      detail:'출석왕 기간 설정 변경'
    });

  }


  /* ---------- 명예의전당 ---------- */

  if(
    JSON.stringify(
      oldDb.hallOfFame || {}
    ) !==
    JSON.stringify(
      newDb.hallOfFame || {}
    )
  ){

    changes.push({
      category:'명예의전당',
      detail:'명예의전당 기록 변경'
    });

  }


  return changes;
}


function addChangeHistory(changes){

  if(!changes.length) return;


  if(
    !Array.isArray(
      db.changeHistory
    )
  ){
    db.changeHistory = [];
  }


  const editor =
    getEditorName();

  const now =
    new Date().toISOString();


  changes.forEach(change => {

    db.changeHistory.unshift({

      id:
        (
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random()}`
        ),

      savedAt:now,

      editor,

      category:
        change.category,

      detail:
        change.detail

    });

  });


  /*
    변경이력은 최근 1000건 유지
  */
  if(
    db.changeHistory.length > 1000
  ){
    db.changeHistory =
      db.changeHistory.slice(0,1000);
  }
}


function renderChangeHistory(){

  const el =
    document.getElementById(
      'changeHistoryRows'
    );

  if(!el) return;


  const rows =
    db.changeHistory || [];


  if(!rows.length){

    el.innerHTML =
      '<tr>' +
      '<td colspan="4" class="muted">' +
      '아직 변경이력이 없습니다.' +
      '</td>' +
      '</tr>';

    return;
  }


  el.innerHTML =
    rows.map(x => {

      const d =
        new Date(x.savedAt);

      return `
        <tr>
          <td>
            ${d.toLocaleString('ko-KR')}
          </td>

          <td>
            <b>${x.editor || '-'}</b>
          </td>

          <td>
            ${x.category || '-'}
          </td>

          <td>
            ${x.detail || '-'}
          </td>
        </tr>
      `;

    }).join('');
}


async function saveAllChanges(){

  const changes =
    summarizeChanges(
      lastSavedDb,
      db
    );


  if(!changes.length){

    alert(
      '변경된 내용이 없습니다.'
    );

    return;
  }


  /*
    저장 실패시 되돌릴 수 있도록
    기존 changeHistory 백업
  */
  const oldHistory =
    JSON.parse(
      JSON.stringify(
        db.changeHistory || []
      )
    );


  addChangeHistory(changes);

  recordLocalBackup();


  const stamp =
    () =>
      new Date()
      .toLocaleTimeString(
        'ko-KR',
        {
          hour:'2-digit',
          minute:'2-digit',
          second:'2-digit'
        }
      );


  setSyncState(
    '저장 중...'
  );


  try{

    await supabaseSaveDatabase(db);

    localStorage.setItem(
      KEY,
      JSON.stringify(db)
    );

    cloudReady = true;

    hasUnsavedChanges = false;

    lastSavedDb =
      JSON.parse(
        JSON.stringify(db)
      );

    setSyncState(
      '✅ 공용 데이터 저장 완료 ' +
      stamp()
    );

    renderChangeHistory();


  }catch(err){

    console.error(err);

    /*
      저장 실패한 변경이력은 제거
    */
    db.changeHistory =
      oldHistory;

    setSyncState(
      '❌ 저장 실패'
    );

    alert(
      '공용 데이터 저장에 실패했습니다.\n' +
      '인터넷 연결 또는 Supabase 설정을 확인해주세요.'
    );

  }
}


/*
  저장하지 않은 상태로 창을 닫으면 경고
*/
window.addEventListener(
  'beforeunload',
  e => {

    if(hasUnsavedChanges){

      e.preventDefault();

      e.returnValue = '';

    }

  }
);


function setSyncState(msg){

  const el =
    document.getElementById(
      'syncState'
    );

  if(el){
    el.textContent = msg;
  }
}


/* =========================================================
   Supabase 최초 로딩
========================================================= */

async function loadCloud(){

  if(!SUPABASE_KEY){

    cloudReady = false;

    setSyncState(
      '❌ Supabase 키가 설정되지 않음'
    );

    alert(
      'core.js의 SUPABASE_KEY에 Publishable key를 입력해주세요.'
    );

    renderAll();

    return;
  }


  setSyncState(
    '공용 데이터 불러오는 중...'
  );


  try{

    const remote =
      await supabaseLoadDatabase();


    if(
      remote &&
      Array.isArray(remote.sessions)
    ){

      db =
        migrateDb(remote);

    }else{

      /*
        Supabase가 빈 상태라면
        초기 데이터를 최초 업로드
      */
      db =
        makeImportedDb();

      await supabaseSaveDatabase(db);
    }


    members =
      db.members ||
      defaultMembers;


    if(!db.memberStatus){
      db.memberStatus = {};
    }

    if(!db.roles){
      db.roles =
        JSON.parse(
          JSON.stringify(roleDefaults)
        );
    }

    if(!db.roleLogs){
      db.roleLogs = [];
    }

    if(!db.hallOfFame){
      db.hallOfFame =
        JSON.parse(
          JSON.stringify(hallDefaults)
        );
    }

    if(!db.legacyAttendanceTotals){
      db.legacyAttendanceTotals =
        JSON.parse(
          JSON.stringify(
            legacyAttendanceTotals
          )
        );
    }

    if(!db.winnerPeriods){
      db.winnerPeriods =
        JSON.parse(
          JSON.stringify(
            winnerPeriodDefaults
          )
        );
    }

    if(!db.winnerHistory){
      db.winnerHistory =
        JSON.parse(
          JSON.stringify(
            winnerHistoryDefaults
          )
        );
    }

    if(
      !Array.isArray(
        db.changeHistory
      )
    ){
      db.changeHistory = [];
    }


    localStorage.setItem(
      KEY,
      JSON.stringify(db)
    );


    cloudReady = true;

    hasUnsavedChanges = false;

    lastSavedDb =
      JSON.parse(
        JSON.stringify(db)
      );


    setSyncState(
      '✅ 공용 데이터 연결됨'
    );


    renderAll();


  }catch(err){

    console.error(err);

    cloudReady = false;

    setSyncState(
      '❌ 공용 데이터 연결 실패'
    );

    alert(
      'Supabase 공용 데이터를 불러오지 못했습니다.\n\n' +
      '현재 화면에서는 저장하지 말고 Supabase 설정을 확인해주세요.'
    );

    renderAll();

  }
}


/* =========================================================
   화면 전체 렌더링
========================================================= */

function renderAll(){

  renderMemberStatus();

  renderRoles();

  renderRoleLogs();

  renderAttendanceMatrix();

  renderCalendar();

  renderSessions();

  renderWinnerPeriods();

  renderWinnerHistory();

  renderWinner();

  renderFees();

  renderHallOfFame();

  renderLegacyAttendance();

  renderChangeHistory();
}


function renderLegacyAttendance(){

  const el =
    document.getElementById(
      'legacyAttendanceSummary'
    );

  if(!el) return;


  const data =
    db.legacyAttendanceTotals ||
    legacyAttendanceTotals;


  el.innerHTML =
    members
    .filter(
      name => (data[name] || 0) > 0
    )
    .sort(
      (a,b) =>
        (data[b] || 0) -
        (data[a] || 0)
    )
    .map(name => `
      <div class="role-card">

        <b>${name}</b>

        <div style="margin-top:5px">
          <span class="pill">
            누적 ${data[name] || 0}회
          </span>
        </div>

      </div>
    `)
    .join('');
}


/* =========================================================
   2026 공휴일 / 패밀리데이
========================================================= */

const koreaHolidays2026 = {

  '2026-01-01':'신정',

  '2026-02-16':'설날 연휴',
  '2026-02-17':'설날',
  '2026-02-18':'설날 연휴',

  '2026-03-01':'삼일절',
  '2026-03-02':'삼일절 대체공휴일',

  '2026-05-05':'어린이날',

  '2026-05-24':'부처님오신날',
  '2026-05-25':'부처님오신날 대체공휴일',

  '2026-06-03':'전국동시지방선거',
  '2026-06-06':'현충일',

  '2026-08-15':'광복절',
  '2026-08-17':'광복절 대체공휴일',

  '2026-09-24':'추석 연휴',
  '2026-09-25':'추석',
  '2026-09-26':'추석 연휴',

  '2026-10-03':'개천절',
  '2026-10-05':'개천절 대체공휴일',
  '2026-10-09':'한글날',

  '2026-12-25':'성탄절'
};


function isoLocal(d){

  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth()+1).padStart(2,'0')}-` +
    `${String(d.getDate()).padStart(2,'0')}`
  );
}


/*
  패밀리데이
  = 21일이 존재하는 주의 금요일

  21일이 토/일이면
  직전 금요일
*/
function familyDayForMonth(y,m){

  const d =
    new Date(y,m-1,21);

  const dow =
    d.getDay();

  let diff;


  if(dow === 6){

    diff = -1;

  }else if(dow === 0){

    diff = -2;

  }else{

    diff = 5 - dow;
  }


  d.setDate(
    d.getDate() + diff
  );


  return isoLocal(d);
}


/*
  동아리 휴무일은
  패밀리데이 직전 목요일.

  사용자 화면에는
  "패밀리데이"라고 표시.
*/
function familyEveForMonth(y,m){

  const f =
    new Date(
      familyDayForMonth(y,m) +
      'T00:00:00'
    );

  f.setDate(
    f.getDate() - 1
  );

  return isoLocal(f);
}


function autoDayInfo(date){

  const holiday =
    koreaHolidays2026[date];

  const [y,m] =
    date.split('-')
    .map(Number);

  const famEve =
    familyEveForMonth(y,m);


  if(holiday){

    return {
      type:'holiday',
      label:holiday,
      noTraining:true
    };
  }


  if(date === famEve){

    return {
      type:'family',
      label:'패밀리데이',
      noTraining:true,
      familyDay:
        familyDayForMonth(y,m)
    };
  }


  return null;
}


/*
  실제 날짜 상태

  수동 설정이 있으면
  수동 설정이 자동 규칙보다 우선.
*/
function effectiveDayInfo(date){

  const s =
    attendanceSession(date);

  const auto =
    autoDayInfo(date);


  if(s?.status === 'train'){

    return {
      status:'train',
      label:
        s.instructor
          ? '강사 훈련'
          : '훈련',
      session:s,
      auto
    };
  }


  if(s?.status === 'cancel'){

    return {
      status:'cancel',
      label:
        s.memo ||
        auto?.label ||
        '훈련 취소',
      session:s,
      auto
    };
  }


  if(auto?.noTraining){

    return {
      status:'cancel',
      label:auto.label,
      session:null,
      auto
    };
  }


  return {
    status:'open',
    label:'',
    session:null,
    auto:null
  };
}


function isNoTraining(date){

  return (
    effectiveDayInfo(date)
    .status === 'cancel'
  );
}


/* =========================================================
   초기 화면
========================================================= */

function today(){

  const d =
    new Date();

  return isoLocal(d);
}


let calendarCursor =
  new Date();


function init(){

  const todayValue =
    today();


  if(
    document.getElementById(
      'sessionDate'
    )
  ){
    sessionDate.value =
      todayValue;
  }


  if(
    document.getElementById(
      'sessionInstructor'
    )
  ){
    sessionInstructor.checked =
      false;
  }


  if(
    document.getElementById(
      'attendanceMatrixMonth'
    )
  ){
    attendanceMatrixMonth.value =
      todayValue.slice(0,7);
  }


  if(
    document.getElementById(
      'roleMatrixMonth'
    )
  ){
    roleMatrixMonth.value =
      todayValue.slice(0,7);
  }


  const y =
    new Date().getFullYear();


  if(
    document.getElementById(
      'feePeriod'
    )
  ){

    feePeriod.innerHTML =
      [1,3,5,7,9,11]
      .map(m => `
        <option
          value="${y}-${String(m).padStart(2,'0')}">
          ${y}년 ${m}~${m+1}월
        </option>
      `)
      .join('');


    const nowM =
      new Date().getMonth()+1;

    const start =
      nowM % 2 === 0
        ? nowM - 1
        : nowM;

    feePeriod.value =
      `${y}-${String(start).padStart(2,'0')}`;
  }


  renderAll();

  loadCloud();
}


/* =========================================================
   탭
========================================================= */

function showMainPane(id,btn){

  document
    .querySelectorAll('.main-pane')
    .forEach(
      x => x.classList.remove('active')
    );


  document
    .querySelectorAll('#mainNav button')
    .forEach(
      x => x.classList.remove('active')
    );


  document
    .getElementById(id)
    .classList.add('active');


  btn.classList.add('active');


  if(id === 'attendancePane'){
    renderAttendanceMatrix();
  }

  if(id === 'rolePane'){
    renderRoleMatrix();
  }

  if(id === 'winnerFeePane'){
    renderWinner();
    renderFees();
  }

  if(id === 'hofPane'){
    renderHallOfFame();
  }

  if(id === 'historyPane'){
    renderChangeHistory();
  }
}


function showTab(id,btn){

  const set =
    btn.closest('.tabset');


  set
    .querySelectorAll('.tabpane')
    .forEach(
      x => x.classList.remove('active')
    );


  set
    .querySelectorAll('.tabbtn')
    .forEach(
      x => x.classList.remove('active')
    );


  document
    .getElementById(id)
    .classList.add('active');


  btn.classList.add('active');


  if(id === 'calendarTab'){
    renderCalendar();
  }

  if(id === 'inputTab'){
    renderAttendanceMatrix();
  }

  if(id === 'roleLogTab'){
    renderRoleMatrix();
  }
}


/* =========================================================
   이전 / 다음 이동
========================================================= */

function moveCalendar(delta){

  calendarCursor =
    new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth()+delta,
      1
    );

  renderCalendar();
}


function moveRoleMonth(delta){

  const el =
    document.getElementById(
      'roleMatrixMonth'
    );

  if(!el) return;


  const base =
    el.value
      ? new Date(
          el.value +
          '-01T00:00:00'
        )
      : new Date();


  base.setMonth(
    base.getMonth()+delta
  );


  el.value =
    `${base.getFullYear()}-` +
    `${String(base.getMonth()+1).padStart(2,'0')}`;


  renderRoleMatrix();
}


function moveWinnerPeriod(delta){

  const el =
    document.getElementById(
      'winnerPeriodSelect'
    );

  if(
    !el ||
    !el.options.length
  ){
    return;
  }


  const idx =
    Math.max(
      0,
      Math.min(
        el.options.length-1,
        el.selectedIndex+delta
      )
    );


  el.selectedIndex =
    idx;


  renderWinner();
}


function moveFeePeriod(delta){

  const el =
    document.getElementById(
      'feePeriod'
    );

  if(
    !el ||
    !el.options.length
  ){
    return;
  }


  const idx =
    Math.max(
      0,
      Math.min(
        el.options.length-1,
        el.selectedIndex+delta
      )
    );


  el.selectedIndex =
    idx;


  renderFees();
}


/* =========================================================
   달력
========================================================= */

function renderCalendar(){

  const y =
    calendarCursor.getFullYear();

  const m =
    calendarCursor.getMonth();


  calendarTitle.textContent =
    `${y}년 ${m+1}월`;


  const first =
    new Date(y,m,1)
    .getDay();

  const last =
    new Date(y,m+1,0)
    .getDate();


  const heads =
    ['일','월','화','수','목','금','토']
    .map(
      day =>
        `<div class="dow">${day}</div>`
    )
    .join('');


  let cells = '';


  for(
    let i=0;
    i<first;
    i++
  ){

    cells +=
      '<div class="day empty"></div>';
  }


  for(
    let d=1;
    d<=last;
    d++
  ){

    const ds =
      `${y}-` +
      `${String(m+1).padStart(2,'0')}-` +
      `${String(d).padStart(2,'0')}`;


    const s =
      attendanceSession(ds);

    const eff =
      effectiveDayInfo(ds);

    const auto =
      autoDayInfo(ds);


    const cls =
      eff.status === 'train'
        ? ' train'
        : eff.status === 'cancel'
          ? ' cancel'
          : '';


    const td =
      ds === today()
        ? ' today'
        : '';


    let info = '';


    if(
      eff.status === 'train'
    ){

      info = `
        <div class="badge">
          ${
            s?.instructor
              ? '🎓 강사 ·'
              : '훈련 ·'
          }
          ${s?.attendees?.length || 0}명
        </div>
      `;

    }else if(
      eff.status === 'cancel'
    ){

      info = `
        <div class="badge">
          ${
            auto?.type === 'holiday'
              ? '🇰🇷 '
              : auto?.type === 'family'
                ? '🏠 '
                : ''
          }
          ${eff.label}
        </div>
      `;
    }


    cells += `
      <div
        class="day${cls}${td}"
        onclick="openCalendarDate('${ds}')">

        <div class="daynum">
          ${d}
        </div>

        ${info}

      </div>
    `;
  }


  calendarGrid.innerHTML =
    heads + cells;
}


function openCalendarDate(ds){

  const s =
    attendanceSession(ds);

  const auto =
    autoDayInfo(ds);


  sessionDate.value =
    ds;


  /*
    ★ 수동 설정이 없다면
      무조건 기본값(자동) 선택
  */
  sessionStatus.value =
    s?.status || 'auto';


  const rawMemo =
    s?.memo || '';


  sessionMemo.value =
    rawMemo ===
    '2026 기존 출석 엑셀 재검증본'
      ? ''
      : (
          rawMemo ||
          auto?.label ||
          ''
        );


  if(
    document.getElementById(
      'sessionInstructor'
    )
  ){

    sessionInstructor.checked =
      !!s?.instructor;
  }


  const list =
    document.getElementById(
      'calendarAttendeeList'
    );


  if(list){

    const names =
      s?.attendees || [];


    list.innerHTML =
      names.length

      ? names.map(name => `
          <div class="role-card">

            <b>
              ${baseName(name)}
            </b>

            ${
              s?.instructor
                ? `
                  <div
                    class="small"
                    style="margin-top:4px">

                    🎓 1.5점

                  </div>
                `
                : ''
            }

          </div>
        `).join('')

      : `
          <div class="muted">
            출석자가 없습니다.
          </div>
        `;
  }


  if(
    document.getElementById(
      'attendanceMatrixMonth'
    )
  ){

    attendanceMatrixMonth.value =
      ds.slice(0,7);
  }


  if(
    document.getElementById(
      'calendarDateDialog'
    )
  ){

    calendarDateDialog.showModal();
  }
}


function goAttendanceFromCalendar(){

  const ds =
    sessionDate.value;


  if(
    document.getElementById(
      'calendarDateDialog'
    )?.open
  ){

    calendarDateDialog.close();
  }


  if(
    document.getElementById(
      'attendanceMatrixMonth'
    )
  ){

    attendanceMatrixMonth.value =
      ds.slice(0,7);
  }


  showTab(
    'inputTab',
    document.querySelector(
      '#attendanceTabs .tabbtn'
    )
  );


  renderAttendanceMatrix();
}


/* =========================================================
   회원
========================================================= */

function renderMemberStatus(){

  memberStatusRows.innerHTML =
    members
    .map(name => {

      const st =
        db.memberStatus[name] || {};

      return `
        <tr>

          <td>
            <b>${name}</b>
          </td>

          <td>

            <select
              onchange="
                setMemberStatus(
                  '${esc(name)}',
                  'type',
                  this.value
                )
              ">

              <option
                value=""
                ${!st.type ? 'selected' : ''}>
                일반
              </option>

              <option
                value="임원진"
                ${st.type === '임원진' ? 'selected' : ''}>
                임원진
              </option>

              <option
                value="출장(파견)"
                ${st.type === '출장(파견)' ? 'selected' : ''}>
                출장(파견)
              </option>

              <option
                value="부상"
                ${st.type === '부상' ? 'selected' : ''}>
                부상
              </option>

              <option
                value="기타"
                ${st.type === '기타' ? 'selected' : ''}>
                기타
              </option>

            </select>

          </td>

          <td>

            <button
              class="danger"
              onclick="
                removeMember(
                  '${esc(name)}'
                )
              ">
              삭제
            </button>

          </td>

        </tr>
      `;

    })
    .join('');
}


function esc(s){

  return String(s)
    .replaceAll('\\','\\\\')
    .replaceAll("'","\\'");
}


function addMember(){

  const input =
    document.getElementById(
      'newMemberName'
    );

  const name =
    (input?.value || '')
    .trim();


  if(!name){

    alert(
      '회원 이름을 입력해주세요.'
    );

    return;
  }


  if(
    members.includes(name)
  ){

    alert(
      '이미 등록된 회원입니다.'
    );

    return;
  }


  members.push(name);

  db.members =
    members;

  db.memberStatus[name] =
    { type:'' };

  db.roles[name] =
    {
      role:'',
      star:false,
      note:''
    };


  persist();


  input.value = '';


  renderAll();


  alert(
    name +
    ' 회원이 추가 대기 상태입니다.\n' +
    '회원 변경 저장 버튼을 눌러야 공용 데이터에 반영됩니다.'
  );
}


function removeMember(name){

  if(
    fixedZeroFeeMembers.includes(name)
  ){

    if(
      !confirm(
        name +
        ' 님은 임원진 0원 고정 대상입니다.\n\n' +
        '회원 목록에서 삭제하시겠습니까?\n' +
        '과거 기록은 유지됩니다.'
      )
    ){
      return;
    }

  }else{

    if(
      !confirm(
        name +
        ' 님을 현재 회원 목록에서 삭제할까요?\n\n' +
        '과거 출석/역할 기록은 유지됩니다.'
      )
    ){
      return;
    }
  }


  members =
    members.filter(
      x => x !== name
    );


  db.members =
    members;


  persist();

  renderAll();
}


function setMemberStatus(
  name,
  key,
  val
){

  if(
    !db.memberStatus[name]
  ){

    db.memberStatus[name] =
      { type:'' };
  }


  db.memberStatus[name].type =
    val || '';


  persist();

  renderFees();
}


function zeroFeeStatus(
  name,
  periodStart,
  periodEnd
){

  if(
    fixedZeroFeeMembers.includes(name)
  ){

    return '임원진(0원 고정)';
  }


  const st =
    db.memberStatus[name];


  return (
    st &&
    st.type
      ? st.type
      : null
  );
}
