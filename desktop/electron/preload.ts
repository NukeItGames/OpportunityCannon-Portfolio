import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("cannon", {
  call: (name: string, ...args: any[]) =>
    ipcRenderer.invoke("cannon", name, ...args),
  progress: (fn: (s: string) => void) => {
    const cb = (_: any, s: string) => fn(s);
    ipcRenderer.on("progress", cb);
    return () => ipcRenderer.removeListener("progress", cb);
  },
});
