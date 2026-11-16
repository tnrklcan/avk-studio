/* AVK Studio arayüzü - sade, adım adım. Metinler "siz" diliyle, düz a harfiyle yazılır. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const call = (n, a) => window.avk.call(n, a);
const S = { user: null, info: {}, setup: {}, update: null };


// ---------- bildirimler ----------
const NKEY = 'avk_notes', MKEY = 'avk_mute';
const loadNotes = () => { try { return JSON.parse(localStorage.getItem(NKEY) || '[]'); } catch (_) { return []; } };
const saveNotes = (n) => { try { localStorage.setItem(NKEY, JSON.stringify(n.slice(0, 50))); } catch (_) { /* sessiz */ } };
const isMuted = () => { try { return localStorage.getItem(MKEY) === '1'; } catch (_) { return false; } };
let audioCtx;
function chime(kind) {
  try {
    if (isMuted()) return;
    audioCtx = audioCtx || new AudioContext();
    audioCtx.resume();
    const t = audioCtx.currentTime;
    (kind === 'error' ? [330, 247] : [660, 880]).forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.17);
      g.gain.exponentialRampToValueAtTime(0.28, t + i * 0.17 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.17 + 0.35);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + i * 0.17); o.stop(t + i * 0.17 + 0.4);
    });
  } catch (_) { /* ses çalınamazsa sessiz geç */ }
}
function notify(kind, title, text) {
  const n = loadNotes();
  n.unshift({ id: Date.now() + Math.random(), kind, title, text: text || '', time: Date.now(), read: false });
  saveNotes(n);
  chime(kind);
  toast(title);
  call('notify', { title: 'AVK Sinema · ' + title, body: text || '' }).catch(() => {});
  refreshBell();
}
function bellEl() {
  const wrap = h('div', { class: 'bell' });
  const draw = () => {
    const notes = loadNotes();
    const unread = notes.filter((x) => !x.read).length;
    const menu = h('div', { class: 'bell-menu hidden' },
      h('div', { class: 'row', style: 'justify-content:space-between;padding:4px 6px 10px' },
        h('b', {}, 'Bildirimler'),
        h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); try { localStorage.setItem(MKEY, isMuted() ? '0' : '1'); } catch (_) {} refreshBell(true); } }, isMuted() ? '🔇 Ses kapalı' : '🔔 Ses açık'),
          h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); saveNotes([]); refreshBell(true); } }, 'Bildirimleri sil'))),
      notes.length ? h('div', { class: 'bell-list' }, notes.map((x) => h('div', { class: 'bell-item ' + (x.kind === 'error' ? 'err' : '') },
        h('div', { class: 'bt' }, (x.kind === 'error' ? '⚠️ ' : '✅ ') + x.title),
        x.text ? h('div', { class: 'bx' }, x.text.slice(0, 180)) : null,
        h('div', { class: 'bm' }, new Date(x.time).toLocaleString('tr-TR')))))
        : h('div', { class: 'muted small', style: 'padding:14px 6px' }, 'Henüz bildirim yok.'));
    const btn = h('button', { class: 'btn ghost small bell-btn', title: 'Bildirimler', onclick: (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('hidden') === false;
      if (open) { const all = loadNotes(); all.forEach((x) => { x.read = true; }); saveNotes(all); badge.remove(); }
    } }, '🔔');
    const badge = h('span', { class: 'badge-n' }, String(unread));
    wrap.replaceChildren(...[btn, unread ? badge : null, menu].filter(Boolean));
    if (wrap.dataset.open === '1') menu.classList.remove('hidden');
  };
  wrap._draw = draw;
  draw();
  return wrap;
}
function refreshBell(keepOpen) {
  document.querySelectorAll('.bell').forEach((b) => { b.dataset.open = keepOpen ? '1' : '0'; if (b._draw) b._draw(); });
}
document.addEventListener('click', () => document.querySelectorAll('.bell-menu').forEach((m) => m.classList.add('hidden')));

function confirmBox({ title, text, ok = 'Sil' }) {
  return new Promise((res) => {
    const done = (v) => { o.remove(); res(v); };
    const o = h('div', { class: 'busy' }, h('div', { class: 'box', style: 'text-align:left' },
      h('h2', {}, title), h('p', { class: 'sub' }, text),
      h('div', { class: 'row right' }, h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Vazgeç'), h('button', { class: 'btn danger', onclick: () => done(true) }, ok))));
    document.body.append(o);
  });
}

// ---------- ortak yardımcılar ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3500); }
const mount = (...nodes) => { const a = $('#app'); a.replaceChildren(...nodes.flat().filter(Boolean)); window.scrollTo(0, 0); };
const logo = () => h('img', { class: 'logo', src: '../assets/logo.png', alt: 'AI Video Kulübü' });

const busyBox = { logs: [], onStop: null };
window.avk.on((e) => {
  if (e.type === 'log') { busyBox.logs.push(e.message); renderBusyLogs(); }
  else if (e.type === 'clip') { busyBox.clip = e; renderBusyLogs(); if (e.state === 'done') notify('ok', `Klip ${e.index + 1}/${e.total} hazır`, ''); }
  else if (e.type === 'update') { S.update = e; renderUpdateBanner(); if (e.state !== 'downloading') notify('ok', 'Yeni sürüm var: ' + e.version, 'Güncelleme hazır.'); }
});
function renderBusyLogs() {
  const b = $('#busy .logbox'); if (!b) return;
  b.textContent = busyBox.logs.slice(-6).join('\n');
  b.scrollTop = b.scrollHeight;
  const c = null, k = busyBox.clip;
  const st = $('#busy .status');
  if (k && $('#busy .bar i')) $('#busy .bar i').style.width = Math.round(((k.index + (k.state === 'done' ? 1 : 0.3)) / k.total) * 100) + '%';
  if (k && st && !c) st.textContent = `Klip ${k.index + 1}/${k.total} ${k.state === 'done' ? 'tamamlandı' : 'üretiliyor'}`;
}

async function job(title, fn, { stoppable = false, hint = '', giveUp = false } = {}) {
  busyBox.logs = []; busyBox.clip = null;
  const el = $('#busy');
  el.replaceChildren(h('div', { class: 'box' },
    h('div', { class: 'spin' }), h('h2', {}, title),
    h('div', { class: 'status muted' }, hint || 'Lütfen bekleyin...'),
    h('div', { class: 'bar' }, h('i')),
    h('div', { class: 'logbox' }),
    stoppable ? h('button', { class: 'btn danger small', onclick: () => { call('job.cancel'); toast('Durduruluyor...'); } }, 'Durdur') : null,
    giveUp ? h('button', { class: 'btn ghost small', style: 'margin-top:12px', onclick: () => { call('setup.cancel'); toast('Vazgeçiliyor...'); } }, 'Vazgeç') : null));
  el.classList.remove('hidden');
  try { return await fn(); }
  finally { el.classList.add('hidden'); }
}

function errBox(e) {
  const needs = e && e.code === 'NEEDS_CALIBRATION';
  return h('div', { class: 'err-box' }, e.message || String(e),
    e.detail ? h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small', onclick: async (ev) => {
      try { await navigator.clipboard.writeText(e.detail); ev.target.textContent = 'Kopyalandı ✓'; } catch (_) { toast('Kopyalanamadı'); }
    } }, 'Hata raporunu kopyala'), h('span', { class: 'muted small', style: 'margin-left:8px' }, 'Kopyalayıp bize gönderin')) : null);
}
async function safe(fn, host) {
  try { return await fn(); }
  catch (e) {
    if (e.code === 'CANCELLED') { toast('Durduruldu.'); return null; }
    window.lastErrDetail = e.detail || null;
    notify('error', 'Bir sorun oluştu', e.message);
    const box = errBox(e);
    if (host) { host.querySelector('.err-box')?.remove(); host.append(box); } else toast(e.message);
    return null;
  }
}

function renderUpdateBanner() {
  const old = $('#upd'); if (old) old.remove();
  const u = S.update; if (!u) return;
  const b = h('div', { class: 'banner', id: 'upd' },
    h('div', {}, h('b', {}, `Yeni sürüm var: ${u.version}. `), u.state === 'downloading' ? 'İndiriliyor...' : u.state === 'ready' ? 'Hazır, yeniden başlatarak kurabilirsiniz.' : 'İndirme sayfasından yeni sürümü kurun.'),
    u.state === 'ready' ? h('button', { class: 'btn small', onclick: () => window.avk.installUpdate() }, 'Güncelle ve yeniden başlat')
      : u.state === 'manual' ? h('button', { class: 'btn small', onclick: () => call('files.openDir', { path: u.url }) }, 'İndirme sayfasını aç') : null);
  const w = $('.wrap'); if (w) w.prepend(b);
}

