
// v11d: Timer for time exercises (Farmers Walk) + Rest alerts + NO autosave (workout draft only saves on 💾 Save)
const STORE_KEY="gym_v11d_timer_nosave_state";
const INC_KG=2.5;
const PIN_INC=1;

const DAY_ORDER=['strength','fatloss','volume'];
function uid(p="id"){return `${p}_${Math.random().toString(16).slice(2)}_${Date.now()}`;}
function localISO(d=new Date()){const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);}
function addDays(iso,n){
  const d=new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  return localISO(d);
}
function load(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'null');}catch(e){return null;}}
function saveState(s){localStorage.setItem(STORE_KEY, JSON.stringify(s));}

function defaultState(){
  const exercises=[
    {id:uid('ex'),name:'Squat',type:'reps',archived:false},
    {id:uid('ex'),name:'Bench Press (Mach/ Free)',type:'reps',archived:false},
    {id:uid('ex'),name:'Bent Over Row',type:'reps',archived:false},
    {id:uid('ex'),name:'Skull Crusher / Rope pull down',type:'reps',archived:false},
    {id:uid('ex'),name:'Deadlift',type:'reps',archived:false},
    {id:uid('ex'),name:'Lat Pull Down',type:'reps',archived:false},
    {id:uid('ex'),name:'Military / Arnold Press',type:'reps',archived:false},
    {id:uid('ex'),name:'Hammer Curl',type:'reps',archived:false},
    {id:uid('ex'),name:'Stiff-Leg Romanian Deadlift',type:'reps',archived:false},
    {id:uid('ex'),name:'Chest Fly Mach/ Free',type:'reps',archived:false},
    {id:uid('ex'),name:'Seated Dumbbell Extension',type:'reps',archived:false},
    {id:uid('ex'),name:'Dumbbell Palm Curl',type:'reps',archived:false},
    {id:uid('ex'),name:"Farmer's Walk",type:'time',archived:false},
  ];
  const id=(n)=>exercises.find(e=>e.name===n)?.id||'';
  const mk=(name,sets,target)=>({id:uid('row'),exId:id(name),sets:String(sets),target:String(target),weight:'',pin:'',rir:'',keep:true,rest:'60'});
  const templates={
    strength:[mk('Squat',3,'5'),mk('Bench Press (Mach/ Free)',2,'5'),mk('Bent Over Row',2,'5'),mk('Skull Crusher / Rope pull down',2,'8-10')],
    fatloss:[mk('Deadlift',2,'8-10'),mk('Lat Pull Down',2,'12-15'),mk('Military / Arnold Press',2,'12-15'),mk('Hammer Curl',2,'12-15'),mk("Farmer's Walk",2,'40')],
    volume:[mk('Stiff-Leg Romanian Deadlift',2,'8-10'),mk('Chest Fly Mach/ Free',2,'12-15'),mk('Seated Dumbbell Extension',2,'12-15'),mk('Dumbbell Palm Curl',2,'12-15'),mk("Farmer's Walk",2,'40')],
  };
  return {exercises,templates,sessions:{},templateLive:{strength:[],fatloss:[],volume:[]},lastCompleted:null};
}

let state = load() || defaultState();
saveState(state);

// DOM
const dateInput=document.getElementById('dateInput');
const prevDay=document.getElementById('prevDay');
const nextDay=document.getElementById('nextDay');
const todayBtn=document.getElementById('todayBtn');

const tabs=[...document.querySelectorAll('.tab')];
const workoutCard=document.getElementById('workoutCard');
const manageCard=document.getElementById('manageCard');
const historyCard=document.getElementById('historyCard');

const dayTitle=document.getElementById('dayTitle');
const dayPill=document.getElementById('dayPill');
const dayHint=document.getElementById('dayHint');
const daySelect=document.getElementById('daySelect');
const tbody=document.getElementById('tbody');
const note=document.getElementById('note');
const draftStatus=document.getElementById('draftStatus');

const addRowBtn=document.getElementById('addRowBtn');
const saveBtn=document.getElementById('saveBtn');
const resetDraftBtn=document.getElementById('resetDraftBtn');

const newName=document.getElementById('newName');
const newType=document.getElementById('newType');
const addExBtn=document.getElementById('addExBtn');
const exList=document.getElementById('exList');

