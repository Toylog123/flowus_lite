/**
 * FlowUs Lite Pro Logic
 * Enhanced with Vertical Hierarchical Timeline
 */
(function() {
    "use strict";

    // --- 1. 状态管理 ---
    const State = {
        pages: [],
        currentPageId: null,
        currentBlocks: [],
        activeBlockId: null,
        menuContext: null,
        // UI 状态缓存 (blockId -> { collapsedYears: [], collapsedMonths: [] })
        timelineState: {} 
    };

    const Utils = {
        uuid: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
        debounce: (fn, delay) => {
            let timer;
            return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
        },
        // 获取星期几
        getWeekDay: (dateStr) => {
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return days[new Date(dateStr).getDay()];
        },
        // 字数统计
        countWords: (blocks) => {
            let count = 0;
            blocks.forEach(b => {
                if (b.type === 'text' || b.type.startsWith('h')) count += (b.content || '').length;
            });
            return count;
        }
    };

    // --- 2. 数据库 (IndexedDB) ---
    const DB = {
        name: 'FlowUsLite_Pro_V2',
        version: 1,
        db: null,
        async init() {
            return new Promise(resolve => {
                const req = indexedDB.open(this.name, this.version);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' });
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            });
        },
        async getAll() {
            return new Promise(resolve => {
                const tx = this.db.transaction('pages', 'readonly');
                resolve(new Promise(res => tx.objectStore('pages').getAll().onsuccess = e => res(e.target.result || [])));
            });
        },
        async save(page) { const tx = this.db.transaction('pages', 'readwrite'); tx.objectStore('pages').put(page); },
        async delete(id) { const tx = this.db.transaction('pages', 'readwrite'); tx.objectStore('pages').delete(id); }
    };

    // --- 3. UI 渲染器 ---
    const Render = {
        sidebarList: document.getElementById('page-list'),
        tocList: document.getElementById('toc-list'),
        blocksContainer: document.getElementById('blocks-container'),
        
        sidebar() {
            this.sidebarList.innerHTML = '';
            State.pages.sort((a,b) => b.updatedAt - a.updatedAt).forEach(p => {
                const el = document.createElement('div');
                el.className = `sidebar-item ${p.id === State.currentPageId ? 'active' : ''}`;
                el.innerHTML = `<span class="icon">📄</span> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title || '无标题'}</span>`;
                el.onclick = () => App.loadPage(p.id);
                this.sidebarList.appendChild(el);
            });
        },

        toc(blocks) {
            this.tocList.innerHTML = '';
            blocks.forEach(b => {
                if (b.type === 'h1' || b.type === 'h2') {
                    const el = document.createElement('div');
                    el.className = `sidebar-item ${b.type}`;
                    el.innerText = b.content || '(空标题)';
                    el.onclick = () => {
                        const target = document.querySelector(`.content-block[data-id="${b.id}"]`);
                        if (target) target.scrollIntoView({behavior: 'smooth'});
                    };
                    this.tocList.appendChild(el);
                }
            });
        },

        // --- 核心：Block 渲染 ---
        createBlockDOM(block) {
            const wrapper = document.createElement('div');
            wrapper.className = `content-block ${block.checked ? 'checked' : ''}`;
            wrapper.dataset.id = block.id;

            // 侧边拖拽手柄
            const handle = document.createElement('div');
            handle.className = 'block-handle-area';
            handle.innerHTML = `<svg><use href="#icon-drag"/></svg>`;
            handle.onclick = (e) => App.openBlockMenu(e, block.id);
            wrapper.appendChild(handle);

            // 类型分发
            if (block.type === 'timeline') {
                wrapper.appendChild(this.renderTimeline(block));
            } else if (block.type === 'table') {
                wrapper.appendChild(this.renderTable(block));
            } else if (block.type === 'cols') {
                wrapper.appendChild(this.renderCols(block));
            } else {
                // 基础文本/标题
                if (block.type === 'todo') {
                    const checkWrap = document.createElement('div');
                    checkWrap.className = 'checkbox-wrapper';
                    checkWrap.innerHTML = `<div class="checkbox"></div>`;
                    checkWrap.onclick = () => App.toggleTodo(block.id);
                    wrapper.appendChild(checkWrap);
                }
                const content = document.createElement('div');
                content.className = 'block-content';
                content.contentEditable = true;
                content.innerText = block.content;
                if (block.type === 'text') content.dataset.placeholder = "输入 '/' 插入功能块";
                if (block.type === 'h1') content.dataset.placeholder = "一级标题";
                
                // 样式修正
                if (block.type === 'h1') content.style.fontSize = '30px';
                if (block.type === 'h2') content.style.fontSize = '24px';

                content.oninput = (e) => App.handleInput(e, block.id);
                content.onkeydown = (e) => App.handleKey(e, block.id);
                wrapper.appendChild(content);
            }
            return wrapper;
        },

        // --- 渲染：高级时间轴 (Vertical Hierarchy) ---
        renderTimeline(block) {
            const container = document.createElement('div');
            container.className = 'timeline-v2-container';
            
            // 工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'block-toolbar';
            toolbar.innerHTML = `
                <span style="font-weight:bold;margin-right:8px">📅 项目日程</span>
                <button class="toolbar-btn" onclick="App.addTimelineEvent('${block.id}')">+ 新建事件</button>
            `;
            container.appendChild(toolbar);

            // 初始化数据
            if (!block.events || !Array.isArray(block.events)) {
                block.events = [
                    { id: 1, title: '项目启动会', date: '2025-10-20', type: 'meeting', status: 'done', owner: '张三' },
                    { id: 2, title: '需求文档定稿', date: '2025-10-20', type: 'task', status: 'doing', priority: 'high' },
                    { id: 3, title: '第一阶段里程碑', date: '2025-10-25', type: 'milestone', status: 'todo' },
                    { id: 4, title: '2026年规划', date: '2026-01-15', type: 'meeting' }
                ];
            }

            // 数据分组：Year -> Month -> Date
            const grouped = {};
            block.events.forEach(ev => {
                const d = new Date(ev.date);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const dateKey = ev.date; // "2025-10-20"
                
                if (!grouped[y]) grouped[y] = {};
                if (!grouped[y][m]) grouped[y][m] = {};
                if (!grouped[y][m][dateKey]) grouped[y][m][dateKey] = [];
                grouped[y][m][dateKey].push(ev);
            });

            // UI 状态
            const uiState = State.timelineState[block.id] || { collapsedYears: {}, collapsedMonths: {} };

            // 渲染分组
            Object.keys(grouped).sort().forEach(year => {
                const yearWrap = document.createElement('div');
                yearWrap.className = 'tl-year-group';
                if (uiState.collapsedYears[year]) yearWrap.classList.add('tl-group-collapsed');

                // 年标题
                const yearHeader = document.createElement('div');
                yearHeader.className = 'tl-year-header';
                yearHeader.innerHTML = `<svg class="tl-toggle-icon"><use href="#icon-chevron-down"/></svg> ${year}年`;
                yearHeader.onclick = () => {
                    uiState.collapsedYears[year] = !uiState.collapsedYears[year];
                    State.timelineState[block.id] = uiState;
                    App.reloadBlock(block.id);
                };
                yearWrap.appendChild(yearHeader);

                // 月份列表
                const monthList = document.createElement('div');
                monthList.className = 'tl-month-list';

                Object.keys(grouped[year]).sort((a,b) => a-b).forEach(month => {
                    const monthWrap = document.createElement('div');
                    monthWrap.className = 'tl-month-group';
                    
                    // 月标题
                    const monthHeader = document.createElement('div');
                    monthHeader.className = 'tl-month-header';
                    // 计算该月事件总数
                    let eventCount = 0;
                    Object.values(grouped[year][month]).forEach(arr => eventCount += arr.length);
                    
                    monthHeader.innerHTML = `
                        <span>${month}月</span>
                        <span class="tl-month-badge">${eventCount} 事件</span>
                    `;
                    monthWrap.appendChild(monthHeader);

                    // 日期行列表
                    Object.keys(grouped[year][month]).sort().forEach(dateStr => {
                        const dayRow = document.createElement('div');
                        dayRow.className = 'tl-day-row';
                        
                        // 左侧：日期标签
                        const dateObj = new Date(dateStr);
                        const dayLabel = document.createElement('div');
                        dayLabel.className = 'tl-day-label';
                        dayLabel.innerHTML = `
                            <div class="tl-day-num">${dateObj.getDate()}日</div>
                            <div class="tl-day-week">${Utils.getWeekDay(dateStr)}</div>
                        `;
                        dayRow.appendChild(dayLabel);

                        // 右侧：事件列表
                        const eventList = document.createElement('div');
                        eventList.className = 'tl-event-list';
                        
                        grouped[year][month][dateStr].forEach(ev => {
                            const card = document.createElement('div');
                            card.className = `event-card type-${ev.type || 'task'}`;
                            
                            // 图标
                            let iconChar = '●';
                            if(ev.type==='meeting') iconChar='○';
                            if(ev.type==='milestone') iconChar='★';

                            card.innerHTML = `
                                <div class="ec-drag-handle">⋮⋮</div>
                                <div class="ec-header">
                                    <span class="ec-icon">${iconChar}</span>
                                    <div class="ec-title" contenteditable="true">${ev.title}</div>
                                </div>
                                <div class="ec-props">
                                    ${ev.status ? `<span class="ec-tag status-${ev.status}">${ev.status==='done'?'已完成':'进行中'}</span>` : ''}
                                    ${ev.priority ? `<span class="ec-tag priority-${ev.priority}">${ev.priority==='high'?'高优':''}</span>` : ''}
                                </div>
                                <div class="ec-meta">
                                    <div class="ec-meta-item"><svg class="icon-small"><use href="#icon-clock"/></svg> ${ev.time || '全天'}</div>
                                    ${ev.owner ? `<div class="ec-meta-item"><svg class="icon-small"><use href="#icon-user"/></svg> ${ev.owner}</div>` : ''}
                                </div>
                            `;
                            
                            // 简单的标题编辑回写
                            const titleEl = card.querySelector('.ec-title');
                            titleEl.onblur = (e) => {
                                ev.title = e.target.innerText;
                                App.save();
                            };

                            eventList.appendChild(card);
                        });

                        // 快速添加按钮
                        const addBtn = document.createElement('div');
                        addBtn.className = 'tl-add-btn';
                        addBtn.innerHTML = `+ 添加`;
                        addBtn.onclick = () => App.addTimelineEvent(block.id, dateStr);
                        eventList.appendChild(addBtn);

                        dayRow.appendChild(eventList);
                        monthWrap.appendChild(dayRow);
                    });

                    monthList.appendChild(monthWrap);
                });

                yearWrap.appendChild(monthList);
                container.appendChild(yearWrap);
            });

            return container;
        },

        // --- 渲染：表格 (保留) ---
        renderTable(block) {
            const container = document.createElement('div');
            // ... (复用之前的表格渲染逻辑，为节省篇幅略，请确保包含之前的 table 逻辑)
            // 这里为了完整性建议保留之前的 tableAction 逻辑
            container.innerHTML = `<div style="padding:10px;border:1px dashed #ddd;text-align:center">表格模块 (请复用之前逻辑)</div>`;
            return container;
        },
        renderCols(block) {
            const el = document.createElement('div');
            el.className = 'col-layout';
            el.innerHTML = `<div class="col-item" contenteditable></div><div class="col-item" contenteditable></div>`;
            return el;
        },

        editor(blocks) {
            this.blocksContainer.innerHTML = '';
            blocks.forEach(b => this.blocksContainer.appendChild(this.createBlockDOM(b)));
            // 更新统计
            document.getElementById('word-count').innerText = `${Utils.countWords(blocks)} 字`;
            document.getElementById('block-count').innerText = `${blocks.length} 块`;
            this.toc(blocks);
        }
    };

    // --- 4. 核心逻辑 ---
    const App = {
        async init() {
            await DB.init();
            State.pages = await DB.getAll();
            if(State.pages.length === 0) await this.createPage(true);
            else this.loadPage(State.pages[0].id);

            // 全局监听
            document.addEventListener('click', (e) => {
                if(!e.target.closest('#slash-menu')) document.getElementById('slash-menu').style.display='none';
                if(!e.target.closest('#block-menu') && !e.target.closest('.block-handle-area')) document.getElementById('block-menu').style.display='none';
            });
            document.getElementById('page-title').oninput = (e) => {
                const p = State.pages.find(x=>x.id===State.currentPageId);
                if(p) { p.title=e.target.value; this.save(); }
            }
        },

        async createPage(isDemo) {
            const newPage = {
                id: Utils.uuid(), title: isDemo ? "FlowUs 风格时间轴" : "", updatedAt: Date.now(),
                blocks: isDemo ? [
                    { id: Utils.uuid(), type: 'h1', content: '垂直时间轴展示' },
                    { id: Utils.uuid(), type: 'text', content: '下方是一个按年/月/日自动分组的垂直时间轴。' },
                    { id: Utils.uuid(), type: 'timeline', events: null }, // 触发默认数据
                    { id: Utils.uuid(), type: 'text', content: '点击折叠图标可收起年份。' }
                ] : [{ id: Utils.uuid(), type: 'text', content: '' }]
            };
            await DB.save(newPage);
            State.pages.unshift(newPage);
            this.loadPage(newPage.id);
        },

        loadPage(id) {
            State.currentPageId = id;
            const page = State.pages.find(p=>p.id===id);
            if(!page) return;
            State.currentBlocks = JSON.parse(JSON.stringify(page.blocks));
            document.getElementById('page-title').value = page.title;
            document.getElementById('breadcrumb-title').innerText = page.title || '无标题';
            Render.sidebar();
            Render.editor(State.currentBlocks);
        },

        save: Utils.debounce(async function() {
            if(!State.currentPageId) return;
            const p = State.pages.find(x=>x.id===State.currentPageId);
            p.blocks = State.currentBlocks;
            p.updatedAt = Date.now();
            await DB.save(p);
            Render.sidebar();
            document.getElementById('update-time').innerText = new Date().toLocaleTimeString();
            const s = document.getElementById('save-status'); s.innerText='保存中...';
            setTimeout(()=>s.innerText='已保存',800);
        }, 800),

        reloadBlock(id) { Render.editor(State.currentBlocks); }, // 简单重绘

        // --- 操作 ---
        handleInput(e, id) {
            const b = State.currentBlocks.find(x=>x.id===id);
            b.content = e.target.innerText;
            this.save();
            if(e.target.innerText === '/') this.openSlashMenu(id);
        },
        handleKey(e, id) {
            if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); this.appendBlock(id); }
        },
        appendBlock(id) {
            const nb = { id: Utils.uuid(), type: 'text', content: '' };
            if(id) {
                const idx = State.currentBlocks.findIndex(x=>x.id===id);
                State.currentBlocks.splice(idx+1, 0, nb);
            } else { State.currentBlocks.push(nb); }
            Render.editor(State.currentBlocks);
            setTimeout(() => {
                const el = document.querySelector(`.content-block[data-id="${nb.id}"] .block-content`);
                if(el) el.focus();
            },0);
            this.save();
        },
        openSlashMenu(id) {
            State.menuContext = id;
            const menu = document.getElementById('slash-menu');
            const el = document.querySelector(`.content-block[data-id="${id}"]`);
            const rect = el.getBoundingClientRect();
            menu.style.display='block';
            menu.style.left = (rect.left+20)+'px'; menu.style.top = (rect.bottom+5)+'px';
        },
        transformBlock(type) {
            const b = State.currentBlocks.find(x=>x.id===State.menuContext);
            if(b) {
                b.type = type;
                if(b.content) b.content = b.content.replace('/','');
                Render.editor(State.currentBlocks);
                this.save();
            }
            document.getElementById('slash-menu').style.display='none';
        },
        deleteCurrentBlock() {
            if(State.activeBlockId) {
                const idx = State.currentBlocks.findIndex(x=>x.id===State.activeBlockId);
                State.currentBlocks.splice(idx,1);
                Render.editor(State.currentBlocks);
                this.save();
            }
            document.getElementById('block-menu').style.display='none';
        },
        openBlockMenu(e, id) {
            e.stopPropagation(); State.activeBlockId = id;
            const menu = document.getElementById('block-menu');
            menu.style.display='block';
            menu.style.left = e.clientX+'px'; menu.style.top = e.clientY+'px';
        },
        toggleTodo(id) {
            const b = State.currentBlocks.find(x=>x.id===id);
            b.checked = !b.checked;
            Render.editor(State.currentBlocks); this.save();
        },
        deleteCurrentPage() { if(confirm('删除此页?')) DB.delete(State.currentPageId).then(()=>location.reload()); },
        toggleTheme() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme')==='dark'?'':'dark'); },

        // --- Timeline 专用操作 ---
        addTimelineEvent(blockId, dateStr) {
            const b = State.currentBlocks.find(x=>x.id===blockId);
            if(!b) return;
            const newDate = dateStr || new Date().toISOString().split('T')[0];
            b.events.push({
                id: Utils.uuid(), title: '新事件', date: newDate, type: 'task', status: 'todo'
            });
            Render.editor(State.currentBlocks);
            this.save();
        }
    };

    window.App = App;
    window.onload = () => App.init();
})();