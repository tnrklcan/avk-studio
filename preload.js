const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('avk', {
  call: async (name, args) => {
    const r = await ipcRenderer.invoke('api', name, args);
    if (r.error) { const e = new Error(r.error); e.code = r.code; e.site = r.site; e.detail = r.detail; throw e; }
    return r.data;
  },
  on: (fn) => ipcRenderer.on('evt', (_e, evt) => fn(evt)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openExternal: (url) => ipcRenderer.invoke('api', 'files.openDir', { path: url })
});
