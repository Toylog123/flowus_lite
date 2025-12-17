import { State, Utils, FileIO } from './data.js';
import { Modules } from './modules.js';

const App = {
    loadPage(id) {
        State.currentPageId = id; const p = State.pages.find(x=>x.id===id);
        document.getElementById('page-title').value = p.title;
        const path = []; let curr = p; while(curr){ path.unshift(curr.title); curr = State.pages.find(x=>x.id===curr.parentId); }
        document.getElementById('breadcrumb').innerText = path.join(' / ');
        Render.sidebar(); Render.editor(p.blocks); FileIO.saveFile();
    },
    render() { Render.editor(State.pages.find(x=>x.id===State.currentPageId).blocks); FileIO.saveFile(); },
    addBlock(id) { 
        const p = State.pages.find(x=>x.id===State.currentPageId); const nb = {id:Utils.uuid(), type:'text', content:''};
        if(id) { const idx=p.blocks.findIndex(b=>b.id===id); p.blocks.splice(idx+1,0,nb); } else p.blocks.push(nb);
        this.render(); setTimeout(()=>document.querySelector(`[data-id="${nb.id}"] .block-content`)?.focus(),0);
    },
    appendBlock() { this.addBlock(); },
    toggleTodo(id) { const b = this.getBlock(id); b.checked = !b.checked; this.render(); },
    transform(type) { const b = this.getBlock(State.menuTargetId); b.type = type; b.content = ''; Menu.close(); this.render(); },
    createSubPage() {
        const newId = Utils.uuid(); State.pages.push({id: newId, title: '未命名子页', parentId: State.currentPageId, blocks: []});
        const b = this.getBlock(State.menuTargetId); b.type = 'page'; b.pageId = newId; Menu.close(); App.loadPage(State.currentPageId);
    },
    getBlock(id) { return State.pages.find(x=>x.id===State.currentPageId).blocks.find(b=>b.id===id); },
    updBlock(el, id, key) { const b = this.getBlock(id); b[key] = el.value; FileIO.saveFile(); },
    addVItem(bid) { const b = this.getBlock(bid); if(!b.events) b.events=[]; b.events.push({title:'节点', date:'2025-01-01'}); this.render(); },
    updVItem(bid, i, k, v) { const b=this.getBlock(bid); b.events[i][k]=v; FileIO.saveFile(); },
    tableRow(bid) { const b = this.getBlock(bid); b.data.push(new Array(b.data[0].length).fill('')); this.render(); },
    updTable(bid, r, c, v) { const b = this.getBlock(bid); b.data[r][c] = v; FileIO.saveFile(); },
    createPage() { const id=Utils.uuid(); State.pages.push({id, title:'New', blocks:[]}); App.loadPage(id); },
    deletePage() { if(confirm('Del?')){ State.pages=State.pages.filter(p=>p.id!==State.currentPageId); App.loadPage(State.pages[0].id); } },
    toggleSidebar() { document.getElementById('sidebar').classList.toggle('closed'); },
    reorderBlock(src, dest) {
        if(src===dest) return;
        const blks = State.pages.find(x=>x.id===State.currentPageId).blocks;
        const sIdx = blks.findIndex(b=>b.id===src); const dIdx = blks.findIndex(b=>b.id===dest);
        const [moved] = blks.splice(sIdx, 1); blks.splice(dIdx, 0, moved); this.render();
    },
    focusEditor(e) { if(e.target.classList.contains('editor-scroller')) App.appendBlock(); }
};

