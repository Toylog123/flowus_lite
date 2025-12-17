export const State = {
    pages: [], currentPageId: null, menuTargetId: null,
    dragging: { active: false }, blockDrag: { src: null }
};

export const Utils = {
    uuid: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
    debounce: (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; },
    dateDiff: (d1, d2) => Math.ceil((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24)),
    addDays: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
};

export const FileIO = {
    handle: null,
    async initNew() { State.pages = [{ id: Utils.uuid(), title: '未命名项目', parentId: null, updatedAt: Date.now(), blocks: [] }]; this.launch(); },
    async initOpen() {
        if(!window.showOpenFilePicker) { document.getElementById('fallback-input').style.display='block'; return; }
        try { [this.handle] = await window.showOpenFilePicker(); const f = await this.handle.getFile(); State.pages = JSON.parse(await f.text()); this.launch(); } catch(e) {}
    },
    handleLegacyOpen(input) { const r = new FileReader(); r.onload = e => { State.pages = JSON.parse(e.target.result); this.launch(); }; r.readAsText(input.files[0]); },
    launch() { document.getElementById('welcome-screen').style.display='none'; document.getElementById('app').style.display='flex'; window.App.loadPage(State.pages[0].id); this.updateStatus(); },
    async saveFile() {
        if(!this.handle) { try{ this.handle = await window.showSaveFilePicker(); }catch(e){return;} }
        const w = await this.handle.createWritable(); await w.write(JSON.stringify(State.pages)); await w.close(); this.updateStatus("已保存");
    },
    updateStatus(msg) { const el=document.getElementById('file-status'); el.innerText=msg||(this.handle?this.handle.name:"未保存"); el.style.color=msg?"var(--success)":"var(--text-hint)"; }
};