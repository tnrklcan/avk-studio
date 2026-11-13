// Supabase'e doğrudan REST ile bağlanır (ek paket gerekmez).
const fs = require('fs');
const path = require('path');
const store = require('./store');

let cfg = null;
function config() {
  if (cfg) return cfg;
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')); } catch (_) { cfg = {}; }
  return cfg;
}
const DEV = process.env.AVK_DEV === '1';
const configured = () => !!(config().supabaseUrl && config().supabaseAnonKey && !/YOUR|BURAYA/i.test(config().supabaseUrl));

async function api(pathname, { method = 'POST', body, token, headers = {} } = {}) {
  const c = config();
  const res = await fetch(c.supabaseUrl.replace(/\/$/, '') + pathname, {
    method,
    headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) { /* boş */ }
  if (!res.ok) {
    const msg = (json && (json.msg || json.message || json.error_description || json.error)) || text || ('HTTP ' + res.status);
    const e = new Error(String(msg)); e.status = res.status; throw e;
  }
  return json;
}

function trError(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('üye listesinde') || m.includes('database error saving')) return 'Bu e-posta AI Video Kulübü üye listesinde bulunamadı. Skool\'da kullandığınız e-postayı yazın.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Bu e-posta için zaten şifre belirlenmiş. "Giriş yap" sekmesini kullanın.';
  if (m.includes('invalid login')) return 'E-posta veya şifre hatalı. İlk kez giriyorsanız "İlk giriş" sekmesinden şifre belirleyin.';
  if (m.includes('password') && m.includes('6')) return 'Şifre en az 6 karakter olmalı.';
  if (m.includes('fetch failed') || m.includes('network')) return 'İnternet bağlantısı kurulamadı.';
  return e.message;
}

function saveSession(s, extra = {}) {
  const cur = store.get('session') || {};
  store.set('session', {
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: Date.now() + (s.expires_in || 3600) * 1000,
    email: (s.user && s.user.email) || cur.email,
    verified_at: cur.verified_at, status: cur.status, ...extra
  });
}

async function refreshIfNeeded() {
  const s = store.get('session');
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s;
  const j = await api('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
  saveSession(j);
  return store.get('session');
}

async function verify(version, platform) {
  const s = await refreshIfNeeded();
  const st = await api('/rest/v1/rpc/my_status', { token: s.access_token, body: { p_version: version, p_platform: platform } });
  store.set('session', { ...store.get('session'), status: st, verified_at: Date.now() });
  return st;
}

async function signIn(email, password, version, platform) {
  if (DEV && !configured()) {
    const st = { active: true, is_admin: /admin/i.test(email), full_name: 'Geliştirici' };
    store.set('session', { email, status: st, verified_at: Date.now(), dev: true });
    return { email, ...st };
  }
  try {
    const j = await api('/auth/v1/token?grant_type=password', { body: { email: email.trim().toLowerCase(), password } });
    saveSession(j);
    const st = await verify(version, platform);
    if (!st.active) { store.set('session', null); throw new Error('Üyeliğiniz aktif değil. Skool üyeliğinizi kontrol edin.'); }
    return { email: email.trim().toLowerCase(), ...st };
  } catch (e) { throw new Error(trError(e)); }
}

async function firstSignup(email, password, version, platform) {
  if (DEV && !configured()) return signIn(email, password, version, platform);
  try {
    await api('/auth/v1/signup', { body: { email: email.trim().toLowerCase(), password } });
  } catch (e) { throw new Error(trError(e)); }
  return signIn(email, password, version, platform);
}

// Açılışta: kayıtlı oturumu doğrula. İnternet yoksa en fazla 3 gün tolerans.
async function restore(version, platform) {
  const s = store.get('session');
  if (!s) return null;
  if (s.dev && DEV) return { email: s.email, ...s.status };
  try {
    const st = await verify(version, platform);
    if (!st.active) { store.set('session', null); return { blocked: true }; }
    return { email: s.email, ...st };
  } catch (e) {
    if (e.status === 400 || e.status === 401) { store.set('session', null); return null; }
    const grace = 3 * 24 * 3600 * 1000;
    if (s.status && s.status.active && s.verified_at && Date.now() - s.verified_at < grace) return { email: s.email, ...s.status, offline: true };
    return null;
  }
}

function signOut() { store.set('session', null); }

async function rpc(name, body) {
  const s = await refreshIfNeeded();
  try { return await api('/rest/v1/rpc/' + name, { token: s.access_token, body: body || {} }); }
  catch (e) { throw new Error(trError(e)); }
}

async function remoteConfig(key) {
  if (!configured()) return null;
  try {
    const s = await refreshIfNeeded();
    const j = await api('/rest/v1/remote_config?key=eq.' + encodeURIComponent(key) + '&select=value', { method: 'GET', token: s.access_token });
    return j && j[0] ? j[0].value : null;
  } catch (_) { return null; }
}

module.exports = { configured, signIn, firstSignup, restore, signOut, rpc, remoteConfig, DEV };
