'use strict';

/* ══════════════════════════════════════════════════════
   MediTrack – app.js  (Animated Premium Version)
   Real-time clock, animated canvas, popups, toast alerts
   ══════════════════════════════════════════════════════ */

const STORAGE_KEY     = 'meditrack_v3';
const LOW_STOCK_LIMIT = 5;
const MISSED_WINDOW   = 60;

/* ── Helpers ──────────────────────────────────────── */
const $$  = id => document.getElementById(id);
const qs  = s  => document.querySelector(s);
const qsa = s  => document.querySelectorAll(s);

function todayISO() { return new Date().toISOString().slice(0,10); }
function dateAfter(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

/* ══════════════════════════════════════════════════════
   SAMPLE DATA
   ══════════════════════════════════════════════════════ */
const SAMPLES = [
  { id:1, name:'Paracetamol 500mg', dosage:'1 tablet',   stock:20, maxStock:30, startDate:todayISO(), endDate:dateAfter(30), schedule:['08:00','14:00','21:00'], takenToday:[], takenLog:[], lastReset:'', notes:'Take after meals. For fever / pain relief.' },
  { id:2, name:'Amoxicillin 250mg', dosage:'1 capsule',  stock:14, maxStock:14, startDate:todayISO(), endDate:dateAfter(7),  schedule:['09:00','21:00'],          takenToday:[], takenLog:[], lastReset:'', notes:'Complete the full antibiotic course.' },
  { id:3, name:'Metformin 500mg',   dosage:'1 tablet',   stock:4,  maxStock:60, startDate:todayISO(), endDate:dateAfter(30), schedule:['08:30','20:30'],          takenToday:[], takenLog:[], lastReset:'', notes:'Take with food to reduce stomach upset.' },
  { id:4, name:'Vitamin D3 1000IU', dosage:'1 tablet',   stock:30, maxStock:30, startDate:todayISO(), endDate:dateAfter(30), schedule:['09:00'],                  takenToday:[], takenLog:[], lastReset:'', notes:'Best absorbed with a meal containing fat.' },
  { id:5, name:'Cetirizine 10mg',   dosage:'1 tablet',   stock:3,  maxStock:15, startDate:todayISO(), endDate:dateAfter(5),  schedule:['22:00'],                  takenToday:[], takenLog:[], lastReset:'', notes:'Take at bedtime. May cause drowsiness.' }
];

/* ══════════════════════════════════════════════════════
   DATABASE
   ══════════════════════════════════════════════════════ */
let db = { medicines:[], nextId:6 };

function loadDB(){
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    db = r ? JSON.parse(r) : { medicines:JSON.parse(JSON.stringify(SAMPLES)), nextId:6 };
  } catch { db = { medicines:JSON.parse(JSON.stringify(SAMPLES)), nextId:6 }; }
}
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

function resetDaily(med){
  const t = todayISO();
  if(med.lastReset !== t){ med.takenToday=[]; med.lastReset=t; }
}
function allMeds(){ db.medicines.forEach(resetDaily); return db.medicines; }
function isActive(m){ const t=todayISO(); return m.startDate<=t && t<=m.endDate; }

/* ── Dose status ──────────────────────────────────── */
function doseStatus(med, slot){
  if(med.takenToday.includes(slot)) return 'taken';
  const now=new Date(), [hh,mm]=slot.split(':').map(Number);
  const st=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hh,mm);
  const diff=(now-st)/60000;
  if(diff>MISSED_WINDOW) return 'missed';
  if(diff>=0) return 'due';
  return 'upcoming';
}
function statusIcon(s){ return {taken:'✔',missed:'✘',due:'⏰',upcoming:'🕐'}[s]||'?'; }
function statusClass(s){ return {taken:'pill-green',missed:'pill-red',due:'pill-yellow',upcoming:'pill-purple'}[s]||''; }
function slotClass(s){ return {taken:'taken',missed:'missed',due:'due',upcoming:'upcoming'}[s]||''; }