const rangeSel=document.getElementById('rangeSel');
const search=document.getElementById('search');
const histList=document.getElementById('histList');
const exportBtn=document.getElementById('exportBtn');
const importFile=document.getElementById('importFile');

let currentDate=localISO();
let currentView='workout';
let currentDayType=null; // strength|fatloss|volume
let draft=null; // {dayType, rows:[]}
let dirty=false;

// Timer runtime
let activeTimer=null; // {rowId, phase, remaining, setsLeft, walkSec, restSec, countdown, intervalId}

dateInput.value=currentDate;

function exById(id){return state.exercises.find(e=>e.id===id)||null;}
function activeExercises(){return state.exercises.filter(e=>!e.archived);}

function parseRange(targetStr){
  const t=(targetStr||'').toString().trim();
  const m=t.match(/^(\d+)\s*-\s*(\d+)$/);
  if(m) return {min:parseInt(m[1],10), max:parseInt(m[2],10), isRange:true};
  const n=t.match(/^(\d+)$/);
  if(n) return {min:parseInt(n[1],10), max:parseInt(n[1],10), isRange:false};
  return null;
}
function fmtDay(t){return t==='strength'?'Strength Day':t==='fatloss'?'Fat Loss Day':t==='volume'?'Volume Day':'Workout';}

function lastCompleted(){
  return state.lastCompleted; // {date, dayType}
}
function nextDayType(afterType){
  const idx=DAY_ORDER.indexOf(afterType||'strength');
  return idx>=0 ? DAY_ORDER[(idx+1)%DAY_ORDER.length] : 'strength';
}

function getPlannedTemplate(dayType){
  // Use live template if user has saved modifications; else default templates
  const live=state.templateLive?.[dayType];
  if(Array.isArray(live) && live.length) return live;
  return (state.templates?.[dayType]||[]).map(r=>({...r}));
}


function rebuildDraftFromDay(dayType){
  // Only affects current date's draft (does not change history until you SAVE)
  const tpl=getPlannedTemplate(dayType).map(r=>({...r, id:uid('row'), weight:(r.weight||''), pin:(r.pin||''), rir:'', keep:(r.keep!==false), rest:(r.rest||'60')}));
  currentDayType=dayType;
  draft={dayType:dayType, rows:tpl};
  dirty=false;
}

function ensureDraftFor(dateISO){
  // If there is an existing saved session for this date, draft from it.
  const saved=state.sessions?.[dateISO];
  if(saved && saved.rows && saved.rows.length){
    currentDayType=saved.dayType||currentDayType||'strength';
    draft=JSON.parse(JSON.stringify(saved));
    dirty=false;
    return;
  }
  // Otherwise, decide day type based on lastCompleted (rotation by last saved)
  const last=lastCompleted();
  const dt = last ? nextDayType(last.dayType) : 'strength';
  rebuildDraftFromDay(dt);
}

function setTopUI(){
  dayTitle.textContent=fmtDay(currentDayType);
  dayPill.textContent=currentDayType==='strength'?'Strength':currentDayType==='fatloss'?'Fat Loss':'Volume';
  dayHint.textContent="Auto-rotates after you SAVE. Draft changes won't count until saved.";
  if(daySelect){
    daySelect.value = currentDayType || "strength";
    const saved = state.sessions?.[currentDate];
    daySelect.disabled = !!(saved && saved.rows && saved.rows.length);
  }
  draftStatus.textContent = dirty ? "Draft (unsaved changes)" : "Draft (not saved)";
  note.textContent = "RIR uses 0/1/2: 2 = progress, 1 = hold, 0 = reduce. Save commits + progresses + rotates.";
}

function render(){
  tabs.forEach(b=>b.classList.toggle('active', b.dataset.tab===currentView));
  workoutCard.classList.toggle('hidden', currentView!=='workout');
  manageCard.classList.toggle('hidden', currentView!=='manage');
  historyCard.classList.toggle('hidden', currentView!=='history');
  if(currentView==='workout') renderWorkout();
  if(currentView==='manage') renderManage();
  if(currentView==='history') renderHistory();
}

