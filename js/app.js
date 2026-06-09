const APP_SCOPE=(location.pathname.split("/").filter(Boolean)[0]||"jbaaaam");
const STORAGE_KEY="simple_budget_sheets_v2";
const LOCAL_STORAGE_KEY="simple_budget_sheets_local_only_v1";
const GH_KEY="simple_budget_github_setting_v1";
const GIT_ENABLED_KEY="simple_budget_git_enabled_v1";
const SUMMARY_COLLAPSED_KEY="simple_budget_summary_collapsed_v1";
const EXPORT_VERSION=10;
const DATA_CRYPT_KEY="jb";
const AUTOSAVE_DELAY=0;

let state=normalizeState(loadState());
let editingItemId=null, selectedType="income", sheetMode="rename", editingSheetId=null;
let autoSaveTimer=null;
let toastTimer=null;
let isApplyingRemote=false;
let isGithubSaving=false;
let hasPendingGithubSave=false;
let lastGithubSha="";
let lastGithubError="";
let lastSyncText="자동 동기화 대기 중";

const $=id=>document.getElementById(id);
const sheetTitle=$("sheetTitle"), subTitle=$("subTitle"), balanceAmount=$("balanceAmount"), incomeAmount=$("incomeAmount"), expenseAmount=$("expenseAmount"), list=$("list"), summaryBox=$("summaryBox"), summaryToggleBtn=$("summaryToggleBtn");
const drawerBackdrop=$("drawerBackdrop"), sheetList=$("sheetList"), githubStatus=$("githubStatus"), githubBox=$("githubBox"), gitEnabledToggle=$("gitEnabledToggle");
const itemModalBackdrop=$("itemModalBackdrop"), itemModalTitle=$("itemModalTitle"), dayInput=$("dayInput"), nameInput=$("nameInput"), amountInput=$("amountInput"), noteInput=$("noteInput"), incomeTypeBtn=$("incomeTypeBtn"), expenseTypeBtn=$("expenseTypeBtn"), deleteItemBtn=$("deleteItemBtn");
const sheetModalBackdrop=$("sheetModalBackdrop"), sheetModalTitle=$("sheetModalTitle"), sheetNameInput=$("sheetNameInput");
const githubModalBackdrop=$("githubModalBackdrop"), importFileInput=$("importFileInput");

$("menuBtnHome").onclick=openDrawer;$("menuBtn").onclick=openDrawer;$("menuBtnTetris").onclick=openDrawer;$("menuBtnDino").onclick=openDrawer;$("menuBtnBamboo").onclick=openDrawer;$("drawerCloseBtn").onclick=closeDrawer;$("newSheetBtn").onclick=()=>openSheetModal("new");$("showBudgetBtn").onclick=()=>setMainView("budget");$("showTetrisBtn").onclick=()=>setMainView("tetris");$("showDinoBtn").onclick=()=>setMainView("dino");$("showBambooBtn").onclick=()=>setMainView("bamboo");$("homeBudgetCard").onclick=()=>setMainView("budget");$("homeTetrisCard").onclick=()=>setMainView("tetris");$("homeDinoCard").onclick=()=>setMainView("dino");$("homeBambooCard").onclick=()=>setMainView("bamboo");$("renameBtn").onclick=()=>openSheetModal("rename",state.currentSheetId);$("scoreBoardBtn").onclick=()=>openGameScoreBoardModal("tetris");$("dinoScoreBoardBtn").onclick=()=>openGameScoreBoardModal("dino");$("bambooScoreBoardBtn").onclick=()=>openGameScoreBoardModal("bamboo");summaryToggleBtn.onclick=toggleSummary;
$("exportBtn").onclick=exportData;$("importBtn").onclick=()=>importFileInput.click();importFileInput.onchange=importData;
$("loadGithubBtn").onclick=()=>loadFromGithub({manual:true});$("saveGithubBtn").onclick=()=>requestGithubSave({manual:true});$("testGithubBtn").onclick=testGithubConnection;$("githubSettingBtn").onclick=openGithubModal;if(gitEnabledToggle)gitEnabledToggle.onchange=toggleGitEnabled;
drawerBackdrop.onclick=e=>{if(e.target===drawerBackdrop)closeDrawer()};

$("addBtn").onclick=()=>openItemModal();$("cancelItemBtn").onclick=closeItemModal;$("closeItemModalBtn").onclick=closeItemModal;$("saveItemBtn").onclick=saveItem;deleteItemBtn.onclick=deleteItem;
itemModalBackdrop.onclick=e=>{};
incomeTypeBtn.onclick=()=>setType("income");expenseTypeBtn.onclick=()=>setType("expense");
amountInput.addEventListener("input", formatAmountInput);

$("cancelSheetBtn").onclick=closeSheetModal;$("closeSheetModalBtn").onclick=closeSheetModal;$("saveSheetBtn").onclick=saveSheetName;
sheetModalBackdrop.onclick=e=>{};

$("cancelGithubBtn").onclick=closeGithubModal;$("closeGithubModalBtn").onclick=closeGithubModal;$("saveGithubSettingBtn").onclick=saveGithubSetting;$("closeScoreNameBtn").onclick=closeScoreNameModal;$("skipScoreSaveBtn").onclick=closeScoreNameModal;$("saveScoreRecordBtn").onclick=saveScoreRecord;$("closeScoreBoardBtn").onclick=closeScoreBoardModal;$("okScoreBoardBtn").onclick=closeScoreBoardModal;$("clearScoreBoardBtn").onclick=clearScoreBoard;
githubModalBackdrop.onclick=e=>{};


function getActiveStorageKey(){
 return isGitEnabled()?STORAGE_KEY:LOCAL_STORAGE_KEY;
}