function topbar(extra) {
  return h('div', { class: 'top' }, logo(),
    h('div', { class: 'right' }, S.user ? bellEl() : null, S.user ? h('span', {}, S.user.full_name || S.user.email) : null, extra));
}

function stepper(names, cur) {
  return h('div', { class: 'steps' }, names.map((n, i) => {
    const can = i < cur && W && W.nav && W.nav[i];
    return h(can ? 'button' : 'div', { class: 's ' + (i === cur ? 'on' : i < cur ? 'done' : '') + (can ? ' click' : ''), onclick: can ? () => W.nav[i]() : null, title: can ? 'Bu adıma dön' : null },
      h('b', {}, i < cur ? '✓' : String(i + 1)), n);
  }));
}

function fileDrop({ multi = false, files, onChange, label }) {
  const thumbs = h('div', { class: 'thumbs' });
  const draw = () => {
    thumbs.replaceChildren(...files.map((f, i) => h('div', { class: 't' }, h('img', { src: f.dataUrl || '' }),
      h('button', { class: 'x', onclick: () => { files.splice(i, 1); draw(); onChange && onChange(); } }, '×'))));
  };
  const drop = h('div', {
    class: 'drop', onclick: async () => {
      const picked = await call('files.pick', { multi });
      if (!picked.length) return;
      if (multi) files.push(...picked); else files.splice(0, files.length, picked[0]);
      draw(); onChange && onChange();
    }
  }, label || (multi ? 'Görselleri seçmek için tıklayın' : 'Görsel seçmek için tıklayın'));
  draw();
  return h('div', {}, drop, thumbs);
}

function chips(options, value, onPick) {
  const wrap = h('div', { class: 'chips' });
  const draw = () => wrap.replaceChildren(...options.map((o) => h('button', { class: 'chip ' + (o.v === value() ? 'on' : ''), onclick: () => { onPick(o.v); draw(); } }, o.t)));
  draw();
  return wrap;
}

// ---------- açılış ----------
async function boot() {
  mount(h('div', { class: 'splash' }, h('img', { src: '../assets/logo.png' })));
  S.info = await call('app.info');
  window.avk.on(() => {});
  const u = await safe(() => call('auth.restore'));
  if (u && u.blocked) { toast('Üyeliğiniz aktif değil.'); return viewLogin(); }
  if (u && u.email) { S.user = u; return afterLogin(); }
  viewLogin();
}

async function afterLogin() {
  S.setup = await call('setup.status');
  if (!S.setup.ready) return viewSetup(true);
  viewHome();
}

// ---------- giriş ----------
function viewLogin(tab = 'login') {
  const err = h('div');
  const email = h('input', { type: 'email', placeholder: 'ornek@mail.com', autocomplete: 'username' });
  const pass = h('input', { type: 'password', placeholder: 'Şifreniz', autocomplete: 'current-password' });
  const pass2 = h('input', { type: 'password', placeholder: 'Şifreyi tekrar yazın' });
  const first = tab === 'first';
  const submit = async () => {
    err.replaceChildren();
    if (!email.value.includes('@')) return err.append(h('div', { class: 'err-box' }, 'Geçerli bir e-posta yazın.'));
    if (pass.value.length < 6) return err.append(h('div', { class: 'err-box' }, 'Şifre en az 6 karakter olmalı.'));
    if (first && pass.value !== pass2.value) return err.append(h('div', { class: 'err-box' }, 'Şifreler aynı değil.'));
    const r = await safe(() => job(first ? 'Hesabınız hazırlanıyor' : 'Giriş yapılıyor', () => call(first ? 'auth.signup' : 'auth.login', { email: email.value, password: pass.value })), err);
    if (r) { S.user = r; afterLogin(); }
  };
  [email, pass, pass2].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && submit()));
  mount(h('div', { class: 'splash' }, h('div', { class: 'wrap narrow center', style: 'width:100%' },
    h('img', { src: '../assets/logo.png', style: 'width:300px;margin-bottom:22px' }),
    h('div', { class: 'card', style: 'text-align:left' },
      h('div', { class: 'tabs' },
        h('button', { class: first ? '' : 'on', onclick: () => viewLogin('login') }, 'Giriş yap'),
        h('button', { class: first ? 'on' : '', onclick: () => viewLogin('first') }, 'İlk giriş')),
      h('div', { class: 'stack' },
        first ? h('p', { class: 'muted small', style: 'margin:0' }, 'Skool\'da kullandığınız e-postayı yazın ve kendinize bir şifre belirleyin. Bunu sadece bir kez yapacaksınız.') : null,
        h('div', {}, h('label', { class: 'f' }, 'E-posta'), email),
        h('div', {}, h('label', { class: 'f' }, 'Şifre'), pass),
        first ? h('div', {}, h('label', { class: 'f' }, 'Şifre (tekrar)'), pass2) : null,
        h('button', { class: 'btn', style: 'width:100%', onclick: submit }, first ? 'Şifremi belirle ve gir' : 'Giriş yap'),
        err)),
    S.info.dev ? h('p', { class: 'hint' }, 'Geliştirici modu (Supabase bağlı değil)') : null,
    !S.info.configured && !S.info.dev ? h('div', { class: 'err-box' }, 'Program henüz sunucuya bağlanmamış (config.json eksik).') : null,
    h('p', { class: 'hint' }, `Sürüm ${S.info.version}`))));
  email.focus();
}

// ---------- kurulum ----------
async function viewSetup(first) {
  S.setup = await call('setup.status');
  const st = S.setup;
  const err = h('div');
  const provName = st.provider === 'claude' ? 'Claude' : 'ChatGPT';

  const connect = (site, title) => async () => {
    err.replaceChildren();
    const r = await safe(() => job(title, () => call('setup.connect', { site }),
      { giveUp: site === 'flow', hint: 'Açılan Chrome penceresinde gerekirse giriş yapın. Gerisini program yapar.' }), err);
    if (r && r.message) toast(r.message);
    viewSetup(first);
  };

  const item = (n, ok, title, desc, actions) => h('div', { class: 'check ' + (ok ? 'ok' : '') },
    h('div', { class: 'dot' }, ok ? '✓' : String(n)),
    h('div', { class: 'body' }, h('h3', {}, title), h('div', { class: 'muted small', style: 'margin-bottom:10px' }, desc), h('div', { class: 'row' }, actions)));

  mount(topbar(h('button', { class: 'btn ghost small', onclick: () => (st.ready ? viewHome() : logout()) }, st.ready ? 'Geri' : 'Çıkış')),
    h('div', { class: 'wrap narrow', style: 'max-width:760px' },
      h('h1', {}, first ? 'Hoş geldiniz! Önce kısa bir kurulum.' : 'Bağlantılar'),
      h('p', { class: 'sub' }, 'Program, bilgisayarınızdaki Chrome üzerinden Google Flow ve yapay zeka sohbetini kullanır. Her biri için sadece "Bağlan" demeniz yeterli. Giriş gerekirse Chrome\'da yaparsınız, gerisini program halleder.'),
      h('div', { class: 'card' },
        item(1, st.flowTested, 'Google Flow',
          'Chrome açılır, Google hesabınızla giriş yapın (Google AI Pro/Ultra üyeliği gerekir). Program Flow\'u otomatik kontrol eder.',
          [h('button', { class: 'btn small', onclick: connect('flow', 'Google Flow\'a bağlanılıyor') }, st.flowTested ? 'Yeniden bağlan' : 'Flow\'a bağlan'),
            st.flowTested ? h('span', { class: 'badge ok' }, 'Hazır') : null]),
        item(2, st.chatTested, 'Prompt yazan yapay zeka (' + provName + ')',
          'Promptlar İngilizce olarak ' + provName + ' ile otomatik yazdırılır. Hangisini kullanacağınızı seçin. (ChatGPT ücretsiz sürümünde birden fazla görsel yüklenemez; bu durumda yalnızca ilk görsel kullanılır.)',
          [chips([{ v: 'chatgpt', t: 'ChatGPT' }, { v: 'claude', t: 'Claude' }], () => st.provider, async (v) => { await call('settings.set', { provider: v }); viewSetup(first); }),
            h('div', { style: 'flex-basis:100%' }),
            h('button', { class: 'btn small', onclick: connect(st.provider, provName + '\'a bağlanılıyor') }, st.chatTested ? 'Yeniden bağlan' : provName + '\'a bağlan'),
            st.chatTested ? h('span', { class: 'badge ok' }, 'Hazır') : null]),
        h('div', { class: 'check ' + (st.ready ? 'ok' : '') }, h('div', { class: 'dot' }, st.ready ? '✓' : '3'),
          h('div', { class: 'body' }, h('h3', {}, st.ready ? 'Her şey hazır!' : 'Son adım'),
            h('div', { class: 'muted small', style: 'margin-bottom:10px' }, st.ready ? 'Artık video üretebilirsiniz.' : 'İki bağlantı da hazır olunca program açılır.'),
            h('button', { class: 'btn', disabled: !st.ready, onclick: viewHome }, 'Programı kullanmaya başla')))),
      err));
}

