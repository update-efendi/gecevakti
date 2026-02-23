const BASE = "https://ezanvakti.emushaf.net";
const TURKEY_ID = "2";

const ordered = [
  ["Imsak", "İmsak"],
  ["Gunes", "Güneş"],
  ["Ogle",  "Öğle"],
  ["Ikindi","İkindi"],
  ["Aksam", "Akşam"],
  ["Yatsi", "Yatsı"],
];

const $ = (id) => document.getElementById(id);

let timer = null;
let todayRow = null;
let tomorrowRow = null;
let placeLabel = null;

let nightTimes = null; // {nightStart,yatsi,halfNight,lastThirdStart,nightEnd}
let nightThirds = null; // {t1End, t2End} boundaries for equal thirds

function setStatus(t){ $("status").textContent = t || ""; }
function setError(t){ $("err").textContent = t || ""; }

function trNorm(s){
  return (s||"").trim().toLowerCase()
    .replaceAll("ı","i")
    .replaceAll("ş","s")
    .replaceAll("ğ","g")
    .replaceAll("ü","u")
    .replaceAll("ö","o")
    .replaceAll("ç","c")
    .replace(/\s+/g," ");
}

function ddMMyyyy(d){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function atTime(dateObj, hhmm){
  const [h,m] = String(hhmm).split(":").map(Number);
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), h, m, 0);
}

