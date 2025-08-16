// ====== Утилиты ======
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const dow = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const emojis = ['🎉','🔥','🤡','🤣','💥','🎈','🎊','✨'];
const pad = n => n.toString().padStart(2,'0');
const ymd = (y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;

// ====== IndexedDB ======
const DB_NAME = 'dasha-birthday';
const DB_VERSION = 1;
let db;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' });
        // value: {id, caption, blob, mime}
      }
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments'); // key: 'YYYY-MM-DD', value: photoId
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta'); // key -> value (pinHash)
      }
    };
    req.onsuccess = ()=>{ db = req.result; resolve(db); };
    req.onerror = ()=>reject(req.error);
  });
}
function tx(storeNames, mode='readonly'){
  return db.transaction(storeNames, mode);
}
async function getAll(storeName){
  return new Promise((res, rej)=>{
    const store = tx([storeName]).objectStore(storeName);
    const r = store.getAll();
    r.onsuccess = ()=>res(r.result || []);
    r.onerror = ()=>rej(r.error);
  });
}
async function get(storeName, key){
  return new Promise((res, rej)=>{
    const store = tx([storeName]).objectStore(storeName);
    const r = store.get(key);
    r.onsuccess = ()=>res(r.result);
    r.onerror = ()=>rej(r.error);
  });
}
async function put(storeName, value, key){
  return new Promise((res, rej)=>{
    const store = tx([storeName], 'readwrite').objectStore(storeName);
    const r = key !== undefined ? store.put(value, key) : store.put(value);
    r.onsuccess = ()=>res(true);
    r.onerror = ()=>rej(r.error);
  });
}
async function del(storeName, key){
  return new Promise((res, rej)=>{
    const store = tx([storeName], 'readwrite').objectStore(storeName);
    const r = store.delete(key);
    r.onsuccess = ()=>res(true);
    r.onerror = ()=>rej(r.error);
  });
}
async function clearStore(storeName){
  return new Promise((res, rej)=>{
    const store = tx([storeName], 'readwrite').objectStore(storeName);
    const r = store.clear();
    r.onsuccess = ()=>res(true);
    r.onerror = ()=>rej(r.error);
  });
}