async function logout() { await call('auth.logout'); S.user = null; viewLogin(); }

// ---------- ana ekran ----------
const MODES = [
  { id: 'ugc', ico: '🤳', t: 'UGC Video', d: 'Gerçekçi, Türkçe konuşan karakter. İsterseniz ürününüzü de tanıtsın.' },
  { id: 'product', ico: '📦', t: 'Ürün Tanıtımı', d: 'Ürün fotoğraflarınızdan profesyonel tanıtım videosu.' },
  { id: 'history', ico: '🏛️', t: 'Zaman Yolculuğu', d: 'Osmanlı, antik çağlar... Kendinizi tarihin içinde anlatın.' },
  { id: 'cine', ico: '🎬', t: 'Sinematik Film', d: 'Hayalinizdeki karakter ve hikaye. İstediğiniz kadar uzatın.' }
];

function viewHome() {
  const right = [
    h('button', { class: 'btn ghost small', onclick: viewLibrary }, 'Videolarım'),
    S.user && S.user.is_admin ? h('button', { class: 'btn ghost small', onclick: viewAdmin }, 'Yönetici') : null,
    h('button', { class: 'btn ghost small', onclick: viewSettings }, 'Ayarlar')
  ];
  mount(topbar(right), h('div', { class: 'wrap' },
    h('h1', {}, 'Ne üretmek istersiniz?'),
    h('p', { class: 'sub' }, 'Bir başlık seçin, gerisini program halleder.'),
    h('div', { class: 'grid' }, MODES.map((m) => h('button', { class: 'mode', onclick: () => startMode(m.id) },
      h('div', { class: 'ico' }, m.ico), h('h3', {}, m.t), h('p', {}, m.d))))));
  renderUpdateBanner();
}

// ---------- ayarlar ----------
function passwordBox() {
  const oldPw = h('input', { type: 'password', placeholder: 'Mevcut şifre', autocomplete: 'current-password' });
  const newPw = h('input', { type: 'password', placeholder: 'Yeni şifre (en az 6 karakter)', autocomplete: 'new-password' });
  const newPw2 = h('input', { type: 'password', placeholder: 'Yeni şifre (tekrar)', autocomplete: 'new-password' });
  const msg = h('div');
  const save = async () => {
    msg.replaceChildren();
    if (!oldPw.value) return msg.append(h('div', { class: 'err-box' }, 'Mevcut şifrenizi yazın.'));
    if (newPw.value.length < 6) return msg.append(h('div', { class: 'err-box' }, 'Yeni şifre en az 6 karakter olmalı.'));
    if (newPw.value !== newPw2.value) return msg.append(h('div', { class: 'err-box' }, 'Yeni şifreler aynı değil.'));
    try {
      await call('auth.changePassword', { oldPw: oldPw.value, newPw: newPw.value });
      oldPw.value = newPw.value = newPw2.value = '';
      toast('Şifreniz değiştirildi ✓');
      msg.append(h('div', { class: 'muted small' }, 'Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın.'));
    } catch (e) { msg.append(h('div', { class: 'err-box' }, e.message)); }
  };
  return h('div', {}, h('label', { class: 'f' }, 'Şifre değiştir'),
    h('div', { class: 'stack' }, oldPw, newPw, newPw2, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: save }, 'Şifreyi değiştir')), msg));
}

async function viewSettings() {
  const info = await call('app.info');
  const st = await call('setup.status');
  mount(topbar(h('button', { class: 'btn ghost small', onclick: viewHome }, 'Geri')), h('div', { class: 'wrap narrow', style: 'max-width:760px' },
    h('h1', {}, 'Ayarlar'),
    h('div', { class: 'card stack' },
      h('div', {}, h('label', { class: 'f' }, 'Videoların kaydedileceği klasör'),
        h('div', { class: 'row' }, h('code', {}, info.outputDir), h('button', { class: 'btn ghost small', onclick: async () => { await call('settings.pickOutput'); viewSettings(); } }, 'Değiştir'))),
      h('div', {}, h('label', { class: 'f' }, 'Bağlantılar'),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => viewSetup(false) }, 'Bağlantıları yönet'),
          h('span', { class: 'muted small' }, st.ready ? 'Her şey hazır.' : 'Eksik adımlar var.'))),
      h('div', {}, h('label', { class: 'f' }, 'Hesap'), h('div', { class: 'row' }, h('span', {}, S.user.email), h('button', { class: 'btn danger small', onclick: logout }, 'Çıkış yap'))),
      passwordBox(),
      h('div', { class: 'muted small' }, `AVK Sinema sürüm ${info.version} · ${info.platform === 'mac' ? 'Mac' : 'Windows'}`))));
}

// ---------- kütüphane ----------
async function viewLibrary() {
  const list = await call('projects.list');
  const picked = []; // seçim sırası = birleştirme sırası
  const delOne = async (p) => {
    if (!(await confirmBox({ title: 'Videoyu sil', text: `"${p.title || 'Video'}" ile ilgili tüm dosyalar (klipler, karakter görseli, storyboard) bilgisayarınızdan silinecek. Silmek istediğinize emin misiniz?` }))) return;
    await safe(() => call('projects.delete', { id: p.id })); toast('Silindi'); viewLibrary();
  };
  const delAll = async () => {
    if (!(await confirmBox({ title: 'Tüm dosyaları sil', text: 'Tüm dosyalar silinecek. Üretilen bütün videolar, karakter kitleri ve görseller bilgisayarınızdan kalıcı olarak kaldırılır. Silmek istediğinize emin misiniz?', ok: 'Hepsini sil' }))) return;
    await safe(() => call('projects.deleteAll')); toast('Tüm dosyalar silindi'); viewLibrary();
  };
  const smooth = h('input', { type: 'checkbox', checked: true });
  const bar = h('div', { class: 'card stack', style: 'margin-bottom:18px' });
  const drawBar = () => {
    bar.replaceChildren(
      h('div', {}, h('b', {}, 'Render: videoları tek filmde birleştirin'),
        h('div', { class: 'muted small' }, picked.length ? `${picked.length} video seçildi (seçim sırasıyla birleşir)` : 'Aşağıdan birleştirmek istediğiniz videoları seçin.')),
      h('label', { class: 'row small' }, smooth, 'Akıcı bağla (klipler kesintisiz, süre kaybı olmaz)'),
      h('button', { class: 'btn', disabled: picked.length < 1, onclick: async () => {
        const files = picked.flatMap((p) => (p.parts && p.parts.length ? p.parts : [p.final]));
        const out = await safe(() => job('Render alınıyor', () => call('video.render', { files, title: 'Film', smooth: smooth.checked }), { hint: 'Videolar birleştiriliyor, birkaç dakika sürebilir.' }));
        if (out) { notify('ok', 'Render hazır 🎬', 'Birleşik film kaydedildi.'); viewResult({ final: out, title: 'Film' }, viewLibrary); }
      } }, 'Render al'));
  };
  const cards = list.map((p) => {
    const cb = h('input', { type: 'checkbox', style: 'width:20px;height:20px', onchange: () => {
      const i = picked.indexOf(p);
      if (cb.checked && i < 0) picked.push(p); else if (!cb.checked && i >= 0) picked.splice(i, 1);
      drawBar(); num.textContent = picked.indexOf(p) >= 0 ? '#' + (picked.indexOf(p) + 1) : '';
    } });
    const num = h('span', { class: 'badge run' }, '');
    return h('div', { class: 'card row', style: 'justify-content:space-between' },
      h('div', { class: 'row' }, cb, h('div', {}, h('h3', { style: 'margin:0' }, p.title || 'Video'),
        h('div', { class: 'muted small' }, new Date(p.date).toLocaleString('tr-TR') + (p.parts && p.parts.length > 1 ? ` · ${p.parts.length} klip` : '')))),
      h('div', { class: 'row' }, num,
        h('button', { class: 'btn small', onclick: () => viewResult({ final: p.final, dir: p.dir, title: p.title }, viewLibrary) }, 'İzle'),
        h('button', { class: 'btn ghost small', onclick: () => call('files.reveal', { path: p.final || p.dir }) }, 'Klasörde göster'),
        h('button', { class: 'btn danger small', onclick: () => delOne(p) }, 'Sil')));
  });
  drawBar();
  mount(topbar(h('button', { class: 'btn ghost small', onclick: viewHome }, 'Geri')), h('div', { class: 'wrap' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h1', {}, 'Videolarım'),
      list.length ? h('button', { class: 'btn danger small', onclick: delAll }, 'Tüm dosyaları sil') : null),
    list.length ? h('div', {}, bar, h('div', { class: 'stack' }, cards)) : h('p', { class: 'sub' }, 'Henüz video üretmediniz.')));
}

