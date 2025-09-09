// ==UserScript==
// @name         Instagram Post Scraper Only (Multi-media/Carousel Support)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Scrape semua media di setiap post Instagram (termasuk carousel!): dashboard, thumbnail preview per media, badge, search, export CSV/HTML, infinite scroll, UI rapih professional.
// @author       Adapted by AI
// @match        https://www.instagram.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
'use strict';

const CONFIG = { DEBUG_MODE: true, MAX_LOGS: 1000 };
const logs = [];
let state = {
    theme: GM_getValue('theme', 'green'),
    isRunning: false,
    postAfterCursor: null,
    scrapedPostIds: new Set()
};

// STYLE (multi thumbnail support)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
#insta-scraper-dashboard { font-family:'JetBrains Mono',monospace; }
#insta-scraper-dashboard button:hover { background:#606060!important; }
#scrape-post-btn:hover { background:#9B59B6!important; }
#clear-log-btn:hover { background:#FF4040!important; }
#minimize-btn:hover, #maximize-btn:hover { background:#E0E0E0!important; }
#exit-btn:hover { background:#FF6060!important; }
#log-area { color:#00FF00; }
#insta-scraper-dashboard-theme-amber #log-area { color:#FFC107;}
#insta-scraper-dashboard-theme-blue #log-area { color:#00BFFF;}
.post-preview-wrap { position:relative; display:inline-block; margin:0 2px 4px 0; max-width:90px; }
.post-preview-wrap img { max-width:78px; max-height:78px; border:1px solid #D0D0D0; cursor:pointer; margin-bottom:2px; transition:transform .15s;}
.post-preview-wrap:hover img { z-index:2; box-shadow:0 0 10px #333; transform:scale(1.8);}
.post-preview-badge {
  position:absolute; left:2px; bottom:2px; background:#222; padding:2px 6px; font-size:10px;
  color:#FFC107; font-weight:bold; border-radius:3px; z-index:3; pointer-events:none; line-height:1; letter-spacing:0;}
`;
document.head.appendChild(styleSheet);

// UI
let clickSound;
try { clickSound = new Audio('data:audio/wav;base64,UklGRl9vAABXQVZFZm10IBAAAAABAAEAQB8AAIA8AAACABAAZGF0YU9vAACAgICA'); } catch(e){ clickSound={play:()=>{}} }
let dashboard = document.createElement('div');
dashboard.id = `insta-scraper-dashboard${state.theme==='green'?'':'-theme-'+state.theme}`;
dashboard.style.cssText = `
    position:fixed; top:2vh; right:2vw; width:clamp(320px,30vw,450px); background:#000; color:#E0E0E0;
    border:2px solid #D0D0D0; font-family:'JetBrains Mono',monospace; font-size:14px; z-index:9999;
    display:flex; flex-direction:column; gap:8px; padding:8px; max-height:90vh; overflow-y:auto;
`;
dashboard.innerHTML = `
    <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:repeating-linear-gradient(transparent 0px,rgba(255,255,255,0.05) 1px,transparent 2px);pointer-events:none;z-index:1;"></div>
    <div id="menu-bar" style="background:#D0D0D0;color:#000;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D0D0D0;position:relative;z-index:2;">
        <div style="font-weight:bold;">C:\\HANAN\\INSTA\\POST_SCRAPER_ONLY.EXE</div>
        <div style="display:flex;gap:4px;">
            <button id="minimize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">_</button>
            <button id="maximize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">□</button>
            <button id="exit-btn" style="background:#FF4040;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">X</button>
        </div>
    </div>
    <div style="background:#000;padding:4px;border-bottom:2px solid #D0D0D0;display:flex;gap:16px;z-index:2;">
        <span id="help-menu" style="cursor:pointer;">Help</span>
        <span id="theme-menu" style="cursor:pointer;">Theme</span>
    </div>
    <div id="dashboard-content" style="display:grid;gap:8px;padding:8px;z-index:2;">
        <div style="display:flex;gap:8px;">
            <button id="scrape-post-btn" style="flex:1;background:#6A0573;border:1px solid #D0D0D0;padding:4px;color:#E0E0E0;cursor:pointer;">SCRAPE POST</button>
            <button id="clear-log-btn" style="flex:1;background:#6610F2;border:1px solid #D0D0D0;padding:4px;color:#E0E0E0;cursor:pointer;">CLEAR LOG</button>
        </div>
        <div id="status-box" style="display:flex;align-items:center;gap:8px;padding:4px;background:#1A1A1A;border:1px solid #D0D0D0;">
            <span id="status-dot" style="width:8px;height:8px;background:#00FF00;"></span>
            <span id="status-text" style="color:#E0E0E0;">IDLE</span>
        </div>
        <div id="log-area" style="background:#000;color:#00FF00;padding:8px;border:1px solid #D0D0D0;font-size:12px;max-height:200px;overflow-y:auto;white-space:pre-wrap;"></div>
    </div>
`;
document.body.appendChild(dashboard);

// DRAG Support
let isDragging=false,currentX=10,currentY=10,initialX,initialY;
const menuBar=document.getElementById('menu-bar');
if(menuBar) menuBar.addEventListener('mousedown', (e) => {isDragging=true;initialX=e.clientX-currentX;initialY=e.clientY-currentY;});
document.addEventListener('mousemove', (e) => {
    if(isDragging){e.preventDefault();currentX=e.clientX-initialX;currentY=e.clientY-initialY;dashboard.style.left=currentX+'px';dashboard.style.top=currentY+'px';dashboard.style.right='auto';}});
document.addEventListener('mouseup', () => isDragging=false);

const minimizeBtn=document.getElementById('minimize-btn'),maxBtn=document.getElementById('maximize-btn'),exitBtn=document.getElementById('exit-btn'),content=document.getElementById('dashboard-content');
const statusDot=document.getElementById('status-dot'),statusText=document.getElementById('status-text'),logArea=document.getElementById('log-area');
const helpMenu=document.getElementById('help-menu'),themeMenu=document.getElementById('theme-menu'),clearLogBtn=document.getElementById('clear-log-btn');

// LOG/STATUS
function log(message,level='INFO'){
    const timestamp=new Date().toISOString();
    const logMessage=`[${timestamp}] [${level}] ${message}`;
    if(logs.length>=CONFIG.MAX_LOGS)logs.shift();logs.push(logMessage);
    if(CONFIG.DEBUG_MODE)console.log(logMessage);
    if(logArea){const logEntry=document.createElement('div');logEntry.textContent=logMessage;
        logEntry.style.color=level==='ERROR'?'#FF4040':level==='WARN'?'#FFFF00':state.theme==='amber'?'#FFC107':state.theme==='blue'?'#00BFFF':'#00FF00';
        logArea.appendChild(logEntry);logArea.scrollTop=logArea.scrollHeight;
    }
}
function updateStatus(message,stateStatus='idle'){
    if(statusText&&statusDot){
        statusText.textContent=message;
        statusDot.style.backgroundColor=stateStatus==='running'?'#00FF00':stateStatus==='error'?'#FF4040':stateStatus==='success'?'#00C000':'#00A000';
        statusDot.classList.toggle('loading',stateStatus==='running');
    }
    log(`Status: ${message}`,stateStatus==='error'?'ERROR':'INFO');
}
function debounce(func,wait){let timeout;return function(...args){clearTimeout(timeout);timeout=setTimeout(()=>func.apply(this,args),wait);};}
function getUserIdFromUrl(){const match=window.location.pathname.match(/^\/([^\/]+)/),username=match?match[1]:null;if(username)log(`Extracted username from URL: ${username}`);return username;}
function formatTimestamp(takenAt){const d=takenAt?new Date(takenAt*1000):new Date();return`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;}

// ==== Helper: Multi-media extract ====
function extractMediaList(node){
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
    }else{
        if(node.media_type===2&&node.video_versions?.[0]?.url){
            medias.push({type:"VIDEO",url:node.video_versions[0].url,thumb:node.image_versions2?.candidates?.[0]?.url||''});
        }else if(node.image_versions2?.candidates?.[0]?.url){
            medias.push({type:"PHOTO",url:node.image_versions2.candidates[0].url,thumb:node.image_versions2.candidates[0].url});
        }
    }
    return medias;
}

/* ==== POST DASHBOARD ==== */
function createPostDashboard(username){
    const old=document.getElementById('post-scraper-dashboard');if(old)old.remove();
    const postDashboard=document.createElement('div');
    postDashboard.id='post-scraper-dashboard';
    postDashboard.style.cssText=`position:fixed;top:13vh;left:8vw;width:clamp(600px,60vw,900px);background:#000;color:#E0E0E0;
        border:2px solid #D0D0D0; font-family:'JetBrains Mono',monospace;font-size:14px;z-index:10000;display:flex;flex-direction:column;gap:8px;padding:8px;max-height:80vh;overflow:hidden;`;
    postDashboard.innerHTML=`
        <div id="post-menu-bar" style="background:#D0D0D0;color:#000;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D0D0D0;position:sticky;top:0;">
            <div style="font-weight:bold;">C:\\HANAN\\INSTA\\POST_SCRAPER_ONLY.EXE</div>
            <div style="display:flex;gap:4px;">
                <button id="post-minimize-btn" style="background:#D0D0D0;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">_</button>
                <button id="post-exit-btn" style="background:#FF4040;border:1px solid #A0A0A0;padding:0 8px;cursor:pointer;">X</button>
            </div>
        </div>
        <div style="padding:4px;display:flex;gap:8px;background:#1A1A1A;border-bottom:2px solid #D0D0D0;position:sticky;top:34px;">
            <input id="post-search" type="text" placeholder="Search..." style="background:#000;color:#E0E0E0;border:1px solid #D0D0D0;padding:4px;flex:1;">
            <button id="select-all-btn" style="background:#6A0573;border:1px solid #D0D0D0;padding:4px 8px;color:#E0E0E0;cursor:pointer;">SELECT ALL</button>
            <button id="export-csv-btn" style="background:#6A0573;border:1px solid #D0D0D0;padding:4px 8px;color:#E0E0E0;cursor:pointer;">EXPORT CSV</button>
            <button id="export-html-btn" style="background:#6A0573;border:1px solid #D0D0D0;padding:4px 8px;color:#E0E0E0;cursor:pointer;">EXPORT HTML</button>
        </div>
        <div id="post-table-container" style="padding:8px;position:relative;max-height:70vh;overflow-y:auto;">
            <table id="post-table" style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#1A1A1A;border-bottom:2px solid #D0D0D0;position:sticky;top:0;">
                    <th>No</th><th>Select</th><th>Username</th><th>Description</th><th>Preview</th>
                    <th>Media URL</th><th>Post URL</th><th>Date</th>
                </tr>
            </thead>
            <tbody id="post-table-body"></tbody>
            </table>
        </div>
    `;
    document.body.appendChild(postDashboard);
    // DRAG/Controls
    let isDraggingPost=false,currentXPost=10,currentYPost=10,initialXPost,initialYPost;
    const postMenuBar=document.getElementById('post-menu-bar');
    if(postMenuBar) postMenuBar.addEventListener('mousedown',(e)=>{isDraggingPost=true;initialXPost=e.clientX-currentXPost;initialYPost=e.clientY-currentYPost;});
    document.addEventListener('mousemove',(e)=>{if(isDraggingPost){e.preventDefault();currentXPost=e.clientX-initialXPost;currentYPost=e.clientY-initialYPost;postDashboard.style.left=currentXPost+'px';postDashboard.style.top=currentYPost+'px';postDashboard.style.right='auto';}});
    document.addEventListener('mouseup',()=>isDraggingPost=false);
    const minimizeBtnPost=document.getElementById('post-minimize-btn'),exitBtnPost=document.getElementById('post-exit-btn'),tableContainer=document.getElementById('post-table-container');
    if(minimizeBtnPost)minimizeBtnPost.addEventListener('click',()=>{ clickSound.play(); tableContainer.style.display=tableContainer.style.display==='none'?'block':'none'; minimizeBtnPost.textContent=tableContainer.style.display==='none'?'+':'_'; });
    if(exitBtnPost)exitBtnPost.addEventListener('click',()=>{ clickSound.play(); postDashboard.remove(); state.postAfterCursor=null; state.scrapedPostIds.clear(); });
    // Search/filter
    const searchInput=document.getElementById('post-search');
    if(searchInput) searchInput.addEventListener('input', debounce(() => {
        const filter = searchInput.value.toLowerCase();
        const rows = document.querySelectorAll('#post-table-body tr');
        rows.forEach(row => {
            const username = row.cells[2].textContent.toLowerCase();
            const caption = row.cells[3].textContent.toLowerCase();
            const postUrl = row.cells[6].textContent.toLowerCase();
            row.style.display = (username.includes(filter)||caption.includes(filter)||postUrl.includes(filter))?'':'none';
        });
    }, 300));
    const selectAllBtn=document.getElementById('select-all-btn');
    if(selectAllBtn) selectAllBtn.addEventListener('click',()=>{
        const checkboxes=document.querySelectorAll('#post-table-body input[type="checkbox"]');
        const allChecked=Array.from(checkboxes).every(cb=>cb.checked); checkboxes.forEach(cb=>cb.checked=!allChecked);
    });
    const exportCsvBtn=document.getElementById('export-csv-btn'),exportHtmlBtn=document.getElementById('export-html-btn');
    if(exportCsvBtn) exportCsvBtn.addEventListener('click',()=>{ exportToCSV(username); });
    if(exportHtmlBtn) exportHtmlBtn.addEventListener('click',()=>{ exportToHTML(username); });
    return document.getElementById('post-table-body');
}

async function scrapePostsPage(tableBody,username,afterCursor=null){
    if(state.isRunning){log('Scraping already in progress','WARN');return;}
    state.isRunning=true;
    try{updateStatus('FETCHING POSTS...','running');
    const profileResponse=await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,{headers:{'x-ig-app-id':'936619743392459'},credentials:'include'});
    if(!profileResponse.ok)throw new Error(`Profile API status ${profileResponse.status}`);
    const profileJson=await profileResponse.json();
    const userId=profileJson?.data?.user?.id; if(!userId)throw new Error('Failed to extract user ID');
    const url=afterCursor?`https://www.instagram.com/api/v1/feed/user/${userId}/?count=12&max_id=${afterCursor}`:`https://www.instagram.com/api/v1/feed/user/${userId}/?count=12`;
    const postsResponse=await fetch(url,{headers:{'x-ig-app-id':'936619743392459'},credentials:'include'});
    if(!postsResponse.ok)throw new Error(`Posts API status ${postsResponse.status}`);
    const postsJson=await postsResponse.json();const posts=postsJson.items||[];
    const nextMaxId=postsJson.next_max_id||null;const hasNextPage=postsJson.more_available||false;
    if(posts.length===0&&!afterCursor){log('No posts found or account may be empty','WARN');updateStatus('NO POSTS FOUND','error');state.isRunning=false;return;}
    let newPostsCount=0;const rowCount=tableBody.children.length;const fragment=document.createDocumentFragment();
    for(const node of posts){
        const postId=node.id; if(state.scrapedPostIds.has(postId))continue; state.scrapedPostIds.add(postId); newPostsCount++;
        const row=document.createElement('tr');
        const numCell=document.createElement('td'); numCell.textContent=rowCount+newPostsCount;
        const selectCell=document.createElement('td'); const checkbox=document.createElement('input');
        checkbox.type='checkbox'; checkbox.style.cursor='pointer'; selectCell.appendChild(checkbox);
        const usernameCell=document.createElement('td'); usernameCell.textContent=node.user?.username||username;
        const captionCell=document.createElement('td');const captionText=node.caption?.text||'No caption';
        captionCell.textContent=captionText;captionCell.title=captionText;captionCell.style.maxWidth='200px';captionCell.style.overflow='hidden';captionCell.style.textOverflow='ellipsis';
        // --- NEW: Multi-preview/URL ---
        const mediaList = extractMediaList(node);
        const previewCell=document.createElement('td');
        if(mediaList.length){
            mediaList.forEach((media,idx)=>{
                const wrap=document.createElement('div');wrap.className='post-preview-wrap';wrap.style.marginRight='5px';
                const img=document.createElement('img');img.src=media.thumb||media.url;img.alt=media.type;
                img.title=`[${media.type}] ${media.url}`;img.onclick=()=>window.open(media.url,'_blank');
                if(media.type==='VIDEO'){img.style.border='2px solid #FFC107'}
                wrap.appendChild(img);
                const badge=document.createElement('span');
                badge.textContent=media.type+(mediaList.length>1?` #${idx+1}`:''); badge.className='post-preview-badge';
                wrap.appendChild(badge);previewCell.appendChild(wrap);
            });
        } else {previewCell.textContent='N/A';}
        const mediaUrlCell=document.createElement('td');
        mediaUrlCell.innerHTML=mediaList.map((media,idx)=>
            `<a href="${media.url}" target="_blank">${media.type}${mediaList.length>1?'#'+(idx+1):''}</a>`).join('<br>');
        const postUrlCell=document.createElement('td');
        const postShortcode=node.code||postId.split('_')[0];
        const postUrl=`https://www.instagram.com/p/${postShortcode}/`;
        postUrlCell.innerHTML=`<a href="${postUrl}" target="_blank">${postUrl.slice(0,25)}...</a>`;
        const dateCell=document.createElement('td');dateCell.textContent=formatTimestamp(node.taken_at);
        row.append(numCell,selectCell,usernameCell,captionCell,previewCell,mediaUrlCell,postUrlCell,dateCell);fragment.appendChild(row);
    }
    tableBody.appendChild(fragment);
    state.postAfterCursor=hasNextPage?nextMaxId:null;
    log(`Scraped ${newPostsCount} new posts, next cursor: ${state.postAfterCursor||'none'}`);updateStatus(`DONE: ${tableBody.children.length} POSTS SCRAPED`,'success');
    }catch(e){log(`Error in scrapePostsPage: ${e.message}`,'ERROR');updateStatus(`ERROR: ${e.message}`,'error');alert(`Error: ${e.message}`);}
    state.isRunning=false;
}

