function attendanceSession(date){
  return (db.sessions||[]).find(x=>x.date===date);
}

function attendanceCellHtml(date,member){
  const eff=effectiveDayInfo(date);
  const sess=attendanceSession(date);

  if(eff.status==='cancel'){
    return `<td class="matrix-cell"
      style="background:#eee;color:#888"
      title="${eff.label}">
      훈련없음
    </td>`;
  }

  const on=!!(sess?.attendees||[]).includes(member);
  const mark=on?(sess?.instructor?'1.5':'✓'):'';

  return `<td
    class="matrix-cell ${on?'donecell':''}"
    title="클릭: 출석/미출석${sess?.instructor?' · 강사일 1.5점':''}"
    onclick="cycleAttendanceCell('${date}','${esc(member)}')">
    ${mark}
  </td>`;
}


function cycleAttendanceCell(date,member){

  if(!db.sessions) db.sessions=[];

  let s=db.sessions.find(x=>x.date===date);

  /* 자동 휴무일이면 출석 입력 금지 */
  if(isNoTraining(date) && !s) return;

  /* 수동 취소일이면 출석 입력 금지 */
  if(s?.status==='cancel') return;

  /*
    출석표에서 처음 사람을 체크하면
    실제 훈련 기록으로 생성
  */
  if(!s){
    s={
      date,
      status:'train',
      memo:'',
      instructor:false,
      attendees:[]
    };

    db.sessions.push(s);
  }

  if(!Array.isArray(s.attendees)){
    s.attendees=[];
  }

  const i=s.attendees.indexOf(member);

  if(i>=0){
    s.attendees.splice(i,1);
  }else{
    s.attendees.push(member);
  }

  s.attendees.sort(
    (a,b)=>members.indexOf(a)-members.indexOf(b)
  );

  db.sessions.sort(
    (a,b)=>a.date.localeCompare(b.date)
  );

  persist();

  renderAttendanceMatrix();
  renderCalendar();
  renderSessions();
  renderWinner();
  renderFees();
}


function moveAttendanceMonth(delta){

  const el=document.getElementById('attendanceMatrixMonth');

  if(!el) return;

  const ym=el.value||today().slice(0,7);

  const [y,m]=ym.split('-').map(Number);

  const d=new Date(y,m-1+delta,1);

  el.value=
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  renderAttendanceMatrix();
}


function renderAttendanceMatrix(){

  const monthEl=document.getElementById('attendanceMatrixMonth');
  const wrap=document.getElementById('attendanceMatrixWrap');

  if(!monthEl||!wrap) return;

  const ym=monthEl.value||today().slice(0,7);

  monthEl.value=ym;

  const dates=matrixDates(ym);

  const head=dates.map(d=>{

    const s=attendanceSession(d);
    const eff=effectiveDayInfo(d);

    return `
      <th class="${eff.status==='cancel'?'todocell':''}">
        ${shortDate(d)}

        ${
          eff.status==='cancel'
          ? `<br><span class="muted">${eff.label}</span>`
          : s?.instructor
            ? '<br><span class="pill">🎓1.5</span>'
            : ''
        }
      </th>
    `;

  }).join('');


  const body=members.map(member=>{

    const total=dates.reduce((sum,d)=>{

      const s=attendanceSession(d);

      return sum+(
        s?.status==='train' &&
        (s.attendees||[]).includes(member)
          ? (s.instructor?1.5:1)
          : 0
      );

    },0);


    return `
      <tr>

        <td class="sticky1">
          <b>${member}</b>
        </td>

        ${
          dates
          .map(d=>attendanceCellHtml(d,member))
          .join('')
        }

        <td class="totalcol done">
          ${fmtScore(total)}
        </td>

      </tr>
    `;

  }).join('');


  wrap.innerHTML=`
    <table class="matrix">

      <thead>
        <tr>
          <th class="sticky1">회원</th>
          ${head}
          <th>출석</th>
        </tr>
      </thead>

      <tbody>
        ${body}
      </tbody>

    </table>
  `;


  const train=dates.filter(
    d=>effectiveDayInfo(d).status==='train'
  ).length;

  const cancel=dates.filter(
    d=>effectiveDayInfo(d).status==='cancel'
  ).length;


  attendanceMatrixInfo.textContent=
    `${ym} · 표시 날짜 ${dates.length}개 · 훈련 ${train}회 · 훈련없음 ${cancel}회`;
}