function newId(){return crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())}
function loadState(){try{const s=JSON.parse(localStorage.getItem(getActiveStorageKey()));if(s&&s.sheets&&s.sheets.length)return s}catch{}const id=newId();return{version:EXPORT_VERSION,currentSheetId:id,sheets:[{id,name:"기본 예산표",items:[]}]}}
function normalizeState(raw){if(!raw||!Array.isArray(raw.sheets)||!raw.sheets.length)raw=loadState();raw.version=EXPORT_VERSION;raw.sheets=raw.sheets.map((s,si)=>{const ns={id:s.id||newId(),name:s.name||`예산표 ${si+1}`,items:Array.isArray(s.items)?s.items:[]};ns.items=ns.items.map((it,i)=>({id:it.id||newId(),name:it.name||"이름 없음",amount:Number(it.amount)||0,type:it.type==="expense"?"expense":"income",day:it.day===""||it.day==null?"":Number(it.day),note:it.note||"",order:Number.isFinite(Number(it.order))?Number(it.order):i}));ns.items.sort((a,b)=>a.order-b.order).forEach((it,i)=>it.order=i);return ns});if(!raw.currentSheetId||!raw.sheets.some(s=>s.id===raw.currentSheetId))raw.currentSheetId=raw.sheets[0].id;if(!raw.games)raw.games={};if(!raw.games.tetris)raw.games.tetris={bestScore:0,records:[]};if(!raw.games.dino)raw.games.dino={bestScore:0,records:[]};if(!raw.games.bamboo)raw.games.bamboo={bestScore:0,records:[]};["tetris","dino","bamboo"].forEach(g=>{raw.games[g].bestScore=Number(raw.games[g].bestScore)||0;if(!Array.isArray(raw.games[g].records))raw.games[g].records=[];raw.games[g].records=raw.games[g].records.map(r=>({id:r.id||newId(),name:String(r.name||"익명"),score:Number(r.score)||0,dt:r.dt||""})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,15);});return raw}
function saveState(){state=normalizeState(state);localStorage.setItem(getActiveStorageKey(),JSON.stringify(state))}
function commitChange(){saveState();render();scheduleAutoSave()}
function getCurrentSheet(){let s=state.sheets.find(x=>x.id===state.currentSheetId);if(!s){s=state.sheets[0];state.currentSheetId=s.id;saveState()}return s}
function money(v){return Number(v||0).toLocaleString("ko-KR")+"원"}
function dayText(d){const n=Number(d);return n?`${n}일`:"일자없음"}
function esc(t){return String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeHtml(t){return esc(t)}
function nowText(){const d=new Date();return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`}


function applySummaryCollapsed(){
 const collapsed=localStorage.getItem(SUMMARY_COLLAPSED_KEY)==="Y";
 summaryBox.classList.toggle("collapsed",collapsed);
 summaryToggleBtn.textContent=collapsed?"⌄":"⌃";
 summaryToggleBtn.title=collapsed?"펼치기":"접기";
}
function toggleSummary(){
 const collapsed=localStorage.getItem(SUMMARY_COLLAPSED_KEY)==="Y";
 localStorage.setItem(SUMMARY_COLLAPSED_KEY,collapsed?"N":"Y");
 applySummaryCollapsed();
}


let currentMainView="home";

function setMainView(view){
 currentMainView=(view==="budget"||view==="tetris"||view==="dino"||view==="bamboo")?view:"home";
 const isHome=currentMainView==="home";
 const isBudget=currentMainView==="budget";
 const isTetris=currentMainView==="tetris";
 const isDino=currentMainView==="dino";
 const isBamboo=currentMainView==="bamboo";

 $("homeView").classList.toggle("active",isHome);
 $("budgetView").classList.toggle("active",isBudget);
 $("tetrisView").classList.toggle("active",isTetris);
 $("dinoView").classList.toggle("active",isDino);
 $("bambooView").classList.toggle("active",isBamboo);
 $("addBtn").style.display=isBudget?"block":"none";
 $("showBudgetBtn").classList.toggle("active",isBudget);
 $("showTetrisBtn").classList.toggle("active",isTetris);
 $("showDinoBtn").classList.toggle("active",isDino);
 $("showBambooBtn").classList.toggle("active",isBamboo);

 closeDrawer();

 if(isTetris){
   initTetrisIfNeeded();
   drawTetris();
 }
 if(isDino){
   initDinoIfNeeded();
   drawDino();
 }
 if(isBamboo){
   initBambooIfNeeded();
   drawBamboo();
 }
}



let pendingGameScore=0;
let pendingGameKey="tetris";
let scoreBoardGameKey="tetris";

function getGameLabel(gameKey){
 if(gameKey==="dino")return "공룡게임";
 if(gameKey==="bamboo")return "죽림고수";
 return "테트리스";
}
function getGameRecords(gameKey){
 state=normalizeState(state);
 return (state.games[gameKey]&&state.games[gameKey].records)||[];
}
function canSaveGameScore(score,gameKey="tetris"){
 const records=getGameRecords(gameKey).slice().sort((a,b)=>Number(b.score)-Number(a.score));
 const n=Number(score)||0;
 if(n<=0)return false;
 if(records.length<15)return true;
 return n>Number(records[14].score||0);
}
function getScoreCutLine(gameKey="tetris"){
 const records=getGameRecords(gameKey).slice().sort((a,b)=>Number(b.score)-Number(a.score));
 return records.length>=15?Number(records[14].score||0):0;
}
function openScoreNameModal(score,gameKey="tetris"){
 pendingGameScore=Number(score)||0;
 pendingGameKey=gameKey;
 if(pendingGameScore<=0)return;
 if(!canSaveGameScore(pendingGameScore,gameKey)){
   const cut=getScoreCutLine(gameKey);
   showToast(cut?`15위 안에 들어야 저장돼 · 기준 ${cut.toLocaleString()}점`:"15위 안에 들어야 저장돼","error");
   return;
 }
 $("scoreNameInput").value=localStorage.getItem("simple_budget_last_game_name")||localStorage.getItem("simple_budget_last_tetris_name")||"";
 $("scoreValueInput").value=String(pendingGameScore);
 const title=$("scoreNameModalBackdrop").querySelector(".modal-title");
 if(title)title.textContent=`${getGameLabel(gameKey)} 스코어 기록`;
 $("scoreNameModalBackdrop").classList.add("open");
 setTimeout(()=>$("scoreNameInput").focus(),50);
}
function closeScoreNameModal(){
 $("scoreNameModalBackdrop").classList.remove("open");
 pendingGameScore=0;
}
function saveScoreRecord(){
 const name=($("scoreNameInput").value||"").trim()||"익명";
 const score=pendingGameScore||Number($("scoreValueInput").value)||0;
 const gameKey=pendingGameKey||"tetris";
 if(score<=0){closeScoreNameModal();return}
 localStorage.setItem("simple_budget_last_game_name",name);
 localStorage.setItem("simple_budget_last_tetris_name",name);
 state=normalizeState(state);
 state.games[gameKey].records=(state.games[gameKey].records||[]).filter(r=>!(String(r.name||"")===name && Number(r.score)===Number(score)));
 state.games[gameKey].records.push({id:newId(),name,score,dt:new Date().toISOString()});
 state.games[gameKey].records=state.games[gameKey].records.sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,15);
 if(score>Number(state.games[gameKey].bestScore||0))state.games[gameKey].bestScore=score;
 closeScoreNameModal();
 commitChange();
 if(gameKey==="tetris")updateTetrisInfo();
 if(gameKey==="dino")updateDinoInfo();
 if(gameKey==="bamboo")updateBambooInfo();
 showToast("스코어 저장 완료");
 openGameScoreBoardModal(gameKey);
}
function formatScoreDate(iso){
 if(!iso)return "";
 const d=new Date(iso);
 if(Number.isNaN(d.getTime()))return "";
 const yy=String(d.getFullYear()).slice(2);
 const mm=String(d.getMonth()+1).padStart(2,"0");
 const dd=String(d.getDate()).padStart(2,"0");
 return `${yy}.${mm}.${dd}`;
}
function openGameScoreBoardModal(gameKey="tetris"){
 scoreBoardGameKey=gameKey;
 renderScoreBoard();
 const title=$("scoreBoardModalBackdrop").querySelector(".modal-title");
 if(title)title.textContent=`${getGameLabel(gameKey)} 스코어 현황`;
 $("scoreBoardModalBackdrop").classList.add("open");
}
function openScoreBoardModal(){openGameScoreBoardModal("tetris")}
function closeScoreBoardModal(){$("scoreBoardModalBackdrop").classList.remove("open")}
function renderScoreBoard(){
 const list=$("scoreList");
 const records=getGameRecords(scoreBoardGameKey).slice().sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,15);
 if(!records.length){
   list.innerHTML='<div class="score-empty">아직 저장된 스코어가 없어.</div>';
   return;
 }
 list.innerHTML=records.map((r,i)=>`
   <div class="score-row">
     <div class="score-rank">${i+1}</div>
     <div>
       <div class="score-name">${escapeHtml(r.name)}</div>
       <div class="score-date">${formatScoreDate(r.dt)}</div>
     </div>
     <div class="score-value">${Number(r.score).toLocaleString()}</div>
   </div>
 `).join("");
}
function clearScoreBoard(){
 if(!confirm("스코어 기록을 전부 삭제할까?"))return;
 const gameKey=scoreBoardGameKey||"tetris";
 state=normalizeState(state);
 state.games[gameKey].records=[];
 state.games[gameKey].bestScore=0;
 commitChange();
 if(gameKey==="tetris")updateTetrisInfo();
 if(gameKey==="dino")updateDinoInfo();
 if(gameKey==="bamboo")updateBambooInfo();
 renderScoreBoard();
 showToast("스코어 삭제 완료");
}

/* Tetris */
const TETRIS_COLS=10;
const TETRIS_ROWS=20;
const TETRIS_BLOCK=24;
let tetrisCtx=null;
let tetrisBoard=[];
let tetrisPiece=null;
let tetrisNextQueue=[];
let tetrisScoreValue=0;
let tetrisRunning=false;
let tetrisPaused=false;
let tetrisLoopId=null;
let tetrisDropMs=700;
let tetrisLevel=1;
let tetrisLastLevel=1;

const TETRIS_SHAPES=[
 {name:"I",color:"#38bdf8",shape:[[1,1,1,1]]},
 {name:"J",color:"#60a5fa",shape:[[1,0,0],[1,1,1]]},
 {name:"L",color:"#fb923c",shape:[[0,0,1],[1,1,1]]},
 {name:"O",color:"#facc15",shape:[[1,1],[1,1]]},
 {name:"S",color:"#4ade80",shape:[[0,1,1],[1,1,0]]},
 {name:"T",color:"#c084fc",shape:[[0,1,0],[1,1,1]]},
 {name:"Z",color:"#f87171",shape:[[1,1,0],[0,1,1]]}
];

function initTetrisIfNeeded(){
 if(tetrisCtx)return;
 const canvas=$("tetrisCanvas");
 tetrisCtx=canvas.getContext("2d");
 $("tetrisStartBtn").onclick=startTetris;
 $("tetrisPauseBtn").onclick=toggleTetrisPause;
 $("tetrisRestartBtn").onclick=startTetris;
 $("tetrisLeftBtn").onclick=()=>moveTetris(-1);
 $("tetrisRightBtn").onclick=()=>moveTetris(1);
 $("tetrisRotateBtn").onclick=rotateTetrisPiece;
 $("tetrisDownBtn").onclick=softDropTetris;
 $("tetrisDropBtn").onclick=hardDropTetris;
 document.addEventListener("keydown",handleTetrisKey);
 resetTetrisBoard();
 drawTetris();
}

function handleTetrisKey(e){
 if(currentMainView!=="tetris")return;
 if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Control"," ","p","P"].includes(e.key))e.preventDefault();
 const startKeys=["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Control"," "];
 if(!tetrisRunning && startKeys.includes(e.key)){
   startTetris();
 }
 if(e.key==="ArrowLeft")moveTetris(-1);
 else if(e.key==="ArrowRight")moveTetris(1);
 else if(e.key==="Control")rotateTetrisPiece();
 else if(e.key==="ArrowUp")hardDropTetris();
 else if(e.key==="ArrowDown")softDropTetris();
 else if(e.key===" ")hardDropTetris();
 else if(e.key==="p"||e.key==="P")toggleTetrisPause();
}

function resetTetrisBoard(){
 tetrisBoard=Array.from({length:TETRIS_ROWS},()=>Array(TETRIS_COLS).fill(null));
 tetrisPiece=null;
 tetrisNextQueue=[randomTetrisPiece(),randomTetrisPiece(),randomTetrisPiece()];
 tetrisScoreValue=0;
 tetrisLevel=1;
 tetrisLastLevel=1;
 tetrisDropMs=getTetrisDropMs(tetrisLevel);
 tetrisRunning=false;
 tetrisPaused=false;
 clearInterval(tetrisLoopId);
 tetrisLoopId=null;
}

function randomTetrisPiece(){
 const base=TETRIS_SHAPES[Math.floor(Math.random()*TETRIS_SHAPES.length)];
 return {
   name:base.name,
   color:base.color,
   shape:base.shape.map(row=>[...row]),
   x:Math.floor((TETRIS_COLS-base.shape[0].length)/2),
   y:0
 };
}

function spawnTetrisPiece(){
 if(!tetrisNextQueue.length)tetrisNextQueue=[randomTetrisPiece(),randomTetrisPiece(),randomTetrisPiece()];
 tetrisPiece=tetrisNextQueue.shift();
 tetrisPiece.x=Math.floor((TETRIS_COLS-tetrisPiece.shape[0].length)/2);
 tetrisPiece.y=0;
 tetrisNextQueue.push(randomTetrisPiece());
 if(collidesTetris(tetrisPiece.x,tetrisPiece.y,tetrisPiece.shape)){
   endTetris();
 }
}

function getTetrisLevel(score=tetrisScoreValue){
 return Math.floor(Number(score||0)/3000)+1;
}

function getTetrisDropMs(level=getTetrisLevel()){
 return Math.max(520,700-(Number(level||1)-1)*20);
}

function getTetrisScoreMultiplier(level=getTetrisLevel()){
 return 1+(Number(level||1)-1)*0.15;
}

function refreshTetrisDifficulty(){
 const nextLevel=getTetrisLevel();
 tetrisLevel=nextLevel;
 const nextDropMs=getTetrisDropMs(nextLevel);
 if(nextLevel!==tetrisLastLevel||nextDropMs!==tetrisDropMs){
   tetrisLastLevel=nextLevel;
   tetrisDropMs=nextDropMs;
   if(tetrisRunning){
     clearInterval(tetrisLoopId);
     tetrisLoopId=setInterval(tetrisTick,tetrisDropMs);
   }
 }
}

function addTetrisScore(baseScore){
 const add=Math.max(0,Math.round(Number(baseScore||0)*getTetrisScoreMultiplier()));
 if(add<=0)return;
 tetrisScoreValue+=add;
 refreshTetrisDifficulty();
}

function startTetris(){
 resetTetrisBoard();
 tetrisRunning=true;
 tetrisPaused=false;
 spawnTetrisPiece();
 drawTetris();
 tetrisLoopId=setInterval(tetrisTick,tetrisDropMs);
}

function toggleTetrisPause(){
 if(!tetrisRunning)return;
 tetrisPaused=!tetrisPaused;
 drawTetris();
}

function tetrisTick(){
 if(!tetrisRunning||tetrisPaused)return;
 if(!tryMoveTetris(0,1)){
   lockTetrisPiece();
   clearTetrisLines();
   spawnTetrisPiece();
 }
 drawTetris();
}

function collidesTetris(x,y,shape){
 for(let r=0;r<shape.length;r++){
   for(let c=0;c<shape[r].length;c++){
     if(!shape[r][c])continue;
     const nx=x+c, ny=y+r;
     if(nx<0||nx>=TETRIS_COLS||ny>=TETRIS_ROWS)return true;
     if(ny>=0&&tetrisBoard[ny][nx])return true;
   }
 }
 return false;
}

function tryMoveTetris(dx,dy){
 if(!tetrisPiece||!tetrisRunning||tetrisPaused)return false;
 const nx=tetrisPiece.x+dx, ny=tetrisPiece.y+dy;
 if(collidesTetris(nx,ny,tetrisPiece.shape))return false;
 tetrisPiece.x=nx;
 tetrisPiece.y=ny;
 return true;
}

function moveTetris(dx){
 if(tryMoveTetris(dx,0))drawTetris();
}

function softDropTetris(){
 if(!tetrisRunning||tetrisPaused)return;
 if(tryMoveTetris(0,1)){
   addTetrisScore(1);
   drawTetris();
 }else{
   tetrisTick();
 }
}

function hardDropTetris(){
 if(!tetrisPiece||!tetrisRunning||tetrisPaused)return;
 let moved=0;
 while(tryMoveTetris(0,1))moved++;
 addTetrisScore(moved*2);
 tetrisTick();
}

function rotateMatrix(matrix){
 const rows=matrix.length, cols=matrix[0].length;
 return Array.from({length:cols},(_,c)=>Array.from({length:rows},(_,r)=>matrix[rows-1-r][c]));
}

function rotateTetrisPiece(){
 if(!tetrisPiece||!tetrisRunning||tetrisPaused)return;
 const rotated=rotateMatrix(tetrisPiece.shape);
 const kicks=[0,-1,1,-2,2];
 for(const kick of kicks){
   if(!collidesTetris(tetrisPiece.x+kick,tetrisPiece.y,rotated)){
     tetrisPiece.shape=rotated;
     tetrisPiece.x+=kick;
     drawTetris();
     return;
   }
 }
}

function lockTetrisPiece(){
 if(!tetrisPiece)return;
 for(let r=0;r<tetrisPiece.shape.length;r++){
   for(let c=0;c<tetrisPiece.shape[r].length;c++){
     if(!tetrisPiece.shape[r][c])continue;
     const x=tetrisPiece.x+c,y=tetrisPiece.y+r;
     if(y>=0&&y<TETRIS_ROWS&&x>=0&&x<TETRIS_COLS)tetrisBoard[y][x]=tetrisPiece.color;
   }
 }
 addTetrisScore(10);
}

function clearTetrisLines(){
 let cleared=0;
 for(let r=TETRIS_ROWS-1;r>=0;r--){
   if(tetrisBoard[r].every(Boolean)){
     tetrisBoard.splice(r,1);
     tetrisBoard.unshift(Array(TETRIS_COLS).fill(null));
     cleared++;
     r++;
   }
 }
 if(cleared){
   const scoreMap=[0,100,300,500,800];
   addTetrisScore(scoreMap[cleared]||cleared*200);
 }
}

function endTetris(){
 tetrisRunning=false;
 clearInterval(tetrisLoopId);
 tetrisLoopId=null;
 drawTetris();
 showToast("테트리스 종료");
 if(tetrisScoreValue>0){
   openScoreNameModal(tetrisScoreValue,"tetris");
 }
}

function getTetrisBest(){
 state=normalizeState(state);
 return Number(state.games&&state.games.tetris&&state.games.tetris.bestScore)||0;
}

function updateTetrisInfo(){
 refreshTetrisDifficulty();
 $("tetrisScore").textContent=String(tetrisScoreValue);
 $("tetrisBest").textContent=String(Math.max(getTetrisBest(),tetrisScoreValue));
 if($("tetrisLevel"))$("tetrisLevel").textContent=String(tetrisLevel);
}

function drawCell(x,y,color){
 tetrisCtx.fillStyle=color;
 tetrisCtx.fillRect(x*TETRIS_BLOCK,y*TETRIS_BLOCK,TETRIS_BLOCK,TETRIS_BLOCK);
 tetrisCtx.strokeStyle="#111827";
 tetrisCtx.lineWidth=2;
 tetrisCtx.strokeRect(x*TETRIS_BLOCK,y*TETRIS_BLOCK,TETRIS_BLOCK,TETRIS_BLOCK);
}

function drawNextPiece(canvas,piece){
 if(!canvas)return;
 const ctx=canvas.getContext("2d");
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle="#030712";
 ctx.fillRect(0,0,canvas.width,canvas.height);
 if(!piece)return;
 const size=12;
 const shape=piece.shape;
 const w=shape[0].length*size;
 const h=shape.length*size;
 const ox=Math.floor((canvas.width-w)/2);
 const oy=Math.floor((canvas.height-h)/2);
 for(let r=0;r<shape.length;r++){
   for(let c=0;c<shape[r].length;c++){
     if(!shape[r][c])continue;
     ctx.fillStyle=piece.color;
     ctx.fillRect(ox+c*size,oy+r*size,size,size);
     ctx.strokeStyle="#111827";
     ctx.lineWidth=1;
     ctx.strokeRect(ox+c*size,oy+r*size,size,size);
   }
 }
}

function drawNextQueue(){
 for(let i=0;i<3;i++){
   drawNextPiece($("nextCanvas"+i),tetrisNextQueue[i]);
 }
}

function getTetrisGhostY(){
 if(!tetrisPiece)return 0;
 let gy=tetrisPiece.y;
 while(!collidesTetris(tetrisPiece.x,gy+1,tetrisPiece.shape))gy++;
 return gy;
}

function drawTetrisGhost(){
 if(!tetrisPiece)return;
 const gy=getTetrisGhostY();
 if(gy===tetrisPiece.y)return;
 tetrisCtx.save();
 tetrisCtx.globalAlpha=0.22;
 for(let r=0;r<tetrisPiece.shape.length;r++){
   for(let c=0;c<tetrisPiece.shape[r].length;c++){
     if(!tetrisPiece.shape[r][c])continue;
     const x=tetrisPiece.x+c,y=gy+r;
     if(y<0||y>=TETRIS_ROWS||x<0||x>=TETRIS_COLS)continue;
     tetrisCtx.fillStyle=tetrisPiece.color;
     tetrisCtx.fillRect(x*TETRIS_BLOCK,y*TETRIS_BLOCK,TETRIS_BLOCK,TETRIS_BLOCK);
     tetrisCtx.strokeStyle="#f9fafb";
     tetrisCtx.lineWidth=2;
     tetrisCtx.strokeRect(x*TETRIS_BLOCK+2,y*TETRIS_BLOCK+2,TETRIS_BLOCK-4,TETRIS_BLOCK-4);
   }
 }
 tetrisCtx.restore();
}

function drawTetris(){
 if(!tetrisCtx)return;
 tetrisCtx.clearRect(0,0,TETRIS_COLS*TETRIS_BLOCK,TETRIS_ROWS*TETRIS_BLOCK);
 tetrisCtx.fillStyle="#030712";
 tetrisCtx.fillRect(0,0,TETRIS_COLS*TETRIS_BLOCK,TETRIS_ROWS*TETRIS_BLOCK);

 tetrisCtx.strokeStyle="#1f2937";
 tetrisCtx.lineWidth=1;
 for(let x=0;x<=TETRIS_COLS;x++){
   tetrisCtx.beginPath();tetrisCtx.moveTo(x*TETRIS_BLOCK,0);tetrisCtx.lineTo(x*TETRIS_BLOCK,TETRIS_ROWS*TETRIS_BLOCK);tetrisCtx.stroke();
 }
 for(let y=0;y<=TETRIS_ROWS;y++){
   tetrisCtx.beginPath();tetrisCtx.moveTo(0,y*TETRIS_BLOCK);tetrisCtx.lineTo(TETRIS_COLS*TETRIS_BLOCK,y*TETRIS_BLOCK);tetrisCtx.stroke();
 }

 for(let r=0;r<TETRIS_ROWS;r++){
   for(let c=0;c<TETRIS_COLS;c++){
     if(tetrisBoard[r][c])drawCell(c,r,tetrisBoard[r][c]);
   }
 }

 if(tetrisPiece){
   drawTetrisGhost();
   for(let r=0;r<tetrisPiece.shape.length;r++){
     for(let c=0;c<tetrisPiece.shape[r].length;c++){
       if(tetrisPiece.shape[r][c])drawCell(tetrisPiece.x+c,tetrisPiece.y+r,tetrisPiece.color);
     }
   }
 }

 updateTetrisInfo();
 drawNextQueue();
}

function render(){
 applySummaryCollapsed();
 state=normalizeState(state);const sheet=getCurrentSheet();const items=[...(sheet.items||[])].sort((a,b)=>a.order-b.order);
 const inc=items.filter(i=>i.type==="income").reduce((s,i)=>s+i.amount,0), exp=items.filter(i=>i.type==="expense").reduce((s,i)=>s+i.amount,0);
 sheetTitle.textContent=sheet.name;incomeAmount.textContent=money(inc);expenseAmount.textContent=money(exp);balanceAmount.textContent=money(inc-exp);
 const gh=getGithubSetting();subTitle.textContent=`${gh.owner}/${gh.repo} · ${gh.path}`;
 list.innerHTML="";
 if(!items.length)list.innerHTML=`<div class="empty">아직 추가한 내역이 없어</div>`;
 else items.forEach((item,index)=>{const el=document.createElement("div");el.className="item";const sign=item.type==="income"?"+":"-";const cls=item.type==="income"?"income":"expense";const note=item.note?esc(item.note):"비고 없음";const noteClass=item.note?"item-note":"item-note empty-note";el.innerHTML=`<div class="item-left"><div class="item-top"><span class="day-badge">${dayText(item.day)}</span><div class="item-name">${esc(item.name)}</div></div><div class="${noteClass}">${note}</div></div><div class="item-right"><div class="item-amount ${cls}">${sign}${money(item.amount)}</div><div class="item-actions"><button class="mini-btn up-btn" ${index===0?"disabled":""}>↑</button><button class="mini-btn down-btn" ${index===items.length-1?"disabled":""}>↓</button><button class="edit-btn">수정</button></div></div>`;el.querySelector(".edit-btn").onclick=()=>openItemModal(item);el.querySelector(".up-btn").onclick=()=>moveItem(item.id,-1);el.querySelector(".down-btn").onclick=()=>moveItem(item.id,1);list.appendChild(el)});
 renderSheetList();updateGithubStatus()
}
function renderSheetList(){sheetList.innerHTML="";state.sheets.forEach(sheet=>{const inc=(sheet.items||[]).filter(i=>i.type==="income").reduce((s,i)=>s+i.amount,0),exp=(sheet.items||[]).filter(i=>i.type==="expense").reduce((s,i)=>s+i.amount,0);const row=document.createElement("div");row.className="sheet-item"+(sheet.id===state.currentSheetId?" active":"");row.innerHTML=`<div style="min-width:0"><div class="sheet-name">${esc(sheet.name)}</div><div class="sheet-meta">남은 금액 ${money(inc-exp)}</div></div><div class="sheet-actions"><button class="sheet-edit">수정</button><button class="sheet-delete">삭제</button></div>`;row.onclick=()=>{state.currentSheetId=sheet.id;commitChange();setMainView("budget")};row.querySelector(".sheet-edit").onclick=e=>{e.stopPropagation();openSheetModal("rename",sheet.id)};row.querySelector(".sheet-delete").onclick=e=>{e.stopPropagation();deleteSheet(sheet.id)};sheetList.appendChild(row)})}
function openDrawer(){drawerBackdrop.classList.add("open");renderSheetList();updateGithubStatus()}function closeDrawer(){drawerBackdrop.classList.remove("open")}


function onlyDigits(value){
 return String(value||"").replace(/[^\d]/g,"");
}
function formatNumberWithComma(value){
 const digits=onlyDigits(value);
 if(!digits)return "";
 return Number(digits).toLocaleString("ko-KR");
}
function formatAmountInput(){
 const formatted=formatNumberWithComma(amountInput.value);
 amountInput.value=formatted;
}
function getAmountNumber(){
 const digits=onlyDigits(amountInput.value);
 return digits?Number(digits):0;
}

function openItemModal(item=null){editingItemId=item?item.id:null;if(item){itemModalTitle.textContent="수정";dayInput.value=item.day||"";nameInput.value=item.name;amountInput.value=formatNumberWithComma(item.amount);noteInput.value=item.note||"";setType(item.type);deleteItemBtn.classList.add("show")}else{itemModalTitle.textContent="추가";dayInput.value="";nameInput.value="";amountInput.value="";noteInput.value="";setType("income");deleteItemBtn.classList.remove("show")}itemModalBackdrop.classList.add("open");setTimeout(()=>dayInput.focus(),100)}
function closeItemModal(){itemModalBackdrop.classList.remove("open");editingItemId=null}
function setType(t){selectedType=t;incomeTypeBtn.classList.toggle("active",t==="income");expenseTypeBtn.classList.toggle("active",t==="expense")}
function saveItem(){const sheet=getCurrentSheet(),dv=dayInput.value.trim(),day=dv===""?"":Number(dv),name=nameInput.value.trim(),amount=getAmountNumber(),note=noteInput.value.trim();if(day!==""&&(!Number.isInteger(day)||day<1||day>31)){alert("일자는 1~31 사이로 입력해줘.");dayInput.focus();return}if(!name){alert("이름을 입력해줘.");nameInput.focus();return}if(!amount||amount<=0){alert("금액을 입력해줘.");amountInput.focus();return}if(!sheet.items)sheet.items=[];if(editingItemId)sheet.items=sheet.items.map(i=>i.id!==editingItemId?i:{...i,day,name,amount,note,type:selectedType});else sheet.items.push({id:newId(),day,name,amount,note,type:selectedType,order:sheet.items.length});normalizeOrder(sheet);closeItemModal();commitChange()}
function deleteItem(){const sheet=getCurrentSheet();if(!editingItemId)return;if(!confirm("삭제할까?"))return;sheet.items=(sheet.items||[]).filter(i=>i.id!==editingItemId);normalizeOrder(sheet);closeItemModal();commitChange()}
function moveItem(id,dir){const sheet=getCurrentSheet();const items=[...(sheet.items||[])].sort((a,b)=>a.order-b.order);const idx=items.findIndex(i=>i.id===id),t=idx+dir;if(idx<0||t<0||t>=items.length)return;[items[idx],items[t]]=[items[t],items[idx]];items.forEach((i,n)=>i.order=n);sheet.items=items;commitChange()}
function normalizeOrder(sheet){sheet.items=[...(sheet.items||[])].sort((a,b)=>a.order-b.order);sheet.items.forEach((i,n)=>i.order=n)}

function openSheetModal(mode,sheetId=null){sheetMode=mode;editingSheetId=sheetId||state.currentSheetId;const sheet=state.sheets.find(s=>s.id===editingSheetId)||getCurrentSheet();sheetModalTitle.textContent=mode==="new"?"새 지출표 만들기":"지출표 이름 수정";sheetNameInput.value=mode==="new"?"":sheet.name;sheetModalBackdrop.classList.add("open");setTimeout(()=>sheetNameInput.focus(),100)}
function closeSheetModal(){sheetModalBackdrop.classList.remove("open");editingSheetId=null}
function saveSheetName(){const name=sheetNameInput.value.trim();if(!name){alert("이름을 입력해줘.");return}if(sheetMode==="new"){const id=newId();state.sheets.unshift({id,name,items:[]});state.currentSheetId=id;closeDrawer()}else{const s=state.sheets.find(x=>x.id===editingSheetId);if(s)s.name=name}closeSheetModal();commitChange()}
function deleteSheet(id){if(state.sheets.length<=1){alert("지출표는 최소 1개는 있어야 해.");return}const s=state.sheets.find(x=>x.id===id);if(!confirm(`"${s.name}" 지출표를 삭제할까?`))return;state.sheets=state.sheets.filter(x=>x.id!==id);if(state.currentSheetId===id)state.currentSheetId=state.sheets[0].id;commitChange()}

function exportData(){const data={app:"simple_budget_sheets",version:EXPORT_VERSION,exportedAt:new Date().toISOString(),state:normalizeState(state)};const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const d=new Date(),fn=`budget-backup-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.json`;const a=document.createElement("a");a.href=url;a.download=fn;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
function importData(e){const file=e.target.files&&e.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result),s=p.state||p;if(!s||!Array.isArray(s.sheets)){alert("가져올 수 없는 파일이야.");return}if(!confirm("현재 데이터가 가져온 파일 내용으로 바뀌어. 계속할까?"))return;state=normalizeState(s);saveState();closeDrawer();render();scheduleAutoSave();alert("가져오기 완료.")}catch{alert("파일을 읽는 중 오류가 났어.")}finally{importFileInput.value=""}};r.readAsText(file,"utf-8")}


function showToast(message,type="normal"){
 const el=$("toast");
 if(!el)return;
 el.textContent=message;
 el.classList.toggle("error",type==="error");
 el.classList.add("show");
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>el.classList.remove("show"),1800);
}


function xorCrypt(text,key){
 let out="";
 for(let i=0;i<text.length;i++){
   out+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length));
 }
 return out;
}
function encodeBase64Unicode(text){
 return btoa(unescape(encodeURIComponent(text)));
}
function decodeBase64Unicode(text){
 return decodeURIComponent(escape(atob(text)));
}
function encryptBudgetPayload(payload){
 const plain=JSON.stringify(payload);
 const xored=xorCrypt(plain,DATA_CRYPT_KEY);
 return {
   app:"simple_budget_sheets",
   encrypted:true,
   method:"xor-base64",
   version:EXPORT_VERSION,
   updatedAt:new Date().toISOString(),
   data:encodeBase64Unicode(xored)
 };
}
function decryptBudgetPayload(payload){
 if(payload && payload.encrypted && payload.data){
   const xored=decodeBase64Unicode(payload.data);
   const plain=xorCrypt(xored,DATA_CRYPT_KEY);
   return JSON.parse(plain);
 }
 return payload && payload.state ? payload.state : payload;
}


function isGitEnabled(){
 const value=localStorage.getItem(GIT_ENABLED_KEY);
 return value===null ? true : value==="Y";
}
function setGitEnabled(enabled){
 localStorage.setItem(GIT_ENABLED_KEY,enabled?"Y":"N");
}
function toggleGitEnabled(){
 const enabled=gitEnabledToggle.checked;

 // 현재 모드의 데이터를 먼저 현재 모드 저장소에 보존
 saveState();

 // 모드 변경
 setGitEnabled(enabled);
 clearTimeout(autoSaveTimer);
 lastGithubError="";

 if(enabled){
   // GitHub 모드는 GitHub용 저장소를 먼저 화면에 로드한 뒤, 원격 data.json을 불러옴
   state=normalizeState(loadState());
   lastSyncText="Supabase 사용 ON";
   render();
   loadFromGithub({manual:false});
   showToast("GitHub 모드");
 }else{
   // Supabase 공유 저장 고정는 GitHub 저장소와 분리된 local 전용 저장소를 화면에 로드
   state=normalizeState(loadState());
   lastSyncText="Supabase 공유 저장 고정";
   render();
   showToast("Supabase 공유 저장 고정");
 }
}

function getGithubSetting(){try{return{owner:"kwonjinbeom",repo:"budget_manage",branch:"main",path:"data.json",token:"",autoLoad:true,autoSave:true,...JSON.parse(localStorage.getItem(GH_KEY)||"{}")}}catch{return{owner:"kwonjinbeom",repo:"budget_manage",branch:"main",path:"data.json",token:"",autoLoad:true,autoSave:true}}}
function saveGithubSetting(){const s={owner:$("ghOwnerInput").value.trim(),repo:$("ghRepoInput").value.trim(),branch:$("ghBranchInput").value.trim()||"main",path:$("ghPathInput").value.trim()||"data.json",token:$("ghTokenInput").value.trim(),autoLoad:true,autoSave:true};if(!s.owner||!s.repo||!s.token){alert("Owner, Repo, Token은 필요해.");return}localStorage.setItem(GH_KEY,JSON.stringify(s));closeGithubModal();render();if(isGitEnabled())loadFromGithub({manual:false});alert("Supabase 설정 저장 완료.")}
function openGithubModal(){const s=getGithubSetting();$("ghOwnerInput").value=s.owner;$("ghRepoInput").value=s.repo;$("ghBranchInput").value=s.branch;$("ghPathInput").value=s.path;$("ghTokenInput").value=s.token;githubModalBackdrop.classList.add("open")}
function closeGithubModal(){githubModalBackdrop.classList.remove("open")}
function updateGithubStatus(){
 const enabled=isGitEnabled();
 if(gitEnabledToggle)gitEnabledToggle.checked=enabled;
 if(githubBox)githubBox.classList.toggle("git-off",!enabled);
 const s=getGithubSetting();
 const tokenText=s.token?"토큰 저장됨":"토큰 미설정";
 const errText=lastGithubError?`\n오류: ${lastGithubError}`:"";
 if(!enabled){
   githubStatus.textContent=`GitHub OFF\nlocalStorage 전용 데이터 사용 중\n${lastSyncText}${errText}`;
   return;
 }
 githubStatus.textContent=`repo: ${s.owner}/${s.repo}\nfile: ${s.path} · branch: ${s.branch}\n암호화 저장: jb · ${tokenText} · ${lastSyncText}${errText}`;
}

function shortErrorText(e){
 let msg="";
 if(e && e.message) msg=String(e.message);
 else msg=String(e||"unknown error");
 try{
   const jsonStart=msg.indexOf("{");
   if(jsonStart>=0){
     const parsed=JSON.parse(msg.slice(jsonStart));
     if(parsed && parsed.message) msg=msg.slice(0,jsonStart).trim()+" "+parsed.message;
   }
 }catch{}
 return msg.replace(/\s+/g," ").slice(0,260);
}

function ghHeaders(token){return{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}}
async function getGithubFile(s){
 const pathParts=s.path.split("/").map(encodeURIComponent).join("/");
 const url=`https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${pathParts}?ref=${encodeURIComponent(s.branch)}&t=${Date.now()}`;
 const res=await fetch(url,{headers:ghHeaders(s.token),cache:"no-store"});
 if(res.status===404)return null;
 if(!res.ok)throw new Error(`${res.status} ${await res.text()}`);
 return await res.json();
}
function encodeBase64Utf8(str){return btoa(unescape(encodeURIComponent(str)))}
function decodeBase64Utf8(str){return decodeURIComponent(escape(atob(str.replace(/\n/g,""))))}

async function loadFromGithub({manual=false}={}){
 if(!isGitEnabled()){if(manual)showToast("GitHub OFF 상태야");updateGithubStatus();return}
 const s=getGithubSetting();if(!s.token){if(manual){alert("먼저 Supabase 설정에서 토큰을 넣어줘.");openGithubModal()}return}
 try{lastSyncText="GitHub 불러오는 중...";updateGithubStatus();const file=await getGithubFile(s);if(!file){lastSyncText="data.json 없음. 저장하면 생성됨";updateGithubStatus();if(manual)alert("data.json 파일이 아직 없어. 현재 데이터를 GitHub에 먼저 저장하면 생성돼.");return}
 const parsed=JSON.parse(decodeBase64Utf8(file.content));const imported=decryptBudgetPayload(parsed);if(!imported||!Array.isArray(imported.sheets))throw new Error("invalid data");
 if(manual&&!confirm("GitHub의 data.json 내용으로 현재 화면 데이터가 바뀌어. 계속할까?")){lastSyncText="수동 불러오기 취소";updateGithubStatus();return}
 isApplyingRemote=true;state=normalizeState(imported);lastGithubSha=file.sha;saveState();render();isApplyingRemote=false;lastSyncText=`GitHub 불러오기 완료 ${nowText()}`;updateGithubStatus();if(manual)alert("GitHub 불러오기 완료.")
 }catch(e){
 console.error(e);
 isApplyingRemote=false;
 lastGithubError=shortErrorText(e);
 if(manual){
   lastSyncText=`불러오기 실패 ${nowText()}`;
   updateGithubStatus();
   alert("GitHub 불러오기 실패: "+lastGithubError);
 }else{
   setGitEnabled(false);
   state=normalizeState(loadState());
   lastSyncText=`GitHub 불러오기 실패 → Supabase 공유 저장 고정 전환 ${nowText()}`;
   render();
   showToast("GitHub 실패 · Supabase 공유 저장 고정","error");
 }
}
}

function scheduleAutoSave(){
 if(isApplyingRemote)return;
 if(!isGitEnabled()){lastSyncText="Supabase 공유 저장 고정";updateGithubStatus();return}
 const s=getGithubSetting();if(!s.token||!s.autoSave)return;
 clearTimeout(autoSaveTimer);
 requestGithubSave({manual:false});
}



async function testGithubConnection(){
 if(!isGitEnabled()){showToast("GitHub OFF 상태야");updateGithubStatus();return}
 const s=getGithubSetting();
 if(!s.token){
   alert("먼저 Supabase 설정에서 토큰을 넣어줘.");
   openGithubModal();
   return;
 }
 try{
   lastGithubError="";
   lastSyncText="GitHub 연결 테스트 중...";
   updateGithubStatus();
   const file=await getGithubFile(s);
   if(file&&file.sha){
     lastGithubSha=file.sha;
     lastSyncText=`연결 성공 ${nowText()} · sha ${file.sha.slice(0,7)}`;
     updateGithubStatus();
     showToast("GitHub 연결 성공");
   }else{
     lastSyncText=`연결 성공 ${nowText()} · data.json 없음`;
     updateGithubStatus();
     showToast("GitHub 연결 성공");
   }
 }catch(e){
   lastGithubError=shortErrorText(e);
   lastSyncText=`연결 실패 ${nowText()}`;
   updateGithubStatus();
   showToast("GitHub 연결 실패","error");
   alert("GitHub 연결 실패: "+lastGithubError);
 }
}

function requestGithubSave({manual=false}={}){
 if(!isGitEnabled()){if(manual)showToast("GitHub OFF 상태야");updateGithubStatus();return}
 if(isGithubSaving){
   hasPendingGithubSave=true;
   lastSyncText="저장 중. 다음 저장 대기...";
   updateGithubStatus();
   return;
 }
 saveToGithub({manual});
}

async function saveToGithub({manual=false}={}){
 if(!isGitEnabled()){if(manual)showToast("GitHub OFF 상태야");updateGithubStatus();return}
 const s=getGithubSetting();
 if(!s.token){
   if(manual){
     alert("먼저 Supabase 설정에서 토큰을 넣어줘.");
     openGithubModal();
   }
   return;
 }

 if(isGithubSaving){
   hasPendingGithubSave=true;
   return;
 }

 isGithubSaving=true;

 try{
   clearTimeout(autoSaveTimer);
   lastSyncText=manual?"GitHub 수동 저장 중...":"GitHub 자동 저장 중...";
   updateGithubStatus();

   let saveOk=false;
   let lastError=null;

   for(let attempt=1; attempt<=3; attempt++){
     try{
       const file=await getGithubFile(s);
       if(!lastGithubSha && file && file.sha) lastGithubSha=file.sha;

       const body={
         message:manual?"manual update budget data":"auto update budget data",
         content:encodeBase64Utf8(JSON.stringify(encryptBudgetPayload(normalizeState(state)),null,2)),
         branch:s.branch
       };

       if(lastGithubSha)body.sha=lastGithubSha; else if(file&&file.sha)body.sha=file.sha;

       const pathParts=s.path.split("/").map(encodeURIComponent).join("/");
       const url=`https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${pathParts}`;

       const res=await fetch(url,{
         method:"PUT",
         headers:{...ghHeaders(s.token),"Content-Type":"application/json"},
         body:JSON.stringify(body)
       });

       if(res.ok){
         const result=await res.json();
         lastGithubSha=result.content&&result.content.sha?result.content.sha:"";
         saveOk=true;
         break;
       }

       const text=await res.text();
       lastError=new Error(`${res.status} ${text}`);

       // 409 is the common sha conflict. Refetch and retry.
       if(res.status===409 || res.status===422){
         lastGithubSha="";
         await new Promise(resolve=>setTimeout(resolve,350*attempt));
         continue;
       }

       throw lastError;
     }catch(err){
       lastError=err;
       await new Promise(resolve=>setTimeout(resolve,250*attempt));
     }
   }

   if(!saveOk)throw lastError||new Error("unknown save error");

   lastGithubError="";
   lastSyncText=`GitHub 저장 완료 ${nowText()}`;
   updateGithubStatus();
   showToast(`GitHub 저장 완료 ${nowText()}`);
   if(manual)console.log("GitHub 저장 완료.");
 }catch(e){
   console.error(e);
   const msg=shortErrorText(e);
   lastGithubError=msg;
   lastSyncText=`저장 실패 ${nowText()}`;
   updateGithubStatus();
   showToast("GitHub 저장 실패","error");
   if(manual)alert("GitHub 저장 실패: "+msg);
 }finally{
   isGithubSaving=false;

   if(hasPendingGithubSave){
     hasPendingGithubSave=false;
     lastSyncText="대기 중인 변경분 저장 중...";
     updateGithubStatus();
     setTimeout(()=>requestGithubSave({manual:false}),50);
   }
 }
}

/* Dino */
let dinoCtx=null;
let dinoRunning=false;
let dinoPaused=false;
let dinoAnimId=null;
let dinoLastTs=0;
let dinoScoreValue=0;
let dinoSpeed=1;
let dinoObstacles=[];
let dinoClouds=[];
let dinoGroundX=0;
let dinoDuck=false;
let dino={x:70,y:0,w:38,h:48,vy:0,onGround:true};
const DINO_W=820;
const DINO_H=420;
const DINO_GROUND=350;
const DINO_GRAVITY=1900;
const DINO_JUMP=-690;

function initDinoIfNeeded(){
 if(dinoCtx)return;
 const canvas=$("dinoCanvas");
 dinoCtx=canvas.getContext("2d");
 $("dinoStartBtn").onclick=startDino;
 $("dinoPauseBtn").onclick=toggleDinoPause;
 $("dinoRestartBtn").onclick=startDino;
 $("dinoJumpBtn").onclick=jumpDino;
 $("dinoDuckBtn").onpointerdown=()=>setDinoDuck(true);
 $("dinoDuckBtn").onpointerup=()=>setDinoDuck(false);
 $("dinoDuckBtn").onpointerleave=()=>setDinoDuck(false);
 document.addEventListener("keydown",handleDinoKeyDown);
 document.addEventListener("keyup",handleDinoKeyUp);
 resetDino();
 drawDino();
}
function handleDinoKeyDown(e){
 if(currentMainView!=="dino")return;
 if(["ArrowUp","ArrowDown"," ","p","P"].includes(e.key))e.preventDefault();
 const startKeys=["ArrowUp","ArrowDown"," "];
 if(!dinoRunning && startKeys.includes(e.key)){
   startDino();
 }
 if(e.key==="ArrowUp"||e.key===" ")jumpDino();
 else if(e.key==="ArrowDown")setDinoDuck(true);
 else if(e.key==="p"||e.key==="P")toggleDinoPause();
}
function handleDinoKeyUp(e){
 if(currentMainView!=="dino")return;
 if(e.key==="ArrowDown")setDinoDuck(false);
}
function resetDino(){
 dinoRunning=false;
 dinoPaused=false;
 cancelAnimationFrame(dinoAnimId);
 dinoAnimId=null;
 dinoLastTs=0;
 dinoScoreValue=0;
 dinoSpeed=1;
 dinoObstacles=[];
 dinoClouds=[{x:160,y:104,w:46},{x:450,y:72,w:62},{x:720,y:132,w:42}];
 dinoGroundX=0;
 dinoDuck=false;
 dino={x:70,y:DINO_GROUND-48,w:38,h:48,vy:0,onGround:true};
 updateDinoInfo();
}
function startDino(){
 resetDino();
 dinoRunning=true;
 dinoPaused=false;
 spawnDinoObstacle();
 dinoAnimId=requestAnimationFrame(dinoLoop);
}
function toggleDinoPause(){
 if(!dinoRunning)return;
 dinoPaused=!dinoPaused;
 if(!dinoPaused){
   dinoLastTs=0;
   dinoAnimId=requestAnimationFrame(dinoLoop);
 }
 drawDino();
}
function jumpDino(){
 if(!dinoRunning){startDino();return}
 if(dinoPaused)return;
 if(dino.onGround){
   dino.vy=DINO_JUMP;
   dino.onGround=false;
 }
}
function setDinoDuck(flag){
 dinoDuck=!!flag;
 if(dinoDuck&&dinoRunning&&!dinoPaused&&!dino.onGround){
   dino.vy=Math.max(dino.vy,980);
 }
}
function spawnDinoObstacle(){
 const birdChance=Math.min(Math.max((dinoScoreValue-700)/2500,0),0.2);
 const isBird=dinoScoreValue>700&&Math.random()<birdChance;
 const size=26+Math.random()*12;
 dinoObstacles.push({
   x:DINO_W+20,
   y:isBird?DINO_GROUND-86:DINO_GROUND-size,
   w:isBird?38:size,
   h:isBird?24:size,
   type:isBird?"bird":"cactus"
 });
}
function dinoLoop(ts){
 if(!dinoRunning||dinoPaused)return;
 if(!dinoLastTs)dinoLastTs=ts;
 const dt=Math.min((ts-dinoLastTs)/1000,0.035);
 dinoLastTs=ts;
 updateDino(dt);
 drawDino();
 dinoAnimId=requestAnimationFrame(dinoLoop);
}
function updateDino(dt){
 dinoScoreValue+=dt*65*dinoSpeed;
 const speedDifficulty=Math.max(0,dinoScoreValue-200);
 // 점수가 계속 오르면 속도도 계속 증가하되, 너무 급격하지 않게 완만한 곡선으로 증가
 dinoSpeed=1+Math.sqrt(speedDifficulty)/58;
 const runSpeed=285*dinoSpeed;
 dinoGroundX=(dinoGroundX-runSpeed*dt)%34;
 dino.vy+=(DINO_GRAVITY+(dinoDuck&&!dino.onGround?2600:0))*dt;
 dino.y+=dino.vy*dt;
 dino.h=(dinoDuck&&dino.onGround)?30:48;
 dino.w=(dinoDuck&&dino.onGround)?52:38;
 const groundY=DINO_GROUND-dino.h;
 if(dino.y>=groundY){
   dino.y=groundY;
   dino.vy=0;
   dino.onGround=true;
 }
 for(const c of dinoClouds){
   c.x-=28*dt*dinoSpeed;
   if(c.x<-80){
     c.x=DINO_W+Math.random()*160;
     c.y=58+Math.random()*130;
     c.w=38+Math.random()*30;
   }
 }
 for(const ob of dinoObstacles)ob.x-=runSpeed*dt;
 dinoObstacles=dinoObstacles.filter(o=>o.x+o.w>-30);
 const lastObstacle=dinoObstacles[dinoObstacles.length-1];
 const speedGap=(dinoSpeed-1)*180;
 const scorePressure=Math.min(Math.max((dinoScoreValue-500)/2500,0),1)*70;
 const minGap=465+speedGap-scorePressure;
 const randomGap=220+(dinoSpeed-1)*70;
 const nextGap=minGap+Math.random()*randomGap;
 if(!lastObstacle||lastObstacle.x<DINO_W-nextGap)spawnDinoObstacle();
 for(const ob of dinoObstacles){
   if(rectHit(getDinoHitBox(),{x:ob.x+3,y:ob.y+3,w:ob.w-6,h:ob.h-6})){
     endDino();
     return;
   }
 }
 updateDinoInfo();
}
function getDinoHitBox(){return {x:dino.x+5,y:dino.y+5,w:dino.w-10,h:dino.h-8}}
function rectHit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function endDino(){
 dinoRunning=false;
 cancelAnimationFrame(dinoAnimId);
 dinoAnimId=null;
 drawDino();
 showToast("공룡게임 종료");
 const finalScore=Math.floor(dinoScoreValue);
 if(finalScore>0)openScoreNameModal(finalScore,"dino");
}
function getDinoBest(){
 state=normalizeState(state);
 return Number(state.games&&state.games.dino&&state.games.dino.bestScore)||0;
}
function updateDinoInfo(){
 if(!$("dinoScore"))return;
 $("dinoScore").textContent=String(Math.floor(dinoScoreValue));
 $("dinoBest").textContent=String(Math.max(getDinoBest(),Math.floor(dinoScoreValue)));
 $("dinoSpeed").textContent=`${dinoSpeed.toFixed(1)}x`;
}
function drawDino(){
 if(!dinoCtx)return;
 const ctx=dinoCtx;
 ctx.clearRect(0,0,DINO_W,DINO_H);
 ctx.fillStyle="#f9fafb";
 ctx.fillRect(0,0,DINO_W,DINO_H);
 ctx.fillStyle="#d1d5db";
 for(const c of dinoClouds)drawCloud(ctx,c.x,c.y,c.w);
 ctx.strokeStyle="#6b7280";
 ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(0,DINO_GROUND+1);ctx.lineTo(DINO_W,DINO_GROUND+1);ctx.stroke();
 ctx.fillStyle="#9ca3af";
 for(let x=dinoGroundX;x<DINO_W;x+=34){
   ctx.fillRect(x,DINO_GROUND+12,12,2);
   ctx.fillRect(x+20,DINO_GROUND+22,8,2);
 }
 drawDinoChar(ctx);
 for(const ob of dinoObstacles){
   if(ob.type==="bird")drawBird(ctx,ob);
   else drawCactus(ctx,ob);
 }
 if(!dinoRunning){
   ctx.fillStyle="rgba(17,24,39,.82)";
   ctx.font="900 22px Pretendard, sans-serif";
   ctx.textAlign="center";
   ctx.fillText(dinoScoreValue>0?"GAME OVER":"START",DINO_W/2,168);
   ctx.font="800 13px Pretendard, sans-serif";
   ctx.fillText("점프 버튼 또는 ↑ / Space",DINO_W/2,196);
 }
 if(dinoPaused){
   ctx.fillStyle="rgba(17,24,39,.82)";
   ctx.font="900 22px Pretendard, sans-serif";
   ctx.textAlign="center";
   ctx.fillText("PAUSE",DINO_W/2,198);
 }
 updateDinoInfo();
}
function drawCloud(ctx,x,y,w){
 ctx.beginPath();
 ctx.arc(x,y+10,w*.22,0,Math.PI*2);
 ctx.arc(x+w*.25,y,w*.28,0,Math.PI*2);
 ctx.arc(x+w*.55,y+8,w*.2,0,Math.PI*2);
 ctx.fill();
}
function drawDinoChar(ctx){
 ctx.fillStyle="#111827";
 const x=dino.x,y=dino.y,w=dino.w,h=dino.h;
 if(dinoDuck&&dino.onGround){
   ctx.fillRect(x,y+8,w,22);
   ctx.fillRect(x+w-14,y,22,18);
   ctx.fillRect(x+8,y+28,8,12);
   ctx.fillRect(x+34,y+28,8,12);
   ctx.fillStyle="#fff";
   ctx.fillRect(x+w+2,y+5,4,4);
 }else{
   ctx.fillRect(x+8,y+8,23,33);
   ctx.fillRect(x+22,y,23,23);
   ctx.fillRect(x+12,y+38,8,12);
   ctx.fillRect(x+28,y+38,8,12);
   ctx.fillRect(x,y+22,12,7);
   ctx.fillStyle="#fff";
   ctx.fillRect(x+38,y+6,4,4);
 }
}
function drawCactus(ctx,ob){
 ctx.fillStyle="#166534";
 ctx.fillRect(ob.x+ob.w*.35,ob.y,ob.w*.3,ob.h);
 ctx.fillRect(ob.x+ob.w*.1,ob.y+ob.h*.38,ob.w*.25,ob.h*.18);
 ctx.fillRect(ob.x+ob.w*.62,ob.y+ob.h*.25,ob.w*.25,ob.h*.18);
}
function drawBird(ctx,ob){
 ctx.fillStyle="#111827";
 ctx.fillRect(ob.x,ob.y+8,ob.w,9);
 const wingUp=Math.floor(dinoScoreValue/20)%2===0;
 if(wingUp)ctx.fillRect(ob.x+12,ob.y,14,8);
 else ctx.fillRect(ob.x+12,ob.y+16,14,8);
 ctx.fillRect(ob.x+ob.w-4,ob.y+5,8,5);
}


/* Bamboo Master */
let bambooCtx=null;
let bambooRunning=false;
let bambooPaused=false;
let bambooAnimId=null;
let bambooLastTs=0;
let bambooScoreValue=0;
let bambooLevel=1;
let bambooArrows=[];
let bambooSpawnTimer=0;
let bambooKeys={up:false,down:false,left:false,right:false};
let bambooPlayer={x:360,y:210,r:14,blink:0};
const BAMBOO_W=720;
const BAMBOO_H=420;

function initBambooIfNeeded(){
 if(bambooCtx)return;
 const canvas=$("bambooCanvas");
 bambooCtx=canvas.getContext("2d");
 $("bambooStartBtn").onclick=startBamboo;
 $("bambooPauseBtn").onclick=toggleBambooPause;
 $("bambooRestartBtn").onclick=startBamboo;

 bindBambooTouchButton("bambooUpBtn","up");
 bindBambooTouchButton("bambooDownBtn","down");
 bindBambooTouchButton("bambooLeftBtn","left");
 bindBambooTouchButton("bambooRightBtn","right");

 document.addEventListener("keydown",handleBambooKeyDown);
 document.addEventListener("keyup",handleBambooKeyUp);
 resetBamboo();
 drawBamboo();
}

function bindBambooTouchButton(id,key){
 const btn=$(id);
 btn.onpointerdown=e=>{e.preventDefault();bambooKeys[key]=true};
 btn.onpointerup=e=>{e.preventDefault();bambooKeys[key]=false};
 btn.onpointerleave=e=>{bambooKeys[key]=false};
 btn.onpointercancel=e=>{bambooKeys[key]=false};
}

function handleBambooKeyDown(e){
 if(currentMainView!=="bamboo")return;
 const k=e.key.toLowerCase();
 if(["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d","p"].includes(k))e.preventDefault();
 const startKeys=["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"];
 if(!bambooRunning && startKeys.includes(k)){
   startBamboo();
 }
 if(k==="arrowup"||k==="w")bambooKeys.up=true;
 else if(k==="arrowdown"||k==="s")bambooKeys.down=true;
 else if(k==="arrowleft"||k==="a")bambooKeys.left=true;
 else if(k==="arrowright"||k==="d")bambooKeys.right=true;
 else if(k==="p")toggleBambooPause();
}

function handleBambooKeyUp(e){
 if(currentMainView!=="bamboo")return;
 const k=e.key.toLowerCase();
 if(k==="arrowup"||k==="w")bambooKeys.up=false;
 else if(k==="arrowdown"||k==="s")bambooKeys.down=false;
 else if(k==="arrowleft"||k==="a")bambooKeys.left=false;
 else if(k==="arrowright"||k==="d")bambooKeys.right=false;
}

function resetBamboo(){
 bambooRunning=false;
 bambooPaused=false;
 cancelAnimationFrame(bambooAnimId);
 bambooAnimId=null;
 bambooLastTs=0;
 bambooScoreValue=0;
 bambooLevel=1;
 bambooArrows=[];
 bambooSpawnTimer=0.9;
 bambooKeys={up:false,down:false,left:false,right:false};
 bambooPlayer={x:BAMBOO_W/2,y:BAMBOO_H/2,r:14,blink:0};
 updateBambooInfo();
}

function startBamboo(){
 resetBamboo();
 bambooRunning=true;
 bambooPaused=false;
 bambooAnimId=requestAnimationFrame(bambooLoop);
}

function toggleBambooPause(){
 if(!bambooRunning)return;
 bambooPaused=!bambooPaused;
 if(!bambooPaused){
   bambooLastTs=0;
   bambooAnimId=requestAnimationFrame(bambooLoop);
 }
 drawBamboo();
}

function bambooLoop(ts){
 if(!bambooRunning||bambooPaused)return;
 if(!bambooLastTs)bambooLastTs=ts;
 const dt=Math.min((ts-bambooLastTs)/1000,0.035);
 bambooLastTs=ts;
 updateBamboo(dt);
 drawBamboo();
 bambooAnimId=requestAnimationFrame(bambooLoop);
}

function updateBamboo(dt){
 bambooScoreValue+=dt*35;
 bambooLevel=1+Math.floor(bambooScoreValue/350);

 const moveSpeed=178+Math.min(bambooLevel*4,38);
 let dx=0,dy=0;
 if(bambooKeys.left)dx-=1;
 if(bambooKeys.right)dx+=1;
 if(bambooKeys.up)dy-=1;
 if(bambooKeys.down)dy+=1;
 if(dx||dy){
   const len=Math.hypot(dx,dy);
   dx/=len;dy/=len;
   bambooPlayer.x+=dx*moveSpeed*dt;
   bambooPlayer.y+=dy*moveSpeed*dt;
 }
 bambooPlayer.x=Math.max(34,Math.min(BAMBOO_W-34,bambooPlayer.x));
 bambooPlayer.y=Math.max(38,Math.min(BAMBOO_H-38,bambooPlayer.y));

 bambooSpawnTimer-=dt;
 if(bambooSpawnTimer<=0){
   spawnBambooPattern();
   const pressure=Math.min(bambooScoreValue/2500,1);
   bambooSpawnTimer=0.95-pressure*0.32+Math.random()*0.25;
 }

 const arrowSpeedBase=145+Math.min(bambooScoreValue/18,155);
 for(const a of bambooArrows){
   a.x+=a.vx*dt;
   a.y+=a.vy*dt;
   a.life+=dt;
   a.rot=Math.atan2(a.vy,a.vx);
 }
 bambooArrows=bambooArrows.filter(a=>a.x>-80&&a.x<BAMBOO_W+80&&a.y>-80&&a.y<BAMBOO_H+80&&a.life<9);

 for(const a of bambooArrows){
   if(hitBambooArrow(a)){
     endBamboo();
     return;
   }
 }

 updateBambooInfo();
}

function spawnBambooPattern(){
 const score=bambooScoreValue;
 const pattern=Math.random();
 const count=score<300?1:(score<900?(Math.random()<0.6?1:2):(Math.random()<0.5?2:3));

 if(score>700&&pattern<0.20){
   spawnBambooSideVolley();
   return;
 }
 if(score>1200&&pattern<0.34){
   spawnBambooCross();
   return;
 }
 if(score>1800&&pattern<0.14){
   spawnBambooDiagonalRain();
   return;
 }

 for(let i=0;i<count;i++){
   setTimeout(()=>spawnBambooArrowFromSide(),i*140);
 }
}

function spawnBambooArrowFromSide(){
 const side=Math.floor(Math.random()*4);
 const aimNoise=scoreNoise(60,22);
 let x,y,targetX=bambooPlayer.x+aimNoise,targetY=bambooPlayer.y+scoreNoise(60,22);
 if(side===0){x=-28;y=Math.random()*BAMBOO_H}
 else if(side===1){x=BAMBOO_W+28;y=Math.random()*BAMBOO_H}
 else if(side===2){x=Math.random()*BAMBOO_W;y=-28}
 else{x=Math.random()*BAMBOO_W;y=BAMBOO_H+28}
 addBambooArrow(x,y,targetX,targetY);
}

function spawnBambooSideVolley(){
 const side=Math.floor(Math.random()*4);
 const margin=54;
 const gap=78;
 const offset=Math.random()*28;
 const lanes=[];
 if(side===0||side===1){
   for(let y=margin+offset;y<=BAMBOO_H-margin;y+=gap)lanes.push(y);
   const safe=Math.max(0,Math.min(lanes.length-1,Math.floor((bambooPlayer.y-margin-offset)/gap)));
   lanes.forEach((y,i)=>{
     if(i===safe&&Math.random()<0.72)return;
     const x=side===0?-34:BAMBOO_W+34;
     const tx=side===0?BAMBOO_W+20:-20;
     addBambooArrow(x,y,tx,y+scoreNoise(10,4));
   });
 }else{
   for(let x=margin+offset;x<=BAMBOO_W-margin;x+=gap)lanes.push(x);
   const safe=Math.max(0,Math.min(lanes.length-1,Math.floor((bambooPlayer.x-margin-offset)/gap)));
   lanes.forEach((x,i)=>{
     if(i===safe&&Math.random()<0.72)return;
     const y=side===2?-34:BAMBOO_H+34;
     const ty=side===2?BAMBOO_H+20:-20;
     addBambooArrow(x,y,x+scoreNoise(10,4),ty);
   });
 }
}

function scoreNoise(base,min){
 const range=Math.max(min,base-Math.min(bambooScoreValue/80,35));
 return (Math.random()*2-1)*range;
}

function addBambooArrow(x,y,targetX,targetY){
 const ang=Math.atan2(targetY-y,targetX-x);
 const speed=150+Math.min(bambooScoreValue/20,150)+Math.random()*28;
 bambooArrows.push({
   x,y,
   vx:Math.cos(ang)*speed,
   vy:Math.sin(ang)*speed,
   rot:ang,
   w:38,
   h:8,
   life:0
 });
}

function spawnBambooCross(){
 addBambooArrow(-28,bambooPlayer.y, BAMBOO_W+10,bambooPlayer.y);
 addBambooArrow(BAMBOO_W+28,bambooPlayer.y+scoreNoise(34,16), -10,bambooPlayer.y);
 if(Math.random()<0.5)addBambooArrow(bambooPlayer.x,-28,bambooPlayer.x,BAMBOO_H+10);
}

function spawnBambooDiagonalRain(){
 const fromLeft=Math.random()<0.5;
 for(let i=0;i<3;i++){
   const x=fromLeft?-28:BAMBOO_W+28;
   const y=40+i*120+Math.random()*30;
   const tx=fromLeft?BAMBOO_W+10:-10;
   const ty=y+80+scoreNoise(50,20);
   setTimeout(()=>addBambooArrow(x,y,tx,ty),i*110);
 }
}

function hitBambooArrow(a){
 const px=bambooPlayer.x,py=bambooPlayer.y;
 const dx=px-a.x,dy=py-a.y;
 const ca=Math.cos(-a.rot),sa=Math.sin(-a.rot);
 const lx=dx*ca-dy*sa;
 const ly=dx*sa+dy*ca;
 const nearestX=Math.max(-a.w/2,Math.min(a.w/2,lx));
 const nearestY=Math.max(-a.h/2,Math.min(a.h/2,ly));
 const dist=Math.hypot(lx-nearestX,ly-nearestY);
 return dist<bambooPlayer.r*0.78;
}

function endBamboo(){
 bambooRunning=false;
 cancelAnimationFrame(bambooAnimId);
 bambooAnimId=null;
 drawBamboo();
 showToast("죽림고수 종료");
 const finalScore=Math.floor(bambooScoreValue);
 if(finalScore>0)openScoreNameModal(finalScore,"bamboo");
}

function getBambooBest(){
 state=normalizeState(state);
 return Number(state.games&&state.games.bamboo&&state.games.bamboo.bestScore)||0;
}

function updateBambooInfo(){
 if(!$("bambooScore"))return;
 $("bambooScore").textContent=String(Math.floor(bambooScoreValue));
 $("bambooBest").textContent=String(Math.max(getBambooBest(),Math.floor(bambooScoreValue)));
 $("bambooLevel").textContent=String(bambooLevel);
}

function drawBamboo(){
 if(!bambooCtx)return;
 const ctx=bambooCtx;
 ctx.clearRect(0,0,BAMBOO_W,BAMBOO_H);
 ctx.fillStyle="#ecfdf5";
 ctx.fillRect(0,0,BAMBOO_W,BAMBOO_H);

 drawBambooBackground(ctx);

 for(const a of bambooArrows)drawBambooArrow(ctx,a);
 drawBambooPlayer(ctx);

 if(!bambooRunning){
   ctx.fillStyle="rgba(17,24,39,.82)";
   ctx.font="900 24px Pretendard, sans-serif";
   ctx.textAlign="center";
   ctx.fillText(bambooScoreValue>0?"GAME OVER":"START",BAMBOO_W/2,165);
   ctx.font="800 13px Pretendard, sans-serif";
   ctx.fillText("방향키/WASD로 이동해서 화살을 피해",BAMBOO_W/2,193);
 }
 if(bambooPaused){
   ctx.fillStyle="rgba(17,24,39,.82)";
   ctx.font="900 24px Pretendard, sans-serif";
   ctx.textAlign="center";
   ctx.fillText("PAUSE",BAMBOO_W/2,182);
 }
 updateBambooInfo();
}

function drawBambooBackground(ctx){
 ctx.strokeStyle="rgba(22,101,52,.16)";
 ctx.lineWidth=8;
 for(let x=36;x<BAMBOO_W;x+=62){
   ctx.beginPath();
   ctx.moveTo(x,0);
   ctx.lineTo(x+12,BAMBOO_H);
   ctx.stroke();
   ctx.lineWidth=2;
   ctx.strokeStyle="rgba(22,101,52,.18)";
   for(let y=40;y<BAMBOO_H;y+=70){
     ctx.beginPath();
     ctx.moveTo(x-10,y);
     ctx.lineTo(x+28,y-10);
     ctx.stroke();
   }
   ctx.strokeStyle="rgba(22,101,52,.16)";
   ctx.lineWidth=8;
 }
 ctx.strokeStyle="rgba(17,24,39,.12)";
 ctx.lineWidth=2;
 ctx.strokeRect(18,18,BAMBOO_W-36,BAMBOO_H-36);
}

function drawBambooPlayer(ctx){
 const p=bambooPlayer;
 ctx.save();
 ctx.translate(p.x,p.y);
 ctx.fillStyle="#111827";
 ctx.beginPath();
 ctx.arc(0,0,p.r,0,Math.PI*2);
 ctx.fill();
 ctx.fillStyle="#facc15";
 ctx.fillRect(-15,-24,30,8);
 ctx.fillStyle="#fff";
 ctx.beginPath();
 ctx.arc(-5,-3,3,0,Math.PI*2);
 ctx.arc(5,-3,3,0,Math.PI*2);
 ctx.fill();
 ctx.restore();
}

function drawBambooArrow(ctx,a){
 ctx.save();
 ctx.translate(a.x,a.y);
 ctx.rotate(a.rot);
 ctx.fillStyle="#7c2d12";
 ctx.fillRect(-a.w/2,-2,a.w,4);
 ctx.fillStyle="#111827";
 ctx.beginPath();
 ctx.moveTo(a.w/2+8,0);
 ctx.lineTo(a.w/2-4,-7);
 ctx.lineTo(a.w/2-4,7);
 ctx.closePath();
 ctx.fill();
 ctx.strokeStyle="#6b7280";
 ctx.lineWidth=2;
 ctx.beginPath();
 ctx.moveTo(-a.w/2,-6);
 ctx.lineTo(-a.w/2+8,0);
 ctx.lineTo(-a.w/2,6);
 ctx.stroke();
 ctx.restore();
}


/* Supabase sync override */
const SUPABASE_URL="https://mnsxaulypjrnczearlyd.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uc3hhdWx5cGpybmN6ZWFybHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTQ4MjYsImV4cCI6MjA5NjU3MDgyNn0.j5x7GC183mTpCFWwJcTbz0Gn-TBgSZ7jCFJ18xIttog";
const SUPABASE_REST=SUPABASE_URL.replace(/\/$/,"")+"/rest/v1";
const SB_ITEM_DELETES_KEY=`simple_budget_supabase_item_deletes_${APP_SCOPE}`;
const SB_SHEET_DELETES_KEY=`simple_budget_supabase_sheet_deletes_${APP_SCOPE}`;
let isSupabaseSaving=false;
let hasPendingSupabaseSave=false;

function sbHeaders(extra={}){
 return {apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,"Content-Type":"application/json",...extra};
}
async function sbFetch(path,options={}){
 const res=await fetch(`${SUPABASE_REST}${path}`,{...options,headers:sbHeaders(options.headers||{}),cache:"no-store"});
 if(!res.ok)throw new Error(`${res.status} ${await res.text()}`);
 if(res.status===204)return null;
 const txt=await res.text();
 return txt?JSON.parse(txt):null;
}
function getDeleteMap(){try{return JSON.parse(localStorage.getItem(SB_ITEM_DELETES_KEY)||"{}")||{}}catch{return {}}}
function saveDeleteMap(m){localStorage.setItem(SB_ITEM_DELETES_KEY,JSON.stringify(m||{}))}
function addItemDelete(sheetId,itemId){if(!sheetId||!itemId)return;const m=getDeleteMap();if(!Array.isArray(m[sheetId]))m[sheetId]=[];if(!m[sheetId].includes(itemId))m[sheetId].push(itemId);saveDeleteMap(m)}
function clearItemDeletesFor(sheetId){const m=getDeleteMap();if(sheetId)delete m[sheetId];else Object.keys(m).forEach(k=>delete m[k]);saveDeleteMap(m)}
function getSheetDeletes(){try{return JSON.parse(localStorage.getItem(SB_SHEET_DELETES_KEY)||"[]")||[]}catch{return []}}
function saveSheetDeletes(arr){localStorage.setItem(SB_SHEET_DELETES_KEY,JSON.stringify([...(new Set(arr||[]))]))}
function addSheetDelete(sheetId){if(!sheetId)return;const arr=getSheetDeletes();if(!arr.includes(sheetId))arr.push(sheetId);saveSheetDeletes(arr)}
function clearSheetDeletes(){saveSheetDeletes([])}
function makeDefaultState(){const id=newId();return normalizeState({version:EXPORT_VERSION,currentSheetId:id,sheets:[{id,name:"기본 예산표",items:[]}],games:{tetris:{bestScore:0,records:[]},dino:{bestScore:0,records:[]},bamboo:{bestScore:0,records:[]}}})}
function scoreRowsToGames(rows){const games={tetris:{bestScore:0,records:[]},dino:{bestScore:0,records:[]},bamboo:{bestScore:0,records:[]}};(rows||[]).forEach(r=>{const g=["tetris","dino","bamboo"].includes(r.game_key)?r.game_key:"tetris";const rec={id:r.id||newId(),name:String(r.name||"익명"),score:Number(r.score)||0,dt:r.created_at||new Date().toISOString()};if(rec.score>0)games[g].records.push(rec)});Object.keys(games).forEach(g=>{games[g].records.sort((a,b)=>b.score-a.score);games[g].records=games[g].records.slice(0,15);games[g].bestScore=games[g].records[0]?Number(games[g].records[0].score)||0:0});return games}
async function fetchSupabaseState(){
 const [sheets,meta,scores]=await Promise.all([
  sbFetch('/budget_sheets?select=id,name,items,updated_at&order=updated_at.desc'),
  sbFetch('/app_meta?select=key,value&key=eq.current_sheet_id'),
  sbFetch('/game_scores?select=id,game_key,name,score,created_at&order=score.desc,created_at.asc&limit=300')
 ]);
 const sheetList=(sheets||[]).map((s,i)=>({id:String(s.id||newId()),name:s.name||`예산표 ${i+1}`,items:Array.isArray(s.items)?s.items:[]}));
 let currentSheetId=sheetList[0]?sheetList[0].id:"";
 const metaValue=meta&&meta[0]&&meta[0].value;
 if(metaValue&&metaValue.id&&sheetList.some(s=>s.id===metaValue.id))currentSheetId=metaValue.id;
 const next=sheetList.length?{version:EXPORT_VERSION,currentSheetId,sheets:sheetList,games:scoreRowsToGames(scores||[])}:makeDefaultState();
 return normalizeState(next);
}
function mergeSheetForSupabase(remoteSheet,localSheet,deletedIds=[]){
 const del=new Set(deletedIds||[]);
 const map=new Map();
 (remoteSheet&&Array.isArray(remoteSheet.items)?remoteSheet.items:[]).forEach(it=>{if(it&&it.id&&!del.has(it.id))map.set(it.id,it)});
 (localSheet&&Array.isArray(localSheet.items)?localSheet.items:[]).forEach(it=>{if(it&&it.id&&!del.has(it.id))map.set(it.id,it)});
 const items=[...map.values()].map((it,i)=>({...it,order:Number.isFinite(Number(it.order))?Number(it.order):i})).sort((a,b)=>a.order-b.order);
 items.forEach((it,i)=>it.order=i);
 return {id:localSheet.id,name:localSheet.name||remoteSheet?.name||"예산표",items};
}
function collectLocalScores(){state=normalizeState(state);const arr=[];["tetris","dino","bamboo"].forEach(g=>{(state.games[g].records||[]).forEach(r=>{arr.push({game_key:g,name:String(r.name||"익명"),score:Number(r.score)||0,created_at:r.dt||new Date().toISOString()})})});return arr.filter(r=>r.score>0)}
async function pruneSupabaseGameScores(gameKey=null){
 const gameKeys=gameKey?[gameKey]:["tetris","dino","bamboo"];
 for(const g of gameKeys){
  const rows=await sbFetch(`/game_scores?select=id,name,score,created_at&game_key=eq.${encodeURIComponent(g)}&order=score.desc,created_at.asc&limit=1000`);
  const seen=new Set();
  const keep=[];
  const remove=[];
  (rows||[]).forEach(r=>{
    const key=`${String(r.name||"").trim()}|${Number(r.score)||0}`;
    if(seen.has(key)){remove.push(r.id);return;}
    seen.add(key);
    if(keep.length<15)keep.push(r);
    else remove.push(r.id);
  });
  const ids=remove.filter(Boolean);
  if(ids.length){
   await sbFetch(`/game_scores?id=in.(${ids.map(encodeURIComponent).join(",")})`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  }
 }
}
async function insertMissingScoresToSupabase(gameKey=null){
 const q=gameKey?`/game_scores?select=game_key,name,score&game_key=eq.${encodeURIComponent(gameKey)}&limit=1000`:'/game_scores?select=game_key,name,score&limit=1000';
 const existing=await sbFetch(q);
 const keys=new Set((existing||[]).map(r=>`${r.game_key}|${r.name}|${Number(r.score)||0}`));
 const local=collectLocalScores().filter(r=>!gameKey||r.game_key===gameKey);
 const missing=[];
 local.forEach(r=>{const k=`${r.game_key}|${r.name}|${Number(r.score)||0}`;if(!keys.has(k)){keys.add(k);missing.push(r)}});
 if(missing.length)await sbFetch('/game_scores',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(missing)});
 await pruneSupabaseGameScores(gameKey);
 return missing.length;
}
async function syncStateToSupabase({manual=false}={}){
 if(!isGitEnabled()){lastSyncText="Supabase 공유 저장 고정";updateGithubStatus();return}
 if(isSupabaseSaving){hasPendingSupabaseSave=true;lastSyncText="저장 중. 다음 저장 대기...";updateGithubStatus();return}
 isSupabaseSaving=true;
 try{
  lastGithubError="";lastSyncText=manual?"Supabase 수동 저장 중...":"Supabase 자동 저장 중...";updateGithubStatus();
  const remote=await fetchSupabaseState().catch(()=>makeDefaultState());
  const sheetDeletes=new Set(getSheetDeletes());
  const itemDeletes=getDeleteMap();
  const remoteMap=new Map(remote.sheets.map(s=>[s.id,s]));
  const mergedMap=new Map();
  remote.sheets.forEach(s=>{if(!sheetDeletes.has(s.id))mergedMap.set(s.id,s)});
  state.sheets.forEach(localSheet=>{if(sheetDeletes.has(localSheet.id))return;const remoteSheet=remoteMap.get(localSheet.id);mergedMap.set(localSheet.id,mergeSheetForSupabase(remoteSheet,localSheet,itemDeletes[localSheet.id]||[]));});
  const mergedSheets=[...mergedMap.values()];
  if(sheetDeletes.size){
   for(const id of sheetDeletes){await sbFetch(`/budget_sheets?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}
  }
  if(mergedSheets.length){
   await sbFetch('/budget_sheets?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(mergedSheets.map(s=>({id:s.id,name:s.name,items:s.items,updated_at:new Date().toISOString()})))});
  }
  const currentId=mergedSheets.some(s=>s.id===state.currentSheetId)?state.currentSheetId:(mergedSheets[0]?.id||state.currentSheetId);
  await sbFetch('/app_meta?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{key:'current_sheet_id',value:{id:currentId},updated_at:new Date().toISOString()}])});
  await insertMissingScoresToSupabase();
  clearSheetDeletes();clearItemDeletesFor();
  const latest=await fetchSupabaseState();
  isApplyingRemote=true;state=normalizeState(latest);saveState();render();isApplyingRemote=false;
  lastSyncText=`Supabase 저장 완료 ${nowText()}`;lastGithubError="";updateGithubStatus();showToast(`Supabase 저장 완료 ${nowText()}`);
 }catch(e){
  console.error(e);lastGithubError=shortErrorText(e);lastSyncText=`Supabase 저장 실패 ${nowText()}`;updateGithubStatus();showToast("Supabase 저장 실패 · 연결을 확인해줘","error");if(manual)alert("Supabase 저장 실패: "+lastGithubError);
 }finally{
  isSupabaseSaving=false;
  if(hasPendingSupabaseSave){hasPendingSupabaseSave=false;setTimeout(()=>requestGithubSave({manual:false}),80)}
 }
}

