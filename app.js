
// Error display
window.onerror = function(msg){ try{ const el=document.getElementById('error'); el.style.display='block'; el.textContent='Error: '+msg; }catch{} };

// Preact + HTM
const html = htm.bind(preact.h);
const { h, render } = preact;
const { useState, useEffect, useMemo, useRef } = preactHooks;

// Formatting
const fmt = (d, p) => (window.dateFns && dateFns.format)? dateFns.format(d,p) : d.toISOString();

// Utils
const uid = () => Math.random().toString(36).slice(2,10);
const todayISO = () => new Date().toISOString();
const load = (k, d) => { try { const v = localStorage.getItem(k); return v? JSON.parse(v): d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
function useLocalState(key, initial){ const [s, S]=useState(()=>load(key,initial)); useEffect(()=>save(key,s),[key,s]); return [s,S]; }

// Build a base URL that's correct for GitHub Pages subfolders (e.g., /GA2/)
function baseUrl(){
  let p = location.pathname;
  if (!p.endsWith('/')) p += '/';
  return location.origin + p;
}

// Deep link handling: ?mid=<id> will auto-open GA2 for that machine.
function getDeepLinkMachineId(){
  const sp = new URLSearchParams(location.search);
  return sp.get('mid') || '';
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

// QR helper
async function makeQR(text, size=512){
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const cell = Math.floor(size/qr.getModuleCount());
  const s = cell * qr.getModuleCount();
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const g = c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,s,s); g.fillStyle='#000';
  for(let r=0;r<qr.getModuleCount();r++) for(let col=0;col<qr.getModuleCount();col++) if(qr.isDark(r,col)) g.fillRect(col*cell,r*cell,cell,cell);
  return c.toDataURL('image/png');
}

function App(){
  const [role, setRole] = useLocalState('role','worker');
  const [profile, setProfile] = useLocalState('profile',{name:'', company:''});
  const [machines, setMachines] = useLocalState('machines', sampleMachines());
  const [ga2s, setGa2s] = useLocalState('ga2s', []);
  const [permits, setPermits] = useLocalState('permits', []);
  const [tab, setTab] = useLocalState('tab', 'dashboard');
  const [scanResult, setScanResult] = useState('');

  const byId = useMemo(()=> Object.fromEntries(machines.map(m=>[m.id,m])), [machines]);

  // If opened via QR deep link (?mid=...), jump to Scan tab with machine preselected
  useEffect(()=>{
    const mid = getDeepLinkMachineId();
    if (mid) {
      setTab('scan');
      setScanResult(mid);
      // clean URL so refresh keeps you in app
      history.replaceState(null, '', location.pathname + '#scan');
    }
  }, []);

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
  const todayChecks = ga2s.filter(g => (fmt(new Date(g.dateISO), 'yyyy-MM-dd')).slice(0,10) === (fmt(new Date(), 'yyyy-MM-dd')).slice(0,10)).length;
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
    </div>
  `;
}

function ScanAndGA2({ profile, machines, setGa2s, scanResult, setScanResult }){
  const [selectedId, setSelectedId] = useState("");
  const [checks, setChecks] = useState(Object.fromEntries(DEFAULT_CHECKS.map(c=>[c.key,false])));
  const [notes, setNotes] = useState("");
  const [passed, setPassed] = useState(true);

  useEffect(()=>{ if (scanResult) setSelectedId(scanResult); }, [scanResult]);

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
        <div class="small">On iPhone you can also use the Camera app to scan the QR. It will open the GA2 form for that machine automatically.</div>
        <div class="small" style="margin-top:6px;word-break:break-all">Deep link: ?mid=… | Result: ${scanResult || '—'}</div>
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
    const m = { id, label: form.label, type: form.type, reg: form.reg, location: form.location, ownerCompany: form.ownerCompany, createdAt: todayISO() };
    setMachines(prev=>[m, ...prev]);
    setForm({ label:"", type:"", reg:"", location:"", ownerCompany:"" });
  };

  // QR deep link content: https://nony0007.github.io/GA2/?mid=<id>#scan (built dynamically for any subfolder)
  const genQR = async (m)=>{
    const url = `${baseUrl()}?mid=${encodeURIComponent(m.id)}#scan`;
    const png = await makeQR(url, 768);
    setQrDataUrl(png); setSelected(m); setShowQR(true);
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
                <button class="btn" onClick=${()=> setSelected(m) || setShowQR(false)}>Edit</button>
                <button class="btn" onClick=${()=> setMachines(prev=> prev.filter(x=>x.id!==m.id)) }>Remove</button>
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
              <div class="small" style="margin-top:6px;word-break:break-all">${baseUrl()}?mid=${selected? encodeURIComponent(selected.id):''}#scan</div>
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
            <div style="font-size:10px;text-align:center">Scan to open GA2 form for this plant.</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function Permits(){ return html`<div class="card">Permits module (unchanged for demo)</div>`; }

function ga2sToCSV(ga2s, machinesById){
  const rows = [["Date","Machine","Reg/ID","Name","Company","Pass","Notes"],
    ...ga2s.map(g => [fmt(new Date(g.dateISO),'yyyy-MM-dd HH:mm'), (machinesById[g.machineId]||{}).label||g.machineId,
      (machinesById[g.machineId]||{}).reg||g.machineId, g.userName, g.company, g.pass?'PASS':'FAIL', (g.notes||'').replace(/\n/g,' ')])];
  return rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
}
function Records({ga2s, machinesById}){
  const downloadCSV = ()=>{
    const csv = ga2sToCSV(ga2s, machinesById);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='ga2-records.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return html`<div class="card"><div style="margin-bottom:6px">GA2 Records</div><button class="btn" onClick=${downloadCSV}>Export CSV</button></div>`;
}
function FooterNote(){ return html`<div class="small">QR deep links enabled. Scanning a label opens GA2 for that machine.</div>`; }
function sampleMachines(){
  return [
    { id: uid(), label:'MRT 2660 Telehandler', type:'Telehandler', reg:'D-12345', location:'Core A — L1', ownerCompany:'Quinn Plant', createdAt: todayISO() },
    { id: uid(), label:'Spider Crane URW-295', type:'Mini Crane', reg:'URW295-07', location:'Atrium', ownerCompany:'LiftCo', createdAt: todayISO() },
    { id: uid(), label:'Scissor Lift GS-1930', type:'MEWP', reg:'MEWP-1930-21', location:'Block B — L3', ownerCompany:'HireAll', createdAt: todayISO() },
  ];
}

// Render
render(preact.h(App, {}), document.getElementById('app'));