function renderWorkout(){
  setTopUI();
  tbody.innerHTML='';
  (draft?.rows||[]).forEach(r=>tbody.appendChild(renderRow(r)));
}

function markDirty(){
  dirty=true;
  draftStatus.textContent="Draft (unsaved changes)";
}

function renderRow(r){
  const tr=document.createElement('tr');

  // Exercise select
  const td1=document.createElement('td');
  const sel=document.createElement('select'); sel.className='input';
  const o0=document.createElement('option'); o0.value=''; o0.textContent='Select…'; sel.appendChild(o0);
  const opts=[...activeExercises()];
  const rowEx=exById(r.exId);
  if(rowEx && rowEx.archived && !opts.find(x=>x.id===rowEx.id)) opts.unshift(rowEx);
  opts.forEach(ex=>{const o=document.createElement('option'); o.value=ex.id; o.textContent=ex.archived?`${ex.name} (archived)`:ex.name; sel.appendChild(o);});
  sel.value=r.exId||'';
  sel.onchange=()=>{r.exId=sel.value; markDirty(); renderWorkout();};
  td1.appendChild(sel);

  // Sets
  const td2=document.createElement('td');
  const sets=document.createElement('input'); sets.className='input'; sets.inputMode='numeric'; sets.value=r.sets??'';
  sets.oninput=()=>{r.sets=sets.value; markDirty();};
  td2.appendChild(sets);

  // Target
  const td3=document.createElement('td');
  const tgt=document.createElement('input'); tgt.className='input'; tgt.value=r.target??'';
  tgt.oninput=()=>{r.target=tgt.value; markDirty();};
  td3.appendChild(tgt);

  // Weight
  const td4=document.createElement('td');
  const w=document.createElement('input'); w.className='input'; w.inputMode='decimal';
  const ex=exById(r.exId);
  w.placeholder=ex?.type==='time'?'kg (optional)':'kg';
  w.value=r.weight??'';
  w.oninput=()=>{r.weight=w.value; markDirty();};
  td4.appendChild(w);

  // Pin
  const td5=document.createElement('td');
  const pin=document.createElement('input'); pin.className='input'; pin.inputMode='numeric';
  pin.placeholder='Pin';
  pin.value=r.pin??'';
  pin.oninput=()=>{r.pin=pin.value; markDirty();};
  td5.appendChild(pin);

  // RIR (0/1/2)
  const td6=document.createElement('td');
  const done=document.createElement('select');
  done.className='rirSelect';
  done.innerHTML = `
    <option value="">RIR</option>
    <option value="2">2</option>
    <option value="1">1</option>
    <option value="0">0</option>
  `;
  done.value=(r.rir??'').toString().trim();
  done.onchange=()=>{r.rir=done.value; markDirty();};
  td6.appendChild(done);

  // Keep toggle
  const tdKeep=document.createElement('td');
  const chk=document.createElement('input'); chk.type='checkbox'; chk.className='keepChk';
  chk.checked = (r.keep!==false);
  chk.onchange=()=>{r.keep=chk.checked; markDirty();};
  tdKeep.appendChild(chk);

  // Timer cell (only for time exercises)
tr.appendChild(tdRemove);
  return tr;
}

function addRow(){
  draft.rows.push({id:uid('row'),exId:'',sets:'2',target:'',weight:'',pin:'',rir:'',keep:true,rest:'60'});
  markDirty(); renderWorkout();
}

function bumpKgStr(w, dir){
  const x=parseFloat((w||'').toString().replace(',','.'));
  if(!isFinite(x)) return w;
  const y = x + dir*INC_KG;
  return (Math.round(y*10)/10).toString();
}
function bumpPinStr(p, dir){
  const x=parseInt((p||'').toString(),10);
  if(!isFinite(x)) return p;
  return String(x + dir*PIN_INC);
}