getGithubSetting=function(){return{owner:"Supabase",repo:"jbaaaam",branch:"public",path:"game_scores / budget_sheets / app_meta / guestbook",token:SUPABASE_ANON_KEY,autoLoad:true,autoSave:true}};
saveGithubSetting=function(){closeGithubModal();alert("Supabase 정보는 index.html에 고정 반영되어 있어.")};
openGithubModal=function(){
 $("ghOwnerInput").value=SUPABASE_URL;$("ghRepoInput").value="jbaaaam";$("ghBranchInput").value="public";$("ghPathInput").value="Supabase tables";$("ghTokenInput").value=SUPABASE_ANON_KEY;githubModalBackdrop.classList.add("open");
};
updateGithubStatus=function(){
 const enabled=isGitEnabled();if(gitEnabledToggle)gitEnabledToggle.checked=enabled;if(githubBox)githubBox.classList.toggle("git-off",!enabled);const errText=lastGithubError?`\n오류: ${lastGithubError}`:"";
 if(!enabled){githubStatus.textContent=`Supabase 공유 저장\n${lastSyncText}${errText}`;return}
 githubStatus.textContent=`Supabase 연결\nproject: mnsxaulypjrnczearlyd · schema: public\n저장소: game_scores / budget_sheets / app_meta / guestbook\n${lastSyncText}${errText}`;
};
toggleGitEnabled=function(){saveState();setGitEnabled(gitEnabledToggle.checked);clearTimeout(autoSaveTimer);lastGithubError="";if(isGitEnabled()){state=normalizeState(loadState());lastSyncText="Supabase 사용 ON";render();loadFromGithub({manual:false});showToast("Supabase 모드")}else{state=normalizeState(loadState());lastSyncText="Supabase 공유 저장 고정";render();showToast("Supabase 공유 저장 고정")}};
loadFromGithub=async function({manual=false}={}){
 if(!isGitEnabled()){if(manual)showToast("Supabase 공유 저장 고정");updateGithubStatus();return}
 try{lastSyncText="Supabase 불러오는 중...";lastGithubError="";updateGithubStatus();await insertMissingScoresToSupabase().catch(()=>0);const remote=await fetchSupabaseState();isApplyingRemote=true;state=normalizeState(remote);saveState();render();isApplyingRemote=false;lastSyncText=`Supabase 불러오기 완료 ${nowText()}`;updateGithubStatus();if(manual)alert("Supabase 불러오기 완료.")}
 catch(e){console.error(e);isApplyingRemote=false;lastGithubError=shortErrorText(e);lastSyncText=`Supabase 불러오기 실패 ${nowText()}`;updateGithubStatus();showToast("Supabase 불러오기 실패","error");if(manual)alert("Supabase 불러오기 실패: "+lastGithubError)}
};
requestGithubSave=function({manual=false}={}){syncStateToSupabase({manual})};
saveToGithub=async function({manual=false}={}){syncStateToSupabase({manual})};
testGithubConnection=async function(){
 if(!isGitEnabled()){showToast("Supabase 공유 저장 고정");updateGithubStatus();return}
 try{lastGithubError="";lastSyncText="Supabase 연결 테스트 중...";updateGithubStatus();await sbFetch('/game_scores?select=id&limit=1');lastSyncText=`Supabase 연결 성공 ${nowText()}`;updateGithubStatus();showToast("Supabase 연결 성공")}
 catch(e){lastGithubError=shortErrorText(e);lastSyncText=`Supabase 연결 실패 ${nowText()}`;updateGithubStatus();showToast("Supabase 연결 실패","error");alert("Supabase 연결 실패: "+lastGithubError+"\n테이블/RLS SQL을 먼저 실행했는지 확인해줘.")}
};
scheduleAutoSave=function(){if(isApplyingRemote)return;if(!isGitEnabled()){lastSyncText="Supabase 공유 저장 고정";updateGithubStatus();return}clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>requestGithubSave({manual:false}),120)};
commitChange=function(){saveState();render();scheduleAutoSave()};
const originalDeleteItemForSupabase=deleteItem;
deleteItem=function(){const sheet=getCurrentSheet();if(editingItemId)addItemDelete(sheet.id,editingItemId);originalDeleteItemForSupabase()};
if(deleteItemBtn)deleteItemBtn.onclick=deleteItem;
const originalDeleteSheetForSupabase=deleteSheet;
deleteSheet=function(id){addSheetDelete(id);originalDeleteSheetForSupabase(id)};
const originalSaveScoreRecordForSupabase=saveScoreRecord;
let isScoreSaveSubmitting=false;
saveScoreRecord=function(){
 if(isScoreSaveSubmitting)return;
 isScoreSaveSubmitting=true;
 const btn=$('saveScoreRecordBtn');
 if(btn)btn.disabled=true;
 const gameKeyBefore=pendingGameKey||"tetris";
 try{
   originalSaveScoreRecordForSupabase();
 }finally{
   setTimeout(()=>{isScoreSaveSubmitting=false;if(btn)btn.disabled=false;},700);
 }
 if(isGitEnabled()){
   setTimeout(()=>pruneSupabaseGameScores(gameKeyBefore).catch(e=>{lastGithubError=shortErrorText(e);lastSyncText=`스코어 정리 실패 ${nowText()}`;updateGithubStatus();}),900);
 }
};
if($('saveScoreRecordBtn'))$('saveScoreRecordBtn').onclick=saveScoreRecord;
const originalOpenGameScoreBoardModalForSupabase=openGameScoreBoardModal;
openGameScoreBoardModal=function(gameKey="tetris"){
 if(isGitEnabled()){
   insertMissingScoresToSupabase(gameKey).then(()=>fetchSupabaseState()).then(remote=>{state.games[gameKey]=remote.games[gameKey];saveState();originalOpenGameScoreBoardModalForSupabase(gameKey);}).catch(()=>originalOpenGameScoreBoardModalForSupabase(gameKey));
 }else originalOpenGameScoreBoardModalForSupabase(gameKey);
};
if($('scoreBoardBtn'))$('scoreBoardBtn').onclick=()=>openGameScoreBoardModal('tetris');
if($('dinoScoreBoardBtn'))$('dinoScoreBoardBtn').onclick=()=>openGameScoreBoardModal('dino');
if($('bambooScoreBoardBtn'))$('bambooScoreBoardBtn').onclick=()=>openGameScoreBoardModal('bamboo');
if($('clearScoreBoardBtn'))$('clearScoreBoardBtn').style.display='none';
if($('loadGithubBtn'))$('loadGithubBtn').onclick=()=>loadFromGithub({manual:true});
if($('saveGithubBtn'))$('saveGithubBtn').onclick=()=>requestGithubSave({manual:true});
if($('testGithubBtn'))$('testGithubBtn').onclick=testGithubConnection;
if($('githubSettingBtn'))$('githubSettingBtn').onclick=openGithubModal;
if($('saveGithubSettingBtn'))$('saveGithubSettingBtn').onclick=saveGithubSetting;