function viewResult(res, back) {
  mount(topbar(h('button', { class: 'btn ghost small', onclick: back || viewHome }, 'Geri')), h('div', { class: 'wrap narrow', style: 'max-width:640px' },
    h('h1', {}, 'Videonuz hazır 🎉'),
    h('video', { class: 'player', controls: true, src: 'file://' + encodeURI(res.final).replace(/#/g, '%23') }),
    h('div', { class: 'row', style: 'margin-top:18px' },
      h('button', { class: 'btn', onclick: () => call('files.reveal', { path: res.final }) }, 'Klasörde göster'),
      h('button', { class: 'btn ghost', onclick: viewHome }, 'Ana sayfa'))));
}

// ---------- üretim sihirbazları ----------
let W = null;
function startMode(id) {
  call('task.start').catch(() => {}); // yeni görev: yeni Flow projesi ve yeni sohbet, görev boyunca aynıları kullanılır
  W = { id, step: 0, files: { ref: [], product: [] }, desc: '', kind: 'photo', nav: [], dir: null, aspect: '9:16' };
  ({ ugc: wUgc, product: wProduct, history: wHistory, cine: wCine })[id]();
}
// Video yönü seçici (dikey 9:16 / yatay 16:9)
function aspectPicker() {
  return h('div', {}, h('label', { class: 'f' }, 'Video yönü'),
    chips([{ v: '9:16', t: '📱 Dikey (9:16)' }, { v: '16:9', t: '🖥️ Yatay (16:9)' }], () => W.aspect, (v) => { W.aspect = v; }),
    h('div', { class: 'hint' }, 'Dikey: Reels, TikTok, Shorts. Yatay: YouTube, sunum, TV.'));
}
const charRef = () => (W.kind === 'avatar' ? 'flow:avatar' : W.kit);
const wFrame = (title, names, step, body) => mount(
  topbar(h('button', { class: 'btn ghost small', onclick: viewHome }, 'Ana sayfa')),
  h('div', { class: 'wrap narrow', style: 'max-width:820px' },
    h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('button', { class: 'btn ghost small', onclick: () => (step > 0 && W.nav[step - 1] ? W.nav[step - 1]() : viewHome()) }, '← Geri')),
    h('h1', {}, title), stepper(names, step), body));
const ensureDir = async (name) => { if (!W.dir) W.dir = await call('project.create', { name }); return W.dir; };
// Süre yazısı: 90 -> "1 dk 30 sn"
const fmtDur = (sec) => (sec < 60 ? sec + ' sn' : Math.floor(sec / 60) + ' dk' + (sec % 60 ? ' ' + (sec % 60) + ' sn' : ''));
// Toplam süreyi 15 sn'lik klip parçalarına böler. Son klip kalanı tamamlar; Flow en az 4 sn üretir,
// kalan 4 sn'den azsa bir önceki klip kısaltılır ki toplam TAM tutsun. Örn: 300 -> 20x15 | 100 -> 6x15+10 | 61 -> 15,15,15,12,4
function planClips(total) {
  total = Math.max(4, Math.round(total));
  const full = Math.floor(total / 15), rem = total - full * 15;
  const a = Array(full).fill(15);
  if (rem >= 4) a.push(rem);
  else if (rem > 0) { if (a.length) a[a.length - 1] = 15 - (4 - rem); a.push(4); }
  return a;
}
const planText = (p) => {
  const last = p[p.length - 1], n15 = p.filter((x) => x === 15).length;
  return n15 === p.length ? `${p.length} klip × 15 sn` : n15 === p.length - 1 ? `${n15} klip × 15 sn + 1 klip × ${last} sn` : p.map((x) => x + ' sn').join(' + ');
};
const freeNote = () => h('div', { class: 'hint' }, 'ℹ️ ChatGPT\'nin ücretsiz sürümünü kullanıyorsanız birden fazla görsel yükleyemezsiniz; bu durumda yapay zekaya yalnızca ilk görsel gösterilir (Flow\'a hepsi gönderilir). Birden fazla görsel için ChatGPT Plus gerekir.');
const NO_AVATAR = 'Programda avatarınız bulunamadı. Google Flow\'da "Avatarlar" bölümünden bir avatar oluşturun, sonra tekrar deneyin.';

// Karakter adımı (UGC ve Zaman Yolculuğu için ortak)
function characterStep(opts) {
  const { title, hint, names, next, again } = opts;
  const self = () => characterStep(opts);
  W.nav[0] = self;
  const err = h('div');
  if (W.kit && W.kitDone) return kitPreview();
  const desc = h('textarea', { placeholder: 'Örn: 28 yaşında, kısa siyah saçlı, sıcak gülümseyen bir kadın. Beyaz tişört giyiyor.' });
  desc.value = W.desc || '';
  const kindBox = h('div');
  const goBtn = h('button', { class: 'btn' }, 'Karakter kitini oluştur');
  const drawKind = () => {
    goBtn.textContent = W.kind === 'ready' ? 'İleri' : 'Karakter kitini oluştur';
    kindBox.replaceChildren(
      chips([{ v: 'photo', t: 'Referans fotoğrafım var' }, { v: 'text', t: 'Tarif edeceğim' }, { v: 'avatar', t: 'Flow avatarımı kullan' }, { v: 'ready', t: 'Hazır karakter kitim var' }], () => W.kind, (v) => { W.desc = desc.value; W.kind = v; drawKind(); }),
      h('div', { style: 'margin-top:16px' },
        W.kind === 'photo' || W.kind === 'ready' ? h('div', {}, h('label', { class: 'f' }, W.kind === 'ready' ? 'Karakter görseliniz' : 'Referans fotoğrafınız'), fileDrop({ files: W.files.ref }), hint ? h('div', { class: 'hint' }, hint) : null) : null,
        W.kind === 'avatar' ? h('div', { class: 'hint' }, 'Google Flow hesabınızdaki avatarınız kullanılır. Avatarınız yoksa program sizi uyarır.') : null,
        h('div', { style: 'margin-top:14px' }, h('label', { class: 'f' }, W.kind === 'text' ? 'Karakteri anlatın' : 'Kısa not (isteğe bağlı)'), desc)));
  };
  drawKind();
  const go = async () => {
    err.replaceChildren();
    W.desc = desc.value.trim();
    if ((W.kind === 'photo' || W.kind === 'ready') && !W.files.ref.length) return err.append(h('div', { class: 'err-box' }, 'Lütfen bir görsel seçin.'));
    if (W.kind === 'text' && W.desc.length < 8) return err.append(h('div', { class: 'err-box' }, 'Lütfen karakteri biraz daha anlatın.'));
    let refPaths = W.files.ref.map((f) => f.path);
    if (W.kind === 'ready') { // hazır kit: ChatGPT/Flow hiç açılmaz, doğrudan sonraki adıma geçilir
      W.kit = refPaths[0]; W.kitDone = true;
      W.charDesc = W.desc || 'the exact person shown in the attached character reference image (same face, hair and outfit)';
      return next();
    }
    const ready = false;
    const r = await safe(() => job(ready ? 'Karakter görseliniz inceleniyor' : 'Karakteriniz hazırlanıyor', async () => {
      const dir = await ensureDir(W.title || 'Video');
      if (W.kind === 'avatar') {
        const a = await call('flow.checkAvatar', { dir });
        if (!a.found) { const e = new Error(NO_AVATAR); throw e; }
        refPaths = a.file ? [a.file] : [];
      }
      if (W.kind === 'ready') { // hazır kit: yeni kit ÜRETİLMEZ, sadece görseldeki kişi kısaca tarif edilir
        const d = await call('chat.json', { template: 'describeCharacter', params: { note: W.desc }, files: [refPaths[0]] });
        W.charDesc = d.short_description; W.kit = refPaths[0]; return;
      }
      const j = await call('chat.json', { template: 'characterKit', params: { description: W.desc, hasReference: W.kind === 'photo' || W.kind === 'avatar' }, files: refPaths });
      W.charDesc = j.short_description;
      W.kit = await call('flow.image', { prompt: j.prompt, files: W.kind === 'photo' ? refPaths : W.kind === 'avatar' ? ['flow:avatar'] : [], dir, name: 'karakter-kiti.png', aspect: '16:9' });
    }, { stoppable: !ready, hint: ready ? 'Hazır karakter kitiniz kullanılacak, yeni kit üretilmez. Yapay zeka görseldeki kişiyi kısaca tarif ediyor.' : 'Önce prompt yazılır, sonra Flow görseli üretir. Bu 1-3 dakika sürebilir.' }), err);
    if (r !== null) { W.kitDone = true; if (!ready) notify('ok', 'Karakter kitiniz hazır', 'Beğenip devam edebilirsiniz.'); kitPreview(); }
  };
  goBtn.onclick = go;
  function kitPreview() {
    call('files.dataUrl', { path: W.kit }).then((du) => wFrame(title, names, 0, h('div', { class: 'card stack' },
      h('h2', {}, 'Karakter kitiniz'), h('img', { class: 'preview', src: du }),
      h('p', { class: 'muted small' }, W.charDesc),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: next }, 'Beğendim, devam et'),
        h('button', { class: 'btn ghost', onclick: () => { W.kit = null; W.kitDone = false; self(); } }, W.kind === 'ready' ? 'Başka görsel seç' : 'Yeniden üret')))));
  }
  wFrame(title, names, 0, h('div', { class: 'card stack' },
    h('h2', {}, 'Karakteriniz kim?'), kindBox, aspectPicker(),
    goBtn, err));
}