function getAlerts(){
  const missed=[],due=[],upcoming=[],lowStock=[];
  allMeds().forEach(med=>{
    if(!isActive(med)) return;
    med.schedule.forEach(slot=>{
      const st=doseStatus(med,slot), now=new Date();
      if(st==='missed')   missed.push({med,slot});
      if(st==='due')      due.push({med,slot});
      if(st==='upcoming'){
        const [hh,mm]=slot.split(':').map(Number);
        const slotDT=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hh,mm);
        const minsAway=Math.round((slotDT-now)/60000);
        if(minsAway<=120) upcoming.push({med,slot,minsAway});
      }
    });
    if(med.stock<=LOW_STOCK_LIMIT) lowStock.push(med);
  });
  return {missed,due,upcoming,lowStock};
}

/* ══════════════════════════════════════════════════════
   ANIMATED CANVAS BACKGROUND  (floating particles)
   ══════════════════════════════════════════════════════ */
function initCanvas(){
  const canvas=$$('bgCanvas');
  const ctx=canvas.getContext('2d');
  let W=0,H=0,particles=[];

  function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
  resize();
  window.addEventListener('resize',resize);

  class Particle{
    constructor(){this.reset(true)}
    reset(rand){
      this.x  = Math.random()*W;
      this.y  = rand ? Math.random()*H : H+10;
      this.r  = Math.random()*2+.5;
      this.vx = (Math.random()-.5)*.4;
      this.vy = -(Math.random()*.6+.2);
      this.alpha = Math.random()*.5+.1;
      this.color = [`rgba(124,111,239,${this.alpha})`,`rgba(56,189,248,${this.alpha})`,`rgba(34,211,160,${this.alpha})`][Math.floor(Math.random()*3)];
    }
    update(){
      this.x+=this.vx; this.y+=this.vy;
      if(this.y<-10||this.x<-10||this.x>W+10) this.reset(false);
    }
    draw(){
      ctx.beginPath();
      ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      ctx.fillStyle=this.color;
      ctx.fill();
    }
  }

  for(let i=0;i<90;i++) particles.push(new Particle());

  function loop(){
    ctx.clearRect(0,0,W,H);
    // Draw connecting lines
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<120){
          ctx.beginPath();
          ctx.strokeStyle=`rgba(124,111,239,${.08*(1-dist/120)})`;
          ctx.lineWidth=.5;
          ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.stroke();
        }
      }
    }
    particles.forEach(p=>{ p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }
  loop();
}

/* ══════════════════════════════════════════════════════
   REAL-TIME CLOCK
   ══════════════════════════════════════════════════════ */
function initClock(){
  function tick(){
    const now=new Date();
    const time=now.toLocaleTimeString('en-IN',{hour12:false});
    const date=now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const shortDate=now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    const topTime=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false});

    // Sidebar clock
    $$('sideTime').textContent = time;
    $$('sideDate').textContent = date;
    // Topbar
    $$('topClock').textContent = topTime;
    $$('topDate').textContent  = shortDate;

    // Greeting
    const h=now.getHours();
    $$('greeting').textContent = h<12?'Morning':h<17?'Afternoon':h<20?'Evening':'Night';
  }
  tick();
  setInterval(tick,1000);
}

/* ══════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════ */
function showToast(msg, type='success'){
  const wrap=$$('toastWrap');
  const div=document.createElement('div');
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  div.className=`toast-item ${type}`;
  div.innerHTML=`<span>${icons[type]||'💬'}</span><span>${msg}</span>`;
  wrap.prepend(div);
  setTimeout(()=>{ div.classList.add('out'); setTimeout(()=>div.remove(),350); }, 3200);
}

/* ══════════════════════════════════════════════════════
   DOSE ALERT POPUP
   ══════════════════════════════════════════════════════ */
function showDosePopup(text){
  $$('dosePopupText').innerHTML=text;
  $$('dosePopup').classList.add('open');
}
function closeDosePopup(){ $$('dosePopup').classList.remove('open'); }