/* Supabase public version: force shared DB mode on every device */
isGitEnabled=function(){return true};
setGitEnabled=function(){localStorage.setItem(GIT_ENABLED_KEY,"Y")};
localStorage.setItem(GIT_ENABLED_KEY,"Y");
if(gitEnabledToggle){gitEnabledToggle.checked=true;gitEnabledToggle.disabled=true}

saveState();
render();
setTimeout(()=>{updateGithubStatus();loadFromGithub({manual:false});},300);


/* Supabase only mode: local data storage removed */
let __sbItemDeleteMap = {};
let __sbSheetDeletes = [];
getDeleteMap=function(){return __sbItemDeleteMap || {}};
saveDeleteMap=function(m){__sbItemDeleteMap=m||{}};
getSheetDeletes=function(){return __sbSheetDeletes || []};
saveSheetDeletes=function(arr){__sbSheetDeletes=[...(new Set(arr||[]))]};
clearItemDeletesFor=function(sheetId){if(sheetId)delete __sbItemDeleteMap[sheetId];else __sbItemDeleteMap={}};
clearSheetDeletes=function(){__sbSheetDeletes=[]};

saveState=function(){};
loadState=function(){return makeDefaultState()};
isGitEnabled=function(){return true};
setGitEnabled=function(){};

