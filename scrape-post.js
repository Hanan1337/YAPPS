// ==UserScript==
// @name         Instagram Post Scraper Enhanced FINAL + Copy Log
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Scrape post Instagram + export HTML (media tampil), batch export bisa diatur, thumbnail dan badge rapi, copy log ke clipboard
// @match        https://www.instagram.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function () {
'use strict';
///////////////////////////////////////////////////////////
//---------- CONFIGURATION AND UTILITIES SECTION --------//
///////////////////////////////////////////////////////////
const CONFIG = {
    DEBUG_MODE: true,
    MAX_LOGS: 2000,
    SAFE_MAX_SCRAPE: 100,
    DELAY_BETWEEN_REQUEST: 1800,
    MAX_RETRY: 3,
    EXPORT_BATCH_SIZE: 50
};
const logs = [];
let state = {
    theme: GM_getValue('theme', 'green'),
    isRunning: false,
    postAfterCursor: null,
    scrapedPostIds: new Set(),
    scrapedRows: [],
    batchExportCount: 0,
    BATCH_SIZE: CONFIG.EXPORT_BATCH_SIZE
};
///////////////////////////////////////////////////////////
//-------------------- UI COMPONENTS --------------------//
///////////////////////////////////////////////////////////
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
.insta-enhanced * { font-family: 'JetBrains Mono', monospace!important; }
#insta-scraper-dashboard { font-family:'JetBrains Mono',monospace!important; }
#insta-scraper-dashboard button:hover { background:#606060!important; }
#scrape-post-btn:hover { background:#9B59B6!important; }
#clear-log-btn:hover { background:#FF4040!important; }
#copy-log-btn { background:#008bfc; border:1px solid #7EC9FC; color:#fff; }
#copy-log-btn:hover { background:#0ac5ff!important; }
#minimize-btn:hover, #maximize-btn:hover { background:#E0E0E0!important; }
#exit-btn:hover { background:#FF6060!important; }
#log-area { color:#00FF00; }
#insta-scraper-dashboard-theme-amber #log-area { color:#FFC107;}
#insta-scraper-dashboard-theme-blue #log-area { color:#00BFFF;}
.progressbar-outer {background:#555;height:12px;width:100%;border-radius:3px;overflow:hidden;}
.progressbar-inner {background:#41d701;height:100%;width:0%;transition:width .2s;}
.virtual-row {display:table-row;}
.virtual-row.hide {display:none;}
::-webkit-scrollbar-thumb {background: #333;}
#batch-size-input { width:44px; padding:2px 4px; background:#111; color:#82ffd7; border:1px solid #D0D0D0; font-weight:bold; font-size:13px; border-radius:4px; margin-right:2px;}
/* ==== Sticky header dashboard tabel mirip export, responsive ==== */
#post-table-container {
  overflow-x:auto;
  overflow-y:auto;
  max-height:67vh;
  max-width:100vw;
  background:#000;
}
#post-table {
  width: 100%;
  border-collapse:collapse;
  table-layout:auto;
  background: #000;
}
#post-table th, #post-table td {
  border:1px solid #D0D0D0;
  text-align:left;
  padding:8px 7px;
  vertical-align:top;
  font-size:13px;
  word-break:break-word;
}
#post-table th {
  background:#1A1A1A;
  font-weight:bold;
  position:sticky;
  top:0;
  z-index:100;
  min-width:80px;
  letter-spacing:0.3px;
}
#post-table tr:nth-child(even){background:#181818;}
#post-table tr:hover{background:#22234f;}
#post-table th:nth-child(1), #post-table td:nth-child(1) { min-width:38px;text-align:center;}
#post-table th:nth-child(2), #post-table td:nth-child(2) {
  min-width:62px;
  text-align:center;
  white-space:nowrap;
  padding:7px 13px;
}
#post-table th:nth-child(3), #post-table td:nth-child(3) { min-width:90px;}
#post-table th:nth-child(4), #post-table td:nth-child(4) {
  min-width:150px;
  max-width:350px;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  line-height: 1.4;
  word-break: break-word;
}
#post-table th:nth-child(5), #post-table td:nth-child(5) { min-width:105px; }
#post-table th:nth-child(6), #post-table td:nth-child(6){ min-width:88px; text-align:center;}
#post-table th:nth-child(7), #post-table td:nth-child(7){ min-width:73px; text-align:center;}
#post-table th:nth-child(8), #post-table td:nth-child(8){ min-width:110px;}
.post-preview-badge {
  font-size:10.5px; color:#FFC107; font-weight:bold;
  position:absolute; bottom:2px; left:2px; background:#222; border-radius:3px;
  padding:2px 7px; z-index:2; line-height:1;
  box-shadow:0 1px 3px #1112;
  user-select:none;
}
.post-preview-wrap{
  display:inline-block;
  position:relative;
  margin:0 2px 4px 0;
  max-width:100px;
  vertical-align:top;
  z-index:1;
}
.post-preview-wrap img, .post-preview-wrap video{
  max-width:90px;
  max-height:90px;
  border:1px solid #D0D0D0;
  background:#000!important;
  cursor:pointer;
  margin-bottom:2px;
  transition:transform .16s;
  z-index:1;
}
.post-preview-wrap video{background:#000;}
.post-preview-wrap:hover img, .post-preview-wrap:hover video {
  z-index:2; box-shadow:0 0 10px #333; transform:scale(1.55);
}
.media-link {
  display:block;
  font-size:11px;
  text-align:center;
  margin-top:2px;
  color:#9B59B6;
  text-decoration:none;
}
.media-link:hover {text-decoration:underline;}
@media(max-width:920px){
  #post-table th, #post-table td {font-size:12px; padding:5px 2px;}
  #post-table th:nth-child(4), #post-table td:nth-child(4) {max-width:150px;}
  #post-table-container {max-width:99vw;}
}
`;
document.head.appendChild(styleSheet);

let clickSound; try { clickSound = new Audio('data:audio/wav;base64,UklGRl9vAABXQVZFZm10IBAAAAABAAEAQB8AAIA8AAACABAAZGF0YU9vAACAgICA'); } catch(e){ clickSound={play:()=>{}} }
let dashboard = document.createElement('div');
dashboard.id = `insta-scraper-dashboard${state.theme==='green'?'':'-theme-'+state.theme}`;
dashboard.className = "insta-enhanced";
dashboard.style.cssText = `
    position:fixed; top:3vh; right:2vw; width:clamp(350px,32vw,520px); background:#000; color:#E0E0E0;
    border:2px solid #D0D0D0; font-family:'JetBrains Mono',monospace; font-size:14px; z-index:9999;
    display:flex; flex-direction:column; gap:8px; padding:8px; max-height:92vh; overflow-y:auto;
`;
dashboard.innerHTML = `
    <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(transparent 0px,rgba(255,255,255,0.05) 1px,transparent 2px);pointer-events:none;z-index:1;"></div>
    <div id="menu-bar" style="background:#D0D0D0;color:#000;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D0D0D0;position:relative;z-index:2;">
        <div style="font-weight:bold;">C:\\HANAN\\INSTA\\POST_SCRAPER_ENHANCED.EXE</div>
        <div style="display:flex;gap:4px;">
            <button id="minimize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">_</button>
            <button id="maximize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">□</button>
            <button id="exit-btn" style="background:#FF4040;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">X</button>
        </div>
    </div>
    <div style="background:#000;padding:4px 0 4px 6px;border-bottom:2px solid #D0D0D0;display:flex;gap:12px;z-index:2;align-items:center;">
        <span id="help-menu" style="cursor:pointer;">Help</span>
        <span id="theme-menu" style="cursor:pointer;">Theme</span>
        <span style="margin-left:14px;font-size:13px;">Batch export:
          <input type="number" id="batch-size-input" min="5" max="300" value="${state.BATCH_SIZE||CONFIG.EXPORT_BATCH_SIZE}"/> <small>per file (default: 50)</small>
        </span>
    </div>
    <div id="dashboard-content" style="display:grid;gap:8px;padding:8px;z-index:2;">
        <div style="display:flex;gap:8px;">
            <button id="scrape-post-btn" style="flex:1;background:#6A0573;border:1px solid #D0D0D0;padding:4px;color:#E0E0E0;cursor:pointer;">SCRAPE POST</button>
            <button id="clear-log-btn" style="flex:1;background:#6610F2;border:1px solid #D0D0D0;padding:4px;color:#E0E0E0;cursor:pointer;">CLEAR LOG</button>
            <button id="copy-log-btn" style="flex:1;background:#008bfc;border:1px solid #7EC9FC;padding:4px;color:#fff;cursor:pointer;">COPY LOG</button>
        </div>
        <div id="status-box" style="display:flex;align-items:center;gap:8px;padding:4px;background:#1A1A1A;border:1px solid #D0D0D0;">
            <span id="status-dot" style="width:8px;height:8px;background:#00FF00;"></span>
            <span id="status-text" style="color:#E0E0E0;">IDLE</span>
        </div>
        <div class="progressbar-outer"><div id="progressbar-bar" class="progressbar-inner"></div></div>
        <div id="log-area" style="background:#000;color:#00FF00;padding:8px;border:1px solid #D0D0D0;font-size:12px;max-height:160px;overflow-y:auto;white-space:pre-wrap;"></div>
    </div>
`;
document.body.appendChild(dashboard);
// ===== Utility Functions =====
function log(message, level='INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    if (logs.length >= CONFIG.MAX_LOGS) logs.shift();
    logs.push(logMessage);
    if (CONFIG.DEBUG_MODE) console.log(logMessage);
    const logArea = document.getElementById('log-area');
    if (logArea) {
        const logEntry = document.createElement('div');
        logEntry.textContent = logMessage;
        logEntry.style.color =
            level === 'ERROR' ? '#FF4040'
            : level === 'WARN' ? '#FFFF00'
            : state.theme === 'amber' ? '#FFC107'
            : state.theme === 'blue' ? '#00BFFF'
            : '#00FF00';
        logArea.appendChild(logEntry);
        logArea.scrollTop = logArea.scrollHeight;
    }
}
function updateStatus(message, color='idle', progress=0) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const bar = document.getElementById('progressbar-bar');
    if (statusText && statusDot) {
        statusText.textContent = message;
        statusDot.style.backgroundColor =
            color === 'running' ? '#41d701' :
            color === 'error' ? '#FF4040' :
            color === 'success' ? '#00C000' : '#00A000';
    }
    if(bar) bar.style.width = (progress * 100).toFixed(1) + "%";
    log(`Status: ${message}`, color === 'error' ? 'ERROR' : 'INFO');
}
async function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }
async function fetchWithRetry(url, options = {}, maxTries = CONFIG.MAX_RETRY, delayMs = CONFIG.DELAY_BETWEEN_REQUEST) {
    let attempt = 0, error;
    while (attempt < maxTries) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (response.status === 429) throw new Error("429 Too Many Requests");
            error = new Error(`Status: ${response.status}`);
        } catch (e) { error = e; }
        attempt++;
        await delay(delayMs * (attempt));
    }
    throw error;
}
function sanitize(input) {
    return (input ?? "")
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/["<>]/g, (c) => ({'"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
}
function formatTimestamp(takenAt){
    const d = takenAt ? new Date(takenAt*1000) : new Date();
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function getUserIdFromUrl(){
    const match = window.location.pathname.match(/^\/([^\/]+)/);
    const username = match ? match[1] : null;
    if (username) log(`Extracted username from URL: ${username}`);
    return username;
}
// ==== Media to base64 (image/video) ====
async function fetchAsBase64(url, type = 'image') {
    try {
        const res = await fetch(url, {credentials: 'include'});
        if (!res.ok) throw new Error(`${type} load failed`);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        log(`Media fetch error for ${url}: ${e.message}`, "ERROR");
        return ''; // fallback: return empty
    }
}
// ========== Dashboard Logic ===========
function createPostDashboard(username){
    const old=document.getElementById('post-scraper-dashboard');
    if(old) old.remove();
    const postDashboard=document.createElement('div');
    postDashboard.id='post-scraper-dashboard';
    postDashboard.style.cssText=`position:fixed;top:12vh;left:7vw;width:clamp(600px,62vw,920px);background:#000;color:#E0E0E0;
    border:2px solid #D0D0D0; font-family:'JetBrains Mono',monospace;font-size:14px;z-index:10000;display:flex;flex-direction:column;gap:8px;padding:8px;max-height:83vh;overflow:hidden;`;
    postDashboard.className="insta-enhanced";
    postDashboard.innerHTML=`
        <div id="post-menu-bar" style="background:#D0D0D0;color:#000;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D0D0D0;position:sticky;top:0;">
            <div style="font-weight:bold;">C:\\HANAN\\INSTA\\POST_SCRAPER_ENHANCED.EXE</div>
            <div style="display:flex;gap:4px;">
                <button id="post-minimize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">_</button>
                <button id="post-exit-btn" style="background:#FF4040;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">X</button>
            </div>
        </div>
        <div style="padding:4px;display:flex;gap:8px;background:#1A1A1A;border-bottom:2px solid #D0D0D0;position:sticky;top:34px;">
            <input id="post-search" type="text" placeholder="Search..." style="background:#000;color:#E0E0E0;border:1px solid #D0D0D0;padding:4px;flex:1;">
            <button id="select-all-btn" style="background:#6A0573;border:1px solid #D0D0D0;padding:4px 8px;color:#E0E0E0;cursor:pointer;">SELECT ALL</button>
            <button id="export-html-btn" style="background:#6A0573;border:1px solid #D0D0D0;padding:4px 8px;color:#E0E0E0;cursor:pointer;">EXPORT HTML (Batch)</button>
        </div>
        <div id="post-table-container" style="padding:8px;position:relative;max-height:67vh;overflow-y:auto;">
            <table id="post-table" style="width:100%;border-collapse:collapse;"><thead>
            <tr style="background:#1A1A1A;border-bottom:2px solid #D0D0D0;position:sticky;top:0;">
                <th>No</th><th>Select</th><th>Username</th><th>Description</th>
                <th>Preview</th><th>Media URL</th><th>Post URL</th><th>Date</th>
            </tr>
            </thead><tbody id="post-table-body"></tbody>
            </table>
        </div>
    `;
    document.body.appendChild(postDashboard);
    let isDraggingPost=false,currentXPost=10,currentYPost=10,initialXPost,initialYPost;
    const postMenuBar=document.getElementById('post-menu-bar');
    if(postMenuBar) postMenuBar.addEventListener('mousedown',(e)=>{isDraggingPost=true;initialXPost=e.clientX-currentXPost;initialYPost=e.clientY-currentYPost;});
    document.addEventListener('mousemove',(e)=>{if(isDraggingPost){e.preventDefault();currentXPost=e.clientX-initialXPost;currentYPost=e.clientY-initialYPost;postDashboard.style.left=currentXPost+'px';postDashboard.style.top=currentYPost+'px';postDashboard.style.right='auto';}});
    document.addEventListener('mouseup',()=>isDraggingPost=false);
    const minimizeBtnPost=document.getElementById('post-minimize-btn'),exitBtnPost=document.getElementById('post-exit-btn'),tableContainer=document.getElementById('post-table-container');
    if(minimizeBtnPost)minimizeBtnPost.addEventListener('click',()=>{ clickSound.play(); tableContainer.style.display=tableContainer.style.display==='none'?'block':'none'; minimizeBtnPost.textContent=tableContainer.style.display==='none'?'+':'_'; });
    if(exitBtnPost)exitBtnPost.addEventListener('click',()=>{ clickSound.play(); postDashboard.remove(); state.postAfterCursor=null; state.scrapedPostIds.clear(); state.scrapedRows=[]; });
    const searchInput=document.getElementById('post-search');
    if(searchInput) searchInput.addEventListener('input', debounce(() => {
        const filter = searchInput.value.toLowerCase();
        Array.from(document.querySelectorAll('#post-table-body tr')).forEach(row => {
            const username = row.cells[2].textContent.toLowerCase();
            const caption = row.cells[3].textContent.toLowerCase();
            const postUrl = row.cells[6].textContent.toLowerCase();
            row.style.display = (username.includes(filter)||caption.includes(filter)||postUrl.includes(filter))?'':'none';
        });
    }, 250));
    document.getElementById('select-all-btn').onclick = function() {
        const checkboxes = document.querySelectorAll('#post-table-body input[type="checkbox"]');
        const allChecked = Array.from(checkboxes).every(cb=>cb.checked);
        checkboxes.forEach(cb=>cb.checked=!allChecked);
    };
    document.getElementById('export-html-btn').onclick=()=>{ exportToHTML(username,true); };
    return document.getElementById('post-table-body');
}
// ========== Scrape Logic ==========
async function scrapePostsPage(tableBody, username, afterCursor=null, progressCb=()=>{}) {
    let newPostsCount = 0;
    try {
        updateStatus('FETCHING POSTS...','running');
        const profileResponse = await fetchWithRetry(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,{headers:{'x-ig-app-id':'936619743392459'},credentials:'include'});
        const profileJson = await profileResponse.json();
        const userId = profileJson?.data?.user?.id;
        if(!userId) throw new Error('Failed to extract user ID!');
        let url = afterCursor
            ? `https://www.instagram.com/api/v1/feed/user/${userId}/?count=12&max_id=${afterCursor}`
            : `https://www.instagram.com/api/v1/feed/user/${userId}/?count=12`;
        const postsResponse = await fetchWithRetry(url, {headers:{'x-ig-app-id':'936619743392459'},credentials:'include'});
        const postsJson = await postsResponse.json();
        const posts = postsJson.items||[];
        const nextMaxId = postsJson.next_max_id || null;
        const hasNextPage = postsJson.more_available || false;
        if(posts.length===0 && !afterCursor){ log('No posts found or account may be empty','WARN'); updateStatus('NO POSTS FOUND','error'); state.isRunning=false; return; }
        let results = [];
        for(const node of posts){
            const postId = node.id; if(state.scrapedPostIds.has(postId)) continue;
            state.scrapedPostIds.add(postId); newPostsCount++;
            const mediaList = extractMediaList(node);
            results.push({
                postId,
                username: node.user?.username||username,
                caption: sanitize(node.caption?.text||'No caption'),
                mediaList,
                postUrl: `https://www.instagram.com/p/${node.code||postId.split('_')[0]}/`,
                date: formatTimestamp(node.taken_at)
            });
        }
        for (let r of results) state.scrapedRows.push(r);
        state.postAfterCursor = hasNextPage ? nextMaxId : null;
        log(`Scraped ${newPostsCount} new posts, next cursor: ${state.postAfterCursor||'none'}`);
        updateStatus(`DONE: ${state.scrapedRows.length} POSTS SCRAPED`, 'success', state.scrapedRows.length/(state.scrapedRows.length+12));
        renderRowsToTable(tableBody, state.scrapedRows);
        progressCb(results.length);
    } catch(e){
        log(`Error in scrapePostsPage: ${e.message}`,'ERROR');
        updateStatus(`ERROR: ${e.message}`,'error');
        alert(`Error: ${e.message}`);
    }
    await delay(CONFIG.DELAY_BETWEEN_REQUEST);
}
function extractMediaList(node) {
    const medias=[];
    if(node.carousel_media&&Array.isArray(node.carousel_media)){
        node.carousel_media.forEach((media)=>{
            const type=media.media_type===2?"VIDEO":"PHOTO";
            if(media.media_type===2&&media.video_versions?.[0]?.url){
                medias.push({type,url:media.video_versions[0].url,thumb:media.image_versions2?.candidates?.[0]?.url||''});
            } else if(media.image_versions2?.candidates?.[0]?.url){
                medias.push({type,url:media.image_versions2.candidates[0].url,thumb:media.image_versions2.candidates[0].url});
            }
        });
    } else {
        if(node.media_type===2&&node.video_versions?.[0]?.url){
            medias.push({type:"VIDEO",url:node.video_versions[0].url,thumb:node.image_versions2?.candidates?.[0]?.url||''});
        } else if(node.image_versions2?.candidates?.[0]?.url){
            medias.push({type:"PHOTO",url:node.image_versions2.candidates[0].url,thumb:node.image_versions2.candidates[0].url});
        }
    }
    return medias;
}
function renderRowsToTable(tableBody, rows) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    const startIdx = 0;
    const visibleItems = Math.min(rows.length, 400);
    for (let i=startIdx; i<visibleItems; ++i) {
        const rowData = rows[i];
        const row = document.createElement('tr'); row.className='virtual-row';
        const numCell = document.createElement('td'); numCell.textContent=i+1;
        const selectCell = document.createElement('td'); const cb=document.createElement('input'); cb.type="checkbox";cb.style.cursor="pointer"; selectCell.appendChild(cb);
        const usernameCell = document.createElement('td'); usernameCell.textContent=rowData.username;
        const captionCell = document.createElement('td'); captionCell.textContent=rowData.caption; captionCell.title=rowData.caption; captionCell.style.maxWidth='200px'; captionCell.style.overflow='hidden'; captionCell.style.textOverflow='ellipsis';
        const previewCell = document.createElement('td');
        if(rowData.mediaList.length){
            rowData.mediaList.forEach((media,idx)=>{
                const wrap=document.createElement('div');wrap.className='post-preview-wrap';wrap.style.marginRight='5px';
                if(media.type==='VIDEO'){
                    const vid=document.createElement('video'); vid.src=media.url; vid.controls=true; vid.muted=true; vid.playsInline=true; vid.preload="none";
                    wrap.appendChild(vid);
                }else{
                    const img=document.createElement('img');img.src=media.thumb||media.url;img.alt=media.type;img.title=`[${media.type}] ${media.url}`;img.onclick=()=>window.open(media.url,'_blank');
                    wrap.appendChild(img);
                }
                const badge=document.createElement('span');
                badge.textContent=media.type+(rowData.mediaList.length>1?` #${idx+1}`:''); badge.className='post-preview-badge';
                wrap.appendChild(badge);previewCell.appendChild(wrap);
            });
        } else { previewCell.textContent='N/A'; }
        const mediaUrlCell=document.createElement('td');
        mediaUrlCell.innerHTML=rowData.mediaList.map((media,idx)=>
            `<a href="${media.url}" target="_blank">${media.type}${rowData.mediaList.length>1?'#'+(idx+1):''}</a>`).join('<br>');
        const postUrlCell=document.createElement('td');
        postUrlCell.innerHTML=`<a href="${rowData.postUrl}" target="_blank">Link</a>`;
        const dateCell=document.createElement('td'); dateCell.textContent=rowData.date;
        row.append(numCell,selectCell,usernameCell,captionCell,previewCell,mediaUrlCell,postUrlCell,dateCell);
        tableBody.appendChild(row);
    }
}
// =============== EXPORT HTML (EMBED MEDIA) =============
async function exportToHTML(username, isBatch=false) {
    let batchSize = parseInt(state.BATCH_SIZE);
    if (isNaN(batchSize) || batchSize<5) batchSize = 5;
    let rows = (isBatch) ? state.scrapedRows : Array.from(document.querySelectorAll('#post-table-body tr')).map((r, idx) => ({
        username: r.cells[2].textContent,
        caption: r.cells[3].textContent,
        mediaList: [],
        postUrl: r.cells[6].querySelector('a').href,
        date: r.cells[7].textContent
    }));
    if(isBatch) { }
    else {
        rows = rows.map((r, idx) => {
            let imgWraps = document.querySelectorAll(`#post-table-body tr:nth-child(${idx+1}) .post-preview-wrap`);
            let mediaList = [];
            imgWraps.forEach((wrap, j)=>{
                const img = wrap.querySelector('img');
                const vid = wrap.querySelector('video');
                const badge = wrap.querySelector('span');
                if(img) {
                    let type = badge ? badge.textContent.split(' ')[0] : "PHOTO";
                    mediaList.push({type, url: img.src, thumb: img.src});
                } else if(vid) {
                    let type = badge ? badge.textContent.split(' ')[0] : "VIDEO";
                    mediaList.push({type, url: vid.src, thumb: vid.poster});
                }
            });
            r.mediaList = mediaList;
            return r;
        });
    }
    let total = rows.length;
    for(let i=0, batch=1; i<total; i+=batchSize, batch++){
        let part = rows.slice(i,i+batchSize);
        log("Downloading & embedding media for batch "+batch+" ...", "INFO");
        for (let rowItem of part) {
            for (let m of rowItem.mediaList) {
                if (!m.datauri) {
                    m.datauri = await fetchAsBase64(m.url, m.type === "VIDEO" ? "video" : "image");
                }
            }
        }
        log("Building HTML file for batch "+batch+" ...", "INFO");
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instagram Posts - ${username}: Batch ${batch}</title>
  <style>
    body{font-family:'JetBrains Mono',monospace;background:#000;color:#E0E0E0;margin:20px;}
    h1{text-align:center;margin-bottom:20px;}
    table{width:100%;border-collapse:collapse;background:#000;}
    th,td{border:1px solid #D0D0D0;padding:8px;text-align:left;vertical-align:top;}
    th{background:#1A1A1A;position:sticky;top:0;}
    tr:nth-child(even){background:#1A1A1A;}
    a{color:#9B59B6;text-decoration:none;}
    a:hover{text-decoration:underline;}
    .post-preview-badge{font-size:9px;color:#FFC107;font-weight:bold;position:absolute;bottom:2px;left:2px;background:#222;border-radius:2px;padding:1px 4px;z-index:2;}
    .post-preview-wrap{display:inline-block;position:relative;margin:0 2px 4px 0;max-width:100px;}
    .post-preview-wrap img, .post-preview-wrap video{max-width:90px;max-height:90px;border:1px solid #D0D0D0;cursor:pointer;margin-bottom:2px;}
    .post-preview-wrap video{background:#000;}
    .media-link{display:block;font-size:11px;text-align:center;margin-top:2px;}
  </style>
</head>
<body>
  <h1>Instagram Posts - ${username} (Batch ${batch})</h1>
  <table>
    <thead>
      <tr>
        <th>No</th><th>Username</th><th>Description</th><th>Preview</th><th>Media URLs</th><th>Post URL</th><th>Date</th>
      </tr>
    </thead>
    <tbody>
`;
        part.forEach((r,idx)=>{
            let previewHtml = '';
            if(r.mediaList && r.mediaList.length){
                previewHtml = r.mediaList.map((m, mi) => `
                <div class="post-preview-wrap">
                    ${m.type=="VIDEO"
                        ? (m.datauri
                            ? `<video src="${m.datauri}" controls muted playsinline preload="none"></video>`
                            : `<span style="color:#888;font-size:10px;">[FAILED: Video]</span>`)
                        : (m.datauri
                            ? `<img src="${m.datauri}" alt="img">`
                            : `<span style="color:#888;font-size:10px;">[FAILED: Image]</span>`)
                    }
                    <span class="post-preview-badge">${m.type}${r.mediaList.length>1?` #${mi+1}`:''}</span>
                </div>
                `).join('');
            } else {
                previewHtml = 'N/A';
            }
            let mediaUrls = (r.mediaList && r.mediaList.length) ?
                r.mediaList.map((a, mi)=>
                    `<a href="${a.url}" class="media-link" target="_blank">${a.type}${r.mediaList.length>1?'#'+(mi+1):''}</a>`
                ).join('') : '';
            html += `<tr>
<td>${i+idx+1}</td>
<td>${r.username}</td>
<td>${r.caption}</td>
<td>${previewHtml}</td>
<td>${mediaUrls}</td>
<td><a href="${r.postUrl}" target="_blank">Link</a></td>
<td>${r.date}</td>
</tr>
`;
        });
        html+=`</tbody></table></body></html>`;
        let blob=new Blob([html],{type:'text/html'}), url=URL.createObjectURL(blob), link=document.createElement('a');
        link.href=url; link.download=`${username}_posts_${new Date().toISOString().split('T')[0]}_part${batch}.html`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        log(`BATCH HTML file exported: part ${batch}`);
    }
}
function debounce(func, wait){let timeout;return function(...args){clearTimeout(timeout);timeout=setTimeout(()=>func.apply(this,args),wait);};}
// ========== UI controls =========
document.getElementById('help-menu').onclick=()=>{ clickSound.play();
    alert(`Instagram Post Scraper Enhanced FINAL (Export HTML preview real media!)
Fitur:
• SCRAPE POST: Carousel/video/photo, preview, badge
• Export batch (split per file hingga 50 post, bisa diubah di Batch Export)
• Embed media (gambar/video) langsung tampil di HTML (offline)
• Tombol "COPY LOG" untuk salin log (semua activity/error)
• Search/filter table, drag window, theme switch, clear-log, minimize/maximize
Tips: Gunakan di page profil. File hasil export bisa sangat besar jika batch besar.`);
};
document.getElementById('theme-menu').onclick=()=>{
    clickSound.play();
    const themes=['green','amber','blue'];const idx=themes.indexOf(state.theme); state.theme=themes[(idx+1)%themes.length];
    GM_setValue('theme',state.theme);
    dashboard.id=`insta-scraper-dashboard${state.theme==='green'?'':'-theme-'+state.theme}`;
    log(`THEME CHANGED TO ${state.theme.toUpperCase()}`,'INFO');
};
document.getElementById('batch-size-input').onchange=(e)=>{
    let v = parseInt(e.target.value);
    state.BATCH_SIZE = (!isNaN(v) && v >= 5 && v <= 300) ? v : CONFIG.EXPORT_BATCH_SIZE;
    log(`Batch export di-set ke ${state.BATCH_SIZE} post per file`);
};
document.getElementById('clear-log-btn').onclick=()=>{ document.getElementById('log-area').innerHTML=''; logs.length=0; log('LOG CLEARED','INFO'); updateStatus('LOG CLEARED','idle'); };
document.getElementById('copy-log-btn').onclick = function() {
    const logArea = document.getElementById('log-area');
    let text = logs.length ? logs.join('\n') : (logArea ? logArea.innerText : '');
    navigator.clipboard.writeText(text)
      .then(() => {
        log('[LOG] Copied to clipboard.','INFO');
        alert('Log berhasil dicopy ke clipboard.');
      })
      .catch(err => {
        log('[LOG] Copy gagal: '+err,'ERROR');
        alert('Gagal copy log!');
      });
};
document.getElementById('scrape-post-btn').onclick = async () => {
    clickSound.play(); state.postAfterCursor=null; state.scrapedPostIds.clear(); state.scrapedRows=[];
    const username=getUserIdFromUrl();
    if(!username){alert('Tidak bisa menemukan username di URL!'); return;}
    const tableBody=createPostDashboard(username);
    let checked = false;
    let scrapeProgress = 0, scraped = 0, warnDialog=false;
    async function progressCb(count){
        scraped += count; scrapeProgress = Math.min(scraped/Math.max(scraped+12,1),1);
        updateStatus(`PROGRESS: ${scraped} posts`, 'running', scrapeProgress);
        if(!checked && scraped > CONFIG.SAFE_MAX_SCRAPE) {checked = true;
            warnDialog = !confirm(`⚠️ Kamu akan scrape lebih dari ${CONFIG.SAFE_MAX_SCRAPE} post. Lanjut? Resiko: rate limit. Pastikan scrape secukupnya, klik OK untuk lanjut!`);
        }
    }
    state.isRunning=true;
    try {
        do {
            if(warnDialog) break;
            await scrapePostsPage(tableBody,username,state.postAfterCursor,progressCb);
        } while(state.isRunning && state.postAfterCursor && !warnDialog);
    } finally {
        state.isRunning = false;
        if(state.scrapedRows.length > 0)
            updateStatus(`ALL DONE: ${state.scrapedRows.length} posts scraped! Export atau scroll di tabel.`, 'success', 1);
        else
            updateStatus(`Scraping selesai/no data.`, 'idle', 1)
    }
    document.getElementById('post-table-container').addEventListener('scroll',debounce(()=>{
    },250));
};
const minimizeBtn=document.getElementById('minimize-btn'),maxBtn=document.getElementById('maximize-btn'),exitBtn=document.getElementById('exit-btn'),content=document.getElementById('dashboard-content');
minimizeBtn.onclick=()=>{ clickSound.play(); content.style.display=content.style.display==='none'?'grid':'none'; minimizeBtn.textContent=content.style.display==='none'?'+':'_'; };
maxBtn.onclick=()=>{ clickSound.play();dashboard.style.width=dashboard.style.width==='80vw'?'clamp(350px,32vw,520px)':'80vw';dashboard.style.height=dashboard.style.height==='80vh'?'auto':'80vh'; };
exitBtn.onclick=()=>{ clickSound.play();dashboard.remove();log('APPLICATION TERMINATED','INFO'); };

})(); // end IIFE