function computeNextFromRow(dayType, row){
  // Use only RIR 0/1/2. If empty RIR -> no progression.
  const rir = parseInt((row.rir||'').toString(),10);
  const ex = exById(row.exId);
  const out = {...row};

  if(!(rir===0||rir===1||rir===2)) return out;

  // Time exercises: progress target seconds based on RIR (2:+5,1:hold,0:-5)
  if(ex?.type==='time'){
    const t=parseInt((row.target||'').toString(),10);
    if(isFinite(t)){
      if(rir===2) out.target=String(t+5);
      if(rir===0) out.target=String(Math.max(5, t-5));
    }
    // optional weight progression if user entered weight numeric
    if(row.weight && isFinite(parseFloat(row.weight))){
      if(rir===2) out.weight=bumpKgStr(row.weight, +1);
      if(rir===0) out.weight=bumpKgStr(row.weight, -1);
    }
    return out;
  }

  // If pin entered -> pin progression
  const hasPin = (row.pin||'').toString().trim()!=='';
  if(hasPin){
    if(rir===2) out.pin=bumpPinStr(row.pin, +1);
    if(rir===0) out.pin=bumpPinStr(row.pin, -1);
    return out;
  }

  // Weight-based
  const hasW = (row.weight||'').toString().trim()!=='';
  const wNum = parseFloat((row.weight||'').toString());
  if(hasW && isFinite(wNum)){
    if(rir===2) out.weight=bumpKgStr(row.weight, +1);
    if(rir===0) out.weight=bumpKgStr(row.weight, -1);
    return out;
  }

  // Range-based reps progression if no weight/pin? We'll still support targets like 8-10 with weight present usually.
  // If target is a range and weight is numeric, reps-first on volume/fatloss:
  const range=parseRange(row.target);
  if(range && isFinite(wNum) && (dayType==='volume' || dayType==='fatloss')){
    // we need a "current reps" value to increment; we assume current = range.min (planned)
    // We'll store planned reps in row.curReps if present; else use min.
    const cur = parseInt((row.curReps||range.min).toString(),10);
    let nextCur=cur;
    let nextW=row.weight;
    if(rir===2){
      if(cur < range.max){
        nextCur = cur+1;
      } else {
        nextW = bumpKgStr(row.weight, +1);
        nextCur = range.min;
      }
    }
    if(rir===0){
      nextW = bumpKgStr(row.weight, -1);
      nextCur = range.min;
    }
    out.curReps = String(nextCur);
    out.weight = nextW;
    return out;
  }

  return out;
}

function saveWorkout(){
  // 1) Filter rows: keep only rows with an exercise selected
  const cleaned = (draft.rows||[]).filter(r=> (r.exId||'').toString().trim()!=='');
  // 2) Build saved session rows exactly as entered (Actual)
  const savedRows = cleaned.map(r=>({...r}));
  // 3) Persist session for currentDate
  state.sessions[currentDate] = {dayType:draft.dayType, rows:savedRows};
  state.lastCompleted = {date: currentDate, dayType: draft.dayType};

  // 4) Update that dayType's template: include only keep==true rows, and set their "planned" values to the progressed next values
  const keepRows = savedRows.filter(r=>r.keep!==false);

  const progressed = keepRows.map(r=>{
    // compute next planned based on actual + rir
    const next = computeNextFromRow(draft.dayType, r);
    // clear rir for next planned
    next.rir='';
    // keep current sets/target etc already adjusted
    // ensure keep and rest retained
    return {...next, id: uid('row')};
  });

  state.templateLive[draft.dayType] = progressed.map(r=>({...r})); // store template rows
  // 5) Save state
  saveState(state);

  // 6) Rotate to next day type by lastCompleted
  const nxt = nextDayType(draft.dayType);
  // open next date (tomorrow) as draft of next day type (but rotation is by lastCompleted; date can be tomorrow if you go daily)
  // We'll set currentDate to next calendar day but user can change date.
  currentDate = addDays(currentDate, 1);
  dateInput.value = currentDate;
  // create draft for new date (it will pick based on lastCompleted -> nxt)
  ensureDraftFor(currentDate);
  dirty=false;
  stopTimer();
  render();
  note.textContent="Saved. Rotated to next day.";
}

function resetDraft(){
  if(!confirm('Reset draft for this date? (Does not delete saved history)')) return;
  stopTimer();
  // If there is a saved session on this date, load it; else rebuild from template/rotation
  ensureDraftFor(currentDate);
  dirty=false;
  render();
}

function openDate(iso){
  stopTimer();
  currentDate=iso;
  dateInput.value=currentDate;
  ensureDraftFor(currentDate);
  dirty=false;
  render();
}