toggleGitEnabled=function(){
  if(gitEnabledToggle){gitEnabledToggle.checked=true;gitEnabledToggle.disabled=true;}
  lastSyncText="Supabase 공유 저장 고정";
  updateGithubStatus();
  showToast("Supabase 공유 저장 고정");
};
updateGithubStatus=function(){
 const errText=lastGithubError?`\n오류: ${lastGithubError}`:"";
 if(gitEnabledToggle){gitEnabledToggle.checked=true;gitEnabledToggle.disabled=true;}
 if(githubBox)githubBox.classList.remove("git-off");
 githubStatus.textContent=`Supabase 공유 저장\nproject: mnsxaulypjrnczearlyd · schema: public\n저장소: game_scores / budget_sheets / app_meta / guestbook\n${lastSyncText}${errText}`;
};
scheduleAutoSave=function(){
 if(isApplyingRemote)return;
 clearTimeout(autoSaveTimer);
 autoSaveTimer=setTimeout(()=>requestGithubSave({manual:false}),120);
};

// 앱 시작 시 기존 기기 localStorage 데이터 대신 Supabase 기준 화면만 사용
state=makeDefaultState();
lastSyncText="Supabase 불러오기 대기";
if(gitEnabledToggle){gitEnabledToggle.checked=true;gitEnabledToggle.disabled=true;}
render();
setTimeout(()=>{updateGithubStatus();loadFromGithub({manual:false});},100);

