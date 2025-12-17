import { State, Utils, FileIO } from './data.js';

export const Modules = {
    // 1. 横向时间轴 (Gantt)
    renderHorizontalTimeline(block) {
        if(!block.tracks) block.tracks = [{id:'t1', name:'轨道A'}, {id:'t2', name:'轨道B'}];
        if(!block.events) block.events = [{id:'e1', trackId:'t1', title:'示例事件', start:new Date().toISOString(), duration:5, status:'doing'}];
        if(!block.zoomLevel) block.zoomLevel = 'week';

        const wrapper = document.createElement('div'); wrapper.className = 'horizontal-timeline module-card'; wrapper.id = `ht-${block.id}`;
        
        // Control Bar
        const controls = document.createElement('div'); controls.className = 'timeline-controls module-toolbar';
        controls.innerHTML = `
            <input class="module-title" value="${block.name||'项目时间轴'}" onchange="window.App.updBlock(this,'${block.id}','name')">
            <div style="display:flex;gap:4px">
                <select class="btn" onchange="window.TimelineLogic.zoom('${block.id}', this.value)">
                    <option value="year" ${block.zoomLevel==='year'?'selected':''}>年</option>
                    <option value="month" ${block.zoomLevel==='month'?'selected':''}>月</option>
                    <option value="week" ${block.zoomLevel==='week'?'selected':''}>周</option>
                    <option value="day" ${block.zoomLevel==='day'?'selected':''}>日</option>
                </select>
                <button class="btn" onclick="window.TimelineLogic.addEvent('${block.id}')">+ 事件</button>
                <button class="btn" onclick="document.getElementById('ht-${block.id}').classList.toggle('ht-fullscreen')">全屏</button>
            </div>
        `;
        wrapper.appendChild(controls);

        // Body
        const body = document.createElement('div'); body.className = 'timeline-body';
        const sidebar = document.createElement('div'); sidebar.className = 'track-headers';
        block.tracks.forEach(t => { const h = document.createElement('div'); h.className = 'track-header-item'; h.innerText = t.name; sidebar.appendChild(h); });
        body.appendChild(sidebar);

        const content = document.createElement('div'); content.className = 'timeline-content';
        
        // Scale Logic
        const unitMap = { 'year': 365, 'month': 30, 'week': 7, 'day': 1 };
        const colWidthMap = { 'year': 100, 'month': 60, 'week': 40, 'day': 40 };
        const daysPerUnit = unitMap[block.zoomLevel];
        const colWidth = colWidthMap[block.zoomLevel];
        const renderUnits = 50; const startDate = new Date(); startDate.setDate(startDate.getDate() - 10);

        const scale = document.createElement('div'); scale.className = 'time-scale';
        for(let i=0; i<renderUnits; i++) {
            const cell = document.createElement('div'); cell.className = 'time-unit'; cell.style.width = colWidth + 'px';
            const d = Utils.addDays(startDate, i * daysPerUnit);
            cell.innerText = block.zoomLevel==='day' ? `${d.getMonth()+1}/${d.getDate()}` : `${d.getMonth()+1}月`;
            scale.appendChild(cell);
        }
        content.appendChild(scale);

        const tracksContainer = document.createElement('div'); tracksContainer.className = 'tracks-container';
        document.documentElement.style.setProperty('--grid-width', colWidth+'px');
        
        block.tracks.forEach(() => {
            const row = document.createElement('div'); row.className = 'timeline-track-row'; row.style.width = (renderUnits * colWidth) + 'px';
            tracksContainer.appendChild(row);
        });

        block.events.forEach(ev => {
            const tidx = block.tracks.findIndex(t => t.id === ev.trackId); if(tidx === -1) return;
            const startDiff = Utils.dateDiff(startDate, ev.start);
            const left = (startDiff / daysPerUnit) * colWidth;
            const width = (ev.duration / daysPerUnit) * colWidth;
            const top = tidx * 50 + 10;

            const bar = document.createElement('div'); bar.className = `timeline-event event-${ev.status||'doing'}`;
            bar.style.left = left + 'px'; bar.style.width = Math.max(24, width) + 'px'; bar.style.top = top + 'px';
            bar.innerText = ev.status==='milestone' ? '' : ev.title; bar.title = ev.title; bar.id = `ev-${block.id}-${ev.id}`;
            bar.innerHTML = `<div class="resize-handle left"></div>${bar.innerText}<div class="resize-handle right"></div>`;
            bar.onmousedown = (e) => window.TimelineLogic.startDrag(e, block.id, ev.id, colWidth, daysPerUnit, startDate);
            bar.ondblclick = (e) => { e.stopPropagation(); window.Modal.open(block.id, ev); };
            tracksContainer.appendChild(bar);
        });

        content.appendChild(tracksContainer);
        content.onscroll = () => { sidebar.scrollTop = content.scrollTop; };
        body.appendChild(content); wrapper.appendChild(body);
        return wrapper;
    },

    // 2. 垂直时间轴
    renderVTimeline(block) {
        const card = document.createElement('div'); card.className='module-card';
        card.innerHTML = `<div class="module-toolbar"><input class="module-title" value="${block.name||'垂直时间轴'}" onchange="window.App.updBlock(this,'${block.id}','name')"><button class="btn" onclick="window.App.addVItem('${block.id}')">+ 节点</button></div>`;
        const con = document.createElement('div'); con.className='v-timeline-wrapper';
        con.innerHTML = `<div class="v-timeline-line"></div>`;
        (block.events||[]).forEach((ev, i) => {
            con.innerHTML += `<div class="vt-item"><div class="vt-dot"></div><div class="vt-card"><div class="vt-header" contenteditable onblur="window.App.updVItem('${block.id}',${i},'title',this.innerText)">${ev.title}</div><div class="vt-meta"><span class="vt-tag" contenteditable onblur="window.App.updVItem('${block.id}',${i},'date',this.innerText)">${ev.date}</span></div></div></div>`;
        });
        card.appendChild(con); return card;
    },

    // 3. 看板
    renderKanban(block) {
        if(!block.columns) block.columns = [{id:'c1', name:'待办', cards:[]}];
        const card = document.createElement('div'); card.className='module-card';
        card.innerHTML = `<div class="module-toolbar"><input class="module-title" value="${block.name||'看板'}" onchange="window.App.updBlock(this,'${block.id}','name')"><button class="btn" onclick="window.Kanban.addCol('${block.id}')">+ 列</button></div>`;
        const bd = document.createElement('div'); bd.className='scroll-container kanban-board';
        block.columns.forEach((c,i)=>{
            const col = document.createElement('div'); col.className='kb-column';
            col.innerHTML = `<div class="kb-header" style="border-top:4px solid var(--accent)">${c.name}</div>`;
            const list = document.createElement('div'); list.className='kb-list';
            list.ondragover=e=>{e.preventDefault();}; list.ondrop=e=>{e.preventDefault();window.Kanban.drop(block.id, c.id);};
            c.cards.forEach(card=>{
                const cd=document.createElement('div'); cd.className='kb-card'; cd.innerText=card.title; cd.draggable=true;
                cd.ondragstart=()=>{State.dragging={type:'card', blockId:block.id, itemId:card.id, srcCol:c.id}};
                list.appendChild(cd);
            });
            const add=document.createElement('div'); add.className='kb-add-btn'; add.innerText='+ 卡片'; add.onclick=()=>window.Kanban.addCard(block.id,c.id);
            col.append(list,add); bd.appendChild(col);
        });
        card.appendChild(bd); return card;
    },

    // 4. 表格
    renderTable(block) {
        const card = document.createElement('div'); card.className='module-card';
        card.innerHTML = `<div class="module-toolbar"><input class="module-title" value="${block.name||'表格'}" onchange="window.App.updBlock(this,'${block.id}','name')"><div><button class="btn" onclick="window.App.tableRow('${block.id}')">+ 行</button></div></div>`;
        const tcon = document.createElement('div'); tcon.className='flowus-table-container';
        let html = `<table class="flowus-table"><tbody>`;
        (block.data||[['','']]).forEach((row,r)=>{ html += `<tr>${row.map((c,ci)=>`<td contenteditable onblur="window.App.updTable('${block.id}',${r},${ci},this.innerText)">${c}</td>`).join('')}</tr>`; });
        tcon.innerHTML = html+'</tbody></table>'; card.appendChild(tcon); return card;
    }
};