// ====== PIN (клиентская защита) ======
async function sha256(msg){
  const buf = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function setPin(pin){
  const h = await sha256(pin);
  await put('meta', h, 'pinHash');
}
async function checkPin(pin){
  const h = await get('meta', 'pinHash');
  if (!h) return false;
  const hh = await sha256(pin);
  return h === hh;
}
async function hasPin(){
  return !!(await get('meta', 'pinHash'));
}

// ====== Календарь ======
function monthInfo(date = new Date()){
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startDay = (first.getDay() + 6) % 7; // Monday=0
  return {year, month, daysInMonth, startDay, now:new Date()};
}
async function buildCalendar(){
  const {year, month, daysInMonth, startDay, now} = monthInfo(new Date());
  $('#monthLabel').textContent = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const grid = $('#calendar');
  grid.innerHTML='';
  dow.forEach(d=>{
    const h = document.createElement('div');
    h.className='dow'; h.textContent=d; grid.appendChild(h);
  });
  for (let i=0;i<startDay;i++){ const e=document.createElement('div'); e.className='day empty'; grid.appendChild(e); }
  for (let day=1; day<=daysInMonth; day++){
    const cell = document.createElement('div');
    cell.className='day';
    const isToday = (day === now.getDate());
    if (isToday) cell.classList.add('today');
    const label = document.createElement('div'); label.className='num'; label.textContent=day;
    const badge = document.createElement('div'); badge.className='badge'; badge.textContent = isToday ? '🎂':'🎉';
    cell.appendChild(label); cell.appendChild(badge);
    cell.addEventListener('click', ()=>openDay(ymd(year,month,day)));
    grid.appendChild(cell);
  }
}

// ====== Логика назначения фото ======
async function randomAssign(dateStr){
  // если уже есть — вернуть
  let id = await get('assignments', dateStr);
  if (id){
    const photo = await get('photos', id);
    if (photo) return photo;
    // иначе, продолжим и переназначим
  }
  const all = await getAll('photos');
  if (!all.length) throw new Error('Нет загруженных фото');
  const pick = all[Math.floor(Math.random()*all.length)];
  await put('assignments', pick.id, dateStr);
  return pick;
}

let objectUrl; // для отрисовки
async function openDay(dateStr){
  try{
    const photo = await randomAssign(dateStr);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(photo.blob);
    $('#modalPhoto').src = objectUrl;
    $('#modalPhoto').alt = photo.caption || 'Фото дня';
    $('#modalCaption').textContent = photo.caption || '';
    $('#photoModal').classList.remove('hidden');
    burstConfetti();
  }catch(e){
    alert(e.message || 'Ошибка');
  }
}
$('#closeModal').addEventListener('click', ()=>{
  $('#photoModal').classList.add('hidden');
});

// ====== Конфетти ======
function burstConfetti(){
  const conf = $('#confetti');
  conf.innerHTML='';
  for (let i=0;i<26;i++){
    const s = document.createElement('div');
    s.className='burst';
    s.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    const angle = Math.random()*2*Math.PI;
    const dist = 120 + Math.random()*160;
    s.style.setProperty('--dx', `${Math.cos(angle)*dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle)*dist}px`);
    s.style.left = '50%'; s.style.top = '60%';
    conf.appendChild(s);
  }
}

// ====== Админ-панель UI ======
$('#adminFab').addEventListener('click', async ()=>{
  $('#adminSection').classList.remove('hidden');
  // показать форму создания PIN или вход
  if (await hasPin()){
    // скрыть createPin, показать login
    $('#createPinForm').classList.add('hidden');
    $('#loginForm').classList.remove('hidden');
    $('#pinHint').textContent = 'Введите PIN, чтобы войти в редактирование.';
  }else{
    $('#createPinForm').classList.remove('hidden');
    $('#loginForm').classList.add('hidden');
    $('#pinHint').textContent = 'Создайте PIN для входа в редактирование.';
  }
});
$('#closeAdmin').addEventListener('click', ()=>$('#adminSection').classList.add('hidden'));

$('#savePinBtn').addEventListener('click', async ()=>{
  const pin = $('#newPin').value.trim();
  if (pin.length < 4){ alert('Минимум 4 символа'); return; }
  await setPin(pin);
  $('#createPinForm').classList.add('hidden');
  $('#loginForm').classList.remove('hidden');
  $('#pinHint').textContent = 'PIN сохранён. Теперь войдите.';
});

let adminUnlocked = false;
$('#loginBtn').addEventListener('click', async ()=>{
  const pin = $('#pinInput').value.trim();
  if (!pin) return;
  const ok = await checkPin(pin);
  $('#loginStatus').textContent = ok ? 'Ок!' : 'Неверный PIN';
  if (ok){
    adminUnlocked = true;
    $('#pinBlock').classList.add('hidden');
    $('#manageBlock').classList.remove('hidden');
    await renderPhotos();
  }
});

// ====== Работа с фото ======
$('#uploadForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!adminUnlocked) return;
  const files = $('#fileInput').files;
  const captionDefault = $('#captionInput').value.trim() || null;
  if (!files || !files.length){ alert('Выберите файл(ы)'); return; }
  $('#uploadStatus').textContent = 'Загружаю...' ;

  for (const file of files){
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    const blob = await file.slice(0, file.size, file.type);
    const photo = { id, caption: captionDefault, blob, mime: file.type };
    await put('photos', photo); // blob сохраняется в IDB
  }
  $('#uploadStatus').textContent = 'Готово!';
  $('#fileInput').value=''; $('#captionInput').value='';
  await renderPhotos();
});

async function renderPhotos(){
  const wrap = $('#photosList'); wrap.innerHTML='';
  const photos = await getAll('photos');
  if (!photos.length){ wrap.innerHTML='<p class="muted">Пока нет загруженных фото.</p>'; return; }
  for (const p of photos){
    const card = document.createElement('div');
    card.className='photo-item';
    const url = URL.createObjectURL(p.blob);
    card.innerHTML = `
      <img src="${url}" alt="img">
      <input class="caption-edit" type="text" value="${p.caption ? escapeHtml(p.caption) : ''}" placeholder="Подпись..." />
      <div class="photo-actions">
        <button class="btn btn-secondary small save">Сохранить подпись</button>
        <button class="btn btn-danger small del">Удалить</button>
      </div>
    `;
    const input = card.querySelector('.caption-edit');
    card.querySelector('.save').addEventListener('click', async ()=>{
      p.caption = input.value.trim() || null;
      await put('photos', p);
    });
    card.querySelector('.del').addEventListener('click', async ()=>{
      if (!confirm('Удалить фото?')) return;
      await del('photos', p.id);
      // удалить назначения с этим фото
      await removeAssignmentsByPhoto(p.id);
      await renderPhotos();
    });
    wrap.appendChild(card);
    // revoke url later
    setTimeout(()=>URL.revokeObjectURL(url), 10000);
  }
}
$('#refreshList').addEventListener('click', renderPhotos);