/* Menu cleanup + budget sheet list + guestbook */
let guestbookMessages=[];

function safeEl(id){return document.getElementById(id)}
function bindClick(id,fn){const el=safeEl(id);if(el)el.onclick=fn}

setMainView=function(view){
 currentMainView=["home","budgetList","budget","tetris","dino","bamboo","guestbook"].includes(view)?view:"home";
 const isHome=currentMainView==="home";
 const isBudgetList=currentMainView==="budgetList";
 const isBudget=currentMainView==="budget";
 const isTetris=currentMainView==="tetris";
 const isDino=currentMainView==="dino";
 const isBamboo=currentMainView==="bamboo";
 const isGuestbook=currentMainView==="guestbook";
 [["homeView",isHome],["budgetListView",isBudgetList],["budgetView",isBudget],["tetrisView",isTetris],["dinoView",isDino],["bambooView",isBamboo],["guestbookView",isGuestbook]].forEach(([id,on])=>{const el=safeEl(id);if(el)el.classList.toggle("active",on)});
 const add=safeEl("addBtn");if(add)add.style.display=isBudget?"block":"none";
 const budgetMenu=safeEl("showBudgetBtn");if(budgetMenu)budgetMenu.classList.toggle("active",isBudget||isBudgetList);
 const tetrisMenu=safeEl("showTetrisBtn");if(tetrisMenu)tetrisMenu.classList.toggle("active",isTetris);
 const dinoMenu=safeEl("showDinoBtn");if(dinoMenu)dinoMenu.classList.toggle("active",isDino);
 const bambooMenu=safeEl("showBambooBtn");if(bambooMenu)bambooMenu.classList.toggle("active",isBamboo);
 closeDrawer();
 if(isBudgetList)renderSheetList();
 if(isTetris){initTetrisIfNeeded();drawTetris()}
 if(isDino){initDinoIfNeeded();drawDino()}
 if(isBamboo){initBambooIfNeeded();drawBamboo()}
 if(isGuestbook)loadGuestbook({silent:true});
};