// Klip inceleme + üretim (ortak)
function clipsReview(args) {
  const { title, names, step, clips, refs, chain, startFrame, onDone, extraTop } = args;
  W.nav[step] = () => clipsReview(args);
  const err = h('div');
  const list = h('div', {}, clips.map((c, i) => h('div', { class: 'clip' },
    h('span', { class: 'badge' }, `Klip ${i + 1} · ${c.seconds || 8} sn`), c.turkish_line ? h('span', { class: 'line' }, '“' + c.turkish_line + '”') : h('span', { class: 'muted' }, 'Görsel anlatım'),
    h('details', {}, h('summary', {}, 'İngilizce promptu gör / düzenle'),
      h('textarea', { oninput: (e) => { c.prompt = e.target.value; } }, c.prompt)))));
  const totalSec = clips.reduce((a, c) => a + (+c.seconds || 8), 0);
  const credit = clips.some((c) => (+c.seconds || 8) >= 15) ? Math.round(totalSec * 4) : 0; // 15 sn ≈ 60 kredi
  const estimate = `Toplam video süresi: ${fmtDur(totalSec)} · ${clips.length} klip` + (credit ? ` · yaklaşık ${credit} Flow kredisi` : '') + ` · tahmini bekleme: ${clips.length * 4}-${clips.length * 6} dk`;
  const go = async () => {
    err.replaceChildren();
    if (clips.length > 8 && !(await confirmBox({ title: 'Uzun üretim', text: `${estimate}. Bu üretim uzun sürer; bilgisayarınız uyumasın ve Chrome penceresini kapatmayın. Başlayalım mı?`, ok: 'Başla' }))) return;
    const r = await safe(() => job('Videonuz üretiliyor', async () => {
      const dir = await ensureDir(W.title || 'Video');
      return call('flow.clips', { clips, refs, chain, startFrame, aspect: W.aspect, dir, title: W.title || 'video' });
    }, { stoppable: true, hint: 'Her klip birkaç dakika sürer. Chrome penceresini kapatmayın.' }), err);
    if (r) { notify('ok', 'Videonuz hazır 🎉', W.title || ''); onDone(r); }
  };
  wFrame(title, names, step, h('div', { class: 'card stack' },
    h('h2', {}, `${clips.length} klip hazırlandı`), extraTop, h('p', { class: 'hint', style: 'margin:0' }, estimate),
    h('p', { class: 'sub', style: 'margin:0' }, 'Her klibin altındaki ok ile promptu görebilir ve isterseniz düzeltebilirsiniz. Bilmiyorsanız dokunmayın.'),
    list, h('button', { class: 'btn', onclick: go }, 'Videoyu üret'), err));
}

// 1) UGC
function wUgc() {
  const names = ['Karakter', 'Video', 'Sahneler', 'Sonuç'];
  const step1 = () => characterStep({ title: 'UGC Video', hint: 'Net, yüzü açık bir fotoğraf en iyi sonucu verir.', names, next: step2, again: step1 });
  const step2 = () => {
    W.nav[1] = step2;
    const err = h('div');
    const script = h('textarea', { style: 'min-height:170px', placeholder: 'Videoda ne anlatılacak? Konuşma metnini ya da sadece fikri yazın.\nÖrn: Bu cilt serumunu 2 haftadır kullanıyorum ve cildimde şaşırtıcı bir fark gördüm...' });
    script.value = W.script || '';
    const note = h('input', { type: 'text', placeholder: 'Ürün hakkında kısa not (isteğe bağlı)' });
    note.value = W.note || '';
    wFrame('UGC Video', names, 1, h('div', { class: 'card stack' },
      h('h2', {}, 'Video konusu veya senaryosu'), script,
      h('div', {}, h('label', { class: 'f' }, 'Ürün tanıtacaksa ürün görseli (isteğe bağlı)'), fileDrop({ files: W.files.product }), freeNote(), h('div', { style: 'margin-top:10px' }, note)),
      h('button', {
        class: 'btn', onclick: async () => {
          W.script = script.value.trim(); W.note = note.value;
          if (W.script.length < 10) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen konuyu biraz daha yazın.'));
          const r = await safe(() => job('Sahneler hazırlanıyor', () => call('chat.json', {
            template: 'ugcScenes', params: { characterDesc: W.charDesc, script: W.script, hasProduct: W.files.product.length > 0, productNote: note.value, aspect: W.aspect },
            files: [W.kit, ...W.files.product.map((f) => f.path)]
          }), { hint: 'Yapay zeka senaryonuzu klip klip planlıyor...' }), err);
          if (!r) return;
          W.title = r.title || 'UGC Video';
          step3(r.clips);
        }
      }, 'Sahneleri hazırla'), err));
  };
  const step3 = (clips) => clipsReview({
    title: 'UGC Video', names, step: 2, clips, refs: [charRef(), ...W.files.product.map((f) => f.path)], chain: false,
    onDone: (r) => viewResult(r)
  });
  step1();
}