function hms(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const hh = String(Math.floor(s/3600)).padStart(2,"0");
  const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${hh}:${mm}:${ss}`;
}

function getHijriFallback(){
  try{
    const fmt = new Intl.DateTimeFormat('tr-TR-u-ca-islamic', { day:'numeric', month:'long', year:'numeric' });
    return fmt.format(new Date());
  }catch(_){
    return "";
  }
}

async function getJson(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

async function getCities(){ return getJson(`${BASE}/sehirler/${TURKEY_ID}`); }
async function getDistricts(sehirId){ return getJson(`${BASE}/ilceler/${sehirId}`); }
async function getVakitler(ilceId){ return getJson(`${BASE}/vakitler/${ilceId}`); }

function findByDate(rows, dstr){
  return rows.find(r => String(r.MiladiTarihKisa||"") === dstr) || null;
}

/**
 * Aktif vakit:
 * - Normal: bugünün vakitleri içinde en son geçmiş olan
 * - İmsaktan önce (00:00-imsak): Yatsı
 */
function getActivePrayerKey(now, today){
  const imsakStr = today.Imsak;
  if(imsakStr){
    const imsakDT = atTime(now, imsakStr);
    if(now < imsakDT){
      return "Yatsi";
    }
  }

  const times = ordered
    .map(([k,label]) => ({k, label, t: today[k]}))
    .filter(x => !!x.t)
    .map(x => ({...x, dt: atTime(now, x.t)}));

  const passed = times.filter(x => x.dt <= now);
  if(passed.length === 0) return null;
  return passed[passed.length - 1].k;
}

function renderTimes(row){
  const wrap = $("times");
  wrap.innerHTML = "";

  const now = new Date();
  const activeKey = getActivePrayerKey(now, row);

  ordered.forEach(([k,label])=>{
    const val = row[k] || "--:--";
    const div = document.createElement("div");
    div.className = "kv";

    const isActive = (activeKey && k === activeKey);
    const left = isActive ? `<span class="bold">${label}</span>` : `<span>${label}</span>`;
    const right = isActive
      ? `<span class="bold" style="font-variant-numeric:tabular-nums">${val}</span>`
      : `<span style="font-variant-numeric:tabular-nums">${val}</span>`;

    div.innerHTML = `<div>${left}</div><div>${right}</div>`;
    wrap.appendChild(div);
  });
}

function computeNext(now, today, tomorrow){
  for(const [k,label] of ordered){
    const t = today[k];
    if(!t) continue;
    const dt = atTime(now, t);
    if(dt > now) return {name: label, dt};
  }
  const imsak = tomorrow.Imsak;
  const dt = atTime(new Date(now.getTime() + 86400000), imsak);
  return {name:"İmsak", dt};
}

/**
 * Gece zamanlarını iki moda göre hesapla:
 * - İmsaktan önceyse: dün akşam -> bugün imsak
 * - Aksi halde: bugün akşam -> yarın imsak
 */
function computeNightTimes(now, today, tomorrow){
  const aksamStr = today.Aksam;
  const yatsiStr = today.Yatsi;
  const imsakTodayStr = today.Imsak;
  const imsakTomorrowStr = tomorrow.Imsak;

  if(!aksamStr || !yatsiStr || !imsakTodayStr || !imsakTomorrowStr){
    throw new Error("Gece bölümleri için Aksam/Yatsi/Imsak alanları eksik.");
  }

  const imsakTodayDT = atTime(now, imsakTodayStr);

  if(now < imsakTodayDT){
    const yesterday = new Date(now.getTime() - 86400000);
    const nightStart = atTime(yesterday, aksamStr);
    const yatsiDT = atTime(yesterday, yatsiStr);
    const nightEnd = imsakTodayDT;

    const durMs = nightEnd - nightStart;
    const halfNight = new Date(nightStart.getTime() + durMs/2);
    const lastThirdStart = new Date(nightStart.getTime() + durMs*2/3);

    return { nightStart, yatsi: yatsiDT, halfNight, lastThirdStart, nightEnd };
  }

  const nightStart = atTime(now, aksamStr);
  const yatsiDT = atTime(now, yatsiStr);
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const nightEnd = atTime(tomorrowDate, imsakTomorrowStr);

  const durMs = nightEnd - nightStart;
  const halfNight = new Date(nightStart.getTime() + durMs/2);
  const lastThirdStart = new Date(nightStart.getTime() + durMs*2/3);

  return { nightStart, yatsi: yatsiDT, halfNight, lastThirdStart, nightEnd };
}

/**
 * Akşam-İmsak arası geceyi 3 eşit parçaya böl:
 * t1End = nightStart + 1/3
 * t2End = nightStart + 2/3
 */
function computeEqualThirds(nt){
  const durMs = nt.nightEnd - nt.nightStart;
  const t1End = new Date(nt.nightStart.getTime() + durMs/3);
  const t2End = new Date(nt.nightStart.getTime() + durMs*2/3);
  return { t1End, t2End };
}

function getActiveNightSegment(now, nt){
  if(!nt) return null;

  if(now >= nt.nightStart && now < nt.yatsi) return "first";
  if(now >= nt.yatsi && now < nt.halfNight) return "mid";
  if(now >= nt.halfNight && now < nt.lastThirdStart) return "mid";
  if(now >= nt.lastThirdStart && now < nt.nightEnd) return "lastThird";

  return null;
}

function getActiveEqualThird(now, nt, thirds){
  if(!nt || !thirds) return null;
  if(now < nt.nightStart || now >= nt.nightEnd) return null;
  if(now < thirds.t1End) return "t1";
  if(now < thirds.t2End) return "t2";
  return "t3";
}

function renderNightParts(today, tomorrow){
  const now = new Date();
  nightTimes = computeNightTimes(now, today, tomorrow);
  nightThirds = computeEqualThirds(nightTimes);

  const activeSeg = getActiveNightSegment(now, nightTimes);
  const activeThird = getActiveEqualThird(now, nightTimes, nightThirds);

  const fmt = (d)=> `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

  const night = $("night");
  night.innerHTML = "";

  // Mevcut "fıkhî" bölümler
  const items = [
    {label:"Gece aralığı", value:`${fmt(nightTimes.nightStart)} → ${fmt(nightTimes.nightEnd)}`, active:false},
    {label:"İlk kısım", value:`${fmt(nightTimes.nightStart)} → ${fmt(nightTimes.yatsi)} (Akşam → Yatsı)`, active: activeSeg === "first"},
    {label:"Orta kısım", value:`${fmt(nightTimes.yatsi)} → ${fmt(nightTimes.halfNight)} (Yatsı → Gece yarısı)`, active: activeSeg === "mid"},
    {label:"Son üçte bir", value:`${fmt(nightTimes.lastThirdStart)} → ${fmt(nightTimes.nightEnd)}`, active: activeSeg === "lastThird"},
  ];

  for(const it of items){
    const div = document.createElement("div");
    div.className = "kv";
    const left = it.active ? `<span class="bold">${it.label}</span>` : `<span>${it.label}</span>`;
    const right = it.active
      ? `<span class="bold" style="font-variant-numeric:tabular-nums">${it.value}</span>`
      : `<span style="font-variant-numeric:tabular-nums">${it.value}</span>`;
    div.innerHTML = `<div>${left}</div><div>${right}</div>`;
    night.appendChild(div);
  }

  // Yeni: Akşam-İmsak arası 3 eşit parça
  const header = document.createElement("div");
  header.style.marginTop = "10px";
  header.style.fontSize = "13px";
  header.className = "muted";
  header.textContent = "Eşit 3 Parça (Akşam → İmsak)";
  night.appendChild(header);

  const thirdsItems = [
    {key:"t1", label:"1. üçte bir", value:`${fmt(nightTimes.nightStart)} → ${fmt(nightThirds.t1End)}`, active: activeThird === "t1"},
    {key:"t2", label:"2. üçte bir", value:`${fmt(nightThirds.t1End)} → ${fmt(nightThirds.t2End)}`, active: activeThird === "t2"},
    {key:"t3", label:"3. üçte bir", value:`${fmt(nightThirds.t2End)} → ${fmt(nightTimes.nightEnd)}`, active: activeThird === "t3"},
  ];

  for(const it of thirdsItems){
    const div = document.createElement("div");
    div.className = "kv";
    const left = it.active ? `<span class="bold">${it.label}</span>` : `<span>${it.label}</span>`;
    const right = it.active
      ? `<span class="bold" style="font-variant-numeric:tabular-nums">${it.value}</span>`
      : `<span style="font-variant-numeric:tabular-nums">${it.value}</span>`;
    div.innerHTML = `<div>${left}</div><div>${right}</div>`;
    night.appendChild(div);
  }
}