const Render = {
    sidebar() {
        const l = document.getElementById('page-list'); l.innerHTML = '';
        State.pages.forEach(p => {
            const d = document.createElement('div'); d.className=`sidebar-item ${p.id===State.currentPageId?'active':''}`;
            d.innerText = p.title||'无标题'; d.onclick=()=>App.loadPage(p.id); l.appendChild(d);
        });
    },
    editor(blocks) {
        const c = document.getElementById('blocks-container'); c.innerHTML = '';
        blocks.forEach(b => c.appendChild(this.createBlock(b)));
    },
    createBlock(block) {
        const w = document.createElement('div'); w.className='block-wrapper'; w.dataset.id=block.id;
        w.draggable = true;
        w.ondragstart = (e) => { State.blockDrag.src = block.id; w.style.opacity = 0.5; };
        w.ondragend = () => { w.style.opacity = 1; document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target')); };
        w.ondragover = (e) => { e.preventDefault(); w.classList.add('drop-target'); };
        w.ondragleave = () => w.classList.remove('drop-target');
        w.ondrop = (e) => { e.preventDefault(); App.reorderBlock(State.blockDrag.src, block.id); };

        const g = document.createElement('div'); g.className='gutter';
        g.innerHTML = `<span class="gutter-btn" onclick="event.stopPropagation(); Menu.open(event,'${block.id}')">+</span><span class="gutter-btn" style="cursor:grab">⋮⋮</span>`;
        w.appendChild(g);

        if(block.type==='timeline-h') w.appendChild(Modules.renderHorizontalTimeline(block));
        else if(block.type==='timeline-v') w.appendChild(Modules.renderVTimeline(block));
        else if(block.type==='kanban') w.appendChild(Modules.renderKanban(block));
        else if(block.type==='table') w.appendChild(Modules.renderTable(block));
        else if(block.type==='page') {
            const p = State.pages.find(x=>x.id===block.pageId);
            const d = document.createElement('div'); d.className='module-card'; d.style.padding='10px'; d.innerHTML=`📄 <u>${p?p.title:'Deleted'}</u>`; d.onclick=()=>App.loadPage(block.pageId); w.appendChild(d);
        } else {
            const d = document.createElement('div'); d.className='block-content'; d.contentEditable=true; d.innerText=block.content;
            if(block.type==='text') d.setAttribute('placeholder', "输入 '/'");
            d.oninput = (e) => { block.content = e.target.innerText; if(e.target.innerText==='/') Menu.open(null, block.id, e.target); };
            d.onkeydown = (e) => { if(e.key==='Enter'){e.preventDefault(); App.addBlock(block.id);} };
            if(block.type==='todo') {
                const cw=document.createElement('div'); cw.className='todo-wrap';
                const cb=document.createElement('div'); cb.className='checkbox-wrapper'; cb.innerHTML='<div class="checkbox"></div>';
                cb.onclick=(e)=>{e.stopPropagation();App.toggleTodo(block.id);};
                if(block.checked) w.classList.add('checked');
                cw.append(cb, d); w.appendChild(cw);
            } else w.appendChild(d);
        }
        return w;
    }
};

const TimelineLogic = {
    zoom(bid, level) { const b = App.getBlock(bid); b.zoomLevel = level; App.render(); },
    addEvent(bid) { const b = App.getBlock(bid); b.events.push({id:Utils.uuid(), trackId:'t1', title:'New', start:new Date().toISOString(), duration:5, status:'doing'}); App.render(); },
    startDrag(e, bid, eid, colW, daysPerUnit, startD) {
        e.preventDefault(); e.stopPropagation();
        const cls = e.target.classList; const type = cls.contains('left')?'l':(cls.contains('right')?'r':'m');
        State.dragging = { active:true, type, bid, eid, startX: e.clientX, colW, daysPerUnit, startD, ev: App.getBlock(bid).events.find(x=>x.id===eid) };
    },
    move(e) {
        if(!State.dragging.active) return;
        const s = State.dragging; const dx = e.clientX - s.startX; 
        const unitsChange = dx / s.colW; const daysChange = Math.round(unitsChange * s.daysPerUnit);
        // Only update data on end, but we can redraw for smooth feedback if optimization allows.
        // For simplicity in module split, we just update on end.
    },
    end(e) {
        if(!State.dragging.active) return;
        const s = State.dragging; const dx = e.clientX - s.startX; 
        const unitsChange = dx / s.colW; const daysChange = Math.round(unitsChange * s.daysPerUnit);
        if(s.type==='m') s.ev.start = Utils.addDays(new Date(s.ev.start), daysChange).toISOString();
        else if(s.type==='r') s.ev.duration = Math.max(1, s.ev.duration + daysChange);
        State.dragging.active=false; App.render();
    }
};

const Kanban = {
    addCol(bid) { const b=App.getBlock(bid); b.columns.push({id:Utils.uuid(), name:'New', cards:[]}); App.render(); },
    addCard(bid, cid) { const c=App.getBlock(bid).columns.find(x=>x.id===cid); c.cards.push({id:Utils.uuid(), title:'Card'}); App.render(); },
    drop(bid, targetColId) {
        const { itemId, srcCol } = State.dragging; if(!itemId) return;
        const b = App.getBlock(bid); const sCol = b.columns.find(x=>x.id===srcCol); const tCol = b.columns.find(x=>x.id===targetColId);
        const [card] = sCol.cards.splice(sCol.cards.findIndex(x=>x.id===itemId), 1); tCol.cards.push(card);
        State.dragging={}; App.render();
    }
};

const Menu = {
    el: document.getElementById('slash-menu'),
    open(e, id, triggerEl) {
        State.menuTargetId = id; const rect = (triggerEl || document.querySelector(`[data-id="${id}"]`)).getBoundingClientRect();
        this.el.classList.add('show'); this.el.style.left = (rect.left + 20) + 'px'; this.el.style.top = (rect.bottom + 5) + 'px';
    },
    close() { this.el.classList.remove('show'); }
};

const Modal = {
    el: document.getElementById('event-modal'),
    open(bid, ev) { this.curr={bid,ev}; document.getElementById('ev-title').value=ev.title; this.el.style.display='flex'; },
    save() { this.curr.ev.title=document.getElementById('ev-title').value; this.close(); App.render(); },
    close() { this.el.style.display='none'; }
};

window.App = App; window.FileIO = FileIO; window.Menu = Menu; window.TimelineLogic = TimelineLogic; window.Kanban = Kanban; window.Modal = Modal;
window.onload = () => {
    document.getElementById('page-title').oninput = (e) => { State.pages.find(x=>x.id===State.currentPageId).title = e.target.value; FileIO.saveFile(); Render.sidebar(); };
    document.addEventListener('mouseup', TimelineLogic.end);
    document.addEventListener('click', (e) => { if(!e.target.closest('#slash-menu')) Menu.close(); });
};