// 2) Ürün tanıtımı
function wProduct() {
  const names = ['Ürün', 'Sahneler', 'Sonuç'];
  const STYLES = ['Lüks ve şık', 'Minimal beyaz stüdyo', 'Sosyal medya (canlı, enerjik)', 'Sinematik', 'Doğal ve sıcak yaşam tarzı'];
  W.style = STYLES[0]; W.count = 3;
  const err = h('div');
  W.nav[0] = wProduct;
  const note = h('input', { type: 'text', placeholder: 'Ürün nedir? (örn: lavanta kokulu el kremi)' });
  const custom = h('input', { type: 'text', placeholder: 'Veya kendi tarzınızı yazın (örn: Apple reklamı gibi sade)' });
  wFrame('Ürün Tanıtımı', names, 0, h('div', { class: 'card stack' },
    h('h2', {}, 'Ürün görselleriniz'), fileDrop({ multi: true, files: W.files.product, label: 'Ürün fotoğraflarını seçin (1-4 adet)' }), freeNote(), note,
    h('div', {}, h('label', { class: 'f' }, 'Nasıl bir tarz istersiniz?'), chips(STYLES.map((s) => ({ v: s, t: s })), () => W.style, (v) => { W.style = v; custom.value = ''; }), h('div', { style: 'margin-top:10px' }, custom)),
    h('div', {}, h('label', { class: 'f' }, 'Kaç sahne?'), chips([2, 3, 4].map((n) => ({ v: n, t: n + ' sahne' })), () => W.count, (v) => { W.count = v; })),
    aspectPicker(),
    h('button', {
      class: 'btn', onclick: async () => {
        if (!W.files.product.length) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen en az bir ürün görseli seçin.'));
        const r = await safe(() => job('Sahneler hazırlanıyor', () => call('chat.json', {
          template: 'productShots', params: { style: custom.value.trim() || W.style, productNote: note.value, count: W.count, aspect: W.aspect }, files: W.files.product.map((f) => f.path)
        })), err);
        if (!r) return;
        W.title = r.title || 'Ürün Tanıtımı';
        clipsReview({ title: 'Ürün Tanıtımı', names, step: 1, clips: r.clips, refs: W.files.product.map((f) => f.path), chain: false, onDone: (x) => viewResult(x) });
      }
    }, 'Sahneleri hazırla'), err));
}

// 3) Zaman yolculuğu
const HISTORY_LENGTHS = [
  ['15', '15 saniye'], ['30', '30 saniye'], ['45', '45 saniye'], ['60', '1 dakika'], ['120', '2 dakika'],
  ['300', '5 dakika'], ['600', '10 dakika'], ['900', '15 dakika'], ['custom', 'Özel süre (saniye yazın)']
];
const setBusyStatus = (t) => { const st = $('#busy .status'); if (st) st.textContent = t; };
// Yapay zekanın yazdığı klipleri plana uydurur: sayı ve süreler plandaki gibi olmalı
function fitClips(list, durs) {
  if (!Array.isArray(list) || list.length < durs.length) throw new Error('Yapay zeka eksik sahne yazdı. Lütfen tekrar deneyin.');
  return list.slice(0, durs.length).map((c, i) => ({ ...c, seconds: durs[i], turkish_line: c.turkish_line || '', prompt: String(c.prompt || '') }));
}
async function writeHistoryClips(durs) {
  const base = { characterDesc: W.charDesc, story: W.story, aspect: W.aspect };
  if (durs.length <= 5) { // kısa: tek istekte
    const r = await call('chat.json', { template: 'historyScenes', params: { ...base, durations: durs }, files: [W.kit] });
    return { title: r.title, clips: fitClips(r.clips, durs) };
  }
  // uzun: önce hikayeyi bölümlere ayır, sonra 4'erli gruplar halinde klip promptlarını yazdır
  setBusyStatus('Hikaye bölümlere ayrılıyor...');
  const o = await call('chat.json', { template: 'historyOutline', params: { story: W.story, durations: durs } });
  const beats = Array.isArray(o.beats) ? o.beats.slice(0, durs.length) : [];
  while (beats.length < durs.length) beats.push(beats[beats.length - 1] || W.story);
  const clips = []; let prevNote = '';
  for (let i = 0; i < durs.length; i += 4) {
    const to = Math.min(i + 4, durs.length);
    setBusyStatus(`Sahneler yazılıyor: klip ${i + 1}-${to} / ${durs.length}`);
    const params = { ...base, title: o.title || '', beats, from: i, to, durations: durs, prevNote };
    let got;
    for (let attempt = 0; ; attempt++) {
      try { const r = await call('chat.json', { template: 'historyBatch', params, files: i === 0 ? [W.kit] : [] }); got = fitClips(r.clips, durs.slice(i, to)); break; }
      catch (e) { if (attempt >= 1) throw e; }
    }
    clips.push(...got);
    prevNote = beats[to - 1];
  }
  return { title: o.title, clips };
}