// Timer helpers
function beep(freq=880, dur=0.12){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='sine'; o.frequency.value=freq;
    g.gain.value=0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{o.stop(); ctx.close();}, dur*1000);
  }catch(e){}
}
function vibrate(ms=200){ try{ if(navigator.vibrate) navigator.vibrate(ms);}catch(e){} }
function formatMMSS(s){
  const m = Math.floor(s/60);
  const r = s%60;
  return m>0 ? `${m}:${String(r).padStart(2,'0')}` : `${r}s`;
}
function stopTimer(){
  if(!activeTimer) return;
  clearInterval(activeTimer.intervalId);
  activeTimer=null;
}
function startTimerForRow(r){
  const ex = exById(r.exId);
  if(ex?.type!=='time') return;
  if(ex?.name==="Farmer's Walk") return;


  const walkSec = parseInt((r.target||'').toString(),10);
  const sets = parseInt((r.sets||'').toString(),10);
  const restSec = parseInt((r.rest||'60').toString(),10);

  if(!isFinite(walkSec) || walkSec<=0){ alert('Enter walk time in Target (seconds).'); return; }
  if(!isFinite(sets) || sets<=0){ alert('Enter sets.'); return; }
  if(!isFinite(restSec) || restSec<0){ alert('Enter rest seconds.'); return; }

  stopTimer();

  activeTimer = {
    rowId: r.id,
    phase: 'countdown',
    remaining: 3,
    setsLeft: sets,
    walkSec, restSec,
    intervalId: null
  };

  beep(660,0.08);
  vibrate(60);

  activeTimer.intervalId = setInterval(()=>{
    if(!activeTimer) return;
    activeTimer.remaining -= 1;

    if(activeTimer.phase==='countdown'){
      if(activeTimer.remaining<=0){
        activeTimer.phase='walk';
        activeTimer.remaining=activeTimer.walkSec;
        beep(880,0.12); vibrate(120);
      }else{
        beep(520,0.05);
      }
      renderWorkout();
      return;
    }

    if(activeTimer.phase==='walk'){
      if(activeTimer.remaining<=0){
        beep(440,0.14); vibrate(200);
        activeTimer.setsLeft -= 1;
        if(activeTimer.setsLeft<=0){
          stopTimer();
          alert("Farmer's Walk complete.");
          renderWorkout();
          return;
        }
        // start rest
        activeTimer.phase='rest';
        activeTimer.remaining=activeTimer.restSec;
      }
      renderWorkout();
      return;
    }

    if(activeTimer.phase==='rest'){
      if(activeTimer.remaining<=0){
        // next set countdown
        beep(880,0.12); vibrate(140);
        activeTimer.phase='countdown';
        activeTimer.remaining=3;
      }
      renderWorkout();
      return;
    }
  }, 1000);

  renderWorkout();
}

// Tabs
tabs.forEach(b=>b.onclick=()=>{
  const next=b.dataset.tab;
  currentView=next;
  render();
});

// Nav
prevDay.onclick=()=>openDate(addDays(currentDate,-1));
nextDay.onclick=()=>openDate(addDays(currentDate,1));
todayBtn.onclick=()=>openDate(localISO());
dateInput.onchange=()=>openDate(dateInput.value||localISO());

// Day picker (manual override for today's training day)
if(daySelect){
  daySelect.onchange=()=>{
    const saved=state.sessions?.[currentDate];
    if(saved && saved.rows && saved.rows.length){
      // can't change a saved day
      daySelect.value = saved.dayType || currentDayType || 'strength';
      return;
    }
    stopTimer();
    rebuildDraftFromDay(daySelect.value);
    render();
  };
}


// Workout buttons
addRowBtn.onclick=addRow;
saveBtn.onclick=saveWorkout;
resetDraftBtn.onclick=resetDraft;