async function removeAssignmentsByPhoto(photoId){
  const store = tx(['assignments']).objectStore('assignments');
  const keys = await new Promise((res,rej)=>{
    const req = store.getAllKeys();
    req.onsuccess = ()=>res(req.result||[]);
    req.onerror = ()=>rej(req.error);
  });
  for (const k of keys){
    const val = await get('assignments', k);
    if (val === photoId){
      await del('assignments', k);
    }
  }
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
}

// ====== Сброс назначений ======
$('#clearMonth').addEventListener('click', async ()=>{
  if (!confirm('Сбросить назначения текущего месяца?')) return;
  const mi = monthInfo(new Date());
  const prefix = `${mi.year}-${pad(mi.month+1)}-`;
  const store = tx(['assignments']).objectStore('assignments');
  const keys = await new Promise((res,rej)=>{
    const r = store.getAllKeys(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error);
  });
  for (const k of keys){
    if (String(k).startsWith(prefix)){
      await del('assignments', k);
    }
  }
  alert('Ок! Назначения текущего месяца очищены.');
});
$('#clearAll').addEventListener('click', async ()=>{
  if (!confirm('Сбросить ВСЕ назначения?')) return;
  await clearStore('assignments');
  alert('Все назначения очищены.');
});

// ====== Бэкап ======
$('#exportBackup').addEventListener('click', async ()=>{
  const photos = await getAll('photos');
  const assignments = await (async ()=>{
    const store = tx(['assignments']).objectStore('assignments');
    const keys = await new Promise((res,rej)=>{ const r=store.getAllKeys(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); });
    const out = {};
    for (const k of keys){
      out[k] = await get('assignments', k);
    }
    return out;
  })();
  // преобразуем blob -> base64
  const photosExport = [];
  for (const p of photos){
    const b64 = await blobToBase64(p.blob);
    photosExport.push({ id: p.id, caption: p.caption || null, mime: p.mime || 'image/jpeg', data: b64 });
  }
  const pkg = { type: 'dasha-birthday-backup', version: 1, photos: photosExport, assignments };
  const blob = new Blob([JSON.stringify(pkg)], {type:'application/json'});
  const u = URL.createObjectURL(blob);
  download(u, `backup-dasha-${Date.now()}.json`);
  setTimeout(()=>URL.revokeObjectURL(u), 5000);
});

$('#importBackup').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try{
    const pkg = JSON.parse(text);
    if (!pkg || pkg.type!=='dasha-birthday-backup') throw new Error('Не тот файл');
    // очистить и восстановить
    await clearStore('photos');
    await clearStore('assignments');
    for (const p of pkg.photos||[]){
      const blob = base64ToBlob(p.data, p.mime||'image/jpeg');
      await put('photos', { id: p.id, caption: p.caption||null, blob, mime: p.mime||'image/jpeg' });
    }
    for (const k of Object.keys(pkg.assignments||{})){
      await put('assignments', pkg.assignments[k], k);
    }
    alert('Импорт завершён');
    await renderPhotos();
  }catch(err){
    alert('Ошибка импорта: ' + err.message);
  }finally{
    e.target.value='';
  }
});

function blobToBase64(blob){
  return new Promise((res, rej)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const result = reader.result; // data:<mime>;base64,....
      const base64 = String(result).split(',')[1];
      res(base64);
    };
    reader.onerror = ()=>rej(reader.error);
    reader.readAsDataURL(blob);
  });
}
function base64ToBlob(base64, mime){
  const bin = atob(base64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type:mime});
}
function download(url, filename){
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); a.remove();
}

// ====== Инициализация ======
(async function init(){
  await openDB();
  await buildCalendar();
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') $('#photoModal').classList.add('hidden'); });
})();