// Export CSV/HTML (semua link media akan otomatis multi karena dashboard multi-a/href)
function exportToCSV(username){
    const rows=document.querySelectorAll('#post-table-body tr');
    let csvContent='data:text/csv;charset=utf-8,No,Username,Description,Media URLs,Post URL,Date\n';
    let hasSelected=false;
    rows.forEach(row=>{const checkbox=row.cells[1].querySelector('input[type="checkbox"]');if(checkbox.checked)hasSelected=true;});
    rows.forEach(row=>{
        const checkbox=row.cells[1].querySelector('input[type="checkbox"]');
        if(!hasSelected||checkbox.checked){
            const num=row.cells[0].textContent;const username=row.cells[2].textContent;
            const caption=`"${row.cells[3].textContent.replace(/"/g,'""')}"`;
            const mediaUrls=`"${Array.from(row.cells[5].querySelectorAll('a')).map(a=>a.href).join('; ')}"`;
            const postUrl=`"${row.cells[6].querySelector('a').href}"`;
            const date=row.cells[7].textContent;
            csvContent+=`${num},${username},${caption},${mediaUrls},${postUrl},${date}\n`;
        }
    });
    const encodedUri=encodeURI(csvContent);const link=document.createElement('a');
    link.setAttribute('href',encodedUri);
    link.setAttribute('download',`${username}_posts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);link.click();document.body.removeChild(link);log(`Exported CSV for ${username}`);
}
async function exportToHTML(username){
    const rows=document.querySelectorAll('#post-table-body tr');
    if(!rows.length){log('No posts to export','WARN');return;}
    let htmlContent=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Instagram Posts - ${username}</title>
<style>body{font-family:'JetBrains Mono',monospace;background:#000;color:#E0E0E0;margin:20px;}
h1{text-align:center;margin-bottom:20px;}
table{width:100%;border-collapse:collapse;background:#000;}
th,td{border:1px solid #D0D0D0;padding:8px;text-align:left;vertical-align:top;}
th{background:#1A1A1A;position:sticky;top:0;}
tr:nth-child(even){background:#1A1A1A;}
img{max-width:100px;height:auto;border:1px solid #D0D0D0;cursor:pointer;}
a{color:#9B59B6;text-decoration:none;}a:hover{text-decoration:underline;}
.post-preview-badge{font-size:9px;color:#FFC107;font-weight:bold;}
.post-preview-wrap{display:inline-block;position:relative;}
</style></head>
<body><h1>Instagram Posts - ${username}</h1><table><thead><tr>
<th>No</th><th>Username</th><th>Description</th><th>Preview</th>
<th>Media URLs</th><th>Post URL</th><th>Date</th>
</tr></thead><tbody>`;
    for(const row of rows){
        const num=row.cells[0].textContent;const usernameCell=row.cells[2].textContent;const caption=row.cells[3].textContent.replace(/"/g,'"');
        const mediaUrls=Array.from(row.cells[5].querySelectorAll('a')).map(a=>`<a href="${a.href}" target="_blank">${a.textContent}</a>`).join('<br>');
        const postUrl=row.cells[6].innerHTML;const date=row.cells[7].textContent;
        let previewHtml='N/A';const previewImgs=row.cells[4].querySelectorAll('img'),badgeEls=row.cells[4].querySelectorAll('.post-preview-badge');
        if(previewImgs.length){
            previewHtml=Array.from(previewImgs).map((img,i)=>`<div class="post-preview-wrap"><img src="${img.src}" alt="${img.alt}" onclick="window.open('${img.src}','_blank')">`+
                (badgeEls[i]?`<span class="post-preview-badge">${badgeEls[i].textContent}</span>`:'')+`</div>`).join('');
        }
        htmlContent+=`<tr><td>${num}</td><td>${usernameCell}</td><td>${caption}</td><td>${previewHtml}</td><td>${mediaUrls}</td><td>${postUrl}</td><td>${date}</td></tr>`;
    }
    htmlContent+=`</tbody></table></body></html>`;
    const blob=new Blob([htmlContent],{type:'text/html'}), url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download=`${username}_posts_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(url);
    log(`Exported HTML for ${username}`);
}

// Button Main
document.getElementById('scrape-post-btn').addEventListener('click', () => {
    clickSound.play();state.postAfterCursor=null;state.scrapedPostIds.clear();
    const username=getUserIdFromUrl();
    if(!username){alert('Tidak bisa menemukan username di URL!');return;}
    const tableBody=createPostDashboard(username);
    scrapePostsPage(tableBody,username);
    const scrollHandler=debounce(async()=>{
        if(state.isRunning||!state.postAfterCursor)return;
        const tableContainer=document.getElementById('post-table-container');
        if(!tableContainer)return;
        if(tableContainer.scrollHeight-tableContainer.scrollTop-tableContainer.clientHeight<200){
            await scrapePostsPage(tableBody,username,state.postAfterCursor);
        }
    },300);
    document.getElementById('post-table-container').addEventListener('scroll',scrollHandler);
});
clearLogBtn.addEventListener('click',()=>{ logArea.innerHTML='';logs.length=0;log('LOG CLEARED','INFO');updateStatus('LOG CLEARED','idle'); });
minimizeBtn.addEventListener('click',()=>{ clickSound.play();content.style.display=content.style.display==='none'?'grid':'none';
    minimizeBtn.textContent=content.style.display==='none'?'+':'_'; });
maxBtn.addEventListener('click',()=>{ clickSound.play();dashboard.style.width=dashboard.style.width==='80vw'?'clamp(320px,30vw,450px)':'80vw';dashboard.style.height=dashboard.style.height==='80vh'?'auto':'80vh'; });
exitBtn.addEventListener('click',()=>{ clickSound.play();dashboard.remove();log('APPLICATION TERMINATED','INFO'); });
helpMenu.addEventListener('click',()=>{clickSound.play();
    alert(`Instagram Post Scraper Only v1.2\nFitur:\n- SCRAPE POST: Multi-media, carousel, photo/video ALL scraped\n- Preview dashboard = multi-thumbnail + badge.[PHOTO/VIDEO/#]\n- Search/filter, CSV/HTML export, drag, infinite scroll.\n- Klik hasil preview/media membesarkan\n- Ctrl+L: Clear Log, Ctrl+T: Theme Switcher\n\nUpload di page profil Instagram.`);
});
themeMenu.addEventListener('click',()=>{
    clickSound.play();
    const themes=['green','amber','blue'];const idx=themes.indexOf(state.theme);
    state.theme=themes[(idx+1)%themes.length];GM_setValue('theme',state.theme);
    dashboard.id=`insta-scraper-dashboard${state.theme==='green'?'':'-theme-'+state.theme}`;
    log(`THEME CHANGED TO ${state.theme.toUpperCase()}`,'INFO');
});
})();