function wHistory() {
  const names = ['Karakter', 'Hikaye', 'Sahneler', 'Sonuç'];
  const step1 = () => characterStep({ title: 'Zaman Yolculuğu', hint: 'Fotoğrafınızı seçebilir ya da "Flow avatarımı kullan" diyebilirsiniz.', names, next: step2, again: step1 });
  const step2 = () => {
    W.nav[1] = step2;
    const err = h('div');
    W.lenSel = W.lenSel || '30';
    const story = h('textarea', { style: 'min-height:130px', placeholder: 'Hangi anı canlandıralım? Örn: Şehzade Mustafa\'nın son gecesi, Konya Ereğlisi, 1553' });
    story.value = W.story || '';
    const era = h('input', { type: 'text', placeholder: 'Dönem (isteğe bağlı): Osmanlı, Roma, Selçuklu...' });
    const ideasBox = h('div', { class: 'stack' });
    const suggest = async () => {
      const r = await safe(() => job('Hikaye fikirleri aranıyor', () => call('chat.json', { template: 'historyIdeas', params: { era: era.value } }), { hint: 'Yapay zeka size hikaye öneriyor...' }), err);
      if (!r) return;
      ideasBox.replaceChildren(...r.ideas.map((i) => h('div', { class: 'clip', style: 'cursor:pointer', onclick: () => { story.value = `${i.title} (${i.era}). ${i.hook}`; toast('Seçildi'); } },
        h('div', { class: 'line' }, i.title), h('div', { class: 'muted small' }, `${i.era} · ${i.hook}`))));
    };
    // Uzunluk: açılır menü + özel süre (saniye). Klip planı otomatik hesaplanır.
    const sel = h('select', { onchange: () => { W.lenSel = sel.value; drawPlan(); } }, HISTORY_LENGTHS.map(([v, t]) => h('option', { value: v, selected: v === W.lenSel }, t)));
    const custom = h('input', { type: 'number', min: '4', max: '1800', step: '1', placeholder: 'Süre (saniye). Örn: 90', style: 'margin-top:10px' });
    custom.value = W.customSec || '';
    const planBox = h('div', { class: 'hint' });
    const totalSec = () => (W.lenSel === 'custom' ? Math.round(+custom.value || 0) : +W.lenSel);
    function drawPlan() {
      custom.style.display = W.lenSel === 'custom' ? '' : 'none';
      const t = totalSec();
      if (!t || t < 4) { planBox.textContent = 'Toplam süreyi saniye olarak yazın (en az 4 sn).'; return; }
      if (t > 1800) { planBox.textContent = 'En fazla 30 dakika (1800 sn) üretilebilir.'; return; }
      const p = planClips(t);
      planBox.textContent = `${fmtDur(t)} (${t} sn) için: ${planText(p)}. Flow'da tek video en fazla 15 sn üretildiği için video parçalara bölünür, üretilen klipler toplamı tam ${t} sn eder. Yaklaşık ${t * 4} Flow kredisi harcanır.`;
    }
    custom.addEventListener('input', () => { W.customSec = custom.value; drawPlan(); });
    drawPlan();
    wFrame('Zaman Yolculuğu', names, 1, h('div', { class: 'card stack' },
      h('h2', {}, 'Hangi hikayeyi anlatalım?'), story,
      h('div', {}, h('label', { class: 'f' }, 'Öneri istiyorsanız'), era, h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn ghost small', onclick: suggest }, '✨ Bana hikaye öner'))),
      ideasBox,
      h('div', {}, h('label', { class: 'f' }, 'Uzunluk'), sel, custom, planBox),
      h('button', {
        class: 'btn', onclick: async () => {
          W.story = story.value.trim();
          if (W.story.length < 10) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen bir hikaye yazın veya öneriden seçin.'));
          const t = totalSec();
          if (!t || t < 4 || t > 1800) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen 4 ile 1800 saniye arasında bir süre seçin veya yazın.'));
          const durs = planClips(t);
          const r = await safe(() => job('Sahneler hazırlanıyor', () => writeHistoryClips(durs), { hint: durs.length > 5 ? 'Uzun hikaye bölümlere ayrılıp klip klip yazılıyor, birkaç dakika sürebilir...' : 'Yapay zeka sahneleri yazıyor...' }), err);
          if (!r) return;
          W.title = r.title || 'Zaman Yolculuğu';
          clipsReview({ title: 'Zaman Yolculuğu', names, step: 2, clips: r.clips, refs: [charRef()], chain: true, onDone: (x) => viewResult(x) });
        }
      }, 'Sahneleri hazırla'), err));
  };
  step1();
}

// 4) Sinematik
function wCine() {
  const names = ['Karakter', 'Hikaye', 'Sahneler', 'Sonuç'];
  W.allClips = []; W.storyLog = '';
  const step1 = () => {
    W.nav[0] = () => (W.kit ? preview() : step1());
    const err = h('div');
    const idea = h('textarea', { placeholder: 'Hayalinizdeki karakteri yazın. Örn: Ayda savaşan fütüristik bir Türk askeri. Kararlı bakışlı, 35 yaşında.' });
    idea.value = W.idea || '';
    wFrame('Sinematik Film', names, 0, h('div', { class: 'card stack' },
      h('h2', {}, 'Karakterinizi hayal edin'), idea, aspectPicker(),
      h('div', {}, h('label', { class: 'f' }, 'Referans görsel (isteğe bağlı)'), fileDrop({ files: W.files.ref })),
      h('button', {
        class: 'btn', onclick: async () => {
          W.idea = idea.value.trim();
          if (W.idea.length < 8) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen karakteri biraz daha anlatın.'));
          const refs = W.files.ref.map((f) => f.path);
          const r = await safe(() => job('Karakteriniz oluşturuluyor', async () => {
            const dir = await ensureDir('Sinematik');
            const j = await call('chat.json', { template: 'cinematicCharacter', params: { idea: W.idea, aspect: W.aspect }, files: refs });
            W.charDesc = j.short_description;
            W.kit = await call('flow.image', { prompt: j.prompt, files: refs, dir, name: 'karakter.png', aspect: W.aspect });
          }, { stoppable: true, hint: 'Önce sahne promptu yazılır, sonra Flow görseli üretir.' }), err);
          if (r !== null) { notify('ok', 'Karakteriniz hazır', 'Beğenip hikayeye geçebilirsiniz.'); preview(); }
        }
      }, 'Karakteri oluştur'), err));
  };
  const preview = async () => {
    const du = await call('files.dataUrl', { path: W.kit });
    wFrame('Sinematik Film', names, 0, h('div', { class: 'card stack' }, h('h2', {}, 'Karakteriniz'), h('img', { class: 'preview', src: du }), h('p', { class: 'muted small' }, W.charDesc),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: step2 }, 'Beğendim, hikayeye geç'), h('button', { class: 'btn ghost', onclick: () => { W.kit = null; step1(); } }, 'Yeniden üret'))));
  };
  const boardView = async (panels, sbImg, note) => {
    const sbUrl = sbImg ? await call('files.dataUrl', { path: sbImg }) : null;
    return h('div', { class: 'stack' },
      sbUrl ? h('img', { class: 'preview', src: sbUrl }) : null,
      h('table', {}, h('tr', {}, h('th', {}, 'Zaman'), h('th', {}, 'Plan')),
        ...panels.map((p) => h('tr', {}, h('td', {}, p.time), h('td', {}, h('b', {}, p.title + ': '), p.action)))),
      h('p', { class: 'hint' }, note || 'Video 15 saniye olarak üretilir (Flow\'da yaklaşık 60 kredi). Karakter görseli ve bu storyboard referans olarak eklenir.'));
  };
  const step2 = () => {
    W.nav[1] = step2;
    const err = h('div');
    const story = h('textarea', { placeholder: 'Hikayeyi bir cümleyle anlatın. Örn: Karakter terk edilmiş bir ay üssünde gizemli bir ışığı fark eder.' });
    story.value = W.story || '';
    wFrame('Sinematik Film', names, 1, h('div', { class: 'card stack' },
      h('h2', {}, 'Hikayeniz'), story,
      h('button', {
        class: 'btn', onclick: async () => {
          W.story = story.value.trim();
          if (W.story.length < 10) return err.replaceChildren(h('div', { class: 'err-box' }, 'Lütfen hikayeyi bir cümleyle yazın.'));
          const r = await safe(() => job('Storyboard hazırlanıyor', async () => {
            const dir = await ensureDir('Sinematik');
            const sb = await call('chat.json', { template: 'cinematicStoryboard', params: { characterDesc: W.charDesc, story: W.story }, files: [W.kit] });
            // Karakter görseli Flow'da zaten var: kütüphaneden referans olarak eklenir
            const sbImg = await call('flow.image', { prompt: sb.storyboard_image_prompt, files: [W.kit], dir, name: 'storyboard-1.png', aspect: '16:9' });
            const vp = await call('chat.json', { template: 'cinematicVideo', params: { characterDesc: W.charDesc, panels: sb.panels, isContinuation: false, aspect: W.aspect }, files: [W.kit, sbImg] });
            return { sb, sbImg, vp };
          }, { stoppable: true, hint: 'Storyboard planlanıyor, görseli Flow\'da üretiliyor ve 15 saniyelik video promptu yazılıyor...' }), err);
          if (!r) return;
          W.title = 'Sinematik Film'; W.storyLog = W.story; W.part = 1; W.lastSb = r.sbImg; W.prevPanels = r.sb.panels;
          notify('ok', 'Storyboard hazır', 'Sahneyi inceleyip videoyu üretebilirsiniz.');
          clipsReview({
            title: 'Sinematik Film', names, step: 2, clips: [{ seconds: 15, turkish_line: '', prompt: r.vp.prompt }],
            refs: [W.kit, r.sbImg], chain: false, extraTop: await boardView(r.sb.panels, r.sbImg),
            onDone: (x) => { W.allClips = x.clips; W.final = x.final; step4(x); }
          });
        }
      }, 'Storyboard ve sahneyi hazırla'), err));
  };
  // Hikayeyi devam ettirme: ilk storyboard'un devamı olan yeni storyboard + 15 sn video, aynı Flow projesinde
  const step4 = (res) => {
    W.nav[3] = () => step4(res);
    const err = h('div');
    const renderSmooth = h('input', { type: 'checkbox', checked: true });
    const renderAll = async () => {
      const out = await safe(() => job('Render alınıyor', () => call('video.render', { files: W.allClips, title: 'Sinematik Film', smooth: renderSmooth.checked }), { hint: 'Bölümler birleştiriliyor, birkaç dakika sürebilir.' }), err);
      if (out) { notify('ok', 'Render hazır 🎬', 'Birleşik film kaydedildi.'); viewResult({ final: out, title: 'Sinematik Film' }, () => step4(res)); }
    };
    const dirInput = h('textarea', { style: 'min-height:90px', placeholder: 'Sonraki bölüm nasıl devam etsin? (boş bırakırsanız yapay zeka karar verir)' });
    const ideas = h('div', { class: 'chips' });
    const suggest = async () => {
      const r = await safe(() => job('Fikirler aranıyor', () => call('chat.json', { template: 'nextStoryIdeas', params: { storySoFar: W.storyLog } })), err);
      if (r) ideas.replaceChildren(...r.options.map((o) => h('button', { class: 'chip', onclick: () => { dirInput.value = o; } }, o)));
    };
    const more = async () => {
      const r = await safe(() => job('Devam storyboard\'u hazırlanıyor', async () => {
        const lastFrame = await call('video.lastFrame', { file: W.allClips[W.allClips.length - 1], dir: W.dir });
        const nx = await call('chat.json', { template: 'cinematicStoryboardNext', params: { characterDesc: W.charDesc, storySoFar: W.storyLog, prevPanels: W.prevPanels, userDirection: dirInput.value.trim() }, files: [W.lastSb] });
        // Karakter görseli ve önceki storyboard Flow kütüphanesinden referans olarak eklenir
        const sbImg = await call('flow.image', { prompt: nx.storyboard_image_prompt, files: [W.kit, W.lastSb], dir: W.dir, name: `storyboard-${(W.part || 1) + 1}.png`, aspect: '16:9' });
        const vp = await call('chat.json', { template: 'cinematicVideo', params: { characterDesc: W.charDesc, panels: nx.panels, isContinuation: true, aspect: W.aspect }, files: [W.kit, sbImg, lastFrame] });
        return { nx, sbImg, vp, lastFrame };
      }, { stoppable: true, hint: 'Devam storyboard\'u üretiliyor ve 15 saniyelik video promptu yazılıyor...' }), err);
      if (!r) return;
      W.part = (W.part || 1) + 1;
      W.storyLog += ' | ' + (r.nx.summary_tr || dirInput.value);
      const prevSb = W.lastSb; W.lastSb = r.sbImg; W.prevPanels = r.nx.panels;
      notify('ok', 'Devam storyboard\'u hazır', 'Sahneyi inceleyip videoyu üretebilirsiniz.');
      clipsReview({
        title: 'Hikayeyi devam ettir', names, step: 2, clips: [{ seconds: 15, turkish_line: '', prompt: r.vp.prompt }],
        refs: [W.kit, r.sbImg, r.lastFrame], chain: false,
        extraTop: await boardView(r.nx.panels, r.sbImg, 'Bu storyboard öncekinin devamıdır. Referanslar: karakter, bu storyboard ve önceki klibin son karesi. Video 15 saniye (yaklaşık 60 kredi).'),
        onDone: (x) => { W.allClips = [...W.allClips, ...x.clips]; step4({ clips: W.allClips, final: x.final }); }
      });
    };
    mount(topbar(h('button', { class: 'btn ghost small', onclick: viewHome }, 'Ana sayfa')), h('div', { class: 'wrap narrow', style: 'max-width:820px' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn ghost small', onclick: () => W.nav[2] && W.nav[2]() }, '← Geri')),
      h('h1', {}, 'Filminiz hazır 🎬'), stepper(names, 3),
      h('div', { class: 'card stack' },
        h('video', { class: 'player', controls: true, src: 'file://' + encodeURI(res.final).replace(/#/g, '%23') }),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => call('files.reveal', { path: res.final }) }, 'Klasörde göster')),
        h('div', { class: 'row small muted' }, `${W.allClips.length} bölüm üretildi. Bölümler: `,
          ...W.allClips.map((f, i) => h('button', { class: 'btn ghost small', onclick: () => step4({ clips: W.allClips, final: f }) }, 'Bölüm ' + (i + 1))))),
      h('div', { class: 'card stack', style: 'margin-top:20px' },
        h('h2', {}, 'Render: tüm bölümleri tek filmde birleştir 🎞️'),
        h('p', { class: 'sub', style: 'margin:0' }, 'Bölümler, akışı bozmadan birleştirilir: bir önceki bölümün son karesi ile sonraki bölümün başı yumuşak geçişle (görüntü ve ses) birbirine eklenir.'),
        h('label', { class: 'row small' }, renderSmooth, 'Yumuşak geçiş (önerilen)'),
        h('button', { class: 'btn', onclick: renderAll }, 'Render al (tek video)')),
      h('div', { class: 'card stack', style: 'margin-top:20px' },
        h('h2', {}, 'Hikaye burada bitmesin 🚀'), h('p', { class: 'sub', style: 'margin:0' }, 'İstediğiniz kadar uzatabilirsiniz. Her bölüm için öncekinin devamı olan yeni bir storyboard ve 15 saniyelik video üretilir.'),
        dirInput, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: suggest }, '✨ Bana fikir ver'), ideas),
        h('button', { class: 'btn', onclick: more }, 'Hikayeyi devam ettir'), err)));
  };
  step1();
}