bindClick("menuBtnBudgetList",openDrawer);
bindClick("menuBtnGuestbook",openDrawer);
bindClick("drawerHomeBtn",()=>setMainView("home"));
bindClick("showBudgetBtn",()=>setMainView("budgetList"));
bindClick("showTetrisBtn",()=>setMainView("tetris"));
bindClick("showDinoBtn",()=>setMainView("dino"));
bindClick("showBambooBtn",()=>setMainView("bamboo"));
bindClick("homeBudgetCard",()=>setMainView("budgetList"));
bindClick("homeTetrisCard",()=>setMainView("tetris"));
bindClick("homeDinoCard",()=>setMainView("dino"));
bindClick("homeBambooCard",()=>setMainView("bamboo"));
bindClick("guestMoreBtn",()=>setMainView("guestbook"));
bindClick("guestSendBtn",submitGuestbookMessage);
bindClick("guestbookRefreshBtn",()=>loadGuestbook({silent:false}));

async function fetchGuestbookMessages(){
 const rows=await sbFetch('/guestbook?select=id,name,content,parent_id,created_at&order=created_at.desc&limit=500');
 const list=Array.isArray(rows)?rows:[];
 return list.map(m=>({
  id:m.id||newId(),
  parent_id:m.parent_id||null,
  name:String(m.name||"익명").slice(0,20),
  content:String(m.content||"").slice(0,300),
  created_at:m.created_at||new Date().toISOString()
 })).filter(m=>m.content.trim());
}