/*
  달력 날짜 설정 저장

  auto   = 수동 설정 제거 → 자동 상태로 복귀
  train  = 훈련
  cancel = 훈련 취소
*/
async function saveSessionMeta(closeDialog=false){

  const date=sessionDate.value;

  if(!date){
    alert('날짜를 선택하세요.');
    return;
  }

  const status=sessionStatus.value;

  const memo=sessionMemo.value.trim();

  const instructor=
    !!document.getElementById('sessionInstructor')?.checked;


  if(!db.sessions){
    db.sessions=[];
  }


  /*
    ★ 기본값(자동)

    해당 날짜에 사용자가 직접 만든
    train/cancel 설정을 제거합니다.

    공휴일 / 패밀리데이 등의
    자동 규칙이 다시 적용됩니다.
  */
  if(status==='auto'){

    const oldSession=
      db.sessions.find(x=>x.date===date);


    /*
      기존 출석자가 있으면 경고
      기본값으로 돌리면 그 날짜의
      출석기록도 같이 삭제됩니다.
    */
    if(
      oldSession &&
      (oldSession.attendees||[]).length>0
    ){

      const ok=confirm(
        `${date}에 출석자 ${(oldSession.attendees||[]).length}명이 있습니다.\n\n`+
        `기본값(자동)으로 되돌리면 이 날짜의 출석 기록도 삭제됩니다.\n\n`+
        `계속할까요?`
      );

      if(!ok) return;
    }


    db.sessions=
      db.sessions.filter(x=>x.date!==date);


    persist();

    await saveAllChanges();


    if(
      document.getElementById('attendanceMatrixMonth')
    ){
      attendanceMatrixMonth.value=
        date.slice(0,7);
    }


    renderAttendanceMatrix();
    renderCalendar();
    renderSessions();
    renderWinner();
    renderFees();


    if(
      closeDialog &&
      document.getElementById('calendarDateDialog')?.open
    ){
      calendarDateDialog.close();
    }


    alert(
      `${date} 날짜가 기본값(자동)으로 변경되었습니다.`
    );

    return;
  }


  /*
    훈련 / 취소 설정
  */
  let s=
    db.sessions.find(x=>x.date===date);


  if(!s){

    s={
      date,
      status,
      memo,
      instructor:
        status==='train' && instructor,
      attendees:[]
    };

    db.sessions.push(s);

  }else{

    s.status=status;

    s.memo=memo;

    s.instructor=
      status==='train' && instructor;


    /*
      취소로 변경하면
      기존 출석 기록 제거
    */
    if(status==='cancel'){

      if((s.attendees||[]).length>0){

        const ok=confirm(
          `${date}에 출석자 ${s.attendees.length}명이 있습니다.\n\n`+
          `훈련 취소로 변경하면 출석기록이 삭제됩니다.\n\n`+
          `계속할까요?`
        );

        if(!ok) return;
      }

      s.attendees=[];
    }
  }


  db.sessions.sort(
    (a,b)=>a.date.localeCompare(b.date)
  );


  persist();

  await saveAllChanges();


  if(
    document.getElementById('attendanceMatrixMonth')
  ){
    attendanceMatrixMonth.value=
      date.slice(0,7);
  }


  renderAttendanceMatrix();
  renderCalendar();
  renderSessions();
  renderWinner();
  renderFees();


  if(
    closeDialog &&
    document.getElementById('calendarDateDialog')?.open
  ){
    calendarDateDialog.close();
  }


  alert('날짜 상태가 저장되었습니다.');
}


function renderSessions(){

  const rows=
    [...(db.sessions||[])]
    .sort((a,b)=>b.date.localeCompare(a.date));


  sessionRows.innerHTML=
    rows.length

    ? rows.map(s=>`

      <tr>

        <td>${s.date}</td>

        <td>

          ${
            s.status==='train'

            ? (
                s.instructor
                ? '<span class="pill">🎓 강사(1.5)</span>'
                : '<span class="pill">훈련</span>'
              )

            : '취소'
          }

        </td>

        <td>
          ${s.attendees?.length||0}명
        </td>

        <td>
          ${s.memo||''}
        </td>

        <td>

          <button
            onclick="editSession('${s.date}')">
            수정
          </button>

          <button
            onclick="deleteSession('${s.date}')">
            삭제
          </button>

        </td>

      </tr>

    `).join('')

    : `
      <tr>
        <td colspan="5" class="muted">
          아직 기록이 없습니다.
        </td>
      </tr>
    `;
}


function editSession(date){

  calendarCursor=
    new Date(
      Number(date.slice(0,4)),
      Number(date.slice(5,7))-1,
      1
    );


  showTab(
    'calendarTab',
    document.querySelectorAll(
      '#attendanceTabs .tabbtn'
    )[1]
  );


  renderCalendar();

  openCalendarDate(date);
}


function deleteSession(date){

  if(
    !confirm(
      date+
      ' 기록을 삭제할까요?\n\n'+
      '삭제하면 해당 날짜는 기본값(자동) 상태로 돌아갑니다.'
    )
  ){
    return;
  }


  db.sessions=
    db.sessions.filter(
      x=>x.date!==date
    );


  persist();

  renderAttendanceMatrix();
  renderCalendar();
  renderSessions();
  renderWinner();
  renderFees();
}
