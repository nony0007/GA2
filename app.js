
// Simple runtime error display to help debug on GitHub Pages
window.onerror = function(msg, src, line, col, err){
  try{
    const el = document.getElementById('error') || (function(){
      const d=document.createElement('div'); d.id='error'; document.body.appendChild(d); return d;
    })();
    el.style.display='block';
    el.textContent = 'Error: ' + msg + ' (' + (src||'') + ':' + (line||'') + ')';
  }catch(e){}
};

// Preact + HTM binding (FIX): htm exposes `htm`, not `htmPreact`.
const html = htm.bind(preact.h);
const { h, render } = preact;
const { useState, useEffect, useMemo, useRef } = preactHooks;

const fmt = dateFns.format;

// Utilities
const uid = () => Math.random().toString(36).slice(2,10);
const todayISO = () => new Date().toISOString();
const load = (k, d) => { try{ const v = localStorage.getItem(k); return v? JSON.parse(v): d; } catch(e){ return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Simple store hooks
function useLocalState(key, initial){
  const [state, setState] = useState(() => load(key, initial));
  useEffect(()=>save(key, state), [key, state]);
  return [state, setState];
}

const DEFAULT_CHECKS = [
  { key: "walkaround", label: "Walkaround visual check" },
  { key: "fluids", label: "Fluids (fuel/coolant/hydraulic)" },
  { key: "leaks", label: "Leaks / hoses / fittings" },
  { key: "tyres", label: "Tyres / tracks condition & pressure" },
  { key: "brakes", label: "Brakes / steering" },
  { key: "lights", label: "Lights / beacons / horn / alarms" },
  { key: "controls", label: "Controls & safety devices" },
  { key: "seatbelt", label: "Seat belt / ROPS (if fitted)" },
  { key: "attachments", label: "Attachment ID & condition" },
  { key: "fireext", label: "Fire extinguisher present & in date" },
];

// QRCode helper -> returns DataURL
async function makeQR(text, size=512){
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const cell = Math.floor(size/qr.getModuleCount());
  const qrsize = cell * qr.getModuleCount();
  const canvas = document.createElement('canvas');
  canvas.width = qrsize; canvas.height = qrsize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,qrsize,qrsize);
  ctx.fillStyle = '#000';
  for(let r=0;r<qr.getModuleCount();r++){
    for(let c=0;c<qr.getModuleCount();c++){
      if(qr.isDark(r,c)) ctx.fillRect(c*cell, r*cell, cell, cell);
    }
  }
  return canvas.toDataURL('image/png');
}

function App(){
  const [role, setRole] = useLocalState("role", "worker");
  const [profile, setProfile] = useLocalState("profile", { name: "", company: "" });
  const [machines, setMachines] = useLocalState("machines", sampleMachines());
  const [ga2s, setGa2s] = useLocalState("ga2s", []);
  const [permits, setPermits] = useLocalState("permits", []);
  const [tab, setTab] = useLocalState("tab", "dashboard");
  const [scanResult, setScanResult] = useState("");

  const byId = useMemo(()=> Object.fromEntries(machines.map(m=>[m.id, m])), [machines]);

  return html`
    <div>
      ${TopBar({role, setRole, profile, setProfile})}
      <main class="container grid">
        ${NavTabs({active: tab, setActive: setTab, role})}
        ${tab === 'dashboard' && Dashboard({role, profile, machines, permits, ga2s})}
        ${tab === 'scan' && ScanAndGA2({profile, machines, setGa2s, scanResult, setScanResult})}
        ${tab === 'machines' && Machines({machines, setMachines})}
        ${tab === 'permits' && Permits({role, profile, machines, permits, setPermits})}
        ${tab === 'records' && Records({ga2s, machinesById: byId})}
        ${FooterNote()}
      </main>
    </div>
  `;
}

function TopBar({ role, setRole, profile, setProfile }){
  const [edit, setEdit] = useState(false);
  return html`
    <header>
      <div class="container" style="display:flex;align-items:center;gap:8px;">
        <div style="font-weight:600">Site Compliance — GA2 / GA1 & Permits</div>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <select class="select" value=${role} onChange=${e=>setRole(e.target.value)}>
            <option value="worker">Worker</option>
            <option value="office">Office (Admin)</option>
          </select>
          <button class="btn" onClick=${()=>setEdit(true)}>Profile</button>
        </div>
      </div>
      ${edit && html`
        <div style="border-top:1px solid var(--border);background:#fff">
          <div class="container grid grid-3" style="gap:8px;padding:12px">
            <input class="input" placeholder="Your full name" value=${profile.name} onInput=${e=>setProfile({...profile, name:e.target.value})} />
            <input class="input" placeholder="Company" value=${profile.company} onInput=${e=>setProfile({...profile, company:e.target.value})} />
            <div style="display:flex;gap:8px">
              <button class="btn" onClick=${()=>setEdit(false)}>Save</button>
              <button class="btn" onClick=${()=>setEdit(false)}>Close</button>
            </div>
          </div>
        </div>
      `}
    </header>
  `;
}

function NavTabs({active, setActive, role}){
  const tabs = [
    ["dashboard","Home"],
    ["scan","Scan & GA2"],
    ["machines","Machines"],
    ["permits","Permits"],
    ["records","Records"],
  ];
  return html`
    <nav class="container grid" style="grid-template-columns:repeat(5,1fr)">
      ${tabs.map(([k,label]) => html`
        <button class="btn ${active===k?'primary':''}" onClick=${()=>setActive(k)}>${label}</button>
      `)}
      ${role==='office' && html`<div class="small" style="grid-column:1/-1">Office role unlocks: machine registry, QR printing, permit approvals & records.</div>`}
    </nav>
  `;
}

function Dashboard({role, profile, machines, permits, ga2s}){
  const today = fmt(new Date(), "EEE, dd MMM yyyy");
  const pending = permits.filter(p=>p.status==='pending').length;
  const todayChecks = ga2s.filter(g => fmt(new Date(g.dateISO), 'yyyy-MM-dd') === fmt(new Date(), 'yyyy-MM-dd')).length;
  return html`
    <div class="grid grid-3">
      <div class="card">
        <div><span class="small">Signed in as</span><div style="font-weight:600">${profile.name||'—'} — ${profile.company||'—'}</div></div>
        <div class="small" style="margin-top:6px">Today: ${today}</div>
        <div class="small" style="margin-top:6px">Prototype stores data locally. Backend can be added later.</div>
      </div>
      <div class="card">
        <div><span class="small">GA2 checks recorded today</span><div style="font-weight:700;font-size:20px">${todayChecks}</div></div>
        <div class="small" style="margin-top:6px">Machines on register: ${machines.length}</div>
      </div>
      <div class="card">
        <div><span class="small">Work permits pending</span><div style="font-weight:700;font-size:20px">${pending}</div></div>
        <div class="small" style="margin-top:6px">Total permits: ${permits.length}</div>
      </div>
      ${role==='office' && Diagnostics({machines, ga2s})}
      <div class="card" style="grid-column:1/-1">
        <div style="margin-bottom:6px">Quick steps</div>
        <ol class="small" style="margin:0 0 0 18px">
          <li>Worker scans the machine QR and completes GA2. Name & company auto-fill from profile.</li>
          <li>Office can add machines, set GA1 dates, and print QR labels.</li>
          <li>Submit work permit requests in Permits; Office can approve/reject.</li>
        </ol>
      </div>
    </div>
  `;
}

function Diagnostics({machines, ga2s}){
  const [results, setResults] = useState([]);
  useEffect(()=>{
    (async()=>{
      const r = [];
      const ids = new Set(Array.from({length:200}, uid));
      r.push({name:"UID uniqueness (200)", pass: ids.size===200});
      try{ const url = await makeQR("TEST"); r.push({name:"QR encode", pass: typeof url==='string' && url.startsWith('data:image')}); }catch{ r.push({name:"QR encode", pass:false}); }
      const csv = ga2sToCSV(ga2s, Object.fromEntries(machines.map(m=>[m.id, m])));
      r.push({name:"CSV export non-empty", pass: !!csv && csv.length>0});
      r.push({name:"BarcodeDetector available", pass: 'BarcodeDetector' in window});
      setResults(r);
    })();
  }, [machines, ga2s]);
  return html`
    <div class="card" style="grid-column:1/-1">
      <div style="font-weight:600;margin-bottom:6px">Diagnostics (self-tests)</div>
      <ul class="small" style="margin:0;padding-left:16px">
        ${results.map(t => html`<li style="color:${t.pass?'#065f46':'#991b1b'}">${t.pass?'✔':'✖'} ${t.name}</li>`)}
      </ul>
    </div>
  `;
}

function ScanAndGA2({ profile, machines, setGa2s, scanResult, setScanResult }){
  const [selectedId, setSelectedId] = useState("");
  const [checks, setChecks] = useState(Object.fromEntries(DEFAULT_CHECKS.map(c=>[c.key,false])));
  const [notes, setNotes] = useState("");
  const [passed, setPassed] = useState(true);

  const [scanning, setScanning] = useState(false);
  const [scannerMsg, setScannerMsg] = useState("");
  const videoRef = useRef(null);
  const rafRef = useRef(0);

  const stopCamera = (ref=videoRef)=>{
    try{ if(rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = ref.current;
      if(v && v.srcObject){ v.srcObject.getTracks().forEach(t=>t.stop()); v.srcObject = null; }
    }catch(e){}
    setScanning(false);
  };
  useEffect(()=>()=>stopCamera(videoRef),[]);

  const startScan = async ()=>{
    if(!('BarcodeDetector' in window)){
      setScannerMsg('BarcodeDetector not supported. Use manual select below.');
      alert('Scanning not supported on this device/browser.');
      return;
    }
    try{
      setScannerMsg('Starting camera…');
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
      const video = videoRef.current; video.srcObject = stream; await video.play();
      const detector = new window.BarcodeDetector({ formats:['qr_code'] });
      setScanning(true); setScannerMsg('Point the camera at the QR label…');
      const loop = async ()=>{
        if(!scanning) return;
        try{
          const codes = await detector.detect(video);
          if(codes && codes.length){
            const val = codes[0].rawValue || '';
            if(val){ setScanResult(val); setSelectedId(val); setScannerMsg('QR detected. Stopping camera…'); stopCamera(videoRef); return; }
          }
        }catch(e){}
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }catch(e){
      console.warn(e); setScannerMsg('Could not access camera. Select below.');
      alert('Could not access camera. Select from the list.');
      setScanning(false);
    }
  };

  useEffect(()=>{ if(scanResult) setSelectedId(scanResult); }, [scanResult]);
  const m = machines.find(x=>x.id===selectedId);
  const toggle = k => setChecks(prev=>({...prev, [k]: !prev[k]}));
  const canSubmit = !!m && !!profile.name && !!profile.company;

  const submit = ()=>{
    if(!m) return alert('Select a machine first');
    if(!profile.name || !profile.company) return alert('Please set your Profile (name & company) from the top right');

    const entry = { id: uid(), machineId: m.id, dateISO: todayISO(), userName: profile.name, company: profile.company, checks, notes, pass: passed };
    setGa2s(prev=>[entry, ...prev]);
    setNotes(""); setChecks(Object.fromEntries(DEFAULT_CHECKS.map(c=>[c.key,false]))); setPassed(true);
    alert(`GA2 submitted as ${passed? 'PASS':'FAIL'}. Thank you.`);
  };

  return html`
    <div class="grid grid-2">
      <div class="card">
        <div style="margin-bottom:6px">Scan QR</div>
        <div style="background:#000;border-radius:12px;overflow:hidden;aspect-ratio:16/9">
          <video ref=${videoRef} muted playsinline style="width:100%;height:100%;object-fit:cover"></video>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" onClick=${startScan} disabled=${scanning}>${scanning?'Scanning…':'Start camera'}</button>
          <button class="btn" onClick=${()=>{ stopCamera(videoRef); setScanResult(""); setSelectedId(""); }}>Stop/Reset</button>
        </div>
        <div class="small" style="margin-top:6px;word-break:break-all">${scannerMsg || `Result: ${scanResult || '—'}`}</div>
      </div>

      <div class="card">
        <div style="margin-bottom:6px">GA2 — Daily Plant Check</div>
        <div class="grid">
          <label class="small">Select machine</label>
          <select class="select" value=${selectedId} onChange=${e=>setSelectedId(e.target.value)}>
            <option value="">— choose —</option>
            ${machines.map(m => html`<option value=${m.id}>${m.label} — ${m.type} (${m.reg||m.id})</option>`)}
          </select>

          ${m && html`
            <div class="small" style="margin-top:4px;padding:8px;border:1px solid var(--border);border-radius:12px;background:#f9fafb">
              <div><span class="small">Location:</span> ${m.location}</div>
              <div><span class="small">Owner company:</span> ${m.ownerCompany}</div>
              ${m.ga1 && m.ga1.validUntil && html`<div class="small">GA1 valid until: ${fmt(new Date(m.ga1.validUntil), 'dd MMM yyyy')}</div>`}
            </div>
          `}

          <div class="grid" style="margin-top:6px">
            ${DEFAULT_CHECKS.map(c => html`
              <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" checked=${!!checks[c.key]} onChange=${()=>toggle(c.key)} /> ${c.label}</label>
            `)}
          </div>

          <label class="small" style="margin-top:6px">Notes (defects / actions)</label>
          <textarea rows="3" class="" onInput=${e=>setNotes(e.target.value)} value=${notes} placeholder="e.g., beacon not working; reported to supervisor"></textarea>

          <label class="small" style="margin-top:6px">Pass / Fail</label>
          <div style="display:flex;gap:8px">
            <button class="btn ${passed?'primary':''}" onClick=${()=>setPassed(true)}>Pass</button>
            <button class="btn ${!passed?'primary':''}" onClick=${()=>setPassed(false)}>Fail</button>
          </div>

          <div class="small" style="margin-top:6px">
            Completed by: <b>${profile.name || '—'}</b> (${profile.company || '—'}) on ${fmt(new Date(), 'dd MMM yyyy, HH:mm')}
          </div>
          <button class="btn ${canSubmit?'primary':''}" disabled=${!canSubmit} onClick=${submit}>Submit GA2</button>
        </div>
      </div>
    </div>
  `;
}

function Machines({machines, setMachines}){
  const [form, setForm] = useState({ label:"", type:"", reg:"", location:"", ownerCompany:"" });
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [selected, setSelected] = useState(null);
  const [showQR, setShowQR] = useState(false);

  const add = ()=>{
    if(!form.label) return alert("Machine label is required");
    const id = uid();
    const m = { id, label: form.label, type: form.type, reg: form.reg, location: form.location, ownerCompany: form.ownerCompany, ga1: {}, createdAt: todayISO() };
    setMachines(prev=>[m, ...prev]);
    setForm({ label:"", type:"", reg:"", location:"", ownerCompany:"" });
  };
  const setGa1 = (mId, patch)=> setMachines(prev=>prev.map(m=> m.id===mId? {...m, ga1:{...(m.ga1||{}), ...patch}}: m));
  const remove = (mId)=> setMachines(prev=> prev.filter(m=> m.id!==mId));

  const genQR = async (m)=>{
    const url = await makeQR(m.id, 768);
    setQrDataUrl(url); setSelected(m); setShowQR(true);
  };
  const downloadQR = ()=>{
    const a = document.createElement('a');
    a.href = qrDataUrl; a.download = `${(selected?.label||'machine')}-QR.png`; a.click();
  };

  return html`
    <div class="grid grid-2">
      <div class="card">
        <div style="margin-bottom:6px">Register new machine</div>
        <div class="grid">
          <input class="input" placeholder="Label (e.g., MRT 2660 Telehandler)" value=${form.label} onInput=${e=>setForm({...form, label:e.target.value})} />
          <input class="input" placeholder="Type/Category (e.g., Telehandler)" value=${form.type} onInput=${e=>setForm({...form, type:e.target.value})} />
          <input class="input" placeholder="Reg / Asset No." value=${form.reg} onInput=${e=>setForm({...form, reg:e.target.value})} />
          <input class="input" placeholder="Location (e.g., Block B)" value=${form.location} onInput=${e=>setForm({...form, location:e.target.value})} />
          <input class="input" placeholder="Owner company" value=${form.ownerCompany} onInput=${e=>setForm({...form, ownerCompany:e.target.value})} />
          <button class="btn" onClick=${add}>Add machine</button>
        </div>
      </div>

      <div class="card">
        <div style="margin-bottom:6px">Registry & QR labels</div>
        <div class="grid" style="max-height:60vh;overflow:auto">
          ${machines.map(m => html`
            <div class="card" style="padding:10px">
              <div style="font-weight:600">${m.label}</div>
              <div class="small">${m.type} — ${m.reg || m.id} — ${m.location}</div>
              <div class="small">Owner: ${m.ownerCompany || '—'}</div>
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="btn" onClick=${()=>genQR(m)}>QR / Print</button>
                <button class="btn" onClick=${()=> setGa1(m.id, { certNo: prompt('GA1 cert number?') || (m.ga1 && m.ga1.certNo) }) }>Set GA1 No.</button>
                <button class="btn" onClick=${()=> setGa1(m.id, { validUntil: prompt('GA1 valid until (YYYY-MM-DD)?') || (m.ga1 && m.ga1.validUntil) }) }>Set GA1 Expiry</button>
                <button class="btn" onClick=${()=>remove(m.id)}>Remove</button>
              </div>
            </div>
          `)}
        </div>

        ${showQR && html`
          <div class="modal">
            <div class="panel">
              <div style="font-weight:600">${selected?.label}</div>
              <div class="small" style="margin-bottom:6px">${selected?.type} — ${selected?.reg || selected?.id}</div>
              ${qrDataUrl && html`<img src=${qrDataUrl} alt="QR" style="width:256px;height:256px;display:block;margin:0 auto" />`}
              <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
                <button class="btn" onClick=${()=>window.print()}>Print</button>
                <button class="btn" onClick=${downloadQR}>Download PNG</button>
                <button class="btn" onClick=${()=>setShowQR(false)}>Close</button>
              </div>
            </div>
          </div>
        `}
      </div>

      <div class="printable">
        ${selected && html`
          <div style="width:300px;height:380px;border:1px solid #000;padding:12px;display:flex;flex-direction:column;justify-content:space-between;align-items:center">
            <div style="text-align:center">
              <div style="font-size:12px;font-weight:600">MACHINE QR LABEL</div>
              <div class="small">${selected.label}</div>
              <div class="small">${selected.type} — ${selected.reg || selected.id}</div>
            </div>
            ${qrDataUrl && html`<img src=${qrDataUrl} style="width:240px;height:240px" />`}
            <div style="font-size:10px;text-align:center">Scan to open GA2 checklist for this plant.</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function Permits({ role, profile, machines, permits, setPermits }){
  const [form, setForm] = useState({ requesterName:"", company:"", machineId:"", location:"", workType:"", startISO:"", endISO:"", controls:"Barricade area; spotter; isolate power" });
  useEffect(()=> setForm(f=>({...f, requesterName: profile.name, company: profile.company })), [profile.name, profile.company]);

  const submit = ()=>{
    if(!form.requesterName || !form.company) return alert("Profile name & company required.");
    if(!form.workType) return alert("Describe the work.");
    const p = { id: uid(), ...form, status:'pending' };
    setPermits(prev=>[p, ...prev]);
    alert("Permit request submitted.");
    setForm(f=>({...f, machineId:"", location:"", workType:"", startISO:"", endISO:""}));
  };

  const decide = (id, status)=>{
    const decidedBy = profile.name || 'Office';
    setPermits(prev=> prev.map(p => p.id===id ? {...p, status, decidedBy, decidedAt: todayISO()} : p));
  };

  return html`
    <div class="grid grid-2">
      <div class="card">
        <div style="margin-bottom:6px">Request work permit</div>
        <div class="grid">
          <input class="input" placeholder="Requester name" value=${form.requesterName} onInput=${e=>setForm({...form, requesterName:e.target.value})} />
          <input class="input" placeholder="Company" value=${form.company} onInput=${e=>setForm({...form, company:e.target.value})} />
          <label class="small">Related machine (optional)</label>
          <select class="select" value=${form.machineId} onChange=${e=>setForm({...form, machineId:e.target.value})}>
            <option value="">— none —</option>
            ${machines.map(m => html`<option value=${m.id}>${m.label}</option>`)}
          </select>
          <input class="input" placeholder="Work location (e.g., Core B, L3)" value=${form.location} onInput=${e=>setForm({...form, location:e.target.value})} />
          <input class="input" placeholder="Work type / description" value=${form.workType} onInput=${e=>setForm({...form, workType:e.target.value})} />
          <div class="grid grid-2">
            <input type="datetime-local" class="input" value=${form.startISO} onInput=${e=>setForm({...form, startISO:e.target.value})} />
            <input type="datetime-local" class="input" value=${form.endISO} onInput=${e=>setForm({...form, endISO:e.target.value})} />
          </div>
          <label class="small">Controls / safety measures</label>
          <textarea rows="3" class="input" value=${form.controls} onInput=${e=>setForm({...form, controls:e.target.value})}></textarea>
          <button class="btn" onClick=${submit}>Submit request</button>
        </div>
      </div>

      <div class="card">
        <div style="margin-bottom:6px">Approvals</div>
        <div class="grid" style="max-height:60vh;overflow:auto">
          ${permits.length===0 && html`<div class="small">No permits yet.</div>`}
          ${permits.map(p => html`
            <div class="card" style="padding:10px">
              <div style="font-weight:600">${p.workType || 'Work permit'}</div>
              <div class="small">${p.requesterName} — ${p.company}</div>
              ${p.machineId && html`<div class="small">Machine: ${(machines.find(m=>m.id===p.machineId)||{}).label}</div>`}
              <div class="small">📍 ${p.location || '—'}</div>
              <div class="small">${p.startISO || '—'} → ${p.endISO || '—'}</div>
              <div class="small"><span style="color:var(--muted)">Controls:</span> ${p.controls}</div>
              <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
                <span class="small" style="padding:2px 8px;border-radius:999px;background:${p.status==='approved'?'#dcfce7':p.status==='rejected'?'#fee2e2':'#fef9c3'}">${p.status}</span>
                ${role==='office' && p.status==='pending' && html`
                  <button class="btn" onClick=${()=>decide(p.id,'approved')}>Approve</button>
                  <button class="btn" onClick=${()=>decide(p.id,'rejected')}>Reject</button>
                `}
                ${p.decidedBy && html`<span class="small">by ${p.decidedBy} on ${p.decidedAt && fmt(new Date(p.decidedAt), 'dd MMM HH:mm')}</span>`}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

function ga2sToCSV(ga2s, machinesById){
  const rows = [
    ["Date","Machine","Reg/ID","Name","Company","Pass","Notes"],
    ...ga2s.map(g => [
      fmt(new Date(g.dateISO), 'yyyy-MM-dd HH:mm'),
      (machinesById[g.machineId]||{}).label || g.machineId,
      (machinesById[g.machineId]||{}).reg || g.machineId,
      g.userName, g.company, g.pass? 'PASS':'FAIL', (g.notes||'').replace(/\n/g,' ')
    ])
  ];
  return rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
}

function Records({ga2s, machinesById}){
  const downloadCSV = ()=>{
    const csv = ga2sToCSV(ga2s, machinesById);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ga2-records-${fmt(new Date(), 'yyyyMMdd-HHmm')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return html`
    <div class="card">
      <div style="margin-bottom:6px">GA2 Records</div>
      <div style="overflow:auto">
        <table class="table">
          <thead><tr><th>Date</th><th>Machine</th><th>Reg/ID</th><th>Name</th><th>Company</th><th>Pass</th><th>Notes</th></tr></thead>
          <tbody>
            ${ga2s.map(g => html`
              <tr>
                <td>${fmt(new Date(g.dateISO), 'dd MMM yyyy HH:mm')}</td>
                <td>${(machinesById[g.machineId]||{}).label || g.machineId}</td>
                <td>${(machinesById[g.machineId]||{}).reg || g.machineId}</td>
                <td>${g.userName}</td>
                <td>${g.company}</td>
                <td>${g.pass?'PASS':'FAIL'}</td>
                <td>${g.notes}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
      <div class="no-print" style="margin-top:8px"><button class="btn" onClick=${downloadCSV}>Export CSV</button></div>
    </div>
  `;
}

function FooterNote(){
  return html`<div class="small">Note: Prototype. Align final fields with your company SMS and the Safety, Health and Welfare at Work Regulations.</div>`;
}

function sampleMachines(){
  return [
    { id: uid(), label:'MRT 2660 Telehandler', type:'Telehandler', reg:'D-12345', location:'Core A — L1', ownerCompany:'Quinn Plant', ga1:{ certNo:'GA1-TH-0923-88', validUntil: futureISO(90) }, createdAt: todayISO() },
    { id: uid(), label:'Spider Crane URW-295', type:'Mini Crane', reg:'URW295-07', location:'Atrium', ownerCompany:'LiftCo', ga1:{ certNo:'GA1-MC-0923-17', validUntil: futureISO(180) }, createdAt: todayISO() },
    { id: uid(), label:'Scissor Lift GS-1930', type:'MEWP', reg:'MEWP-1930-21', location:'Block B — L3', ownerCompany:'HireAll', ga1:{ certNo:'GA1-ME-0524-03', validUntil: futureISO(60) }, createdAt: todayISO() },
  ];
}
function futureISO(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString(); }

// Render
const root = document.getElementById('app');
render(h(App, {}), root);