async function insertGuestbookMessage(message){
 const row={
  name:String(message.name||"익명").slice(0,20),
  content:String(message.content||"").slice(0,300)
 };
 if(message.parent_id)row.parent_id=message.parent_id;
 await sbFetch('/guestbook',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify([row])});
 guestbookMessages=await fetchGuestbookMessages();
 return guestbookMessages;
}

function getTopGuestbookMessages(){
 return (guestbookMessages||[]).filter(m=>!m.parent_id);
}

function getGuestbookReplies(parentId){
 return (guestbookMessages||[])
  .filter(m=>m.parent_id===parentId)
  .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}

function renderGuestMini(){
 const mini=safeEl("guestMiniList");
 if(!mini)return;
 const recent=getTopGuestbookMessages().slice(0,5);
 if(!recent.length){mini.innerHTML="";return}
 mini.innerHTML=recent.map(m=>`
  <div class="guest-mini-item">
    <div class="guest-mini-top"><b>${esc(m.name||"익명")}</b><span>${formatScoreDate(m.created_at)}</span></div>
    <div class="guest-mini-content">${esc(m.content||"")}</div>
  </div>
 `).join("");
}

function renderGuestbook(){
 const list=safeEl("guestbookList");
 renderGuestMini();
 if(!list)return;
 const topMessages=getTopGuestbookMessages();
 if(!topMessages.length){list.innerHTML='<div class="empty">아직 글이 없어.</div>';return}
 list.innerHTML=topMessages.map(m=>{
  const replies=getGuestbookReplies(m.id);
  const replyHtml=replies.length?`
    <div class="guest-reply-list">
      ${replies.map(r=>`
        <div class="guest-reply-item">
          <div class="guest-reply-top"><b>${esc(r.name||"익명")}</b><span>${formatScoreDate(r.created_at)}</span></div>
          <div class="guest-reply-content">${esc(r.content||"")}</div>
        </div>
      `).join("")}
    </div>
  `:"";
  return `
  <div class="guestbook-item">
    <div class="guestbook-top"><div class="guestbook-name">${esc(m.name||"익명")}</div><div class="guestbook-date">${formatScoreDate(m.created_at)}</div></div>
    <div class="guestbook-content">${esc(m.content||"")}</div>
    ${replyHtml}
    <button class="guest-reply-toggle" type="button" data-parent-id="${esc(m.id)}" aria-expanded="false">
      <span class="guest-reply-arrow">⌄</span>
      <span>대댓글 달기${replies.length?` · ${replies.length}개`:""}</span>
    </button>
    <div class="guest-reply-form collapsed" data-parent-id="${esc(m.id)}">
      <div class="guest-reply-title">대댓글</div>
      <input class="input guest-reply-name" maxlength="20" placeholder="이름">
      <textarea class="input guest-reply-content-input" maxlength="300" placeholder="내용"></textarea>
      <button class="guest-reply-send" type="button">등록</button>
    </div>
  </div>
 `}).join("");
 list.querySelectorAll(".guest-reply-toggle").forEach(btn=>{
  btn.onclick=()=>{
   const parentId=btn.dataset.parentId;
   const form=list.querySelector(`.guest-reply-form[data-parent-id="${CSS.escape(parentId)}"]`);
   if(!form)return;
   const willOpen=form.classList.contains("collapsed");
   form.classList.toggle("collapsed",!willOpen);
   btn.setAttribute("aria-expanded",willOpen?"true":"false");
   const arrow=btn.querySelector(".guest-reply-arrow");
   if(arrow)arrow.textContent=willOpen?"⌃":"⌄";
   const label=btn.querySelector("span:last-child");
   if(label)label.textContent=willOpen?"대댓글 닫기":"대댓글 달기";
   if(willOpen){
     const input=form.querySelector(".guest-reply-name");
     setTimeout(()=>{if(input)input.focus()},50);
   }
  };
 });
 list.querySelectorAll(".guest-reply-send").forEach(btn=>{
  btn.onclick=()=>{
   const form=btn.closest(".guest-reply-form");
   if(form)submitGuestbookReply(form.dataset.parentId,form);
  };
 });
}

async function loadGuestbook({silent=false}={}){
 const status=safeEl("guestMiniStatus");
 try{
  if(status&&!silent)status.textContent="방명록 불러오는 중...";
  guestbookMessages=await fetchGuestbookMessages();
  renderGuestbook();
  const topCount=getTopGuestbookMessages().length;
  if(status)status.textContent=topCount?`최근 ${Math.min(5,topCount)}개 표시`:"";
 }catch(e){
  console.error(e);
  if(status)status.textContent="방명록 불러오기 실패";
  const list=safeEl("guestbookList");if(list)list.innerHTML=`<div class="empty">방명록 불러오기 실패<br>${esc(shortErrorText(e))}</div>`;
 }
}

async function submitGuestbookMessage(){
 const nameEl=safeEl("guestNameInput");
 const contentEl=safeEl("guestContentInput");
 const status=safeEl("guestMiniStatus");
 const name=(nameEl&&nameEl.value.trim()?nameEl.value.trim():"익명").slice(0,20);
 const content=(contentEl&&contentEl.value.trim()?contentEl.value.trim():"").slice(0,300);
 if(!content){if(status)status.textContent="내용을 입력해줘.";if(contentEl)contentEl.focus();return}
 try{
  if(status)status.textContent="저장 중...";
  await insertGuestbookMessage({name,content});
  if(contentEl)contentEl.value="";
  if(status)status.textContent="방명록 저장 완료";
  renderGuestbook();
  showToast("방명록 저장 완료");
 }catch(e){
  console.error(e);
  if(status)status.textContent="방명록 저장 실패";
  showToast("방명록 저장 실패","error");
 }
}

async function submitGuestbookReply(parentId,form){
 const nameEl=form.querySelector(".guest-reply-name");
 const contentEl=form.querySelector(".guest-reply-content-input");
 const btn=form.querySelector(".guest-reply-send");
 const name=(nameEl&&nameEl.value.trim()?nameEl.value.trim():"익명").slice(0,20);
 const content=(contentEl&&contentEl.value.trim()?contentEl.value.trim():"").slice(0,300);
 if(!content){if(contentEl)contentEl.focus();return}
 try{
  if(btn){btn.disabled=true;btn.textContent="저장 중";}
  await insertGuestbookMessage({name,content,parent_id:parentId});
  showToast("대댓글 저장 완료");
  renderGuestbook();
 }catch(e){
  console.error(e);
  showToast("대댓글 저장 실패","error");
  if(btn){btn.disabled=false;btn.textContent="등록";}
 }
}

// 메뉴 정리 후 현재 화면 활성 상태 보정
setMainView(currentMainView||"home");
setTimeout(()=>loadGuestbook({silent:true}),500);