// ---------- yönetici ----------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = []; const seen = new Set();
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === ';' || ch === '\t') && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const nameIdx = head.findIndex((x) => /^(name|full ?name|ad ?soyad|isim)$/.test(x));
  const fIdx = head.findIndex((x) => /first/.test(x)), lIdx = head.findIndex((x) => /last/.test(x));
  for (const l of lines) {
    const m = l.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (!m) continue;
    const email = m[0].toLowerCase(); if (seen.has(email)) continue; seen.add(email);
    const c = split(l);
    let name = nameIdx >= 0 ? c[nameIdx] : [fIdx >= 0 ? c[fIdx] : '', lIdx >= 0 ? c[lIdx] : ''].join(' ').trim();
    if (name && name.includes('@')) name = '';
    rows.push({ email, name: name || '' });
  }
  return rows;
}

async function viewAdmin(tab = 'members') {
  const body = h('div', { class: 'card' }, 'Yükleniyor...');
  const tabs = h('div', { class: 'tabs' },
    ['members:Üyeler', 'import:CSV yükle'].map((t) => { const [k, n] = t.split(':'); return h('button', { class: tab === k ? 'on' : '', onclick: () => viewAdmin(k) }, n); }));
  mount(topbar(h('button', { class: 'btn ghost small', onclick: viewHome }, 'Geri')), h('div', { class: 'wrap' }, h('h1', {}, 'Yönetici paneli'), tabs, body));
  const err = h('div');
  if (tab === 'members') {
    const list = await safe(() => call('admin.list'), body);
    if (!list) return;
    const q = h('input', { type: 'text', placeholder: 'E-posta veya isim ara...' });
    const tbl = h('div');
    const draw = () => {
      const f = q.value.toLowerCase();
      tbl.replaceChildren(h('table', {}, h('tr', {}, ['E-posta', 'İsim', 'Durum', 'Son görülme', 'Sürüm', ''].map((x) => h('th', {}, x))),
        ...list.filter((m) => !f || (m.email + ' ' + (m.full_name || '')).toLowerCase().includes(f)).map((m) => h('tr', {},
          h('td', {}, m.email), h('td', {}, m.full_name || ''),
          h('td', {}, h('span', { class: 'badge ' + (m.active ? 'ok' : '') }, m.active ? 'Aktif' : 'Pasif')),
          h('td', {}, m.last_seen ? new Date(m.last_seen).toLocaleDateString('tr-TR') : '-'), h('td', {}, m.app_version || '-'),
          h('td', {}, m.is_admin ? 'Yönetici' : h('button', { class: 'btn ghost small', onclick: async () => { await safe(() => call('admin.setActive', { email: m.email, active: !m.active })); viewAdmin('members'); } }, m.active ? 'Kapat' : 'Aç'))))));
    };
    q.addEventListener('input', draw); draw();
    body.replaceChildren(h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:12px' }, h('b', {}, `${list.length} üye · ${list.filter((m) => m.active).length} aktif`), h('div', { style: 'width:280px' }, q)), tbl);
  } else if (tab === 'import') {
    let rows = null;
    const deact = h('input', { type: 'checkbox', checked: true });
    const out = h('div');
    const pick = async () => {
      const t = await call('files.csv'); if (!t) return;
      rows = parseCsv(t);
      out.replaceChildren(h('p', {}, h('b', {}, rows.length + ' e-posta bulundu.'), ' İlk 5: ' + rows.slice(0, 5).map((r) => r.email).join(', ')),
        h('label', { class: 'row' }, deact, 'Listede olmayan üyeleri kapat (Skool\'dan ayrılanlar)'),
        h('button', { class: 'btn', onclick: async () => {
          const r = await safe(() => job('Üyeler yükleniyor', () => call('admin.import', { rows, deactivateMissing: deact.checked })), err);
          if (r) toast(`${r.added} yeni, ${r.reactivated} yeniden açıldı, ${r.deactivated} kapatıldı`);
        } }, 'Üyeleri kaydet'));
    };
    body.replaceChildren(h('div', { class: 'stack' }, h('h2', {}, 'Skool üye listesini yükleyin'),
      h('p', { class: 'sub', style: 'margin:0' }, 'Skool\'dan indirdiğiniz CSV dosyasını seçin. İçindeki e-postalar otomatik üye olur.'),
      h('button', { class: 'btn', onclick: pick }, 'CSV dosyası seç'), out, err));
  } else if (false) {
    const ta = h('textarea', { style: 'min-height:240px;font-family:monospace;font-size:13px', placeholder: '[ {"key":"promptBox","label":"..."}, ... ]' });
    body.replaceChildren(h('div', { class: 'stack' }, h('h2', {}, 'Düğme listesini uzaktan güncelle'),
      h('p', { class: 'sub', style: 'margin:0' }, 'Google Flow arayüzü değişirse, kalibrasyon adım listesini buradan tüm üyelere gönderebilirsiniz (JSON). Üyeler bir sonraki kalibrasyonda yeni listeyi kullanır.'),
      ta, h('button', { class: 'btn', onclick: async () => {
        let v; try { v = JSON.parse(ta.value); } catch (_) { return toast('Geçerli JSON değil'); }
        const r = await safe(() => call('admin.setConfig', { key: 'flow_steps', value: v }), err); if (r !== null) toast('Kaydedildi');
      } }, 'Kaydet'), err));
  }
}

boot();
