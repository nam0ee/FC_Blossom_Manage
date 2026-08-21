async function fetchBackupHistory(){
  if(window.google && google.script && google.script.run){
    try{
      return await new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getBackupHistory(3));
    }catch(e){ console.warn('클라우드 백업 이력 조회 실패',e); }
  }
  try{return JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]')}catch(e){return []}
}
function excelDayName(date){return ['일','월','화','수','목','금','토'][new Date(date+'T00:00:00').getDay()]}
function excelPeriodFeeRows(){
  const rows=[];
  [1,3,5,7,9,11].forEach(m=>{
    const y=2026,ym1=`${y}-${String(m).padStart(2,'0')}`,ym2=`${y}-${String(m+1).padStart(2,'0')}`;
    const sessions=(db.sessions||[]).filter(s=>effectiveDayInfo(s.date).status==='train'&&(s.date.startsWith(ym1)||s.date.startsWith(ym2)));
    const total=sessions.length,threshold=total/2,periodStart=`${ym1}-01`,periodEnd=new Date(y,m+1,0).toISOString().slice(0,10);
    members.forEach(name=>{
      const score=sessions.reduce((sum,se)=>sum+attendanceScoreForSession(se,name),0),z=zeroFeeStatus(name,periodStart,periodEnd),fee=z?0:(score>threshold?10000:20000);
      rows.push([`${m}~${m+1}월`,name,score,total,threshold,z||'일반',fee]);
    });
  });
  return rows;
}
function styleExcelSheet(ws,opts={}){
  const headerColor=opts.headerColor||'1F4E78',tabColor=opts.tabColor||headerColor;
  ws.properties.tabColor={argb:'FF'+tabColor};
  if(ws.rowCount>0){
    const header=ws.getRow(1);header.height=26;
    header.eachCell(cell=>{
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+headerColor}};
      cell.font={bold:true,color:{argb:'FFFFFFFF'}};
      cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
      cell.border={bottom:{style:'thin',color:{argb:'FFD1D5DB'}}};
    });
    ws.views=[{state:'frozen',ySplit:1,xSplit:opts.freezeX||0}];
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:Math.max(1,ws.columnCount)}};
  }
  for(let r=2;r<=ws.rowCount;r++){
    const row=ws.getRow(r);row.alignment={vertical:'middle'};
    if(r%2===0)row.eachCell(c=>{if(!c.fill||!c.fill.pattern)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}}});
    row.eachCell(c=>{c.border={bottom:{style:'hair',color:{argb:'FFE5E7EB'}}};c.alignment={vertical:'middle',wrapText:true};});
  }
  ws.columns.forEach((col,idx)=>{
    let max=String(ws.getRow(1).getCell(idx+1).value??'').length;
    col.eachCell({includeEmpty:false},cell=>{let v=cell.value;if(v&&typeof v==='object'&&v.text)v=v.text;max=Math.max(max,String(v??'').length);});
    col.width=Math.min(opts.maxWidth||34,Math.max(opts.minWidth||10,max+2));
  });
  if(opts.widths)Object.entries(opts.widths).forEach(([i,w])=>ws.getColumn(Number(i)).width=w);
}
function addExcelSheet(wb,name,rows,opts={}){
  const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  rows.forEach(r=>ws.addRow(r));
  styleExcelSheet(ws,opts);return ws;
}
async function exportExcel(){
  if(typeof ExcelJS==='undefined'){alert('엑셀 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해주세요.');return;}
  const wb=new ExcelJS.Workbook();wb.creator='FC Blossom';wb.created=new Date();
  const allDates=[...new Set([...(db.sessions||[]).map(s=>s.date),...Object.keys(koreaHolidays2026),...Array.from({length:12},(_,i)=>familyEveForMonth(2026,i+1))])].filter(d=>d.startsWith('2026-')).sort();
  const trainingDates=allDates.filter(d=>{const dt=new Date(d+'T00:00:00');return dt.getDay()===1||dt.getDay()===4||(db.sessions||[]).some(s=>s.date===d);});

  const attendance=[['회원',...trainingDates,'합계']];
  members.forEach(m=>{let total=0;const vals=trainingDates.map(d=>{const se=attendanceSession(d),eff=effectiveDayInfo(d);if(eff.status==='cancel')return eff.label;const present=!!(se?.attendees||[]).includes(m);if(!present)return '';const v=se?.instructor?1.5:1;total+=v;return v;});attendance.push([m,...vals,total]);});
  const aws=addExcelSheet(wb,'출석',attendance,{headerColor:'2563EB',tabColor:'2563EB',freezeX:1,maxWidth:22,widths:{1:22,[trainingDates.length+2]:10}});
  trainingDates.forEach((d,i)=>{const col=i+2,auto=autoDayInfo(d),se=attendanceSession(d);aws.getColumn(col).width=12;if(auto?.noTraining){aws.getRow(1).getCell(col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF9CA3AF'}};}else if(se?.instructor){aws.getRow(1).getCell(col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF59E0B'}};aws.getRow(1).getCell(col).font={bold:true,color:{argb:'FF111827'}};}for(let r=2;r<=aws.rowCount;r++){const c=aws.getRow(r).getCell(col);if(typeof c.value==='string'&&c.value){c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F4F6'}};c.font={color:{argb:'FF6B7280'}};}else if(c.value===1.5){c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEF3C7'}};c.font={bold:true,color:{argb:'FF92400E'}};}else if(c.value===1){c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDCFCE7'}};c.font={bold:true,color:{argb:'FF166534'}};}}});

  const schedule=[['날짜','요일','상태','구분','강사일','참석인원','메모']];
  allDates.forEach(d=>{const se=attendanceSession(d),eff=effectiveDayInfo(d),auto=autoDayInfo(d);schedule.push([d,excelDayName(d),eff.status==='train'?'훈련':eff.status==='cancel'?'훈련없음':'미설정',auto?.label||'',se?.instructor?'Y':'',se?.attendees?.length||0,se?.memo||'']);});
  const sws=addExcelSheet(wb,'훈련일정',schedule,{headerColor:'0F766E',tabColor:'0F766E',maxWidth:36,widths:{1:13,2:7,3:12,4:26,5:9,6:11,7:30}});
  for(let r=2;r<=sws.rowCount;r++){const status=sws.getRow(r).getCell(3);if(status.value==='훈련없음')status.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEE2E2'}};else if(status.value==='훈련')status.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDCFCE7'}};if(sws.getRow(r).getCell(5).value==='Y')sws.getRow(r).getCell(5).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEF3C7'}};}

  const roleLogs=[['날짜','역할','담당자','결과','메모']];[...(db.roleLogs||[])].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>roleLogs.push([x.date,x.role,x.member,x.done?'완료':'미완료',x.memo||'']));
  const rws=addExcelSheet(wb,'역할수행',roleLogs,{headerColor:'7C3AED',tabColor:'7C3AED',maxWidth:36,widths:{1:13,2:14,3:22,4:10,5:30}});for(let r=2;r<=rws.rowCount;r++){const c=rws.getRow(r).getCell(4);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:c.value==='완료'?'FFDCFCE7':'FFFEE2E2'}};}

  const roles=[['회원','책임자','역할','비고']];members.forEach(m=>{const r=(db.roles||{})[m]||{};roles.push([m,r.star?'★':'',r.role||'',r.note||'']);});
  addExcelSheet(wb,'역할배정',roles,{headerColor:'7C3AED',tabColor:'8B5CF6',maxWidth:40,widths:{1:22,2:9,3:30,4:34}});

  const winner=[['월','시작일','종료일','역대 출석왕','출석점수','훈련횟수']];const hist=Object.fromEntries((db.winnerHistory||[]).map(h=>[h.label,h]));sortedWinnerPeriods().forEach(p=>{const h=hist[p.label]||{};winner.push([p.label.replace('-', '.'),p.start,p.end,h.winner||'',h.score??'',h.trainCount??trainCountInRange(p.start,p.end)]);});
  addExcelSheet(wb,'출석왕',winner,{headerColor:'B45309',tabColor:'D97706',widths:{1:11,2:13,3:13,4:22,5:11,6:11}});

  const fee=[['기간','회원','출석점수','훈련횟수','1/2 기준','상태','회비']];excelPeriodFeeRows().forEach(r=>fee.push(r));
  const fws=addExcelSheet(wb,'회비',fee,{headerColor:'047857',tabColor:'059669',widths:{1:11,2:22,3:11,4:11,5:11,6:16,7:12}});for(let r=2;r<=fws.rowCount;r++){const c=fws.getRow(r).getCell(7);c.numFmt='#,##0"원"';c.fill={type:'pattern',pattern:'solid',fgColor:{argb:Number(c.value)===0?'FFE0E7FF':Number(c.value)===10000?'FFDCFCE7':'FFFEE2E2'}};}

  const status=[['회원','상태','회비0원고정']];members.forEach(m=>{const st=(db.memberStatus||{})[m]||{};status.push([m,st.type||'',fixedZeroFeeMembers.includes(m)?'Y':'']);});
  addExcelSheet(wb,'회원상태',status,{headerColor:'475569',tabColor:'64748B',widths:{1:22,2:16,3:14}});

  const hof=[['순위','이름','총점','볼마스터리','빙고','자체전 우승','출석왕 2회 이상','대회 참가','대회 수상','수상 가중점수']];const originalIndex=Object.fromEntries(hallMembers.map((n,i)=>[n,i]));hallMembers.map(name=>({name,v:(db.hallOfFame||{})[name]||hallDefaults[name]||{},score:hallScore((db.hallOfFame||{})[name]||hallDefaults[name]||{})})).sort((a,b)=>b.score-a.score||originalIndex[a.name]-originalIndex[b.name]).forEach((r,i)=>hof.push([i+1,r.name,r.score,Number(r.v.ball||0),Number(r.v.bingo||0),Number(r.v.selfWin||0),Number(r.v.attendance2||0),Number(r.v.contest||0),Number(r.v.award||0),Number(r.v.award||0)*2]));
  const hws=addExcelSheet(wb,'명예의전당',hof,{headerColor:'92400E',tabColor:'F59E0B',maxWidth:24,widths:{1:8,2:18,3:10}});for(let r=2;r<=Math.min(4,hws.rowCount);r++)hws.getRow(r).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:r===2?'FFFFF3C4':r===3?'FFE5E7EB':'FFFDE2C5'}};c.font={bold:true};});

  const backups=await fetchBackupHistory();
  const bsum=[['백업ID','저장시각','출처','회원수','출석일수','역할수행기록수','출석왕기간수']];
  const bdata=[['백업ID','파트','백업데이터(JSON 조각)']];
  backups.forEach((b,i)=>{let obj={};try{obj=JSON.parse(b.data||'{}')}catch(e){}const id=`B${String(i+1).padStart(3,'0')}`;bsum.push([id,b.savedAt||'',b.source||((window.google&&google.script)?'클라우드':'로컬'),(obj.members||[]).length,(obj.sessions||[]).length,(obj.roleLogs||[]).length,(obj.winnerPeriods||[]).length]);const txt=b.data||'';for(let p=0;p<txt.length;p+=30000)bdata.push([id,Math.floor(p/30000)+1,txt.slice(p,p+30000)]);});
  addExcelSheet(wb,'백업이력',bsum,{headerColor:'334155',tabColor:'334155',maxWidth:26,widths:{1:10,2:24,3:12}});
  addExcelSheet(wb,'백업데이터',bdata,{headerColor:'334155',tabColor:'475569',maxWidth:60,widths:{1:10,2:8,3:60}});

  // 최신 HTML 자체를 엑셀 안에 보관: A열을 순서대로 이어 붙이면 .html 파일로 복원 가능
  const htmlSource='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  const htmlRows=[['순번','HTML 소스 조각 (순서대로 이어붙여 .html로 저장)']];
  for(let p=0,i=1;p<htmlSource.length;p+=30000,i++)htmlRows.push([i,htmlSource.slice(p,p+30000)]);
  const htmlWs=addExcelSheet(wb,'HTML_최신본',htmlRows,{headerColor:'0F172A',tabColor:'0F172A',maxWidth:80,widths:{1:8,2:80}});
  for(let r=2;r<=htmlWs.rowCount;r++){htmlWs.getRow(r).height=60;htmlWs.getRow(r).getCell(2).alignment={vertical:'top',wrapText:true};}

  const buffer=await wb.xlsx.writeBuffer();download(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'FC_Blossom_Manage.xlsx');
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function resetAll(){if(confirm('웹에서 추가/수정한 값을 지우고, 처음 가져온 엑셀 초기값으로 되돌릴까요?')){db=makeImportedDb();members=db.members;persist();saveAllChanges();renderAll()}}
init();