// Manage
function renderManage(){
  exList.innerHTML='';
  const sorted=state.exercises.slice().sort((a,b)=> (a.archived===b.archived)?a.name.localeCompare(b.name):(a.archived?1:-1));
  sorted.forEach(ex=>{
    const div=document.createElement('div'); div.className='item';
    const name=document.createElement('div'); name.style.fontWeight='800'; name.textContent=ex.name;
    const t=document.createElement('div'); t.className='pill'; t.textContent=ex.type==='time'?'Time (sec)':'Reps+Weight';
    const st=document.createElement('div'); st.className='pill'; st.textContent=ex.archived?'Archived':'Active';

    const rename=document.createElement('button'); rename.className='btn'; rename.textContent='Rename';
    rename.onclick=()=>{const n=prompt('Rename exercise', ex.name); if(!n) return; ex.name=n.trim(); saveState(state); renderManage();};

    const toggle=document.createElement('button'); toggle.className='btn'; toggle.textContent=ex.type==='time'?'Set to Reps':'Set to Time';
    toggle.onclick=()=>{ex.type=ex.type==='time'?'reps':'time'; saveState(state); renderManage();};

    const arch=document.createElement('button'); arch.className='btn danger'; arch.textContent=ex.archived?'Restore':'Archive';
    arch.onclick=()=>{ex.archived=!ex.archived; saveState(state); renderManage();};

    div.appendChild(name);div.appendChild(t);div.appendChild(st);div.appendChild(rename);div.appendChild(toggle);div.appendChild(arch);
    exList.appendChild(div);
  });
}
addExBtn.onclick=()=>{
  const n=(newName.value||'').trim(); if(!n) return;
  state.exercises.push({id:uid('ex'),name:n,type:newType.value,archived:false});
  newName.value='';
  saveState(state);
  renderManage();
};

// History
function renderHistory(){
  const days=parseInt(rangeSel.value,10);
  const cutoff=addDays(localISO(),-days);
  const q=(search.value||'').trim().toLowerCase();
  const entries=Object.entries(state.sessions||{}).filter(([iso,s])=> iso>=cutoff && s?.rows?.length).sort((a,b)=>a[0]<b[0]?1:-1);
  histList.innerHTML='';
  entries.forEach(([iso,sess])=>{
    const rows=sess.rows.filter(r=>{const ex=exById(r.exId); if(!ex) return false; if(!q) return true; return ex.name.toLowerCase().includes(q);});
    if(!rows.length) return;
    const card=document.createElement('div'); card.className='hcard';
    card.innerHTML=`<div class="hhead" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
      <div><strong>${iso}</strong> <span class="pill">${sess.dayType||'day'}</span></div>
      <button class="xbtn" title="Delete this day" aria-label="Delete">✕</button>
    </div>`;
    const delBtn=card.querySelector('.xbtn');
    delBtn.onclick=(ev)=>{
      ev.stopPropagation();
      if(!confirm(`Delete ${iso}?`)) return;
      delete state.sessions[iso];
      saveState(state);
      renderHistory();
    };
    card.onclick=()=>{ currentView='workout'; openDate(iso); };
    const list=document.createElement('div'); list.style.marginTop='8px'; list.style.display='grid'; list.style.gap='6px';
    rows.forEach(r=>{
      const ex=exById(r.exId);
      const line=document.createElement('div'); line.className='muted small';
      if(ex?.type==='time') line.textContent=`${ex.name}: ${r.sets} sets • ${r.target||''}s • rest ${r.rest||''}s • RIR ${r.rir||''}`;
      else line.textContent=`${ex.name}: ${r.sets}×${r.target||''} @ ${r.weight||''}kg pin ${r.pin||''} • RIR ${r.rir||''}`;
      list.appendChild(line);
    });
    card.appendChild(list);
    histList.appendChild(card);
  });
}
rangeSel.onchange=renderHistory; search.oninput=renderHistory;

// Backup
exportBtn.onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`workout_backup_${localISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
importFile.onchange=async()=>{
  const f=importFile.files?.[0]; if(!f) return;
  try{
    const text=await f.text();
    const incoming=JSON.parse(text);
    if(!incoming?.exercises || !incoming?.sessions){
      alert('Backup not recognized.');
      return;
    }
    if(!confirm('Import backup? This replaces your data on this device.')) return;
    state=incoming;
    saveState(state);
    alert('Imported.');
    stopTimer();
    openDate(localISO());
  }catch(e){
    alert('Import failed.');
  }finally{ importFile.value=''; }
};

// Service worker
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}

// Init
ensureDraftFor(currentDate);
render();
