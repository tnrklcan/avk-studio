// Basit JSON depolama: ayarlar, kalibrasyon, oturum, proje geçmişi (kullanıcının bilgisayarında).
const fs = require('fs');
const path = require('path');

let dir = null;
let data = { settings: {}, calib: {}, session: null, projects: [] };

function file() { return path.join(dir, 'avk-store.json'); }

function init(userDataDir) {
  dir = userDataDir;
  fs.mkdirSync(dir, { recursive: true });
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch (_) { /* ilk açılış */ }
}

function save() {
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file());
}

const get = (k) => data[k];
const set = (k, v) => { data[k] = v; save(); };

function setCalib(site, step, desc) {
  data.calib[site] = data.calib[site] || {};
  data.calib[site][step] = desc;
  save();
}
const getCalib = (site, step) => (data.calib[site] || {})[step] || null;
const calibDone = (site, steps) => steps.every((s) => getCalib(site, s));
function clearCalib(site) { delete data.calib[site]; save(); }

function addProject(p) {
  data.projects.unshift(p);
  data.projects = data.projects.slice(0, 200);
  save();
}
function updateProject(id, patch) {
  const p = data.projects.find((x) => x.id === id);
  if (p) { Object.assign(p, patch); save(); }
  return p;
}

module.exports = { init, get, set, setCalib, getCalib, calibDone, clearCalib, addProject, updateProject, dir: () => dir };