/* ══════════════════════════════════════════════════════
   ROUTING
   ══════════════════════════════════════════════════════ */
const PAGE_META={
  dashboard:{ title:'Dashboard',         emoji:'🏠' },
  medicines:{ title:'My Medicines',      emoji:'📋' },
  schedule: { title:"Today's Schedule",  emoji:'📅' },
  alerts:   { title:'Alerts',            emoji:'🔔' },
  history:  { title:'Dose History',      emoji:'📜' },
  add:      { title:'Add Medicine',      emoji:'➕' },
};

function goPage(id){
  qsa('.page').forEach(p=>p.classList.remove('active'));
  qsa('.nav-link').forEach(l=>l.classList.remove('active'));
  const pg=$$('page-'+id); if(pg) pg.classList.add('active');
  const lk=qs(`[data-page="${id}"]`); if(lk) lk.classList.add('active');
  const meta=PAGE_META[id]||{title:id,emoji:'📄'};
  $$('pageTitleText').textContent=meta.title;
  $$('pageTitle').querySelector('.title-emoji').textContent=meta.emoji;
  $$('sidebar').classList.remove('open');
  renderPage(id);
}

function renderPage(id){
  switch(id){
    case 'dashboard': renderDashboard(); break;
    case 'medicines': renderMedicines(); break;
    case 'schedule':  renderSchedule();  break;
    case 'alerts':    renderAlerts();    break;
    case 'history':   renderHistory();   break;
    case 'add':       resetForm();       break;
  }
}

/* ══════════════════════════════════════════════════════
   COUNT-UP ANIMATION
   ══════════════════════════════════════════════════════ */
function countUp(el, target, duration=600){
  if(!el) return;
  const start=parseInt(el.textContent)||0;
  if(start===target) return;
  const step=(target-start)/(duration/16);
  let cur=start;
  const timer=setInterval(()=>{
    cur+=step;
    if((step>0&&cur>=target)||(step<0&&cur<=target)){ cur=target; clearInterval(timer); }
    el.textContent=Math.round(cur);
  },16);
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════ */
let chartA=null, chartS=null;

function renderDashboard(){
  const meds=allMeds(), alerts=getAlerts();
  let taken=0;
  meds.forEach(m=>{ if(isActive(m)) taken+=m.takenToday.length; });

  countUp($$('statTotal'),    meds.length);
  countUp($$('statTaken'),    taken);
  countUp($$('statMissed'),   alerts.missed.length);
  countUp($$('statLowStock'), alerts.lowStock.length);

  // Badge
  const total=alerts.missed.length+alerts.due.length+alerts.lowStock.length;
  const badge=$$('alertBadge');
  badge.textContent=total;
  badge.classList.toggle('show',total>0);

  // Upcoming doses
  const all=[...alerts.due,...alerts.upcoming.slice(0,5)];
  const upEl=$$('upcomingList');
  upEl.innerHTML = all.length
    ? all.map(({med,slot,minsAway})=>{
        const st=doseStatus(med,slot);
        const lbl=st==='due'?'<span class="pill pill-yellow">⏰ Due Now</span>':`<span class="pill pill-purple">in ${minsAway}m</span>`;
        return `<div class="dose-row">
          <span class="dose-time">${slot}</span>
          <span class="dose-name">${med.name}</span>
          ${lbl}
          <button class="btn btn-green btn-sm" onclick="openMarkModal(${med.id})">Take</button>
        </div>`;
      }).join('')
    : '<p class="empty-msg">🎉 All doses are up to date!</p>';

  // Low stock
  const lsEl=$$('lowStockList');
  lsEl.innerHTML = alerts.lowStock.length
    ? alerts.lowStock.map(m=>`
        <div class="dose-row">
          <span class="dose-name">${m.name}</span>
          <span class="pill pill-orange">Only ${m.stock} left</span>
          <button class="btn btn-orange btn-sm" onclick="openStockModal(${m.id})">Refill</button>
        </div>`).join('')
    : '<p class="empty-msg">✔ All stocks sufficient!</p>';

  renderAdherenceChart(meds, alerts);
  renderStockChart(meds);
}

function renderAdherenceChart(meds, alerts){
  const ctx=$$('chartAdherence').getContext('2d');
  let taken=0,missed=0,upcoming=0;
  meds.forEach(m=>{
    if(!isActive(m)) return;
    m.schedule.forEach(slot=>{
      const st=doseStatus(m,slot);
      if(st==='taken') taken++;
      else if(st==='missed') missed++;
      else upcoming++;
    });
  });
  if(chartA) chartA.destroy();
  chartA=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:['Taken','Missed','Pending'],
      datasets:[{data:[taken,missed,upcoming],backgroundColor:['#22d3a0','#f43f5e','#7c6fef'],borderWidth:0,borderRadius:4}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#94a3b8',font:{size:12},boxWidth:12,padding:16 } } },
      cutout:'70%',
      animation:{ animateRotate:true, duration:800 }
    }
  });
}