async function resolveByNames(provinceName, districtName){
  const cities = await getCities();
  const provN = trNorm(provinceName);

  const city = cities.find(c => trNorm(c.SehirAdi) === provN)
            || cities.find(c => trNorm(c.SehirAdi).includes(provN));
  if(!city) throw new Error(`İl bulunamadı: ${provinceName}`);

  const districts = await getDistricts(city.SehirID);
  const distN = trNorm(districtName);

  const district = districts.find(d => trNorm(d.IlceAdi) === distN)
               || districts.find(d => trNorm(d.IlceAdi).includes(distN));
  if(!district) throw new Error(`İlçe bulunamadı: ${districtName}`);

  return { sehir: city, ilce: district };
}

async function reverseGeocode(lat,lng){
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=tr`;
  const r = await fetch(url, { headers: { "Accept": "application/json" }});
  if(!r.ok) throw new Error("Reverse geocoding başarısız.");
  const j = await r.json();
  const a = j.address || {};
  const province = a.state || a.province || a.region;
  const district = a.county || a.district || a.town || a.city_district;
  if(!province || !district) throw new Error("Konumdan il/ilçe okunamadı.");
  return { province, district };
}

function tick(){
  if(!todayRow || !tomorrowRow) return;

  const now = new Date();
  const nxt = computeNext(now, todayRow, tomorrowRow);
  $("nextName").textContent = nxt.name;
  $("nextLeft").textContent = hms(nxt.dt - now);

  renderTimes(todayRow);
  renderNightParts(todayRow, tomorrowRow);
}

function startTimer(){
  if(timer) clearInterval(timer);
  timer = setInterval(tick, 1000);
}

async function loadWithIlce(ilceId, label){
  setError("");
  setStatus("Aylık vakitler alınıyor...");

  const rows = await getVakitler(ilceId);

  const now = new Date();
  todayRow = findByDate(rows, ddMMyyyy(now));
  tomorrowRow = findByDate(rows, ddMMyyyy(new Date(now.getTime()+86400000)));

  if(!todayRow || !tomorrowRow) throw new Error("Bugün/yarın vakit satırı bulunamadı.");

  placeLabel = label;

  $("cardA").style.display = "block";
  $("cardB").style.display = "block";
  $("titleA").textContent = `${placeLabel} • ${todayRow.MiladiTarihKisa || ""}`;

  if(todayRow.HicriTarihUzun){
    $("hijriDate").textContent = todayRow.HicriTarihUzun;
  } else if(todayRow.HicriTarihKisa){
    $("hijriDate").textContent = todayRow.HicriTarihKisa;
  } else {
    $("hijriDate").textContent = getHijriFallback();
  }

  tick();
  startTimer();
  setStatus("Hazır");
}

async function locateFlow(){
  setError("");
  setStatus("Konum alınıyor...");
  $("manual").style.display = "none";

  if(!navigator.geolocation) throw new Error("Tarayıcı konum desteklemiyor.");

  const pos = await new Promise((resolve, reject)=>{
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout:15000 });
  });

  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  setStatus("Konum çözümleniyor (il/ilçe)...");
  const { province, district } = await reverseGeocode(lat,lng);

  setStatus("Diyanet il/ilçe kodu bulunuyor...");
  const { sehir, ilce } = await resolveByNames(province, district);

  await loadWithIlce(ilce.IlceID, `${sehir.SehirAdi} / ${ilce.IlceAdi}`);
}

async function initManual(){
  const cities = await getCities();
  const sel = $("selCity");
  sel.innerHTML = "";
  cities.forEach(c=>{
    const o = document.createElement("option");
    o.value = c.SehirID;
    o.textContent = c.SehirAdi;
    sel.appendChild(o);
  });

  async function fillDistricts(){
    const sehirId = sel.value;
    const districts = await getDistricts(sehirId);
    const selD = $("selDistrict");
    selD.innerHTML = "";
    districts.forEach(d=>{
      const o = document.createElement("option");
      o.value = d.IlceID;
      o.textContent = d.IlceAdi;
      selD.appendChild(o);
    });
  }

  sel.addEventListener("change", fillDistricts);
  await fillDistricts();
}

async function showManual(){
  await initManual();
  $("manual").style.display = "block";
  setStatus("Manuel seçim açık.");
}

async function boot(){
  try{
    if("serviceWorker" in navigator){
      await navigator.serviceWorker.register("./sw.js");
    }
  }catch(_){}

  $("btnLocate").onclick = async ()=>{
    try{ await locateFlow(); }
    catch(e){
      setError(String(e.message||e));
      setStatus("Konum başarısız. Manuel seçim açıldı.");
      await showManual();
    }
  };

  $("btnRefresh").onclick = async ()=>{
    try{
      if(todayRow && tomorrowRow && placeLabel){
        tick();
        setStatus("Yenilendi.");
      } else {
        await locateFlow();
      }
    }catch(e){
      setError(String(e.message||e));
      setStatus("Yenileme başarısız. Manuel seçim açıldı.");
      await showManual();
    }
  };

  $("btnManualGo").onclick = async ()=>{
    try{
      const sehirId = $("selCity").value;
      const ilceId = $("selDistrict").value;

      const cities = await getCities();
      const sehir = cities.find(c=> String(c.SehirID) === String(sehirId));
      const districts = await getDistricts(sehirId);
      const ilce = districts.find(d=> String(d.IlceID) === String(ilceId));

      await loadWithIlce(ilceId, `${sehir?.SehirAdi || "İl"} / ${ilce?.IlceAdi || "İlçe"}`);
    }catch(e){
      setError(String(e.message||e));
    }
  };

  setStatus("Başlamak için “Konumu Kullan”a bas.");
}

boot();