function renderStockChart(meds){
  const ctx=$$('chartStock').getContext('2d');
  if(chartS) chartS.destroy();
  chartS=new Chart(ctx,{
    type:'bar',
    data:{
      labels:meds.map(m=>m.name.split(' ')[0]),
      datasets:[{
        label:'Stock',
        data:meds.map(m=>m.stock),
        backgroundColor:meds.map(m=>m.stock<=LOW_STOCK_LIMIT?'rgba(251,146,60,.7)':'rgba(124,111,239,.7)'),
        borderColor:meds.map(m=>m.stock<=LOW_STOCK_LIMIT?'#fb923c':'#7c6fef'),
        borderWidth:1,borderRadius:6,borderSkipped:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      animation:{ duration:800 },
      scales:{
        x:{ ticks:{color:'#64748b',font:{size:10}}, grid:{color:'rgba(255,255,255,.04)'} },
        y:{ ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,.04)'},beginAtZero:true }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════
   MEDICINES
   ══════════════════════════════════════════════════════ */
function renderMedicines(filter=''){
  const grid=$$('medicineCards');
  const meds=allMeds().filter(m=>m.name.toLowerCase().includes(filter.toLowerCase()));
  grid.innerHTML = meds.length ? meds.map(medCard).join('') : '<p class="empty-msg" style="padding:20px">No medicines found.</p>';
}

function medCard(med){
  const low=med.stock<=LOW_STOCK_LIMIT;
  const max=med.maxStock||30;
  const pct=Math.min(100,Math.round(med.stock/max*100));
  const barCls=med.stock===0?'pf-empty':low?'pf-low':'pf-ok';
  const slots=med.schedule.map(slot=>{
    const st=doseStatus(med,slot);
    return `<span class="slot-chip ${slotClass(st)}">${statusIcon(st)} ${slot}</span>`;
  }).join('');
  return `
  <div class="med-card ${low?'low-stock':''}" id="card-${med.id}">
    <div class="med-card-name">💊 ${med.name}</div>
    <div class="med-card-id">ID: ${med.id} · ${isActive(med)?'<span style="color:var(--green)">Active</span>':'<span style="color:var(--red)">Inactive</span>'}</div>
    ${med.notes?`<div class="med-notes">${med.notes}</div>`:''}
    <div class="med-meta">
      <span>Dosage<strong>${med.dosage}</strong></span>
      <span>Period<strong style="font-size:.75rem">${med.startDate} → ${med.endDate}</strong></span>
    </div>
    <div class="med-slots">${slots}</div>
    <div class="stock-label"><span>Stock</span><span>${low?`<span class="pill pill-orange">⚠ ${med.stock} units</span>`:`<strong>${med.stock}</strong> units`}</span></div>
    <div class="progress"><div class="progress-fill ${barCls}" style="width:${pct}%"></div></div>
    <div class="med-actions">
      <button class="btn btn-green btn-sm" onclick="openMarkModal(${med.id})">✔ Take Dose</button>
      <button class="btn btn-orange btn-sm" onclick="openStockModal(${med.id})">📦 Refill</button>
      <button class="btn btn-secondary btn-sm" onclick="editMedicine(${med.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete(${med.id})">🗑️</button>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════
   SCHEDULE
   ══════════════════════════════════════════════════════ */
function renderSchedule(){
  const d=new Date();
  $$('scheduleDate').textContent=d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const rows=[];
  allMeds().forEach(med=>{
    if(!isActive(med)) return;
    med.schedule.forEach(slot=>rows.push({med,slot,st:doseStatus(med,slot)}));
  });
  rows.sort((a,b)=>a.slot.localeCompare(b.slot));
  if(!rows.length){ $$('scheduleTable').innerHTML='<p class="empty-msg" style="padding:16px">No active medicines today.</p>'; return; }
  $$('scheduleTable').innerHTML=`
  <table class="data-table">
    <thead><tr><th>Time</th><th>Medicine</th><th>Dosage</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${rows.map(({med,slot,st})=>`
      <tr>
        <td><strong>${slot}</strong></td>
        <td>${med.name}</td>
        <td>${med.dosage}</td>
        <td><span class="pill ${statusClass(st)}">${statusIcon(st)} ${st.charAt(0).toUpperCase()+st.slice(1)}</span></td>
        <td>${st!=='taken'?`<button class="btn btn-green btn-sm" onclick="quickMark(${med.id},'${slot}')">Take</button>`:'—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

/* ══════════════════════════════════════════════════════
   ALERTS
   ══════════════════════════════════════════════════════ */
function renderAlerts(){
  const {missed,due,upcoming,lowStock}=getAlerts();
  const fill=(elId,items,fn)=>{ $$(elId).innerHTML=items.length?items.map(fn).join(''):'<p class="empty-msg">None. ✔</p>'; };

  fill('alertMissed',missed,({med,slot})=>
    `<div class="alert-item"><strong>${med.name}</strong><span>Scheduled at ${slot} — not taken</span></div>`);

  fill('alertDue',due,({med,slot})=>
    `<div class="alert-item"><strong>${med.name}</strong><span>Due since ${slot}</span>
     <button class="btn btn-green btn-sm" style="margin-top:7px" onclick="quickMark(${med.id},'${slot}')">Take Now</button></div>`);

  fill('alertUpcoming',upcoming,({med,slot,minsAway})=>
    `<div class="alert-item"><strong>${med.name}</strong><span>${slot} — in ${minsAway} minute(s)</span></div>`);

  fill('alertStock',lowStock,med=>
    `<div class="alert-item"><strong>${med.name}</strong><span>Only ${med.stock} unit(s) remaining</span>
     <button class="btn btn-orange btn-sm" style="margin-top:7px" onclick="openStockModal(${med.id})">Refill Stock</button></div>`);

  // Update badge
  const total=missed.length+due.length+lowStock.length;
  const badge=$$('alertBadge');
  badge.textContent=total;
  badge.classList.toggle('show',total>0);
}

/* ══════════════════════════════════════════════════════
   HISTORY
   ══════════════════════════════════════════════════════ */
function renderHistory(){
  const filter=$$('historyFilter');
  filter.innerHTML='<option value="">— All Medicines —</option>'+
    db.medicines.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  buildHistoryTable();
  filter.onchange=buildHistoryTable;
}

function buildHistoryTable(){
  const sel=$$('historyFilter').value;
  const rows=[];
  db.medicines.forEach(med=>{
    if(sel && String(med.id)!==sel) return;
    (med.takenLog||[]).forEach(e=>rows.push({...e,name:med.name,dosage:med.dosage}));
  });
  rows.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const tbody=$$('historyBody');
  tbody.innerHTML=rows.length
    ? rows.slice(0,100).map(r=>`<tr><td>${r.date}</td><td>${r.time}</td><td>${r.name}</td><td>${r.dosage}</td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No doses logged yet.</td></tr>';
}

/* ══════════════════════════════════════════════════════
   FORM – Add / Edit
   ══════════════════════════════════════════════════════ */
let currentSlots=[];

function resetForm(med=null){
  $$('formTitle').textContent    = med?'✏️ Edit Medicine':'➕ Add New Medicine';
  $$('formSubmitBtn').textContent= med?'💾 Update Medicine':'💾 Save Medicine';
  $$('editId').value  = med?med.id:'';
  $$('fName').value   = med?med.name:'';
  $$('fDosage').value = med?med.dosage:'';
  $$('fStart').value  = med?med.startDate:todayISO();
  $$('fEnd').value    = med?med.endDate:'';
  $$('fStock').value  = med?med.stock:'';
  $$('fNotes').value  = med?med.notes||'':'';
  currentSlots        = med?[...med.schedule]:[];
  renderTimeSlots();
  clearErrors();
}

function editMedicine(id){
  const med=db.medicines.find(m=>m.id===id);
  if(!med) return;
  resetForm(med);
  goPage('add');
}

function renderTimeSlots(){
  $$('timeSlots').innerHTML=currentSlots.map(t=>
    `<div class="time-chip">${t}<button type="button" onclick="removeTimeSlot('${t}')">✕</button></div>`
  ).join('');
}
function addTimeSlot(){
  const v=$$('newTimeInput').value;
  if(!v){ showToast('Enter a time first.','warning'); return; }
  if(currentSlots.includes(v)){ showToast(`${v} already added.`,'warning'); return; }
  currentSlots.push(v); currentSlots.sort(); renderTimeSlots();
  $$('newTimeInput').value=''; $$('errTime').textContent='';
}
function removeTimeSlot(t){ currentSlots=currentSlots.filter(s=>s!==t); renderTimeSlots(); }

function clearErrors(){
  ['errName','errDosage','errStart','errEnd','errStock','errTime']
    .forEach(id=>{ const el=$$(id); if(el) el.textContent=''; });
  qsa('.error').forEach(el=>el.classList.remove('error'));
}
function setError(fId,eId,msg){ const f=$$(fId),e=$$(eId); if(f) f.classList.add('error'); if(e) e.textContent=msg; }

function validateForm(){
  clearErrors(); let ok=true;
  const name=$$('fName').value.trim();
  const editId=$$('editId').value;
  if(!name||!/^[\w\s\-\.]+$/.test(name)){ setError('fName','errName','Enter a valid medicine name.'); ok=false; }
  else { const dup=db.medicines.find(m=>m.name.toLowerCase()===name.toLowerCase()&&String(m.id)!==editId); if(dup){ setError('fName','errName',`'${name}' already exists (ID ${dup.id}).`); ok=false; } }
  if(!$$('fDosage').value.trim()){ setError('fDosage','errDosage','Dosage is required.'); ok=false; }
  if(!$$('fStart').value){ setError('fStart','errStart','Start date is required.'); ok=false; }
  if(!$$('fEnd').value){ setError('fEnd','errEnd','End date is required.'); ok=false; }
  if($$('fStart').value && $$('fEnd').value && $$('fEnd').value<=$$('fStart').value){ setError('fEnd','errEnd','End date must be after start date.'); ok=false; }
  const s=parseInt($$('fStock').value,10); if(!$$('fStock').value||isNaN(s)||s<1){ setError('fStock','errStock','Stock must be a positive integer.'); ok=false; }
  if(currentSlots.length===0){ $$('errTime').textContent='Add at least one dose time.'; ok=false; }
  return ok;
}

$$('medForm').addEventListener('submit',e=>{
  e.preventDefault(); if(!validateForm()) return;
  const editId=$$('editId').value;
  const name=$$('fName').value.trim();
  const payload={
    name, dosage:$$('fDosage').value.trim(),
    stock:parseInt($$('fStock').value,10), startDate:$$('fStart').value,
    endDate:$$('fEnd').value, schedule:[...currentSlots], notes:$$('fNotes').value.trim()
  };
  if(editId){
    const idx=db.medicines.findIndex(m=>m.id===parseInt(editId));
    if(idx!==-1){
      const old=db.medicines[idx];
      db.medicines[idx]={...old,...payload,maxStock:Math.max(payload.stock,old.maxStock||payload.stock)};
      showToast(`'${name}' updated!`,'success');
    }
  } else {
    db.medicines.push({...payload,id:db.nextId++,maxStock:payload.stock,takenToday:[],takenLog:[],lastReset:''});
    showToast(`'${name}' added!`,'success');
  }
  saveDB(); goPage('medicines');
});

/* ══════════════════════════════════════════════════════
   MARK DOSE TAKEN
   ══════════════════════════════════════════════════════ */
function openMarkModal(id){
  const med=db.medicines.find(m=>m.id===id); if(!med) return;
  resetDaily(med);
  const pending=med.schedule.filter(s=>!med.takenToday.includes(s));
  const body=$$('markModalBody');
  if(!pending.length){
    body.innerHTML='<p style="color:var(--green)">✔ All doses for today already taken!</p>';
  } else {
    body.innerHTML=`
      <div style="margin-bottom:14px">
        <strong>${med.name}</strong><br>
        <span style="color:var(--muted);font-size:.82rem">Stock: <strong style="color:var(--text)">${med.stock}</strong> unit(s)</span>
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:10px">Select dose to mark as taken:</p>
      ${pending.map(slot=>{
        const st=doseStatus(med,slot);
        return `<div class="dose-row" style="cursor:pointer" onclick="markTaken(${id},'${slot}')">
          <span class="dose-time">${slot}</span>
          <span class="dose-name">${med.name}</span>
          <span class="pill ${statusClass(st)}">${statusIcon(st)} ${st}</span>
          <button class="btn btn-green btn-sm">Take</button>
        </div>`;
      }).join('')}`;
  }
  openModal('markModal');
}

function markTaken(id, slot){
  const med=db.medicines.find(m=>m.id===id); if(!med) return;
  if(med.stock<=0){ showToast(`No stock for ${med.name}! Refill first.`,'error'); return; }
  if(med.takenToday.includes(slot)){ showToast('Already taken!','warning'); return; }
  med.takenToday.push(slot);
  med.stock--;
  med.takenLog.push({date:todayISO(),time:slot});
  saveDB();
  const warn=med.stock<=LOW_STOCK_LIMIT?`\n⚠️ Only ${med.stock} units left — please refill!`:'';
  showToast(`✅ ${med.name} @ ${slot} — dose taken!\nStock: ${med.stock} units.${warn}`, med.stock<=LOW_STOCK_LIMIT?'warning':'success');
  closeModal('markModal');
  // If critically low, show popup
  if(med.stock<=2){
    showDosePopup(`⚠️ <strong>${med.name}</strong> has only <strong style="color:var(--orange)">${med.stock} unit(s)</strong> remaining!<br><br>Please refill your stock soon.`);
  }
  const activePg=qs('.page.active'); if(activePg) renderPage(activePg.id.replace('page-',''));
}

function quickMark(id,slot){ markTaken(id,slot); }

/* ══════════════════════════════════════════════════════
   UPDATE STOCK
   ══════════════════════════════════════════════════════ */
function openStockModal(id){
  const med=db.medicines.find(m=>m.id===id); if(!med) return;
  $$('stockModalBody').innerHTML=`
    <div style="margin-bottom:16px">
      <strong>${med.name}</strong><br>
      <span style="color:var(--muted);font-size:.82rem">Current stock: <strong style="color:var(--text)">${med.stock}</strong> unit(s)</span>
    </div>
    <div class="form-group">
      <label>Units to Add</label>
      <input type="number" id="stockAddVal" min="1" value="10" placeholder="e.g. 30"/>
      <span class="form-error" id="stockAddErr"></span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary pulse-btn" onclick="doUpdateStock(${id})">📦 Update Stock</button>
      <button class="btn btn-ghost" onclick="closeModal('stockModal')">Cancel</button>
    </div>`;
  openModal('stockModal');
}

function doUpdateStock(id){
  const med=db.medicines.find(m=>m.id===id);
  const val=parseInt($$('stockAddVal').value,10);
  if(!val||val<1){ $$('stockAddErr').textContent='Enter a positive number.'; return; }
  med.stock+=val;
  med.maxStock=Math.max(med.maxStock||0,med.stock);
  saveDB();
  showToast(`✅ Stock updated to ${med.stock} units for ${med.name}`,'success');
  closeModal('stockModal');
  const activePg=qs('.page.active'); if(activePg) renderPage(activePg.id.replace('page-',''));
}

/* ══════════════════════════════════════════════════════
   DELETE
   ══════════════════════════════════════════════════════ */
let _delTarget=null;

function confirmDelete(id){
  const med=db.medicines.find(m=>m.id===id); if(!med) return;
  _delTarget=id;
  $$('deleteMsg').textContent=`Are you sure you want to delete "${med.name}"? This cannot be undone.`;
  openModal('deleteModal');
}
$$('deleteConfirmBtn').addEventListener('click',()=>{
  if(_delTarget===null) return;
  const med=db.medicines.find(m=>m.id===_delTarget);
  db.medicines=db.medicines.filter(m=>m.id!==_delTarget);
  saveDB();
  showToast(`🗑️ '${med?.name}' deleted.`,'info');
  closeModal('deleteModal'); renderMedicines(); _delTarget=null;
});

/* ══════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════ */
function openModal(id)  { $$(id).classList.add('open'); }
function closeModal(id) { $$(id).classList.remove('open'); }
qsa('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); }));

/* ══════════════════════════════════════════════════════
   AUTO DOSE REMINDER POPUP (every minute check)
   ══════════════════════════════════════════════════════ */
function checkDoseReminders(){
  const {due}=getAlerts();
  if(due.length>0){
    const names=due.map(d=>`<strong>${d.med.name}</strong> @ ${d.slot}`).join('<br>');
    showDosePopup(`⏰ <strong>Time to take your medicine!</strong><br><br>${names}`);
  }
}

/* ══════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  loadDB();
  initCanvas();
  initClock();

  // Nav links
  qsa('.nav-link').forEach(l=>{
    l.addEventListener('click',e=>{ e.preventDefault(); goPage(l.dataset.page); });
  });

  // Hamburger
  $$('hamburger').addEventListener('click',()=>$$('sidebar').classList.toggle('open'));

  // Search
  $$('medSearchInput').addEventListener('input',e=>renderMedicines(e.target.value));

  // Form default date
  $$('fStart').value=todayISO();

  // Auto-refresh every 60 sec
  setInterval(()=>{
    const activePg=qs('.page.active');
    if(activePg){
      const id=activePg.id.replace('page-','');
      if(['dashboard','alerts','schedule','medicines'].includes(id)) renderPage(id);
    }
    // Update badge
    const {missed,due,lowStock}=getAlerts();
    const total=missed.length+due.length+lowStock.length;
    const badge=$$('alertBadge');
    badge.textContent=total; badge.classList.toggle('show',total>0);
  },60000);

  // Check dose reminder every 2 min
  setInterval(checkDoseReminders,120000);

  // Start
  goPage('dashboard');

  // Show welcome toast
  setTimeout(()=>{
    const {missed,lowStock}=getAlerts();
    if(missed.length>0) showToast(`⚠️ You have ${missed.length} missed dose(s) today!`,'warning');
    if(lowStock.length>0) showToast(`📦 ${lowStock.length} medicine(s) running low on stock!`,'warning');
  },1200);
});
