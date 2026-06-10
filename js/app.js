const APP_SCOPE=(location.pathname.split("/").filter(Boolean)[0]||"jbaaaam");
const STORAGE_KEY="simple_budget_sheets_v2";
const LOCAL_STORAGE_KEY="simple_budget_sheets_local_only_v1";
const GH_KEY="simple_budget_github_setting_v1";
const GIT_ENABLED_KEY="simple_budget_git_enabled_v1";
const SUMMARY_COLLAPSED_KEY="simple_budget_summary_collapsed_v1";
const EXPORT_VERSION=10;
const DATA_CRYPT_KEY="jb";
const AUTOSAVE_DELAY=0;
const TETRIS_HINT_KEY="jbaaaam_tetris_hint_enabled_v1";

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
amountInput.addEventListener("input", formatAmountInput); if(dayInput){dayInput.type="date";dayInput.placeholder="YYYY-MM-DD";dayInput.removeAttribute("min");dayInput.removeAttribute("max");}

$("cancelSheetBtn").onclick=closeSheetModal;$("closeSheetModalBtn").onclick=closeSheetModal;$("saveSheetBtn").onclick=saveSheetName;
sheetModalBackdrop.onclick=e=>{};

$("cancelGithubBtn").onclick=closeGithubModal;$("closeGithubModalBtn").onclick=closeGithubModal;$("saveGithubSettingBtn").onclick=saveGithubSetting;$("closeScoreNameBtn").onclick=closeScoreNameModal;$("skipScoreSaveBtn").onclick=closeScoreNameModal;$("saveScoreRecordBtn").onclick=saveScoreRecord;$("closeScoreBoardBtn").onclick=closeScoreBoardModal;$("okScoreBoardBtn").onclick=closeScoreBoardModal;$("clearScoreBoardBtn").onclick=clearScoreBoard;
githubModalBackdrop.onclick=e=>{};


function getActiveStorageKey(){
 return isGitEnabled()?STORAGE_KEY:LOCAL_STORAGE_KEY;
}

function newId(){return crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())}
function loadState(){try{const s=JSON.parse(localStorage.getItem(getActiveStorageKey()));if(s&&s.sheets&&s.sheets.length)return s}catch{}const id=newId();return{version:EXPORT_VERSION,currentSheetId:id,sheets:[{id,name:"기본 예산표",items:[]}]}}
function isFullDateString(v){return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+"T00:00:00").getTime())}
function normalizeBudgetDay(v){if(v===""||v==null)return "";if(isFullDateString(v))return v;const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=31?n:""}
function getDayInputValue(v){return isFullDateString(v)?v:""}
function normalizeState(raw){if(!raw||!Array.isArray(raw.sheets)||!raw.sheets.length)raw=loadState();raw.version=EXPORT_VERSION;raw.sheets=raw.sheets.map((s,si)=>{const ns={id:s.id||newId(),name:s.name||`예산표 ${si+1}`,items:Array.isArray(s.items)?s.items:[]};ns.items=ns.items.map((it,i)=>({id:it.id||newId(),name:it.name||"이름 없음",amount:Number(it.amount)||0,type:it.type==="expense"?"expense":"income",day:normalizeBudgetDay(it.day),note:it.note||"",order:Number.isFinite(Number(it.order))?Number(it.order):i}));ns.items.sort((a,b)=>a.order-b.order).forEach((it,i)=>it.order=i);return ns});if(!raw.currentSheetId||!raw.sheets.some(s=>s.id===raw.currentSheetId))raw.currentSheetId=raw.sheets[0].id;if(!raw.games)raw.games={};if(!raw.games.tetris)raw.games.tetris={bestScore:0,records:[]};if(!raw.games.dino)raw.games.dino={bestScore:0,records:[]};if(!raw.games.bamboo)raw.games.bamboo={bestScore:0,records:[]};["tetris","dino","bamboo"].forEach(g=>{raw.games[g].bestScore=Number(raw.games[g].bestScore)||0;if(!Array.isArray(raw.games[g].records))raw.games[g].records=[];raw.games[g].records=raw.games[g].records.map(r=>({id:r.id||newId(),name:String(r.name||"익명"),score:Number(r.score)||0,dt:r.dt||""})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,15);});return raw}
function saveState(){state=normalizeState(state);localStorage.setItem(getActiveStorageKey(),JSON.stringify(state))}
function commitChange(){saveState();render();scheduleAutoSave()}
function getCurrentSheet(){let s=state.sheets.find(x=>x.id===state.currentSheetId);if(!s){s=state.sheets[0];state.currentSheetId=s.id;saveState()}return s}
function money(v){return Number(v||0).toLocaleString("ko-KR")+"원"}
function dayText(d){if(isFullDateString(d))return String(d).replace(/-/g,".");const n=Number(d);return n?`${n}일`:"일자없음"}
function esc(t){return String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeHtml(t){return esc(t)}
function isTypingTarget(target){
 const el=target||document.activeElement;
 if(!el)return false;
 const tag=(el.tagName||"").toLowerCase();
 if(tag==="input"||tag==="textarea"||tag==="select"||tag==="button")return true;
 if(el.isContentEditable)return true;
 return !!(el.closest&&el.closest("input,textarea,select,button,[contenteditable=\'true\'],[contenteditable=\'\']"));
}
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
let tetrisHintEnabled=localStorage.getItem(TETRIS_HINT_KEY)!=="N";

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
 if($("tetrisHintToggle")){
   $("tetrisHintToggle").checked=tetrisHintEnabled;
   $("tetrisHintToggle").onchange=()=>{
     tetrisHintEnabled=$("tetrisHintToggle").checked;
     localStorage.setItem(TETRIS_HINT_KEY,tetrisHintEnabled?"Y":"N");
     drawTetris();
   };
 }
 document.addEventListener("keydown",handleTetrisKey);
 resetTetrisBoard();
 drawTetris();
}

function handleTetrisKey(e){
 if(currentMainView!=="tetris")return;
 if(isTypingTarget(e.target))return;
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
 // 블록 고정 점수는 난이도 배율을 적용하지 않는다.
 // 힌트 ON: 추가점수 없음, 힌트 OFF: 마지막에 +2점
 tetrisScoreValue += tetrisHintEnabled ? 0 : 2;
 refreshTetrisDifficulty();
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
   if(tetrisHintEnabled)drawTetrisGhost();
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

function openItemModal(item=null){editingItemId=item?item.id:null;if(item){itemModalTitle.textContent="수정";dayInput.value=getDayInputValue(item.day);nameInput.value=item.name;amountInput.value=formatNumberWithComma(item.amount);noteInput.value=item.note||"";setType(item.type);deleteItemBtn.classList.add("show")}else{itemModalTitle.textContent="추가";dayInput.value="";nameInput.value="";amountInput.value="";noteInput.value="";setType("income");deleteItemBtn.classList.remove("show")}itemModalBackdrop.classList.add("open");setTimeout(()=>dayInput.focus(),100)}
function closeItemModal(){itemModalBackdrop.classList.remove("open");editingItemId=null}
function setType(t){selectedType=t;incomeTypeBtn.classList.toggle("active",t==="income");expenseTypeBtn.classList.toggle("active",t==="expense")}
function saveItem(){const sheet=getCurrentSheet(),oldItem=editingItemId&&sheet.items?sheet.items.find(i=>i.id===editingItemId):null,dv=dayInput.value.trim(),day=dv===""?(oldItem&&!isFullDateString(oldItem.day)?oldItem.day:""):dv,name=nameInput.value.trim(),amount=getAmountNumber(),note=noteInput.value.trim();if(day!==""&&!isFullDateString(day)&&!(Number.isInteger(Number(day))&&Number(day)>=1&&Number(day)<=31)){alert("일자는 년-월-일 형식으로 입력해줘.");dayInput.focus();return}if(!name){alert("이름을 입력해줘.");nameInput.focus();return}if(!amount||amount<=0){alert("금액을 입력해줘.");amountInput.focus();return}if(!sheet.items)sheet.items=[];if(editingItemId)sheet.items=sheet.items.map(i=>i.id!==editingItemId?i:{...i,day,name,amount,note,type:selectedType});else sheet.items.push({id:newId(),day,name,amount,note,type:selectedType,order:sheet.items.length});normalizeOrder(sheet);closeItemModal();commitChange()}
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
 if(isTypingTarget(e.target))return;
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
 if(isTypingTarget(e.target))return;
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
const BAMBOO_CONTROL_KEY="jbaaaam_bamboo_control_mode_v1";
let bambooControlMode=localStorage.getItem(BAMBOO_CONTROL_KEY)||"buttons";
let bambooJoystick={active:false,pointerId:null,dx:0,dy:0,strength:0};
let bambooJoystickBound=false;
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
 installBambooControllerUi();
 applyBambooControlMode();
 bindBambooJoystick();

 bindBambooTouchButton("bambooUpBtn","up");
 bindBambooTouchButton("bambooDownBtn","down");
 bindBambooTouchButton("bambooLeftBtn","left");
 bindBambooTouchButton("bambooRightBtn","right");

 document.addEventListener("keydown",handleBambooKeyDown);
 document.addEventListener("keyup",handleBambooKeyUp);
 resetBamboo();
 drawBamboo();
}


function installBambooControllerUi(){
 if($("bambooControlPanel"))return;
 const upBtn=$("bambooUpBtn");
 if(!upBtn)return;
 const controls=upBtn.closest(".game-controls")||upBtn.closest(".bamboo-controls")||upBtn.parentElement;
 if(!controls)return;
 const panel=document.createElement("div");
 panel.id="bambooControlPanel";
 panel.className="bamboo-control-panel";
 panel.innerHTML=`
   <div class="bamboo-control-title">조작 방식</div>
   <div class="bamboo-control-choice" role="group" aria-label="죽림고수 조작 방식">
     <button type="button" id="bambooModeButtons" class="bamboo-mode-btn" data-mode="buttons">방향키</button>
     <button type="button" id="bambooModeJoystick" class="bamboo-mode-btn" data-mode="joystick">원형 조이스틱</button>
   </div>
   <div id="bambooJoystickPad" class="bamboo-joystick-pad" aria-label="죽림고수 원형 조이스틱">
     <div class="bamboo-joystick-ring"><div id="bambooJoystickKnob" class="bamboo-joystick-knob"></div></div>
     <div class="bamboo-joystick-hint">동그라미를 원하는 방향으로 밀어서 움직여</div>
   </div>`;
 controls.insertAdjacentElement("beforebegin",panel);
 if(!$("bambooControllerStyle")){
   const st=document.createElement("style");
   st.id="bambooControllerStyle";
   st.textContent=`
    .bamboo-control-panel{margin:10px 0 8px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;box-shadow:0 3px 12px rgba(15,23,42,.05)}
    .bamboo-control-title{font-size:13px;font-weight:950;color:#374151;margin-bottom:8px;text-align:center}
    .bamboo-control-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .bamboo-mode-btn{height:40px;border:0;border-radius:13px;background:#f3f4f6;color:#374151;font-weight:950;cursor:pointer}
    .bamboo-mode-btn.active{background:#111827;color:#fff}
    .bamboo-joystick-pad{display:none;margin-top:12px;touch-action:none;user-select:none;-webkit-user-select:none;text-align:center}
    .bamboo-joystick-ring{position:relative;width:132px;height:132px;margin:0 auto;border-radius:50%;background:radial-gradient(circle at 50% 50%,#f8fafc 0,#f8fafc 30%,#e5e7eb 31%,#e5e7eb 100%);border:2px solid #cbd5e1;box-shadow:inset 0 2px 10px rgba(15,23,42,.10),0 6px 16px rgba(15,23,42,.08);touch-action:none}
    .bamboo-joystick-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;border-radius:50%;transform:translate(-50%,-50%);background:#111827;box-shadow:0 6px 12px rgba(15,23,42,.24);border:4px solid #fff;will-change:transform}
    .bamboo-joystick-hint{margin-top:8px;font-size:12px;color:#6b7280;font-weight:800}
    .bamboo-joystick-mode .bamboo-joystick-pad{display:block}
    .bamboo-joystick-mode #bambooUpBtn,.bamboo-joystick-mode #bambooDownBtn,.bamboo-joystick-mode #bambooLeftBtn,.bamboo-joystick-mode #bambooRightBtn{display:none!important}
   `;
   document.head.appendChild(st);
 }
 $("bambooModeButtons").onclick=()=>setBambooControlMode("buttons");
 $("bambooModeJoystick").onclick=()=>setBambooControlMode("joystick");
}

function setBambooControlMode(mode){
 bambooControlMode=mode==="joystick"?"joystick":"buttons";
 localStorage.setItem(BAMBOO_CONTROL_KEY,bambooControlMode);
 bambooResetJoystick();
 applyBambooControlMode();
}

function applyBambooControlMode(){
 const panel=$("bambooControlPanel");
 if(panel)panel.classList.toggle("bamboo-joystick-mode",bambooControlMode==="joystick");
 const b=$("bambooModeButtons"), j=$("bambooModeJoystick");
 if(b)b.classList.toggle("active",bambooControlMode!=="joystick");
 if(j)j.classList.toggle("active",bambooControlMode==="joystick");
}

function bindBambooJoystick(){
 if(bambooJoystickBound)return;
 const pad=$("bambooJoystickPad");
 if(!pad)return;
 bambooJoystickBound=true;
 const move=e=>{
   if(bambooControlMode!=="joystick")return;
   if(e&&e.cancelable)e.preventDefault();
   const point=e.touches&&e.touches[0]?e.touches[0]:e;
   bambooUpdateJoystickFromPoint(point);
 };
 const end=e=>{
   if(e&&e.cancelable)e.preventDefault();
   bambooResetJoystick();
 };
 pad.addEventListener("pointerdown",e=>{
   if(bambooControlMode!=="joystick")return;
   if(e&&e.cancelable)e.preventDefault();
   bambooJoystick.active=true;
   bambooJoystick.pointerId=e.pointerId;
   try{pad.setPointerCapture(e.pointerId)}catch{}
   if(!bambooRunning)startBamboo();
   bambooUpdateJoystickFromPoint(e);
 },{passive:false});
 pad.addEventListener("pointermove",e=>{
   if(!bambooJoystick.active||bambooJoystick.pointerId!==e.pointerId)return;
   move(e);
 },{passive:false});
 pad.addEventListener("pointerup",end,{passive:false});
 pad.addEventListener("pointercancel",end,{passive:false});
 if(!window.PointerEvent){
   pad.addEventListener("touchstart",e=>{bambooJoystick.active=true;if(!bambooRunning)startBamboo();move(e);},{passive:false});
   pad.addEventListener("touchmove",move,{passive:false});
   pad.addEventListener("touchend",end,{passive:false});
   pad.addEventListener("touchcancel",end,{passive:false});
 }
}

function bambooUpdateJoystickFromPoint(point){
 const ring=$("bambooJoystickPad")&&$("bambooJoystickPad").querySelector(".bamboo-joystick-ring");
 const knob=$("bambooJoystickKnob");
 if(!ring||!point)return;
 const rect=ring.getBoundingClientRect();
 const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
 const max=rect.width*0.34;
 let dx=point.clientX-cx, dy=point.clientY-cy;
 const len=Math.hypot(dx,dy);
 const clamped=Math.min(max,len||0);
 const nx=len?dx/len:0, ny=len?dy/len:0;
 bambooJoystick.active=true;
 bambooJoystick.dx=nx*(clamped/max);
 bambooJoystick.dy=ny*(clamped/max);
 bambooJoystick.strength=clamped/max;
 if(knob)knob.style.transform=`translate(calc(-50% + ${nx*clamped}px), calc(-50% + ${ny*clamped}px))`;
}

function bambooResetJoystick(){
 bambooJoystick={active:false,pointerId:null,dx:0,dy:0,strength:0};
 const knob=$("bambooJoystickKnob");
 if(knob)knob.style.transform="translate(-50%,-50%)";
}

function bindBambooTouchButton(id,key){
 const btn=$(id);
 btn.onpointerdown=e=>{e.preventDefault();if(bambooControlMode==="joystick")return;if(!bambooRunning)startBamboo();bambooKeys[key]=true};
 btn.onpointerup=e=>{e.preventDefault();bambooKeys[key]=false};
 btn.onpointerleave=e=>{bambooKeys[key]=false};
 btn.onpointercancel=e=>{bambooKeys[key]=false};
}

function handleBambooKeyDown(e){
 if(currentMainView!=="bamboo")return;
 if(isTypingTarget(e.target))return;
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
 if(isTypingTarget(e.target))return;
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
 bambooResetJoystick();
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
 if(bambooControlMode==="joystick"&&bambooJoystick.active&&bambooJoystick.strength>0.05){
   dx+=bambooJoystick.dx;
   dy+=bambooJoystick.dy;
 }
 if(dx||dy){
   const len=Math.hypot(dx,dy);
   dx/=len;dy/=len;
   const analog=(bambooControlMode==="joystick"&&bambooJoystick.active)?Math.max(0.35,Math.min(1,bambooJoystick.strength)):1;
   bambooPlayer.x+=dx*moveSpeed*analog*dt;
   bambooPlayer.y+=dy*moveSpeed*analog*dt;
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
   ctx.fillText(bambooControlMode==="joystick"?"원형 조이스틱을 밀어서 화살을 피해":"방향키/WASD로 이동해서 화살을 피해",BAMBOO_W/2,193);
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
    <div class="guestbook-top">
      <div class="guestbook-name-wrap">
        <div class="guestbook-name">${esc(m.name||"익명")}</div>
        <button class="guest-reply-toggle" type="button" data-parent-id="${esc(m.id)}" aria-expanded="false" title="대댓글 열기" aria-label="대댓글 열기">
          <svg class="guest-reply-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19 15 15 11v3H5V5H3v11h12v3l4-4Z"></path>
          </svg>
        </button>
      </div>
      <div class="guestbook-date">${formatScoreDate(m.created_at)}</div>
    </div>
    <div class="guestbook-content">${esc(m.content||"")}</div>
    ${replyHtml}
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
   btn.title=willOpen?"대댓글 닫기":"대댓글 열기";
   btn.setAttribute("aria-label",willOpen?"대댓글 닫기":"대댓글 열기");
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

/* Jump Map game: Supabase stage-save add-on */
(function(){
  const JUMP_TOTAL_STAGES=60;
  const JUMP_PLAYER_CACHE_KEY='jbaaaam_jump_last_player_v1';
  const JUMP_SCALE=1;
  let jumpReady=false;
  let jumpCtx=null;
  let jumpCanvas=null;
  let jumpLoopId=0;
  let jumpKeys={left:false,right:false,jump:false};
  let jumpTouch={left:false,right:false,jump:false};
  let jumpPlayerRecord=null;
  let jumpClears=[];
  let jumpStageNo=1;
  let jumpLevel=null;
  let jumpStarted=false;
  let jumpPaused=false;
  let jumpClearLock=false;
  let jumpDeaths=0;
  let jumpStartTime=0;
  let jumpLastTime=0;
  let jumpCameraX=0;
  let jumpControlPressLock=0;
  let jumpPlayer={x:40,y:40,w:24,h:28,vx:0,vy:0,onGround:false,face:1};

  function jumpSafeEl(id){return document.getElementById(id)}
  function jumpHtml(t){return String(t==null?'':t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
  function jumpShowToast(msg,type){ if(typeof showToast==='function')showToast(msg,type); else console.log(msg); }
  function jumpErr(e){ return typeof shortErrorText==='function'?shortErrorText(e):String(e&&e.message?e.message:e); }
  function jumpDateText(iso){ if(typeof formatScoreDate==='function')return formatScoreDate(iso); const d=new Date(iso); return Number.isNaN(d.getTime())?'':`${d.getMonth()+1}/${d.getDate()}`; }

  function installJumpStyle(){
    if(jumpSafeEl('jumpStyle'))return;
    const st=document.createElement('style');
    st.id='jumpStyle';
    st.textContent=`
      .jump-page{padding-bottom:20px}.jump-wrap{display:flex;flex-direction:column;gap:10px}.jump-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.jump-actions button,.jump-control-btn,.jump-player-btn,.jump-small-btn{border:0;border-radius:14px;background:#f3f4f6;color:#111827;font-weight:950;cursor:pointer}.jump-actions button{min-height:44px;font-size:15px}.jump-stage{background:#111827;border-radius:20px;padding:10px;box-shadow:0 10px 24px rgba(17,24,39,.18)}#jumpCanvas{display:block;width:100%;height:auto;background:#7dd3fc;border-radius:14px;touch-action:none}.jump-info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.jump-info-box{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:10px 11px}.jump-info-box span{display:block;color:#6b7280;font-size:11px;font-weight:850}.jump-info-box b{display:block;margin-top:2px;font-size:17px;font-weight:950;color:#111827}.jump-player-panel,.jump-select-panel{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:14px;box-shadow:0 3px 12px rgba(15,23,42,.05)}.jump-player-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.jump-player-row .input{height:48px}.jump-player-btn{height:48px;padding:0 16px;background:#111827;color:#fff}.jump-player-meta{margin-top:8px;color:#6b7280;font-size:12px;line-height:1.45}.jump-select-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.jump-select-title{font-size:15px;font-weight:950}.jump-small-btn{height:36px;padding:0 12px;font-size:13px}.jump-stage-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.jump-stage-btn{height:42px;border:0;border-radius:13px;background:#f3f4f6;color:#111827;font-weight:950;cursor:pointer}.jump-stage-btn.cleared{background:#dcfce7;color:#166534}.jump-stage-btn.current{background:#111827;color:#fff}.jump-stage-btn.locked{background:#f3f4f6;color:#c4c8d0;cursor:not-allowed}.jump-controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.jump-control-btn{min-height:56px;font-size:22px;touch-action:none;user-select:none;-webkit-user-select:none}.jump-control-btn.jump{background:#111827;color:#fff}.jump-help{color:#6b7280;font-size:12px;line-height:1.45;text-align:center}.jump-rank-list{display:flex;flex-direction:column;gap:6px;max-height:210px;overflow:auto}.jump-rank-row{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:13px;padding:8px 10px;font-size:13px}.jump-rank-row b{font-size:14px}.jump-rank-score{font-weight:950}.app-card.jump-card .app-icon{background:#ecfeff}.menu-section-btn.jump-active{background:#111827;color:#fff}@media(max-width:420px){.jump-stage-grid{grid-template-columns:repeat(4,1fr)}.jump-player-row{grid-template-columns:1fr}.jump-player-btn{width:100%}}
    `;
    document.head.appendChild(st);
  }

  function installJumpDom(){
    installJumpStyle();
    const app=document.querySelector('.app')||document.body;
    const grid=document.querySelector('#homeView .app-grid')||document.querySelector('.app-grid');
    if(grid&&!jumpSafeEl('homeJumpCard')){
      const card=document.createElement('button');
      card.type='button';
      card.id='homeJumpCard';
      card.className='app-card jump-card';
      card.innerHTML='<div class="app-icon">🧊</div><div><div class="app-name">점프맵</div><div class="app-desc">스테이지 점프 클리어</div></div>';
      card.onclick=()=>setMainView('jump');
      grid.appendChild(card);
    }
    const bambooBtn=jumpSafeEl('showBambooBtn');
    if(bambooBtn&&!jumpSafeEl('showJumpBtn')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.id='showJumpBtn';
      btn.className='menu-section-btn';
      btn.innerHTML='점프맵<br><span style="font-size:12px;font-weight:700;color:inherit;opacity:.72">스테이지 점프</span>';
      btn.onclick=()=>setMainView('jump');
      bambooBtn.insertAdjacentElement('afterend',btn);
    }
    if(!jumpSafeEl('jumpView')){
      const view=document.createElement('section');
      view.id='jumpView';
      view.className='view-page jump-page';
      view.innerHTML=`
        <div class="header"><button class="menu-btn" id="menuBtnJump" type="button">☰</button><div class="title-area"><div class="title">점프맵</div><div class="subtitle">블록을 밟고 목표 지점까지 가는 스테이지 점프 게임</div></div><button class="name-btn" id="jumpRankBtn" type="button">랭킹</button></div>
        <div class="jump-wrap">
          <div class="jump-player-panel">
            <div class="jump-player-row"><input id="jumpNameInput" class="input" maxlength="20" placeholder="이름을 입력해줘"><button class="jump-player-btn" id="jumpLoadPlayerBtn" type="button">시작</button></div>
            <div class="jump-player-meta" id="jumpPlayerMeta">이름별로 Supabase에 진행도가 저장돼.</div>
          </div>
          <div class="jump-actions"><button id="jumpStartBtn" type="button">시작</button><button id="jumpPauseBtn" type="button">일시정지</button><button id="jumpRestartBtn" type="button">다시시작</button></div>
          <div class="jump-info"><div class="jump-info-box"><span>플레이어</span><b id="jumpPlayerName">-</b></div><div class="jump-info-box"><span>점수</span><b id="jumpScore">0</b></div><div class="jump-info-box"><span>스테이지</span><b id="jumpStageText">1</b></div></div>
          <div class="jump-select-panel"><div class="jump-select-head"><div class="jump-select-title">스테이지 선택</div><button class="jump-small-btn" id="jumpContinueBtn" type="button">이어하기</button></div><div class="jump-stage-grid" id="jumpStageGrid"></div></div>
          <div class="jump-stage"><canvas id="jumpCanvas" width="460" height="300"></canvas></div>
          <div class="jump-controls"><button class="jump-control-btn" id="jumpLeftBtn" type="button">←</button><button class="jump-control-btn jump" id="jumpJumpBtn" type="button">점프</button><button class="jump-control-btn" id="jumpRightBtn" type="button">→</button></div>
          <div class="jump-help">PC: ←/→ 이동, ↑/Space 점프, R 다시시작, P 일시정지<br>폰: 아래 버튼을 누르고 있으면 이동해. 파란 타일은 얼음이라 미끄러워.</div>
          <div class="jump-select-panel"><div class="jump-select-head"><div class="jump-select-title">진행도 랭킹</div><button class="jump-small-btn" id="jumpRefreshRankBtn" type="button">새로고침</button></div><div class="jump-rank-list" id="jumpRankList"><div class="empty">랭킹 불러오기 전</div></div></div>
        </div>`;
      const anchor=jumpSafeEl('bambooView')||document.querySelector('.view-page:last-of-type');
      if(anchor&&anchor.parentNode)anchor.insertAdjacentElement('afterend',view); else app.appendChild(view);
    }
  }

  function bindJump(){
    if(jumpReady)return;
    jumpReady=true;
    jumpCanvas=jumpSafeEl('jumpCanvas');
    jumpCtx=jumpCanvas.getContext('2d');
    const last=localStorage.getItem(JUMP_PLAYER_CACHE_KEY)||'';
    const nameInput=jumpSafeEl('jumpNameInput');
    if(nameInput)nameInput.value=last;
    jumpSafeEl('menuBtnJump').onclick=openDrawer;
    jumpSafeEl('jumpLoadPlayerBtn').onclick=()=>jumpLoadPlayerFromInput();
    jumpSafeEl('jumpStartBtn').onclick=()=>jumpStart();
    jumpSafeEl('jumpPauseBtn').onclick=()=>jumpTogglePause();
    jumpSafeEl('jumpRestartBtn').onclick=()=>jumpRestart();
    jumpSafeEl('jumpContinueBtn').onclick=()=>jumpContinue();
    jumpSafeEl('jumpRankBtn').onclick=()=>jumpLoadRanks();
    jumpSafeEl('jumpRefreshRankBtn').onclick=()=>jumpLoadRanks();
    if(nameInput)nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')jumpLoadPlayerFromInput()});
    bindHold('jumpLeftBtn','left');bindHold('jumpRightBtn','right');bindHold('jumpJumpBtn','jump');
    document.addEventListener('keydown',jumpKeyDown);
    document.addEventListener('keyup',jumpKeyUp);
    jumpBuildStageGrid();
    jumpLoadRanks();
    if(last)jumpLoadPlayer(last,{silent:true});
    else jumpSelectStage(1,false);
    jumpDraw();
  }

  function bindHold(id,key){
    const el=jumpSafeEl(id); if(!el)return;
    const on=e=>{
      if(e&&e.cancelable)e.preventDefault();
      if(key==='jump'){
        jumpTouch.jump=jumpStarted;
        jumpStartOrJump();
        return;
      }
      jumpTouch[key]=true;
    };
    const off=e=>{if(e&&e.cancelable)e.preventDefault();jumpTouch[key]=false;};
    el.addEventListener('pointerdown',on,{passive:false});
    el.addEventListener('pointerup',off,{passive:false});
    el.addEventListener('pointercancel',off,{passive:false});
    el.addEventListener('pointerleave',off,{passive:false});
    el.addEventListener('touchstart',on,{passive:false});
    el.addEventListener('touchend',off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
    el.addEventListener('mousedown',on);
    el.addEventListener('mouseup',off);
    el.addEventListener('click',e=>{
      if(e&&e.cancelable)e.preventDefault();
      if(key==='jump'&&!jumpStarted)jumpStart();
    });
  }
  function jumpStartOrJump(){
    if(jumpStarted){jumpTryJump();return;}
    jumpStart();
  }
  function jumpIsStartKey(e){return e&&((e.key==='ArrowUp')||(e.key===' ')||(e.key==='Spacebar')||(e.code==='Space')||(e.key==='Space'));}
  function jumpKeyDown(e){
    if(currentMainView!=='jump')return;
    if(isTypingTarget(e.target))return;
    const isStartKey=jumpIsStartKey(e);
    if(['ArrowLeft','ArrowRight','ArrowUp',' ','Spacebar','Space','r','R','p','P'].includes(e.key)||e.code==='Space')e.preventDefault();
    if(e.key==='ArrowLeft')jumpKeys.left=true;
    if(e.key==='ArrowRight')jumpKeys.right=true;
    if(isStartKey){
      jumpKeys.jump=true;
      jumpStartOrJump();
    }
    if(e.key==='r'||e.key==='R')jumpRestart();
    if(e.key==='p'||e.key==='P')jumpTogglePause();
  }
  function jumpKeyUp(e){
    if(isTypingTarget(e.target))return;
    if(e.key==='ArrowLeft')jumpKeys.left=false;
    if(e.key==='ArrowRight')jumpKeys.right=false;
    if(jumpIsStartKey(e))jumpKeys.jump=false;
  }

  async function jumpLoadPlayerFromInput(){
    const name=(jumpSafeEl('jumpNameInput').value||'').trim();
    if(!name){jumpSafeEl('jumpNameInput').focus();jumpShowToast('이름을 입력해줘','error');return;}
    await jumpLoadPlayer(name,{silent:false});
  }
  async function jumpLoadPlayer(name,{silent=false}={}){
    try{
      jumpSetMeta('플레이어 불러오는 중...');
      const clean=String(name||'').trim().slice(0,20)||'익명';
      let rows=await sbFetch(`/jump_players?select=id,name,unlocked_stage,score,last_stage,created_at,updated_at&name=eq.${encodeURIComponent(clean)}&limit=1`);
      if(!rows||!rows.length){
        await sbFetch('/jump_players?on_conflict=name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{name:clean,unlocked_stage:1,score:0,last_stage:1}])});
        rows=await sbFetch(`/jump_players?select=id,name,unlocked_stage,score,last_stage,created_at,updated_at&name=eq.${encodeURIComponent(clean)}&limit=1`);
      }
      jumpPlayerRecord=rows[0];
      localStorage.setItem(JUMP_PLAYER_CACHE_KEY,jumpPlayerRecord.name);
      jumpClears=await jumpFetchClears(jumpPlayerRecord.id);
      const unlocked=Math.max(1,Math.min(JUMP_TOTAL_STAGES,Number(jumpPlayerRecord.unlocked_stage)||1));
      const target=Math.max(1,Math.min(unlocked,Number(jumpPlayerRecord.last_stage)||unlocked));
      jumpSelectStage(target,false);
      jumpUpdateUi();
      jumpBuildStageGrid();
      jumpSetMeta(`${jumpPlayerRecord.name} · ${jumpClears.length}개 클리어 · ${unlocked}스테이지까지 열림`);
      if(!silent)jumpShowToast('점프맵 세이브 불러오기 완료');
    }catch(e){console.error(e);jumpSetMeta('Supabase 불러오기 실패: '+jumpErr(e));jumpShowToast('점프맵 불러오기 실패','error');}
  }
  async function jumpFetchClears(playerId){
    if(!playerId)return [];
    const rows=await sbFetch(`/jump_stage_clears?select=stage_no,best_time_ms,deaths,clear_count,cleared_at,updated_at&player_id=eq.${encodeURIComponent(playerId)}&order=stage_no.asc&limit=1000`);
    return Array.isArray(rows)?rows:[];
  }
  function jumpClearedSet(){return new Set((jumpClears||[]).map(r=>Number(r.stage_no)).filter(Boolean));}
  function jumpGetScore(){return jumpClearedSet().size;}
  function jumpGetUnlocked(){
    const db=jumpPlayerRecord?Number(jumpPlayerRecord.unlocked_stage)||1:1;
    const local=Math.min(JUMP_TOTAL_STAGES,jumpGetScore()+1);
    return Math.max(1,Math.min(JUMP_TOTAL_STAGES,Math.max(db,local)));
  }
  function jumpUpdateUi(){
    const name=jumpPlayerRecord?jumpPlayerRecord.name:'-';
    const score=jumpGetScore();
    const unlocked=jumpGetUnlocked();
    if(jumpSafeEl('jumpPlayerName'))jumpSafeEl('jumpPlayerName').textContent=name;
    if(jumpSafeEl('jumpScore'))jumpSafeEl('jumpScore').textContent=String(score);
    if(jumpSafeEl('jumpStageText'))jumpSafeEl('jumpStageText').textContent=`${jumpStageNo} / ${JUMP_TOTAL_STAGES}`;
    if(jumpPlayerRecord)jumpSetMeta(`${name} · 점수 ${score}점 · ${unlocked}스테이지까지 열림`);
  }
  function jumpSetMeta(text){const el=jumpSafeEl('jumpPlayerMeta');if(el)el.textContent=text;}

  function jumpBuildStageGrid(){
    const grid=jumpSafeEl('jumpStageGrid'); if(!grid)return;
    const cleared=jumpClearedSet(); const unlocked=jumpGetUnlocked();
    grid.innerHTML='';
    for(let i=1;i<=JUMP_TOTAL_STAGES;i++){
      const btn=document.createElement('button');
      btn.type='button';btn.className='jump-stage-btn';btn.textContent=String(i);
      const isCleared=cleared.has(i), isCurrent=i===jumpStageNo, isLocked=i>unlocked;
      btn.classList.toggle('cleared',isCleared);btn.classList.toggle('current',isCurrent);btn.classList.toggle('locked',isLocked);
      btn.disabled=isLocked;
      btn.onclick=()=>jumpSelectStage(i,true);
      grid.appendChild(btn);
    }
  }
  function jumpSelectStage(stageNo,startNow=true){
    jumpStageNo=Math.max(1,Math.min(JUMP_TOTAL_STAGES,Number(stageNo)||1));
    jumpLevel=jumpGenerateStage(jumpStageNo);
    jumpResetPlayer();
    jumpStarted=false;jumpPaused=false;jumpClearLock=false;jumpCameraX=0;jumpDeaths=0;
    jumpSelectedAt=(performance&&performance.now)?performance.now():Date.now();
    jumpStageStartedAt=0;
    jumpBuildStageGrid();jumpUpdateUi();jumpDraw();
    if(startNow)jumpStart();
  }
  function jumpContinue(){jumpSelectStage(jumpGetUnlocked(),true)}
  function jumpStart(){
    if(!jumpPlayerRecord){jumpLoadPlayerFromInput();return;}
    if(!jumpLevel)jumpSelectStage(jumpStageNo,false);
    const now=(performance&&performance.now)?performance.now():Date.now();
    jumpStarted=true;jumpPaused=false;jumpClearLock=false;jumpStartTime=now;jumpLastTime=now;jumpStageStartedAt=now;
    jumpKeys.jump=false;jumpTouch.jump=false;
    cancelAnimationFrame(jumpLoopId);jumpLoopId=requestAnimationFrame(jumpLoop);
  }
  function jumpRestart(){jumpSelectStage(jumpStageNo,true)}
  function jumpTogglePause(){if(!jumpStarted)return;jumpPaused=!jumpPaused;if(!jumpPaused){jumpLastTime=performance.now();jumpLoopId=requestAnimationFrame(jumpLoop)}jumpDraw();}
  function jumpResetPlayer(){const s=jumpLevel?jumpLevel.start:{x:40,y:40};jumpPlayer={x:s.x,y:s.y,w:24,h:28,vx:0,vy:0,onGround:false,face:1};}

  function jumpGenerateStage(n){
    const stage=Math.max(1,Math.min(JUMP_TOTAL_STAGES,Number(n)||1));
    const baseY=248;
    const height=300;
    const mk=(x,y,w,type='solid',extra={})=>({x,y,w,h:18,type,baseX:x,phase:0,range:0,speed:0,...extra});
    const startBlock={x:0,y:baseY,w:132,h:34,type:'solid'};
    const finish=(platforms,hazards=[],bg=0)=>{
      platforms.sort((a,b)=>a.x-b.x||a.y-b.y);
      const last=platforms[platforms.length-1];
      const width=Math.max(720,last.x+last.w+125);
      return {no:stage,width,height,baseY,start:{x:32,y:baseY-50},goal:{x:last.x+Math.max(22,last.w-31),y:last.y-42,w:34,h:42},platforms,hazards,bg:bg%4};
    };
    const addFloorSpikes=(hazards,from,to,count,offset=0)=>{
      for(let i=0;i<count;i++){
        const x=from+offset+i*((to-from)/Math.max(1,count));
        if(x>155&&x<to)hazards.push({x:Math.round(x),y:260,w:24,h:20,type:'spike'});
      }
    };
    const laneHazard=(hazards,p,side='right')=>{
      if(!p||p.w<64)return;
      const y=p.y-18;
      // 한 발판 안에 가시가 2개 이상 생기면 착지/통과 구간이 거의 사라져
      // 29탄처럼 클리어 불가능하게 보이는 배치가 생긴다.
      // 그래서 발판 하나에는 가시를 최대 1개만 허용한다.
      const already=hazards.some(h=>h&&h.type==='spike'&&Math.abs(Number(h.y)-y)<1&&Number(h.x)>=p.x-2&&Number(h.x)+Number(h.w)<=p.x+p.w+2);
      if(already)return;
      const x=side==='left'?p.x+5:p.x+p.w-23;
      hazards.push({x:Math.round(x),y,w:19,h:18,type:'spike'});
    };

    const manual={
      1:{bg:0,p:[[206,226,78],[335,217,70],[462,226,82],[602,211,78]],h:[[280,260,24,20],[548,260,24,20]]},
      2:{bg:1,p:[[202,230,74],[326,200,64],[454,171,62],[588,202,66],[722,225,80]],h:[[286,260,24,20],[656,260,24,20]]},
      3:{bg:2,p:[[196,221,68],[318,202,60],[442,224,56],[570,198,62],[704,218,74]],h:[[376,260,24,20],[498,260,24,20],[642,260,24,20]]},
      4:{bg:3,p:[[202,236,60],[328,236,52,'ice'],[458,208,58],[590,184,52],[726,214,70]],h:[[390,260,24,20],[666,260,24,20]]},
      5:{bg:0,p:[[194,224,62],[320,194,54],[456,164,52],[596,196,54],[730,226,72]],h:[[263,206,18,18],[520,260,24,20],[660,260,24,20]]},
      6:{bg:1,p:[[198,226,58],[320,226,46],[438,204,48],[560,181,46,'spring'],[688,215,58],[816,232,70]],h:[[266,260,24,20],[384,260,24,20],[620,260,24,20]]},
      7:{bg:2,p:[[204,232,52],[330,206,48],[454,232,46],[582,206,46],[710,181,46],[842,214,62]],h:[[382,260,24,20],[514,260,24,20],[773,260,24,20]]},
      8:{bg:3,p:[[204,220,54],[333,198,46],[461,176,44],[593,205,44,'ice'],[724,230,50],[854,205,62]],h:[[272,260,24,20],[397,260,24,20],[657,260,24,20],[792,260,24,20]]},
      9:{bg:0,p:[[206,226,50],[334,197,44,'move',0,32,.78],[470,218,44],[604,189,42],[740,216,48],[878,196,62]],h:[[292,260,24,20],[530,260,24,20],[806,260,24,20]]},
      10:{bg:1,p:[[198,232,48],[320,202,42],[444,174,42,'spring'],[578,208,42],[708,183,40,'move',0,34,.82],[842,218,60]],h:[[260,260,24,20],[382,260,24,20],[642,260,24,20],[778,260,24,20]]},
      11:{bg:2,p:[[202,226,46],[326,207,40],[452,188,38],[580,218,40],[708,191,38],[840,164,40],[970,204,60]],h:[[266,260,24,20],[394,260,24,20],[648,260,24,20],[775,260,24,20]]},
      12:{bg:3,p:[[200,234,44],[324,214,40,'ice'],[448,194,38],[575,174,38],[704,204,36,'move',1,38,.9],[838,228,56]],h:[[270,260,24,20],[392,260,24,20],[514,260,24,20],[771,260,24,20]]}
    };
    if(manual[stage]){
      const cfg=manual[stage];
      const platforms=[startBlock];
      cfg.p.forEach(a=>{
        const [x,y,w,type,phase,range,speed]=a;
        const extra={};
        if(type==='move'){extra.phase=phase||0;extra.range=range||30;extra.speed=speed||.8;}
        platforms.push(mk(x,y,w,type||'solid',extra));
      });
      const hazards=(cfg.h||[]).map(a=>({x:a[0],y:a[1],w:a[2],h:a[3],type:'spike'}));
      return finish(platforms,hazards,cfg.bg||0);
    }

    const tier=Math.floor((stage-1)/10); // 1부터 빠르게 상승, 50대는 매우 빡빡한 정밀 구간
    const variant=stage%6;
    const platforms=[startBlock];
    const hazards=[];
    const count=7+Math.min(9,Math.floor(stage/5));
    let x=142;
    let y=baseY-18;
    const gapBase=88+Math.min(34,stage*.82)+tier*4;
    const minW=Math.max(38,58-tier*4);
    const maxW=Math.max(50,82-tier*5);
    for(let i=0;i<count;i++){
      const wave=((stage*31+i*47)%29)-14;
      let gap=Math.round(gapBase+wave+(i%3===1?12:0));
      if(variant===1&&i%2===0)gap+=10;
      if(variant===3&&i%4===2)gap+=15;
      gap=Math.max(82,Math.min(142,gap));
      x+=gap;

      const climb=[-22,-42,-62,-34,-54,-18,-48,-70,-40,-15];
      const saw=[-16,-48,-20,-58,-26,-66,-30,-52,-18,-60];
      const drop=[-54,-30,-10,-44,-20,-64,-36,-14,-50,-26];
      const needle=[-24,-58,-40,-72,-46,-20,-64,-36,-74,-28];
      const patterns=[climb,saw,drop,needle,climb,needle];
      const prevY=y;
      y=baseY+patterns[variant][i%10];
      if(stage>=35&&i%5===3)y-=12;
      if(stage>=48&&i%4===1)y-=10;
      y=Math.max(112,Math.min(238,y));
      if(prevY-y>42){ const reduce=Math.min(28,Math.ceil((prevY-y-42)*.8)); x-=reduce; }

      let w=maxW-((stage*7+i*11)%Math.max(8,maxW-minW+1));
      if(stage>=30&&i%3===0)w-=8;
      if(stage>=45&&i%4===2)w-=10;
      w=Math.max(minW,w);

      let type='solid';
      const extra={};
      if(stage>=14&&(i+stage)%5===0)type='ice';
      if(stage>=18&&(i+stage)%7===0)type='spring';
      if(stage>=22&&(i+stage)%4===0){
        type='move';
        extra.phase=(i%5)*0.55;
        extra.range=26+Math.min(34,tier*6+((stage+i)%4)*5);
        extra.speed=.78+Math.min(.55,tier*.08+((stage+i)%5)*.05);
      }
      if(stage>=42&&(i+stage)%9===0)type='ice';
      const p=mk(x,y,w,type,extra);
      platforms.push(p);

      // 플래시 점프맵식: 후반에는 같은 발판 안에서도 안전 착지 영역을 줄임.
      if(stage>=16&&i%4===1)laneHazard(hazards,p,'right');
      if(stage>=32&&i%6===4)laneHazard(hazards,p,'left');
      if(stage>=50&&i%5===2&&p.w>70)hazards.push({x:Math.round(p.x+p.w/2-8),y:p.y-18,w:16,h:18,type:'spike'});

      // 수직 보조 발판: 올라가는 구간을 더 어렵게 만들되 도달 가능한 중간 발판 제공.
      if(stage>=26&&i%5===0){
        platforms.push(mk(x+Math.max(22,w-12),Math.max(102,y-54),Math.max(34,w-18),'solid'));
      }
      x+=w;
    }

    const last=platforms[platforms.length-1];
    const finalGap=Math.min(128,92+tier*4+(stage%4)*4);
    const finalY=Math.max(120,Math.min(232,last.y+((stage%2)?-18:24)));
    platforms.push(mk(last.x+last.w+finalGap,finalY,Math.max(44,76-tier*5),stage>=38?'move':'solid',stage>=38?{phase:1.1,range:24+tier*5,speed:.85+tier*.06}:{}));

    const endLimit=platforms[platforms.length-1].x-35;
    addFloorSpikes(hazards,210,endLimit,Math.min(22,3+Math.floor(stage/3)),stage%5*9);
    if(stage>=25){
      for(let i=3;i<platforms.length-3;i+=5){
        const p=platforms[i];
        if(p&&p.w>40&&p.type!=='spring')laneHazard(hazards,p,(i+stage)%2?'right':'left');
      }
    }
    return finish(platforms,hazards,stage);
  }

  function jumpTryJump(){
    if(!jumpStarted||jumpPaused)return;
    if(jumpPlayer.onGround){jumpPlayer.vy=-440;jumpPlayer.onGround=false;}
  }
  function jumpLoop(t){
    if(!jumpStarted||jumpPaused){jumpDraw();return;}
    const dt=Math.min(.033,(t-jumpLastTime)/1000||.016);jumpLastTime=t;
    jumpUpdate(dt,t/1000);
    jumpDraw();
    jumpLoopId=requestAnimationFrame(jumpLoop);
  }
  function jumpUpdate(dt,time){
    const left=jumpKeys.left||jumpTouch.left, right=jumpKeys.right||jumpTouch.right;
    const accel=left?-1500:right?1500:0;
    const maxSpeed=left||right?190:0;
    const friction=jumpPlayer.onGround?1350:620;
    if(accel){jumpPlayer.vx+=accel*dt;jumpPlayer.face=accel>0?1:-1;} else {
      if(jumpPlayer.vx>0)jumpPlayer.vx=Math.max(0,jumpPlayer.vx-friction*dt);
      if(jumpPlayer.vx<0)jumpPlayer.vx=Math.min(0,jumpPlayer.vx+friction*dt);
    }
    if(maxSpeed)jumpPlayer.vx=Math.max(-maxSpeed,Math.min(maxSpeed,jumpPlayer.vx));
    jumpPlayer.vy+=900*dt;
    jumpMovePlatforms(time);
    jumpMoveAxis('x',jumpPlayer.vx*dt);
    jumpPlayer.onGround=false;
    jumpMoveAxis('y',jumpPlayer.vy*dt);
    if(jumpPlayer.y>jumpLevel.height+120)jumpDie();
    for(const h of jumpLevel.hazards){if(rectHit(jumpPlayer,h)){jumpDie();return;}}
    if(jumpCanClearStage())jumpClearStage();
    const target=Math.max(0,Math.min(jumpLevel.width-jumpCanvas.width,jumpPlayer.x-jumpCanvas.width*.38));
    jumpCameraX+=((target||0)-jumpCameraX)*Math.min(1,dt*6);
  }
  function jumpMovePlatforms(time){
    jumpLevel.platforms.forEach(p=>{
      if(p.type==='move')p.x=p.baseX+Math.sin(time*p.speed+p.phase)*p.range;
    });
  }
  function jumpMoveAxis(axis,amount){
    jumpPlayer[axis]+=amount;
    for(const p of jumpLevel.platforms){
      if(!rectHit(jumpPlayer,p))continue;
      if(axis==='x'){
        if(amount>0)jumpPlayer.x=p.x-jumpPlayer.w;
        else if(amount<0)jumpPlayer.x=p.x+p.w;
        jumpPlayer.vx=0;
      }else{
        if(amount>0){
          jumpPlayer.y=p.y-jumpPlayer.h;jumpPlayer.vy=0;jumpPlayer.onGround=true;
          if(p.type==='spring'){jumpPlayer.vy=-620;jumpPlayer.onGround=false;}
          if(p.type==='ice')jumpPlayer.vx*=1.018;
        }else if(amount<0){jumpPlayer.y=p.y+p.h;jumpPlayer.vy=40;}
      }
    }
    if(jumpPlayer.x<0){jumpPlayer.x=0;jumpPlayer.vx=0;}
    if(jumpPlayer.x+jumpPlayer.w>jumpLevel.width){jumpPlayer.x=jumpLevel.width-jumpPlayer.w;jumpPlayer.vx=0;}
  }
  function rectHit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
  function jumpCanClearStage(){
    if(!jumpStarted||jumpPaused||jumpClearLock||!jumpLevel||!jumpLevel.goal)return false;
    const now=(performance&&performance.now)?performance.now():Date.now();
    if(!jumpStageStartedAt||now-jumpStageStartedAt<450)return false;
    const g=jumpLevel.goal;
    if(!rectHit(jumpPlayer,g))return false;
    const cx=jumpPlayer.x+jumpPlayer.w/2;
    const bottom=jumpPlayer.y+jumpPlayer.h;
    const insideGoalX=cx>=g.x+4&&cx<=g.x+g.w-4;
    const atGoalBase=bottom>=g.y+g.h-2&&bottom<=g.y+g.h+18;
    return jumpPlayer.onGround&&insideGoalX&&atGoalBase;
  }
  function jumpDie(){jumpDeaths++;jumpResetPlayer();jumpCameraX=Math.max(0,jumpPlayer.x-80);jumpShowToast('다시 도전');}
  async function jumpClearStage(){
    if(jumpClearLock||!jumpPlayerRecord||!jumpCanClearStage())return;
    const clearedStageNo=jumpStageNo;
    jumpClearLock=true;jumpStarted=false;cancelAnimationFrame(jumpLoopId);
    const elapsed=Math.max(1,Math.round(((performance&&performance.now)?performance.now():Date.now())-jumpStartTime));
    try{
      const old=(jumpClears||[]).find(r=>Number(r.stage_no)===clearedStageNo);
      const best=old&&old.best_time_ms?Math.min(Number(old.best_time_ms),elapsed):elapsed;
      const deaths=(old?Number(old.deaths)||0:0)+jumpDeaths;
      const clearCount=(old?Number(old.clear_count)||0:0)+1;
      await sbFetch('/jump_stage_clears?on_conflict=player_id,stage_no',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{player_id:jumpPlayerRecord.id,stage_no:clearedStageNo,best_time_ms:best,deaths,clear_count:clearCount,cleared_at:new Date().toISOString(),updated_at:new Date().toISOString()}])});
      jumpClears=await jumpFetchClears(jumpPlayerRecord.id);
      const score=jumpGetScore();
      const unlocked=Math.min(JUMP_TOTAL_STAGES,Math.max(jumpGetUnlocked(),clearedStageNo+1));
      const lastStage=Math.min(JUMP_TOTAL_STAGES,clearedStageNo+1);
      await sbFetch('/jump_players?on_conflict=name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{id:jumpPlayerRecord.id,name:jumpPlayerRecord.name,score,unlocked_stage:unlocked,last_stage:lastStage,updated_at:new Date().toISOString()}])});
      const rows=await sbFetch(`/jump_players?select=id,name,unlocked_stage,score,last_stage,created_at,updated_at&id=eq.${encodeURIComponent(jumpPlayerRecord.id)}&limit=1`);
      if(rows&&rows[0])jumpPlayerRecord=rows[0];
      jumpUpdateUi();jumpBuildStageGrid();jumpLoadRanks();
      jumpShowToast(`STAGE ${clearedStageNo} 클리어 · +1점`);
      setTimeout(()=>{jumpSelectStage(lastStage,false);jumpDraw();},650);
    }catch(e){console.error(e);jumpShowToast('클리어 저장 실패','error');jumpSetMeta('클리어 저장 실패: '+jumpErr(e));jumpClearLock=false;}
  }

  async function jumpLoadRanks(){
    const list=jumpSafeEl('jumpRankList'); if(!list)return;
    list.innerHTML='<div class="empty">랭킹 불러오는 중...</div>';
    try{
      const rows=await sbFetch('/jump_players?select=name,score,unlocked_stage,last_stage,updated_at&order=score.desc,unlocked_stage.desc,updated_at.asc&limit=15');
      if(!rows||!rows.length){list.innerHTML='<div class="empty">아직 기록이 없어.</div>';return;}
      list.innerHTML=rows.map((r,i)=>`<div class="jump-rank-row"><b>${i+1}</b><div>${jumpHtml(r.name)}<br><span style="color:#6b7280;font-size:11px">STAGE ${Number(r.unlocked_stage)||1} · ${jumpDateText(r.updated_at)}</span></div><div class="jump-rank-score">${Number(r.score)||0}점</div></div>`).join('');
    }catch(e){console.error(e);list.innerHTML=`<div class="empty">랭킹 불러오기 실패<br>${jumpHtml(jumpErr(e))}</div>`;}
  }

  function jumpDraw(){
    if(!jumpCtx||!jumpCanvas)return;
    const c=jumpCtx,w=jumpCanvas.width,h=jumpCanvas.height;
    c.clearRect(0,0,w,h);
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,['#bae6fd','#bbf7d0','#ddd6fe','#fed7aa'][jumpLevel?jumpLevel.bg:0]||'#bae6fd');g.addColorStop(1,'#f8fafc');c.fillStyle=g;c.fillRect(0,0,w,h);
    c.save();c.translate(-jumpCameraX,0);
    c.fillStyle='rgba(255,255,255,.45)';
    for(let i=0;i<8;i++){const x=((i*170+40)-(jumpCameraX*.25%(170*8)));c.beginPath();c.roundRect(x,44+(i%3)*34,58,16,8);c.fill();}
    if(jumpLevel){
      jumpLevel.platforms.forEach(p=>drawPlatform(c,p));
      jumpLevel.hazards.forEach(hz=>drawSpike(c,hz));
      drawGoal(c,jumpLevel.goal);
      drawPlayer(c,jumpPlayer);
    }
    c.restore();
    if(!jumpStarted){drawOverlay(c,w,h,jumpPlayerRecord?'Space / ↑ / 점프 버튼으로 시작':'이름 입력 후 Space / ↑ / 점프 버튼으로 시작');}
    if(jumpPaused)drawOverlay(c,w,h,'일시정지');
  }
  function drawPlatform(c,p){
    const colors={solid:'#64748b',ice:'#38bdf8',spring:'#22c55e',move:'#a855f7'};
    c.fillStyle=colors[p.type]||colors.solid;c.strokeStyle='rgba(15,23,42,.35)';c.lineWidth=2;
    c.beginPath();c.roundRect(p.x,p.y,p.w,p.h,6);c.fill();c.stroke();
    c.fillStyle='rgba(255,255,255,.25)';c.fillRect(p.x+4,p.y+3,Math.max(0,p.w-8),3);
    if(p.type==='spring'){c.fillStyle='#fef08a';c.fillRect(p.x+10,p.y-5,p.w-20,5)}
  }
  function drawSpike(c,s){
    c.fillStyle='#ef4444';c.strokeStyle='#991b1b';c.lineWidth=1.5;c.beginPath();c.moveTo(s.x,s.y+s.h);c.lineTo(s.x+s.w/2,s.y);c.lineTo(s.x+s.w,s.y+s.h);c.closePath();c.fill();c.stroke();
  }
  function drawGoal(c,g){
    c.strokeStyle='#475569';c.lineWidth=3;c.beginPath();c.moveTo(g.x,g.y+g.h);c.lineTo(g.x,g.y-22);c.stroke();
    c.fillStyle='#ef4444';c.beginPath();c.moveTo(g.x+2,g.y-22);c.lineTo(g.x+30,g.y-13);c.lineTo(g.x+2,g.y-4);c.closePath();c.fill();
    c.fillStyle='rgba(250,204,21,.25)';c.beginPath();c.arc(g.x+6,g.y+g.h-4,25,0,Math.PI*2);c.fill();
  }
  function drawPlayer(c,p){
    c.fillStyle='#fff';c.strokeStyle='#111827';c.lineWidth=2;c.beginPath();c.roundRect(p.x,p.y,p.w,p.h,7);c.fill();c.stroke();
    c.fillStyle='#111827';c.fillRect(p.x+7,p.y+10,3,4);c.fillRect(p.x+15,p.y+10,3,4);c.fillRect(p.x+9,p.y+20,8,2);
  }
  function drawOverlay(c,w,h,text){
    c.save();c.fillStyle='rgba(17,24,39,.55)';c.fillRect(0,0,w,h);c.fillStyle='#fff';c.font='900 22px Pretendard, sans-serif';c.textAlign='center';c.fillText(text,w/2,h/2);c.restore();
  }

  const oldSetMainView=setMainView;
  setMainView=function(view){
    if(view==='jump'){
      currentMainView='jump';
      ['homeView','budgetListView','budgetView','tetrisView','dinoView','bambooView','guestbookView'].forEach(id=>{const el=jumpSafeEl(id);if(el)el.classList.remove('active')});
      const j=jumpSafeEl('jumpView');if(j)j.classList.add('active');
      const add=jumpSafeEl('addBtn');if(add)add.style.display='none';
      ['showBudgetBtn','showTetrisBtn','showDinoBtn','showBambooBtn'].forEach(id=>{const el=jumpSafeEl(id);if(el)el.classList.remove('active')});
      const jb=jumpSafeEl('showJumpBtn');if(jb)jb.classList.add('active');
      closeDrawer();bindJump();jumpDraw();return;
    }
    oldSetMainView(view);
    const j=jumpSafeEl('jumpView');if(j)j.classList.remove('active');
    const jb=jumpSafeEl('showJumpBtn');if(jb)jb.classList.remove('active');
  };

  const oldUpdateGithubStatus=updateGithubStatus;
  updateGithubStatus=function(){
    oldUpdateGithubStatus();
    if(githubStatus&&githubStatus.textContent&&!githubStatus.textContent.includes('jump_players')){
      githubStatus.textContent=githubStatus.textContent.replace('game_scores / budget_sheets / app_meta / guestbook','game_scores / budget_sheets / app_meta / guestbook / jump_players / jump_stage_clears');
    }
  };
  const oldTestGithubConnection=testGithubConnection;
  testGithubConnection=async function(){
    try{
      await oldTestGithubConnection();
      await sbFetch('/jump_players?select=id&limit=1');
      await sbFetch('/jump_stage_clears?select=id&limit=1');
      jumpShowToast('Supabase + 점프맵 테이블 연결 성공');
    }catch(e){lastGithubError=jumpErr(e);lastSyncText=`점프맵 테이블 확인 실패 ${nowText()}`;updateGithubStatus();alert('점프맵 테이블 확인 실패: '+lastGithubError+'\n전달한 supabase_jumpmap.sql을 먼저 실행해줘.');}
  };
  if(jumpSafeEl('testGithubBtn'))jumpSafeEl('testGithubBtn').onclick=testGithubConnection;

  installJumpDom();
  bindClick('homeJumpCard',()=>setMainView('jump'));
  bindClick('showJumpBtn',()=>setMainView('jump'));
  setMainView(currentMainView||'home');
})();

/* Omok Online Supabase Add-on */
(function(){
  const OMOK_SIZE=15;
  const OMOK_TURN_SECONDS=30;
  const OMOK_NAME_KEY='jbaaaam_omok_player_name_v1';
  const OMOK_ROOM_KEY='jbaaaam_omok_last_room_v1';
  const omokSafe=id=>document.getElementById(id);
  const omokHtml=s=>String(s==null?'':s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const omokErr=e=>e&&e.message?e.message:String(e||'알 수 없는 오류');
  let omokReady=false, omokCanvas=null, omokCtx=null, omokRoom=null, omokMoves=[], omokPlayerName='', omokStone='', omokRealtimeClient=null, omokChannel=null, omokPollTimer=null, omokClockTimer=null, omokLastHash='', omokPlaceBusy=false;
  function omokToast(msg,type){ if(typeof showToast==='function')showToast(msg,type); else console.log(msg); }
  function omokRandomCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)]; return s; }
  function omokStoneText(stone){return stone==='black'?'흑':stone==='white'?'백':'관전';}
  function omokMyTurn(){return omokRoom&&omokRoom.status==='playing'&&omokStone&&omokRoom.current_turn===omokStone&&!omokRoom.winner;}
  function omokGetTurnStartMs(){
    if(!omokRoom||omokRoom.status!=='playing'||omokRoom.winner)return 0;
    const last=omokMoves&&omokMoves.length?omokMoves[omokMoves.length-1]:null;
    const raw=(last&&last.created_at)||omokRoom.updated_at||omokRoom.created_at;
    const ms=raw?new Date(raw).getTime():0;
    return Number.isFinite(ms)?ms:0;
  }
  function omokTurnSecondsLeft(){
    const start=omokGetTurnStartMs();
    if(!start)return OMOK_TURN_SECONDS;
    const elapsed=Math.floor((Date.now()-start)/1000);
    return Math.max(0,OMOK_TURN_SECONDS-elapsed);
  }
  function omokIsTurnExpired(){return omokRoom&&omokRoom.status==='playing'&&!omokRoom.winner&&omokTurnSecondsLeft()<=0;}
  function omokResultText(){
    if(!omokRoom||!omokRoom.winner)return '';
    if(!omokStone)return `${omokStoneText(omokRoom.winner)} 승리`;
    return omokRoom.winner===omokStone?'WIN':'LOSE';
  }
  function omokEnsureClock(){
    clearInterval(omokClockTimer);
    omokClockTimer=setInterval(()=>{ if(currentMainView==='omok'&&omokRoom)omokUpdateTurnDisplay(); },500);
  }
  function omokUpdateTurnDisplay(){
    const turn=omokSafe('omokTurnChip');
    if(!turn||!omokRoom)return;
    const b=turn.querySelector('b');
    turn.classList.remove('danger','result-win','result-lose');
    if(omokRoom.winner){
      const rt=omokResultText();
      if(b)b.textContent=rt||`${omokStoneText(omokRoom.winner)} 승리`;
      turn.classList.add(rt==='WIN'?'result-win':rt==='LOSE'?'result-lose':'win');
      return;
    }
    if(omokRoom.status==='waiting'){ if(b)b.textContent='대기'; return; }
    const left=omokTurnSecondsLeft();
    const expired=left<=0;
    if(b)b.textContent=expired?'빨간불':`${omokStoneText(omokRoom.current_turn)} ${left}s`;
    turn.classList.toggle('danger',expired);
  }
  function omokGetName(){ const input=omokSafe('omokNameInput'); return String((input&&input.value)||omokPlayerName||'').trim().slice(0,20); }
  function omokSetStatus(text){ const el=omokSafe('omokStatusText'); if(el)el.textContent=text; }
  function omokInstallCss(){ if(document.getElementById('omokStyleAddon'))return; const st=document.createElement('style'); st.id='omokStyleAddon'; st.textContent=`
    .omok-page{padding-bottom:20px}.omok-panel{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:14px;box-shadow:0 4px 14px rgba(15,23,42,.05);margin-bottom:12px}.omok-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.omok-actions.three{grid-template-columns:1fr 1fr 1fr}.omok-btn{height:44px;border:0;border-radius:14px;background:#111827;color:#fff;font-weight:950;cursor:pointer}.omok-btn.ghost{background:#f3f4f6;color:#374151}.omok-btn.warn{background:#fee2e2;color:#b91c1c}.omok-meta{font-size:12px;color:#6b7280;line-height:1.45;margin-top:8px;white-space:pre-line}.omok-room-code{display:inline-flex;align-items:center;gap:6px;background:#111827;color:#fff;border-radius:999px;padding:7px 10px;font-size:13px;font-weight:950}.omok-board-wrap{background:#111827;border-radius:22px;padding:10px;margin:12px auto;max-width:480px}.omok-board-head{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}.omok-chip{background:rgba(255,255,255,.09);border-radius:14px;padding:8px;color:#fff;text-align:center;font-size:12px;font-weight:850;min-height:46px}.omok-chip b{display:block;font-size:15px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.omok-chip.active{outline:2px solid #facc15}.omok-chip.win{background:#166534}.omok-chip.danger{background:#991b1b;outline:2px solid #ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.26)}.omok-chip.danger b{color:#fff}.omok-chip.result-win{background:#15803d;outline:2px solid #86efac}.omok-chip.result-lose{background:#991b1b;outline:2px solid #fecaca}.omok-canvas-box{background:#d8a94b;border-radius:16px;padding:8px;display:flex;justify-content:center;touch-action:none}.omok-canvas{width:100%;max-width:430px;height:auto;border-radius:10px;display:block;touch-action:none}.omok-log{max-height:154px;overflow:auto;display:flex;flex-direction:column;gap:6px}.omok-move{display:grid;grid-template-columns:38px 1fr auto;gap:8px;align-items:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:8px 10px;font-size:13px}.omok-stone-mini{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:950}.omok-stone-mini.black{background:#111827;color:#fff}.omok-stone-mini.white{background:#fff;color:#111827;border:1px solid #9ca3af}.omok-empty{text-align:center;color:#9ca3af;padding:18px 8px;background:#fff;border:1px dashed #d1d5db;border-radius:16px}.omok-open-room{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:10px;margin-top:8px}.omok-open-room-title{font-weight:950}.omok-open-room-sub{font-size:12px;color:#6b7280;margin-top:2px}.omok-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.omok-stat-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:10px;text-align:center}.omok-stat-card small{display:block;color:#6b7280;font-size:11px;font-weight:800}.omok-stat-card b{display:block;font-size:20px;margin-top:4px}.omok-history{display:flex;flex-direction:column;gap:7px}.omok-history-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:9px 10px;font-size:13px}.omok-history-row b{font-weight:950}.omok-history-sub{font-size:12px;color:#6b7280;margin-top:3px}.omok-rank-list{display:flex;flex-direction:column;gap:7px;margin-top:8px}.omok-rank-row{display:grid;grid-template-columns:38px 1fr auto;gap:9px;align-items:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:9px 10px;font-size:13px}.omok-rank-no{width:28px;height:28px;border-radius:999px;background:#111827;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:950}.omok-rank-name{font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.omok-rank-sub{font-size:12px;color:#6b7280;margin-top:2px}.omok-rank-rate{font-weight:950;color:#111827}.omok-result-win{color:#15803d;font-weight:950}.omok-result-lose{color:#b91c1c;font-weight:950}.omok-result-neutral{color:#374151;font-weight:950}`; document.head.appendChild(st); }
  function omokInstallDom(){ if(omokSafe('omokView'))return; omokInstallCss(); const app=document.querySelector('.app')||document.body; const grid=document.querySelector('.app-grid'); if(grid&&!omokSafe('homeOmokCard')){ const card=document.createElement('button'); card.type='button'; card.id='homeOmokCard'; card.className='app-card'; card.innerHTML='<div class="app-icon">⚫</div><div><div class="app-name">오목</div><div class="app-desc">실시간 1:1 대전</div></div>'; card.onclick=()=>setMainView('omok'); grid.appendChild(card); }
    const jumpBtn=omokSafe('showJumpBtn')||omokSafe('showBambooBtn'); if(jumpBtn&&!omokSafe('showOmokBtn')){ const btn=document.createElement('button'); btn.type='button'; btn.id='showOmokBtn'; btn.className='menu-section-btn'; btn.innerHTML='오목<br><small>실시간 대전</small>'; btn.onclick=()=>setMainView('omok'); jumpBtn.insertAdjacentElement('afterend',btn); }
    const view=document.createElement('section'); view.id='omokView'; view.className='view-page omok-page'; view.innerHTML=`
      <div class="header"><button class="menu-btn" id="menuBtnOmok">☰</button><div class="title-area"><div class="title">오목</div><div class="subtitle">Supabase로 다른 사람이랑 실시간 1:1 대전</div></div><button class="name-btn" id="omokRefreshBtn">새로고침</button></div>
      <div class="omok-panel"><div class="section-title">대전 준비</div><div class="field"><label>내 이름</label><input id="omokNameInput" class="input" maxlength="20" placeholder="예: 진범"></div><div class="field"><label>방 코드</label><input id="omokRoomInput" class="input" maxlength="12" placeholder="입장할 코드 입력"></div><div class="omok-actions three"><button id="omokCreateBtn" class="omok-btn">방 만들기</button><button id="omokJoinBtn" class="omok-btn ghost">입장</button><button id="omokOpenRoomsBtn" class="omok-btn ghost">방 목록</button></div><div class="omok-meta" id="omokStatusText">이름을 입력하고 방을 만들거나 입장해줘.</div><div id="omokOpenRooms" style="display:none"></div></div>
      <div class="omok-panel"><div class="section-title-row"><div class="section-title">내 전적</div><button id="omokStatsRefreshBtn" class="tiny-btn" type="button">갱신</button></div><div class="omok-stat-grid"><div class="omok-stat-card"><small>승</small><b id="omokWins">0</b></div><div class="omok-stat-card"><small>패</small><b id="omokLosses">0</b></div><div class="omok-stat-card"><small>승률</small><b id="omokWinRate">0%</b></div></div><div class="omok-meta" id="omokStatsMeta">이름을 입력하면 개인 전적을 불러와.</div></div>
      <div class="omok-board-wrap"><div class="omok-board-head"><div class="omok-chip" id="omokBlackChip">흑<b>-</b></div><div class="omok-chip" id="omokTurnChip">차례<b>-</b></div><div class="omok-chip" id="omokWhiteChip">백<b>-</b></div></div><div class="omok-canvas-box"><canvas id="omokCanvas" class="omok-canvas" width="450" height="450"></canvas></div><div class="omok-actions"><button id="omokCopyCodeBtn" class="omok-btn ghost">코드 복사</button><button id="omokLeaveBtn" class="omok-btn warn">나가기</button></div></div>
      <div class="omok-panel"><div class="section-title-row"><div class="section-title">착수 기록</div><span class="omok-room-code" id="omokRoomCodeBadge">NO ROOM</span></div><div class="omok-log" id="omokMoveList"><div class="omok-empty">아직 진행 중인 방이 없어.</div></div></div>
      <div class="omok-panel"><div class="section-title-row"><div class="section-title">최근 전적 이력 <small style="font-size:11px;color:#6b7280">전체 공개</small></div><button id="omokHistoryRefreshBtn" class="tiny-btn" type="button">갱신</button></div><div class="omok-history" id="omokRecentHistory"><div class="omok-empty">아직 전적 이력이 없어.</div></div></div>
      <div class="omok-panel"><div class="section-title-row"><div class="section-title">전체 유저 전적</div><button id="omokAllStatsRefreshBtn" class="tiny-btn" type="button">갱신</button></div><div class="omok-meta">이름 기준으로 완료된 대국 승/패를 집계해. 같은 이름은 같은 유저로 처리돼.</div><div class="omok-rank-list" id="omokAllStatsList"><div class="omok-empty">아직 유저 전적이 없어.</div></div></div>`;
    const anchor=omokSafe('jumpView')||omokSafe('bambooView')||document.querySelector('.view-page:last-of-type'); if(anchor&&anchor.parentNode)anchor.insertAdjacentElement('afterend',view); else app.appendChild(view);
  }
  function omokBind(){ if(omokReady)return; omokReady=true; omokCanvas=omokSafe('omokCanvas'); omokCtx=omokCanvas.getContext('2d'); const nm=localStorage.getItem(OMOK_NAME_KEY)||''; const code=localStorage.getItem(OMOK_ROOM_KEY)||''; if(omokSafe('omokNameInput'))omokSafe('omokNameInput').value=nm; if(omokSafe('omokRoomInput'))omokSafe('omokRoomInput').value=code; omokSafe('menuBtnOmok').onclick=openDrawer; omokSafe('omokCreateBtn').onclick=omokCreateRoom; omokSafe('omokJoinBtn').onclick=()=>omokJoinRoom((omokSafe('omokRoomInput').value||'').trim()); omokSafe('omokRefreshBtn').onclick=()=>omokRefreshAll(true); omokSafe('omokOpenRoomsBtn').onclick=omokToggleOpenRooms; omokSafe('omokCopyCodeBtn').onclick=omokCopyCode; omokSafe('omokLeaveBtn').onclick=omokLeaveRoom; if(omokSafe('omokStatsRefreshBtn'))omokSafe('omokStatsRefreshBtn').onclick=()=>omokLoadStatsAndHistory(true); if(omokSafe('omokHistoryRefreshBtn'))omokSafe('omokHistoryRefreshBtn').onclick=()=>omokLoadStatsAndHistory(true); if(omokSafe('omokAllStatsRefreshBtn'))omokSafe('omokAllStatsRefreshBtn').onclick=()=>omokLoadStatsAndHistory(true); omokCanvas.addEventListener('pointerdown',omokHandleBoard,{passive:false}); if(!window.PointerEvent)omokCanvas.addEventListener('touchstart',omokHandleBoard,{passive:false}); omokSafe('omokNameInput').addEventListener('input',()=>{omokPlayerName=omokGetName();}); omokSafe('omokNameInput').addEventListener('blur',()=>omokLoadStatsAndHistory(false)); omokSafe('omokNameInput').addEventListener('keydown',e=>{if(e.key==='Enter')omokCreateRoom();}); omokSafe('omokRoomInput').addEventListener('keydown',e=>{if(e.key==='Enter')omokJoinRoom((omokSafe('omokRoomInput').value||'').trim());}); if(code&&nm)omokJoinRoom(code,{silent:true}); else {omokDraw(); omokEnsureClock();} }
  async function omokCreateRoom(){ const name=omokGetName(); if(!name){omokSafe('omokNameInput').focus();omokToast('이름을 입력해줘','error');return;} localStorage.setItem(OMOK_NAME_KEY,name); omokPlayerName=name; let code=omokRandomCode(); for(let i=0;i<5;i++){ try{ const rows=await sbFetch('/omok_rooms?select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{room_code:code,status:'waiting',black_name:name,current_turn:'black'}])}); if(rows&&rows[0]){ await omokSetRoom(rows[0]); omokStone='black'; omokToast(`방 생성 완료: ${code}`); return; } }catch(e){ if(!String(omokErr(e)).includes('duplicate'))throw e; code=omokRandomCode(); } } }
  async function omokJoinRoom(code,{silent=false}={}){ const name=omokGetName(); code=String(code||'').trim().toUpperCase(); if(!name){omokSafe('omokNameInput').focus();omokToast('이름을 입력해줘','error');return;} if(!code){omokSafe('omokRoomInput').focus();omokToast('방 코드를 입력해줘','error');return;} try{ localStorage.setItem(OMOK_NAME_KEY,name); localStorage.setItem(OMOK_ROOM_KEY,code); omokPlayerName=name; const rows=await sbFetch('/rpc/join_omok_room',{method:'POST',body:JSON.stringify({p_room_code:code,p_player_name:name})}); const room=Array.isArray(rows)?rows[0]:rows; if(!room||!room.id)throw new Error('방을 찾을 수 없어.'); await omokSetRoom(room); if(room.black_name===name)omokStone='black'; else if(room.white_name===name)omokStone='white'; else omokStone=''; if(!silent)omokToast(`${code} 입장 완료 · 나는 ${omokStoneText(omokStone)}`); }catch(e){console.error(e);omokToast('입장 실패: '+omokErr(e),'error');omokSetStatus('입장 실패: '+omokErr(e));} }
  async function omokSetRoom(room){ omokRoom=room; if(omokSafe('omokRoomInput'))omokSafe('omokRoomInput').value=room.room_code||''; localStorage.setItem(OMOK_ROOM_KEY,room.room_code||''); await omokLoadMoves(); await omokLoadStatsAndHistory(false); omokRender(); omokEnsureClock(); await omokSubscribe(); omokStartPolling(); }
  async function omokLoadRoom(){ if(!omokRoom)return; const rows=await sbFetch(`/omok_rooms?select=*&id=eq.${encodeURIComponent(omokRoom.id)}&limit=1`); if(rows&&rows[0])omokRoom=rows[0]; }
  async function omokLoadMoves(){ if(!omokRoom)return; const rows=await sbFetch(`/omok_moves?select=move_no,x,y,stone,player_name,created_at&room_id=eq.${encodeURIComponent(omokRoom.id)}&order=move_no.asc&limit=300`); omokMoves=Array.isArray(rows)?rows:[]; }
  async function omokRefreshAll(manual=false){ try{ if(!omokRoom){ if(manual)await omokToggleOpenRooms(true); omokDraw(); return; } await omokLoadRoom(); await omokLoadMoves(); await omokLoadStatsAndHistory(false); omokRender(); if(manual)omokToast('오목 새로고침 완료'); }catch(e){console.error(e); if(manual)omokToast('새로고침 실패: '+omokErr(e),'error');} }
  async function omokSubscribe(){ if(!omokRoom||omokChannel)return; try{ await omokLoadRealtimeClient(); if(!omokRealtimeClient)return; omokChannel=omokRealtimeClient.channel('omok-room-'+omokRoom.id).on('postgres_changes',{event:'*',schema:'public',table:'omok_moves',filter:'room_id=eq.'+omokRoom.id},()=>omokRefreshAll()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'omok_rooms',filter:'id=eq.'+omokRoom.id},()=>omokRefreshAll()).subscribe(); omokSetStatus('실시간 연결됨 · 상대 착수는 자동 반영돼.'); }catch(e){console.warn('Realtime fallback to polling',e);omokSetStatus('실시간 스크립트 실패 · 1초 새로고침으로 대체 중');} }
  function omokLoadRealtimeClient(){ return new Promise(resolve=>{ if(window.supabase&&SUPABASE_URL&&SUPABASE_ANON_KEY){ omokRealtimeClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY); resolve(omokRealtimeClient); return; } const old=document.getElementById('supabaseJsV2'); if(old){old.addEventListener('load',()=>resolve(window.supabase?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null));old.addEventListener('error',()=>resolve(null));return;} const s=document.createElement('script'); s.id='supabaseJsV2'; s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; s.onload=()=>{omokRealtimeClient=window.supabase?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;resolve(omokRealtimeClient);}; s.onerror=()=>resolve(null); document.head.appendChild(s); setTimeout(()=>resolve(omokRealtimeClient),5000); }); }
  function omokStartPolling(){ clearInterval(omokPollTimer); omokPollTimer=setInterval(async()=>{ if(currentMainView==='omok'&&omokRoom){ const hash=(omokRoom.updated_at||'')+'|'+omokMoves.length+'|'+(omokMoves[omokMoves.length-1]?.move_no||0); await omokRefreshAll(false); const newHash=(omokRoom.updated_at||'')+'|'+omokMoves.length+'|'+(omokMoves[omokMoves.length-1]?.move_no||0); if(newHash!==hash)omokRender(); } },1200); }
  async function omokPlace(x,y){
    if(omokPlaceBusy)return;
    if(!omokRoom){omokToast('먼저 방을 만들거나 입장해줘','error');return;}
    if(!omokStone){omokToast('관전자는 둘 수 없어','error');return;}
    if(omokRoom.status==='waiting'){omokToast('상대를 기다리는 중이야','error');return;}
    if(omokRoom.status==='finished'||omokRoom.winner){omokToast('이미 끝난 대국이야','error');return;}
    try{
      omokPlaceBusy=true;
      const rows=await sbFetch('/rpc/place_omok_move',{method:'POST',body:JSON.stringify({p_room_id:omokRoom.id,p_player_name:omokPlayerName,p_x:x,p_y:y})});
      const room=Array.isArray(rows)?rows[0]:rows;
      if(room&&room.id)omokRoom=room;
      await omokRefreshAll(false);
    }catch(e){
      console.error(e);
      omokToast('둘 수 없음: '+omokErr(e),'error');
      await omokRefreshAll(false);
    }finally{
      omokPlaceBusy=false;
    }
  }
  function omokHandleBoard(e){ if(e&&e.cancelable)e.preventDefault(); const rect=omokCanvas.getBoundingClientRect(); const p=e.touches&&e.touches[0]?e.touches[0]:e; const px=(p.clientX-rect.left)*(omokCanvas.width/rect.width); const py=(p.clientY-rect.top)*(omokCanvas.height/rect.height); const pad=28, gap=(omokCanvas.width-pad*2)/(OMOK_SIZE-1); const x=Math.round((px-pad)/gap); const y=Math.round((py-pad)/gap); if(x<0||x>=OMOK_SIZE||y<0||y>=OMOK_SIZE)return; omokPlace(x,y); }

  function omokSetText(id,txt){ const el=omokSafe(id); if(el)el.textContent=txt; }
  function omokPct(w,g){ g=Number(g)||0; return g?Math.round((Number(w)||0)*100/g)+'%':'0%'; }
  async function omokLoadStatsAndHistory(manual=false){
    const name=omokGetName();
    omokPlayerName=name||omokPlayerName;
    try{
      if(name){
        const statRows=await sbFetch(`/omok_player_stats?select=*&player_name=eq.${encodeURIComponent(name)}&limit=1`);
        const st=(Array.isArray(statRows)&&statRows[0])?statRows[0]:{games:0,wins:0,losses:0,win_rate:0};
        const games=Number(st.games)||0, wins=Number(st.wins)||0, losses=Number(st.losses)||0;
        omokSetText('omokWins',String(wins)); omokSetText('omokLosses',String(losses)); omokSetText('omokWinRate',games?`${Math.round(Number(st.win_rate)||((wins*100)/games))}%`:'0%');
        omokSetText('omokStatsMeta',games?`${name} · 총 ${games}전 ${wins}승 ${losses}패`:`${name} · 아직 완료된 대국이 없어.`);
      }else{
        omokSetText('omokWins','0'); omokSetText('omokLosses','0'); omokSetText('omokWinRate','0%'); omokSetText('omokStatsMeta','이름을 입력하면 개인 전적을 불러와. 아래 최근 전적/전체 유저 전적은 모두에게 공개돼.');
      }
      const recentRows=await sbFetch('/omok_recent_matches?select=*&order=finished_at.desc&limit=12');
      omokRenderHistory(Array.isArray(recentRows)?recentRows:[],name);
      const allStats=await sbFetch('/omok_player_stats?select=*&order=wins.desc,games.desc,player_name.asc&limit=30');
      omokRenderAllStats(Array.isArray(allStats)?allStats:[],name);
      if(manual)omokToast('오목 전적 갱신 완료');
    }catch(e){
      console.error(e);
      omokSetText('omokStatsMeta','전적 로딩 실패: '+omokErr(e));
      const h=omokSafe('omokRecentHistory'); if(h)h.innerHTML=`<div class="omok-empty">최근 전적 로딩 실패<br>${omokHtml(omokErr(e))}</div>`;
      const a=omokSafe('omokAllStatsList'); if(a)a.innerHTML=`<div class="omok-empty">전체 유저 전적 로딩 실패<br>${omokHtml(omokErr(e))}</div>`;
      if(manual)omokToast('전적 갱신 실패: '+omokErr(e),'error');
    }
  }
  function omokRenderHistory(rows,name){
    const h=omokSafe('omokRecentHistory'); if(!h)return;
    if(!rows.length){ h.innerHTML='<div class="omok-empty">아직 완료된 대국이 없어.</div>'; return; }
    h.innerHTML=rows.map(r=>{
      const black=r.black_name||'-', white=r.white_name||'-', winner=r.winner_name||'-';
      const loser=String(winner)===String(black)?white:black;
      const mine=name&&(String(black)===String(name)||String(white)===String(name));
      const myWin=mine&&String(winner)===String(name);
      const cls=mine?(myWin?'omok-result-win':'omok-result-lose'):'omok-result-neutral';
      const label=mine?(myWin?'내 승리':'내 패배'):`${omokHtml(winner)} 승리`;
      const moves=Number(r.move_count)||0;
      const dt=omokFormatDate(r.finished_at||r.updated_at||r.created_at);
      return `<div class="omok-history-row"><div><b class="${cls}">${label}</b> · ${omokHtml(black)} vs ${omokHtml(white)}<div class="omok-history-sub">패자 ${omokHtml(loser)} · ${omokHtml(r.room_code||'')} · ${moves}수 · ${dt}</div></div><span>${omokStoneText(r.winner_stone)}</span></div>`;
    }).join('');
  }
  function omokRenderAllStats(rows,name){
    const box=omokSafe('omokAllStatsList'); if(!box)return;
    if(!rows.length){ box.innerHTML='<div class="omok-empty">아직 유저 전적이 없어.</div>'; return; }
    box.innerHTML=rows.map((r,i)=>{
      const player=String(r.player_name||'익명');
      const games=Number(r.games)||0, wins=Number(r.wins)||0, losses=Number(r.losses)||0;
      const rate=games?Math.round(Number(r.win_rate)||((wins*100)/games)):0;
      const mine=name&&player===String(name);
      return `<div class="omok-rank-row"${mine?' style="outline:2px solid #facc15"':''}><span class="omok-rank-no">${i+1}</span><div><div class="omok-rank-name">${omokHtml(player)}${mine?' · 나':''}</div><div class="omok-rank-sub">${games}전 ${wins}승 ${losses}패</div></div><span class="omok-rank-rate">${rate}%</span></div>`;
    }).join('');
  }
  function omokFormatDate(iso){
    const d=new Date(iso); if(Number.isNaN(d.getTime()))return '';
    const mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'), hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
    return `${mm}.${dd} ${hh}:${mi}`;
  }
  async function omokToggleOpenRooms(force=false){ const box=omokSafe('omokOpenRooms'); if(!box)return; if(!force&&box.style.display!=='none'){box.style.display='none';return;} box.style.display='block'; box.innerHTML='<div class="omok-empty">방 목록 불러오는 중...</div>'; try{ const rows=await sbFetch('/omok_rooms?select=id,room_code,status,black_name,white_name,updated_at&status=eq.waiting&order=updated_at.desc&limit=8'); if(!rows||!rows.length){box.innerHTML='<div class="omok-empty">대기 중인 방이 없어. 방을 하나 만들어줘.</div>';return;} box.innerHTML=rows.map(r=>`<div class="omok-open-room"><div><div class="omok-open-room-title">${omokHtml(r.room_code)} · ${omokHtml(r.black_name||'흑')}</div><div class="omok-open-room-sub">상대 기다리는 중</div></div><button class="omok-btn ghost" data-code="${omokHtml(r.room_code)}">입장</button></div>`).join(''); box.querySelectorAll('[data-code]').forEach(btn=>btn.onclick=()=>omokJoinRoom(btn.dataset.code)); }catch(e){box.innerHTML=`<div class="omok-empty">방 목록 실패<br>${omokHtml(omokErr(e))}</div>`;} }
  function omokCopyCode(){ const code=omokRoom&&omokRoom.room_code; if(!code){omokToast('복사할 방 코드가 없어','error');return;} navigator.clipboard?.writeText(code); omokToast('방 코드 복사 완료: '+code); }
  function omokLeaveRoom(){ if(omokChannel&&omokRealtimeClient){try{omokRealtimeClient.removeChannel(omokChannel);}catch{}} omokChannel=null; omokRoom=null; omokMoves=[]; omokStone=''; omokLastHash=''; clearInterval(omokPollTimer); clearInterval(omokClockTimer); omokRender(); omokToast('오목방에서 나왔어'); }
  function omokRender(){ const code=omokRoom?omokRoom.room_code:'NO ROOM'; const badge=omokSafe('omokRoomCodeBadge'); if(badge)badge.textContent=code; const black=omokSafe('omokBlackChip'), white=omokSafe('omokWhiteChip'), turn=omokSafe('omokTurnChip'); if(black){black.querySelector('b').textContent=omokRoom?.black_name||'-'; black.classList.toggle('active',omokRoom?.current_turn==='black'&&!omokRoom?.winner); black.classList.toggle('win',omokRoom?.winner==='black');} if(white){white.querySelector('b').textContent=omokRoom?.white_name||'-'; white.classList.toggle('active',omokRoom?.current_turn==='white'&&!omokRoom?.winner); white.classList.toggle('win',omokRoom?.winner==='white');} if(turn){ turn.classList.remove('win','danger','result-win','result-lose'); omokUpdateTurnDisplay(); }
    if(omokRoom){ if(omokRoom.status==='waiting')omokSetStatus(`방 코드 ${code} · 상대가 입장하면 시작돼. 나는 ${omokStoneText(omokStone)}.`); else if(omokRoom.winner){ const rt=omokResultText(); const detail=`${omokStoneText(omokRoom.winner)} 승리 · ${omokRoom.win_reason||'5목 완성'}`; omokSetStatus(rt==='WIN'?`WIN · 승리했어. ${detail}`:rt==='LOSE'?`LOSE · 패배했어. ${detail}`:detail); } else { const left=omokTurnSecondsLeft(); const over=left<=0; omokSetStatus(`${code} · 나는 ${omokStoneText(omokStone)} · ${omokMyTurn()?'내 차례':'상대 차례'} · ${over?'빨간불':`남은 시간 ${left}초`}`); } } else omokSetStatus('이름을 입력하고 방을 만들거나 입장해줘.');
    const list=omokSafe('omokMoveList'); if(list){ if(!omokMoves.length)list.innerHTML='<div class="omok-empty">아직 착수 기록이 없어.</div>'; else list.innerHTML=omokMoves.slice().reverse().map(m=>`<div class="omok-move"><span class="omok-stone-mini ${m.stone}">${m.move_no}</span><div>${omokHtml(m.player_name)} · ${omokStoneText(m.stone)}</div><b>${String.fromCharCode(65+Number(m.x))}${Number(m.y)+1}</b></div>`).join(''); }
    omokDraw(); }
  function omokDraw(){ if(!omokCtx||!omokCanvas)return; const c=omokCtx, W=omokCanvas.width, H=omokCanvas.height, pad=28, gap=(W-pad*2)/(OMOK_SIZE-1); c.clearRect(0,0,W,H); c.fillStyle='#d8a94b'; c.fillRect(0,0,W,H); c.strokeStyle='rgba(17,24,39,.78)'; c.lineWidth=1.4; for(let i=0;i<OMOK_SIZE;i++){ const p=pad+i*gap; c.beginPath();c.moveTo(p,pad);c.lineTo(p,H-pad);c.stroke(); c.beginPath();c.moveTo(pad,p);c.lineTo(W-pad,p);c.stroke(); } const stars=[[3,3],[11,3],[7,7],[3,11],[11,11]]; c.fillStyle='rgba(17,24,39,.75)'; stars.forEach(([x,y])=>{c.beginPath();c.arc(pad+x*gap,pad+y*gap,4,0,Math.PI*2);c.fill();}); omokMoves.forEach((m,i)=>{ const x=pad+Number(m.x)*gap, y=pad+Number(m.y)*gap; const r=gap*.38; const g=c.createRadialGradient(x-r*.35,y-r*.35,2,x,y,r); if(m.stone==='black'){g.addColorStop(0,'#4b5563');g.addColorStop(1,'#030712');} else {g.addColorStop(0,'#fff');g.addColorStop(1,'#d1d5db');} c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.strokeStyle=m.stone==='black'?'#000':'#9ca3af';c.lineWidth=1.5;c.stroke(); if(i===omokMoves.length-1){c.strokeStyle='#ef4444';c.lineWidth=3;c.beginPath();c.arc(x,y,r+4,0,Math.PI*2);c.stroke();} }); if(!omokRoom){ c.fillStyle='rgba(17,24,39,.72)'; c.fillRect(0,0,W,H); c.fillStyle='#fff'; c.font='900 22px Pretendard, sans-serif'; c.textAlign='center'; c.fillText('방을 만들거나 입장해줘',W/2,H/2); } else if(omokRoom.status==='waiting'){ c.fillStyle='rgba(17,24,39,.48)'; c.fillRect(0,0,W,H); c.fillStyle='#fff'; c.font='900 22px Pretendard, sans-serif'; c.textAlign='center'; c.fillText('상대 기다리는 중',W/2,H/2-12); c.font='800 17px Pretendard, sans-serif'; c.fillText('방 코드 '+omokRoom.room_code,W/2,H/2+20); } else if(omokRoom.winner){ const rt=omokResultText(); c.fillStyle=rt==='WIN'?'rgba(22,101,52,.78)':rt==='LOSE'?'rgba(153,27,27,.78)':'rgba(17,24,39,.62)'; c.fillRect(0,0,W,H); c.fillStyle='#fff'; c.textAlign='center'; c.font='1000 48px Pretendard, sans-serif'; c.fillText(rt||`${omokStoneText(omokRoom.winner)} 승리`,W/2,H/2-8); c.font='900 18px Pretendard, sans-serif'; c.fillText(`${omokStoneText(omokRoom.winner)} 승리 · ${omokRoom.win_reason||'5목 완성'}`,W/2,H/2+30); } else if(omokIsTurnExpired()){ c.fillStyle='rgba(239,68,68,.22)'; c.fillRect(0,0,W,H); c.fillStyle='#ef4444'; c.beginPath(); c.arc(W-34,34,13,0,Math.PI*2); c.fill(); c.fillStyle='#fff'; c.font='900 13px Pretendard, sans-serif'; c.textAlign='center'; c.fillText('!',W-34,39); } }
  const oldSetMainView=setMainView; setMainView=function(view){ if(view==='omok'){ currentMainView='omok'; ['homeView','budgetListView','budgetView','tetrisView','dinoView','bambooView','jumpView','guestbookView'].forEach(id=>{const el=omokSafe(id);if(el)el.classList.remove('active');}); const v=omokSafe('omokView'); if(v)v.classList.add('active'); const add=omokSafe('addBtn'); if(add)add.style.display='none'; ['showBudgetBtn','showTetrisBtn','showDinoBtn','showBambooBtn','showJumpBtn'].forEach(id=>{const el=omokSafe(id);if(el)el.classList.remove('active');}); const b=omokSafe('showOmokBtn'); if(b)b.classList.add('active'); closeDrawer(); omokBind(); omokLoadStatsAndHistory(false); omokDraw(); omokEnsureClock(); return; } oldSetMainView(view); const v=omokSafe('omokView'); if(v)v.classList.remove('active'); const b=omokSafe('showOmokBtn'); if(b)b.classList.remove('active'); };
  if(typeof updateGithubStatus==='function'){ const oldUpdate=updateGithubStatus; updateGithubStatus=function(){ oldUpdate(); if(githubStatus&&githubStatus.textContent&&!githubStatus.textContent.includes('omok_rooms')) githubStatus.textContent=githubStatus.textContent.replace('jump_players / jump_stage_clears','jump_players / jump_stage_clears / omok_rooms / omok_moves'); }; }
  if(typeof testGithubConnection==='function'){ const oldTest=testGithubConnection; testGithubConnection=async function(){ await oldTest(); try{ await sbFetch('/omok_rooms?select=id&limit=1'); await sbFetch('/omok_moves?select=id&limit=1'); await sbFetch('/omok_player_stats?select=player_name&limit=1'); await sbFetch('/omok_recent_matches?select=room_code&limit=1'); omokToast('Supabase + 오목 테이블/전적 뷰 연결 성공'); }catch(e){ alert('오목 테이블 확인 실패: '+omokErr(e)+'\n전달한 supabase_omok.sql을 먼저 실행해줘.'); } }; const btn=omokSafe('testGithubBtn'); if(btn)btn.onclick=testGithubConnection; }
  omokInstallDom(); const hc=omokSafe('homeOmokCard'); if(hc)hc.onclick=()=>setMainView('omok'); const mb=omokSafe('showOmokBtn'); if(mb)mb.onclick=()=>setMainView('omok'); setMainView(currentMainView||'home');
})();

/* Drawer menu scroll fix: scroll the whole side menu, not each small section */
(function installDrawerMenuScrollFix(){
  const old=document.getElementById('drawerMenuScrollFixStyle');
  if(old)old.remove();
  const st=document.createElement('style');
  st.id='drawerMenuScrollFixStyle';
  st.textContent=`
    #drawerBackdrop.open{
      overflow-y:auto!important;
      overflow-x:hidden!important;
      -webkit-overflow-scrolling:touch!important;
      overscroll-behavior:contain!important;
      align-items:flex-start!important;
      padding-top:10px!important;
      padding-bottom:10px!important;
    }
    #drawerBackdrop > *{
      max-height:none!important;
      overflow:visible!important;
      flex-shrink:0!important;
    }
    #drawerBackdrop .drawer,
    #drawerBackdrop .drawer-panel,
    #drawerBackdrop .drawer-content,
    #drawerBackdrop .side-drawer,
    #drawerBackdrop .sheet-drawer,
    #drawerBackdrop .menu-drawer,
    #drawerBackdrop [class*="drawer"],
    #drawerBackdrop .sheet-list,
    #drawerBackdrop #sheetList,
    #drawerBackdrop .menu-section,
    #drawerBackdrop .menu-section-btn{
      max-height:none!important;
      overflow:visible!important;
      -webkit-overflow-scrolling:auto!important;
      overscroll-behavior:auto!important;
    }
    #drawerBackdrop .sheet-list,
    #drawerBackdrop #sheetList,
    #drawerBackdrop .menu-section,
    #drawerBackdrop .menu-section-btn{
      flex-shrink:0!important;
    }
    @supports(height:100dvh){
      #drawerBackdrop.open{max-height:100dvh!important;}
    }
  `;
  document.head.appendChild(st);
})();

/* Budget detail back button: return from selected personal ledger to budget list */
(function installBudgetDetailBackButton(){
  function byId(id){return document.getElementById(id)}
  function ensureBudgetBackButton(){
    const budgetView=byId('budgetView');
    const menuBtn=byId('menuBtn');
    if(!budgetView||!menuBtn)return;
    let btn=byId('budgetBackToListBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='budgetBackToListBtn';
      btn.type='button';
      btn.className='budget-back-btn';
      btn.innerHTML='← 목록';
      btn.title='지출표 목록으로 돌아가기';
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        if(typeof setMainView==='function')setMainView('budgetList');
      };
      if(menuBtn.parentNode)menuBtn.parentNode.insertBefore(btn,menuBtn.nextSibling);
      else budgetView.insertBefore(btn,budgetView.firstChild);
    }
    const isBudgetActive=budgetView.classList.contains('active') || (typeof currentMainView!=='undefined'&&currentMainView==='budget');
    btn.style.display=isBudgetActive?'inline-flex':'none';
  }
  if(!byId('budgetBackToListStyle')){
    const st=document.createElement('style');
    st.id='budgetBackToListStyle';
    st.textContent=`
      #budgetBackToListBtn.budget-back-btn{
        align-items:center;
        justify-content:center;
        min-width:58px;
        height:34px;
        margin-left:8px;
        padding:0 11px;
        border:1px solid rgba(15,23,42,.12);
        border-radius:999px;
        background:#fff;
        color:#111827;
        font-size:13px;
        font-weight:900;
        letter-spacing:-.03em;
        box-shadow:0 8px 18px rgba(15,23,42,.08);
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }
      #budgetBackToListBtn.budget-back-btn:active{transform:translateY(1px);}
      @media(max-width:420px){
        #budgetBackToListBtn.budget-back-btn{min-width:52px;height:32px;margin-left:6px;padding:0 9px;font-size:12px;}
      }
    `;
    document.head.appendChild(st);
  }
  const prevSetMainView=typeof setMainView==='function'?setMainView:null;
  if(prevSetMainView&&!prevSetMainView.__budgetBackPatched){
    const patched=function(view){
      const result=prevSetMainView.apply(this,arguments);
      setTimeout(ensureBudgetBackButton,0);
      return result;
    };
    patched.__budgetBackPatched=true;
    setMainView=patched;
  }
  const prevRender=typeof render==='function'?render:null;
  if(prevRender&&!prevRender.__budgetBackPatched){
    const patchedRender=function(){
      const result=prevRender.apply(this,arguments);
      ensureBudgetBackButton();
      return result;
    };
    patchedRender.__budgetBackPatched=true;
    render=patchedRender;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureBudgetBackButton,{once:true});
  else ensureBudgetBackButton();
  setTimeout(ensureBudgetBackButton,200);
})();

/* Bamboo joystick screen lock + control cleanup patch */
(function(){
  const BAMBOO_SCROLL_LOCK_KEY='jbaaaam_bamboo_scroll_lock_v1';
  let bambooScrollPatchBound=false;
  function bambooScrollLockEnabled(){ return localStorage.getItem(BAMBOO_SCROLL_LOCK_KEY)!=='N'; }
  function bambooSetScrollLockEnabled(on){ localStorage.setItem(BAMBOO_SCROLL_LOCK_KEY,on?'Y':'N'); bambooApplyScrollLockPatch(); }
  function bambooEnsureScrollPatchCss(){
    if(document.getElementById('bambooJoystickScrollPatchStyle'))return;
    const st=document.createElement('style');
    st.id='bambooJoystickScrollPatchStyle';
    st.textContent=`
      .bamboo-joystick-mode .bamboo-button-controls{display:none!important}
      .bamboo-scroll-toggle{display:none;margin-top:8px;width:100%;height:38px;border:0;border-radius:12px;background:#eef2ff;color:#3730a3;font-weight:950;cursor:pointer}
      .bamboo-joystick-mode .bamboo-scroll-toggle{display:block}
      body.bamboo-scroll-locked{overflow:hidden;overscroll-behavior:none;touch-action:none}
      body.bamboo-scroll-locked #bambooView{overscroll-behavior:none}
      body.bamboo-scroll-locked #bambooJoystickPad,body.bamboo-scroll-locked #bambooJoystickPad *{touch-action:none}
    `;
    document.head.appendChild(st);
  }
  function bambooGetButtonControls(){
    const up=document.getElementById('bambooUpBtn');
    if(!up)return null;
    return up.closest('.game-controls')||up.closest('.bamboo-controls')||up.parentElement;
  }
  function bambooEnsureControlCleanup(){
    bambooEnsureScrollPatchCss();
    const controls=bambooGetButtonControls();
    if(controls)controls.classList.add('bamboo-button-controls');
    const panel=document.getElementById('bambooControlPanel');
    if(panel&&!document.getElementById('bambooScrollLockBtn')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.id='bambooScrollLockBtn';
      btn.className='bamboo-scroll-toggle';
      btn.onclick=()=>bambooSetScrollLockEnabled(!bambooScrollLockEnabled());
      panel.appendChild(btn);
    }
    if(!bambooScrollPatchBound){
      bambooScrollPatchBound=true;
      document.addEventListener('touchmove',e=>{
        if(!document.body.classList.contains('bamboo-scroll-locked'))return;
        if(e.target&&e.target.closest&&e.target.closest('#drawerBackdrop.open,.modal-backdrop.open,.modal.open'))return;
        if(e.cancelable)e.preventDefault();
      },{passive:false});
      document.addEventListener('wheel',e=>{
        if(!document.body.classList.contains('bamboo-scroll-locked'))return;
        if(e.target&&e.target.closest&&e.target.closest('#drawerBackdrop.open,.modal-backdrop.open,.modal.open'))return;
        if(e.cancelable)e.preventDefault();
      },{passive:false});
    }
  }
  function bambooApplyScrollLockPatch(){
    bambooEnsureControlCleanup();
    const joystickMode=(typeof bambooControlMode!=='undefined'&&bambooControlMode==='joystick');
    const isBamboo=(typeof currentMainView!=='undefined'&&currentMainView==='bamboo');
    const lockOn=joystickMode&&isBamboo&&bambooScrollLockEnabled();
    document.body.classList.toggle('bamboo-scroll-locked',!!lockOn);
    const btn=document.getElementById('bambooScrollLockBtn');
    if(btn)btn.textContent=bambooScrollLockEnabled()?'화면 스크롤 고정 ON':'화면 스크롤 고정 OFF';
    const controls=bambooGetButtonControls();
    if(controls)controls.style.display=joystickMode?'none':'';
  }
  if(typeof applyBambooControlMode==='function'){
    const oldApplyBambooControlMode=applyBambooControlMode;
    applyBambooControlMode=function(){ oldApplyBambooControlMode(); bambooApplyScrollLockPatch(); };
  }
  if(typeof setBambooControlMode==='function'){
    const oldSetBambooControlMode=setBambooControlMode;
    setBambooControlMode=function(mode){ oldSetBambooControlMode(mode); bambooApplyScrollLockPatch(); };
  }
  if(typeof setMainView==='function'){
    const oldSetMainViewForBambooLock=setMainView;
    setMainView=function(view){ const r=oldSetMainViewForBambooLock(view); setTimeout(bambooApplyScrollLockPatch,0); return r; };
  }
  window.addEventListener('resize',bambooApplyScrollLockPatch);
  setTimeout(bambooApplyScrollLockPatch,0);
})();

/* BRICK RPG ADDON - 2026-06-10 */
(function(){
  'use strict';
  const BRICK_NAME_KEY='jbaaaam_brick_player_name_v1';
  const BRICK_STAGE_KEY='jbaaaam_brick_last_stage_v1';
  const W=360,H=520;
  const MAX_STAGE=80;
  const $b=id=>document.getElementById(id);
  const html=s=>String(s==null?'':s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const nfmt=n=>Number(n||0).toLocaleString('ko-KR');
  let brickReady=false, brickCtx=null, brickCanvas=null;
  let brickPlayer=null, brickStage=1, brickState='idle', brickLoopId=null, brickLastTs=0;
  let brickPaddle=null, brickBalls=[], brickBricks=[], brickParticles=[], brickPowerups=[];
  let brickKeys={left:false,right:false}, brickScore=0, brickMoneyEarned=0, brickMessage='이름을 입력하고 시작해줘';
  let brickCleared=false, brickPointerActive=false;

  function toast(msg,type){ if(typeof showToast==='function')showToast(msg,type); else console.log(msg); }
  function errText(e){return e&&e.message?e.message:String(e||'알 수 없는 오류');}
  function upgradeCost(key){ const lv=Number(brickPlayer&&brickPlayer[key])||1; const base={paddle_level:90,power_level:140,ball_level:190,pierce_level:260}[key]||120; return Math.round(base*Math.pow(1.82,lv-1)); }
  function upgradeLabel(key){ return {paddle_level:'패들',power_level:'파워',ball_level:'공',pierce_level:'관통'}[key]||key; }
  function currentPlayerName(){ return ($b('brickNameInput')&&$b('brickNameInput').value.trim())||localStorage.getItem(BRICK_NAME_KEY)||''; }
  function playerDefaults(name){ return {name, money:0, max_stage:1, current_stage:1, paddle_level:1, power_level:1, ball_level:1, pierce_level:1}; }
  async function brickFetchPlayer(name){
    const rows=await sbFetch(`/brick_players?select=*&name=eq.${encodeURIComponent(name)}&limit=1`);
    if(rows&&rows[0])return rows[0];
    const made=await sbFetch('/brick_players',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(playerDefaults(name))});
    return made&&made[0]?made[0]:playerDefaults(name);
  }
  async function brickSavePlayer(patch={}){
    if(!brickPlayer||!brickPlayer.id)return;
    const body={...patch,updated_at:new Date().toISOString()};
    const rows=await sbFetch(`/brick_players?id=eq.${encodeURIComponent(brickPlayer.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
    if(rows&&rows[0])brickPlayer={...brickPlayer,...rows[0]}; else brickPlayer={...brickPlayer,...body};
  }
  async function brickSaveClear(stageNo,score,money){
    if(!brickPlayer||!brickPlayer.id)return;
    await sbFetch('/brick_stage_clears?on_conflict=player_id,stage_no',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({player_id:brickPlayer.id,stage_no:stageNo,score:Math.floor(score),money_earned:Math.floor(money),cleared_at:new Date().toISOString()})});
  }
  async function brickLoadPublicStats(){
    try{
      const [rank,recent]=await Promise.all([
        sbFetch('/brick_player_rankings?select=*&order=max_stage.desc,money.desc,updated_at.desc&limit=20'),
        sbFetch('/brick_recent_clears?select=*&order=cleared_at.desc&limit=12')
      ]);
      renderBrickStats(rank||[],recent||[]);
    }catch(e){
      const box=$b('brickStatsBox'); if(box)box.innerHTML=`<div class="brick-muted">랭킹을 불러오지 못했어. SQL 실행 여부를 확인해줘.</div>`;
    }
  }
  function ensureBrickUi(){
    if(brickReady)return;
    brickReady=true;
    injectBrickStyle();
    const homeGrid=document.querySelector('#homeView .app-grid,.app-grid,#homeView .home-grid,.home-grid,.game-grid');
    if(homeGrid&&!$b('homeBrickCard')){
      const card=document.createElement('button');
      card.id='homeBrickCard';
      card.type='button';
      card.className=homeGrid.classList.contains('app-grid')?'app-card brick-card':'home-card game-card brick-card';
      card.innerHTML=homeGrid.classList.contains('app-grid')
        ? '<div class="app-icon">🧱</div><div><div class="app-name">벽돌깨기 RPG</div><div class="app-desc">벽돌 깨고 돈 벌어서 성장하기</div></div>'
        : '<span class="home-card-icon">🧱</span><strong>벽돌깨기 RPG</strong><small>벽돌 깨고 돈 벌어서 성장하기</small>';
      card.onclick=()=>setMainView('brick');
      homeGrid.appendChild(card);
    }
    const bambooBtn=$b('showBambooBtn')||document.querySelector('[id^="show"][id$="BambooBtn"]');
    const omokBtn=$b('showOmokBtn');
    if(!$b('showBrickBtn')){
      const btn=document.createElement('button'); btn.id='showBrickBtn'; btn.type='button'; btn.className='drawer-btn'; btn.innerHTML='<span>🧱</span> 벽돌깨기 RPG'; btn.onclick=()=>setMainView('brick');
      (omokBtn||bambooBtn||document.querySelector('.drawer-menu button:last-child'))?.insertAdjacentElement('afterend',btn);
    }
    const main=document.querySelector('main')||document.body;
    if(!$b('brickView')){
      const view=document.createElement('section'); view.id='brickView'; view.className='view-page brick-page';
      view.innerHTML=`
        <div class="game-card brick-shell">
          <div class="game-header-row">
            <div><h2>벽돌깨기 RPG</h2><p>공을 튕겨 벽돌을 깨고 돈으로 업그레이드해.</p></div>
            <button id="brickRankRefreshBtn" class="mini-btn" type="button">랭킹 새로고침</button>
          </div>
          <div class="brick-login card-soft">
            <input id="brickNameInput" class="text-input" maxlength="20" placeholder="이름 입력" />
            <button id="brickLoadBtn" class="primary-btn" type="button">불러오기</button>
            <button id="brickNewRunBtn" class="ghost-btn" type="button">현재 스테이지 시작</button>
          </div>
          <div class="brick-status-grid">
            <div><span>이름</span><strong id="brickPlayerName">-</strong></div>
            <div><span>스테이지</span><strong id="brickStageText">1</strong></div>
            <div><span>돈</span><strong id="brickMoneyText">0원</strong></div>
            <div><span>점수</span><strong id="brickScoreText">0</strong></div>
          </div>
          <div class="brick-upgrades card-soft">
            <button id="brickUpPaddle" type="button">패들 Lv.1</button>
            <button id="brickUpPower" type="button">파워 Lv.1</button>
            <button id="brickUpBall" type="button">공 Lv.1</button>
            <button id="brickUpPierce" type="button">관통 Lv.1</button>
          </div>
          <div class="brick-stage-tools">
            <button id="brickPrevStageBtn" type="button">◀ 이전</button>
            <button id="brickStartBtn" type="button">시작</button>
            <button id="brickPauseBtn" type="button">일시정지</button>
            <button id="brickNextStageBtn" type="button">다음 ▶</button>
          </div>
          <div class="brick-canvas-wrap"><canvas id="brickCanvas" width="360" height="520"></canvas></div>
          <div class="brick-mobile-controls">
            <button id="brickLeftBtn" type="button">←</button>
            <button id="brickLaunchBtn" type="button">발사/시작</button>
            <button id="brickRightBtn" type="button">→</button>
          </div>
          <div id="brickHelp" class="brick-help">조작: PC ←/→/Space, 모바일 버튼/드래그 · 후반에는 벽돌 체력/공속/보스가 증가 · 금색=보너스, 파랑=멀티볼, 보라=관통, 빨강/보라=강화벽돌</div>
          <div id="brickStatsBox" class="brick-stats"></div>
        </div>`;
      main.appendChild(view);
    }
    bindBrickUi();
  }
  function injectBrickStyle(){
    if($b('brickRpgStyle'))return;
    const st=document.createElement('style'); st.id='brickRpgStyle'; st.textContent=`
      .brick-page{display:none}.brick-page.active{display:block}.brick-card .app-icon{background:#fff7ed}.brick-shell{padding:16px}.game-header-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.game-header-row h2{margin:0;font-size:22px}.game-header-row p{margin:5px 0 0;color:#6b7280;font-size:13px;font-weight:800}.card-soft{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:12px}.brick-login{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin:12px 0}.text-input{height:42px;border:1px solid #d1d5db;border-radius:12px;padding:0 12px;font-weight:900;min-width:0}.primary-btn,.ghost-btn,.mini-btn,.brick-stage-tools button,.brick-upgrades button,.brick-mobile-controls button{border:0;border-radius:13px;font-weight:950;cursor:pointer}.primary-btn{background:#111827;color:white;padding:0 14px}.ghost-btn,.mini-btn{background:#e5e7eb;color:#111827;padding:0 12px}.mini-btn{height:34px;font-size:12px}.brick-status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.brick-status-grid>div{background:#111827;color:#fff;border-radius:16px;padding:10px;text-align:center}.brick-status-grid span{display:block;font-size:11px;color:#cbd5e1;font-weight:800}.brick-status-grid strong{display:block;margin-top:3px;font-size:15px}.brick-upgrades{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.brick-upgrades button{min-height:50px;background:#fff;border:1px solid #dbe3ef;color:#111827;font-size:12px;line-height:1.25}.brick-upgrades button.can-buy{background:#ecfdf5;border-color:#86efac}.brick-stage-tools{display:grid;grid-template-columns:1fr 1.2fr 1.2fr 1fr;gap:8px;margin:10px 0}.brick-stage-tools button{height:42px;background:#111827;color:#fff}.brick-stage-tools button:nth-child(1),.brick-stage-tools button:nth-child(4){background:#374151}.brick-canvas-wrap{background:#020617;border-radius:20px;padding:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}#brickCanvas{display:block;width:100%;max-width:420px;height:auto;margin:0 auto;border-radius:14px;background:#020617;touch-action:none}.brick-mobile-controls{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:10px;margin-top:10px}.brick-mobile-controls button{height:52px;background:#111827;color:white;font-size:18px}.brick-help{margin-top:10px;font-size:12px;color:#6b7280;font-weight:800;text-align:center}.brick-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.brick-stat-panel{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px}.brick-stat-panel h3{margin:0 0 8px;font-size:15px}.brick-rank-row,.brick-recent-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid #f1f5f9;font-size:12px;font-weight:850}.brick-rank-row:first-of-type,.brick-recent-row:first-of-type{border-top:0}.brick-muted{font-size:12px;color:#6b7280;font-weight:800;text-align:center;padding:12px}.brick-player-highlight{background:#fef9c3;border-radius:10px;padding-left:5px;padding-right:5px}@media(max-width:520px){.brick-login{grid-template-columns:1fr}.brick-status-grid{grid-template-columns:repeat(2,1fr)}.brick-upgrades{grid-template-columns:repeat(2,1fr)}.brick-stats{grid-template-columns:1fr}.brick-stage-tools{grid-template-columns:1fr 1fr}.game-header-row{display:block}.mini-btn{margin-top:8px;width:100%}}
    `; document.head.appendChild(st);
  }
  function bindBrickUi(){
    if($b('brickLoadBtn').dataset.bound)return;
    $b('brickLoadBtn').dataset.bound='Y';
    $b('brickNameInput').value=localStorage.getItem(BRICK_NAME_KEY)||'';
    $b('brickLoadBtn').onclick=brickLoadByName;
    $b('brickNewRunBtn').onclick=()=>brickStartStage(brickStage);
    $b('brickStartBtn').onclick=()=>brickStartStage(brickStage);
    $b('brickPauseBtn').onclick=brickTogglePause;
    $b('brickPrevStageBtn').onclick=()=>brickSelectStage(Math.max(1,brickStage-1));
    $b('brickNextStageBtn').onclick=()=>brickSelectStage(Math.min(getMaxUnlocked(),brickStage+1));
    $b('brickRankRefreshBtn').onclick=brickLoadPublicStats;
    $b('brickUpPaddle').onclick=()=>brickBuyUpgrade('paddle_level');
    $b('brickUpPower').onclick=()=>brickBuyUpgrade('power_level');
    $b('brickUpBall').onclick=()=>brickBuyUpgrade('ball_level');
    $b('brickUpPierce').onclick=()=>brickBuyUpgrade('pierce_level');
    bindHoldButton('brickLeftBtn','left'); bindHoldButton('brickRightBtn','right');
    $b('brickLaunchBtn').onclick=brickLaunchOrStart;
    brickCanvas=$b('brickCanvas'); brickCtx=brickCanvas.getContext('2d');
    brickCanvas.addEventListener('pointerdown',brickPointer,{passive:false});
    brickCanvas.addEventListener('pointermove',brickPointer,{passive:false});
    brickCanvas.addEventListener('pointerup',()=>brickPointerActive=false,{passive:false});
    document.addEventListener('keydown',brickKeyDown);
    document.addEventListener('keyup',brickKeyUp);
    brickResetStage(1); brickDraw(); brickLoadPublicStats();
  }
  function bindHoldButton(id,key){ const btn=$b(id); btn.addEventListener('pointerdown',e=>{e.preventDefault();brickKeys[key]=true;if(brickState==='idle')brickStartStage(brickStage);},{passive:false}); ['pointerup','pointerleave','pointercancel'].forEach(ev=>btn.addEventListener(ev,()=>brickKeys[key]=false)); }
  function brickPointer(e){ if(e.cancelable)e.preventDefault(); brickPointerActive=true; const rect=brickCanvas.getBoundingClientRect(); const x=(e.clientX-rect.left)*(W/rect.width); if(brickPaddle)brickPaddle.x=Math.max(brickPaddle.w/2,Math.min(W-brickPaddle.w/2,x)); if(brickState==='idle')brickStartStage(brickStage); }
  function brickKeyDown(e){ if(currentMainView!=='brick')return; if(typeof isTypingTarget==='function'&&isTypingTarget(e.target))return; const k=e.key.toLowerCase(); if(['arrowleft','arrowright',' ','p','r'].includes(k))e.preventDefault(); if(k==='arrowleft')brickKeys.left=true; else if(k==='arrowright')brickKeys.right=true; else if(k===' ')brickLaunchOrStart(); else if(k==='p')brickTogglePause(); else if(k==='r')brickStartStage(brickStage); }
  function brickKeyUp(e){ if(currentMainView!=='brick')return; if(typeof isTypingTarget==='function'&&isTypingTarget(e.target))return; const k=e.key.toLowerCase(); if(k==='arrowleft')brickKeys.left=false; else if(k==='arrowright')brickKeys.right=false; }
  async function brickLoadByName(){
    const name=currentPlayerName().trim(); if(!name){toast('이름을 입력해줘','error');return;}
    try{ brickMessage='불러오는 중...'; brickDraw(); brickPlayer=await brickFetchPlayer(name); localStorage.setItem(BRICK_NAME_KEY,name); brickStage=Number(localStorage.getItem(BRICK_STAGE_KEY))||Number(brickPlayer.current_stage)||Number(brickPlayer.max_stage)||1; brickStage=Math.max(1,Math.min(getMaxUnlocked(),brickStage)); brickResetStage(brickStage); renderBrickInfo(); brickLoadPublicStats(); toast('벽돌깨기 세이브 불러옴'); }
    catch(e){toast('벽돌깨기 불러오기 실패: '+errText(e),'error');}
  }
  function getMaxUnlocked(){ return brickPlayer?Math.max(1,Math.min(MAX_STAGE,Number(brickPlayer.max_stage)||1)):1; }
  function brickSelectStage(no){ brickStage=Math.max(1,Math.min(getMaxUnlocked(),Number(no)||1)); localStorage.setItem(BRICK_STAGE_KEY,String(brickStage)); brickResetStage(brickStage); renderBrickInfo(); }
  function brickResetStage(stage){
    brickState='idle'; brickCleared=false; brickScore=0; brickMoneyEarned=0; brickParticles=[]; brickPowerups=[]; brickBricks=makeBrickStage(stage);
    const paddleLv=Number(brickPlayer&&brickPlayer.paddle_level)||1; const ballLv=Number(brickPlayer&&brickPlayer.ball_level)||1;
    const diff=getBrickDifficulty(stage);
    brickPaddle={x:W/2,y:H-38,w:Math.max(54,74+Math.min(54,(paddleLv-1)*10)-diff.paddlePenalty),h:12,speed:285+Math.min(35,diff.tier*4)};
    brickBalls=[]; const count=Math.min(4,ballLv); for(let i=0;i<count;i++)brickBalls.push(makeBall(i,count));
    brickMessage=brickPlayer?'시작 버튼 또는 Space로 발사':'이름을 입력하고 불러오기';
    stopBrickLoop(); brickDraw();
  }
  function getBrickPassivePierce(){ const lv=Number(brickPlayer&&brickPlayer.pierce_level)||1; return Math.max(0,Math.min(8,lv-1)); }
  function getBrickUpgradePressure(){
    if(!brickPlayer)return 0;
    return Math.max(0,((Number(brickPlayer.paddle_level)||1)+(Number(brickPlayer.power_level)||1)+(Number(brickPlayer.ball_level)||1)+(Number(brickPlayer.pierce_level)||1))-4);
  }
  function getBrickDifficulty(stage=brickStage){
    const st=Math.max(1,Number(stage)||1);
    const up=getBrickUpgradePressure();
    return {stage:st,upgrade:up,tier:Math.floor((st-1)/10),hpBonus:Math.floor(st/9)+Math.floor(up/7),speedBonus:Math.min(170,st*3+up*5),paddlePenalty:Math.min(36,Math.floor(st/10)*4+Math.floor(up/10)*3)};
  }
  function makeBall(i,count){ const d=getBrickDifficulty(brickStage); const spread=(i-(count-1)/2)*0.35; return {x:W/2+(i-(count-1)/2)*12,y:H-56,r:6,vx:95*Math.sin(spread),vy:-270-d.speedBonus*0.45,stuck:true,pierce:getBrickPassivePierce()}; }
  function makeBrickStage(stage){
    const d=getBrickDifficulty(stage);
    const rows=Math.min(10,5+Math.floor(stage/7));
    const cols=8;
    const arr=[];
    const top=48;
    const gap=4;
    const bw=(W-28-gap*(cols-1))/cols;
    const bh=20;
    const bossStage=stage>=10&&stage%10===0;
    const skipBoss=(r,c)=>bossStage&&r===0&&c>=2&&c<=5;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      if(skipBoss(r,c))continue;
      const seed=(stage*37+r*17+c*23)%100;
      const holeChance=Math.max(2,10-Math.floor(stage/12));
      if(stage>4&&seed<holeChance)continue;
      let type='normal';
      let hp=1+d.hpBonus+Math.floor(r/3);
      let reward=4+Math.floor(stage/5)+Math.floor(hp*2);
      if(seed>76){type='hard';hp+=1+Math.floor(stage/18);reward+=9;}
      if(seed>88){type='gold';hp+=Math.floor(stage/20);reward+=28+stage;}
      if(stage>5&&seed>=68&&seed<75){type='multi';hp+=1;reward+=12;}
      if(stage>12&&seed>=60&&seed<66){type='pierce';hp+=1+Math.floor(stage/25);reward+=14;}
      if(stage>18&&seed>=50&&seed<58){type='steel';hp+=2+Math.floor(stage/16);reward+=20;}
      if(stage>30&&seed>=42&&seed<48){type='guard';hp+=3+Math.floor(stage/14)+Math.floor(d.upgrade/8);reward+=24;}
      if(stage>44&&seed>=34&&seed<39){type='curse';hp+=4+Math.floor(stage/12);reward+=30;}
      arr.push({x:14+c*(bw+gap),y:top+r*(bh+gap),w:bw,h:bh,hp,maxHp:hp,type,reward});
    }
    if(bossStage){
      const bossHp=10+Math.floor(stage*1.3)+Math.floor(d.upgrade*1.8);
      arr.push({x:14+2*(bw+gap),y:top,w:bw*4+gap*3,h:bh*1.55,hp:bossHp,maxHp:bossHp,type:'boss',reward:120+stage*9});
    }
    return arr;
  }
  function brickLaunchOrStart(){ if(!brickPlayer){brickLoadByName();return;} if(brickState==='idle'||brickState==='over'||brickState==='clear')brickStartStage(brickStage); else if(brickState==='ready')brickLaunchBalls(); }
  function brickStartStage(stage){ if(!brickPlayer){brickLoadByName();return;} brickStage=Math.max(1,Math.min(getMaxUnlocked(),Number(stage)||1)); localStorage.setItem(BRICK_STAGE_KEY,String(brickStage)); brickResetStage(brickStage); brickState='running'; brickLaunchBalls(); startBrickLoop(); }
  function brickLaunchBalls(){ brickBalls.forEach((b,i)=>{ if(b.stuck){ b.stuck=false; const angle=(-Math.PI/2)+(i-(brickBalls.length-1)/2)*0.22; const diff=getBrickDifficulty(brickStage); const speed=285+diff.speedBonus; b.vx=Math.cos(angle)*speed; b.vy=Math.sin(angle)*speed; }}); brickMessage=''; }
  function brickTogglePause(){ if(brickState==='running'){brickState='pause';stopBrickLoop();brickMessage='PAUSE';brickDraw();} else if(brickState==='pause'){brickState='running';brickMessage='';startBrickLoop();} }
  function startBrickLoop(){ stopBrickLoop(); brickLastTs=0; brickLoopId=requestAnimationFrame(brickLoop); }
  function stopBrickLoop(){ if(brickLoopId)cancelAnimationFrame(brickLoopId); brickLoopId=null; }
  function brickLoop(ts){ if(brickState!=='running')return; if(!brickLastTs)brickLastTs=ts; const dt=Math.min(0.028,(ts-brickLastTs)/1000); brickLastTs=ts; updateBrick(dt); brickDraw(); brickLoopId=requestAnimationFrame(brickLoop); }
  function updateBrick(dt){
    if(brickKeys.left)brickPaddle.x-=brickPaddle.speed*dt; if(brickKeys.right)brickPaddle.x+=brickPaddle.speed*dt; brickPaddle.x=Math.max(brickPaddle.w/2,Math.min(W-brickPaddle.w/2,brickPaddle.x));
    const power=Number(brickPlayer&&brickPlayer.power_level)||1; const pierceLv=Number(brickPlayer&&brickPlayer.pierce_level)||1;
    for(const b of brickBalls){
      if(b.stuck){b.x=brickPaddle.x;b.y=brickPaddle.y-18;continue;}
      b.x+=b.vx*dt; b.y+=b.vy*dt; if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);} if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);} if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy);} 
      if(b.y>H+28){ b.dead=true; continue; }
      if(circleRect(b,{x:brickPaddle.x-brickPaddle.w/2,y:brickPaddle.y,w:brickPaddle.w,h:brickPaddle.h})&&b.vy>0){ const rel=(b.x-brickPaddle.x)/(brickPaddle.w/2); const speed=Math.hypot(b.vx,b.vy)+3; const angle=(-Math.PI/2)+rel*0.92; b.vx=Math.cos(angle)*speed; b.vy=Math.sin(angle)*speed; b.y=brickPaddle.y-b.r-1; }
      for(const br of brickBricks){ if(br.dead)continue; if(circleRect(b,br)){ const damage=Math.max(1,1+Math.floor((power-1)/3)); br.hp-=damage; brickScore+=10*damage; if(b.pierce<=0){ const cx=Math.max(br.x,Math.min(br.x+br.w,b.x)); const cy=Math.max(br.y,Math.min(br.y+br.h,b.y)); if(Math.abs(b.x-cx)>Math.abs(b.y-cy))b.vx*=-1; else b.vy*=-1; } else b.pierce-=1; if(br.hp<=0){ br.dead=true; brickMoneyEarned+=br.reward; brickScore+=br.reward*2; spawnBrickFx(br); handleBrickSpecial(br,b,pierceLv); } break; }}
    }
    brickBalls=brickBalls.filter(b=>!b.dead); if(!brickBalls.length){brickState='over';brickMessage='GAME OVER';stopBrickLoop();brickDraw();return;}
    brickParticles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}); brickParticles=brickParticles.filter(p=>p.life>0);
    if(!brickCleared&&brickBricks.every(b=>b.dead)){ brickClearStage(); }
  }
  function circleRect(c,r){ const nx=Math.max(r.x,Math.min(r.x+r.w,c.x)); const ny=Math.max(r.y,Math.min(r.y+r.h,c.y)); return Math.hypot(c.x-nx,c.y-ny)<=c.r; }
  function handleBrickSpecial(br,ball,pierceLv){ if(br.type==='multi'&&brickBalls.length<8){ const nb={...ball,vx:-ball.vx*0.88,vy:Math.min(-180,ball.vy-30),stuck:false,pierce:Math.max(ball.pierce||0,getBrickPassivePierce())}; brickBalls.push(nb); toast('멀티볼!'); } if(br.type==='pierce'){ ball.pierce+=3+Math.floor(pierceLv*1.5); toast(`관통 +${3+Math.floor(pierceLv*1.5)}회!`); } }
  function spawnBrickFx(br){ for(let i=0;i<5;i++)brickParticles.push({x:br.x+br.w/2,y:br.y+br.h/2,vx:(Math.random()*2-1)*80,vy:(Math.random()*2-1)*80,life:.45,color:brickColor(br)}); }
  async function brickClearStage(){
    brickCleared=true; brickState='clear'; stopBrickLoop(); const clearStage=brickStage; const bonus=80+clearStage*16; const earned=brickMoneyEarned+bonus; brickMoneyEarned=earned; brickScore+=bonus*4; brickMessage=`STAGE ${clearStage} CLEAR +${earned}원`; brickDraw();
    try{ const nextMax=Math.max(Number(brickPlayer.max_stage)||1,Math.min(MAX_STAGE,clearStage+1)); const nextCurrent=Math.min(MAX_STAGE,clearStage+1); await brickSaveClear(clearStage,brickScore,earned); await brickSavePlayer({money:Number(brickPlayer.money||0)+earned,max_stage:nextMax,current_stage:nextCurrent}); brickStage=nextCurrent; localStorage.setItem(BRICK_STAGE_KEY,String(brickStage)); renderBrickInfo(); brickLoadPublicStats(); }
    catch(e){toast('클리어 저장 실패: '+errText(e),'error');}
  }
  async function brickBuyUpgrade(key){ if(!brickPlayer){toast('이름을 먼저 불러와줘','error');return;} const lv=Number(brickPlayer[key])||1; if(lv>=12){toast('최대 레벨이야');return;} const cost=upgradeCost(key); if(Number(brickPlayer.money||0)<cost){toast(`${upgradeLabel(key)} 업그레이드 비용 부족: ${nfmt(cost)}원`,'error');return;} try{ const patch={money:Number(brickPlayer.money||0)-cost}; patch[key]=lv+1; await brickSavePlayer(patch); renderBrickInfo(); brickResetStage(brickStage); toast(`${upgradeLabel(key)} Lv.${lv+1}`); }catch(e){toast('업그레이드 실패: '+errText(e),'error');} }
  function renderBrickInfo(){
    if(!$b('brickPlayerName'))return; const p=brickPlayer; $b('brickPlayerName').textContent=p?p.name:'-'; $b('brickStageText').textContent=p?`${brickStage} / ${getMaxUnlocked()}`:'1'; $b('brickMoneyText').textContent=(p?nfmt(p.money):'0')+'원'; $b('brickScoreText').textContent=nfmt(brickScore);
    const buttons=[['brickUpPaddle','paddle_level'],['brickUpPower','power_level'],['brickUpBall','ball_level'],['brickUpPierce','pierce_level']]; buttons.forEach(([id,key])=>{ const btn=$b(id); if(!btn)return; const lv=Number(p&&p[key])||1; const cost=p?upgradeCost(key):0; const effect=key==='pierce_level'?`시작 관통 ${Math.max(0,lv-1)}회 · `:''; btn.innerHTML=`${upgradeLabel(key)} Lv.${lv}<br><small>${lv>=12?effect+'MAX':effect+nfmt(cost)+'원'}</small>`; btn.classList.toggle('can-buy',!!p&&lv<12&&Number(p.money||0)>=cost); });
  }
  function renderBrickStats(rank,recent){ const box=$b('brickStatsBox'); if(!box)return; const me=brickPlayer&&brickPlayer.name; box.innerHTML=`<div class="brick-stat-panel"><h3>전체 유저 랭킹</h3>${rank.length?rank.map((r,i)=>`<div class="brick-rank-row ${me&&r.name===me?'brick-player-highlight':''}"><b>${i+1}</b><span>${html(r.name)}<br><small>업그레이드 Lv.${Number(r.total_upgrade_level||0)}</small></span><strong>ST ${Number(r.max_stage||1)}</strong></div>`).join(''):'<div class="brick-muted">아직 랭킹 없음</div>'}</div><div class="brick-stat-panel"><h3>최근 클리어</h3>${recent.length?recent.map(r=>`<div class="brick-recent-row ${me&&r.name===me?'brick-player-highlight':''}"><b>ST ${Number(r.stage_no)}</b><span>${html(r.name)}<br><small>${new Date(r.cleared_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></span><strong>${nfmt(r.money_earned)}원</strong></div>`).join(''):'<div class="brick-muted">최근 클리어 없음</div>'}</div>`; }
  function brickColor(br){ return {normal:'#60a5fa',hard:'#f97316',gold:'#facc15',multi:'#38bdf8',pierce:'#a78bfa',steel:'#94a3b8',guard:'#ef4444',curse:'#7c3aed',boss:'#f43f5e'}[br.type]||'#60a5fa'; }
  function brickDraw(){
    if(!brickCtx)return; const ctx=brickCtx; ctx.clearRect(0,0,W,H); const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0f172a'); g.addColorStop(1,'#111827'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.06)'; for(let i=0;i<18;i++){ctx.beginPath();ctx.arc((i*61+brickStage*13)%W,(i*47)%H,1.4,0,Math.PI*2);ctx.fill();}
    brickBricks.forEach(br=>{ if(br.dead)return; ctx.fillStyle=brickColor(br); roundRect(ctx,br.x,br.y,br.w,br.h,5,true); ctx.fillStyle='rgba(255,255,255,.45)'; ctx.fillRect(br.x+3,br.y+3,br.w-6,3); if(br.hp>1){ctx.fillStyle='#020617';ctx.font='900 11px sans-serif';ctx.textAlign='center';ctx.fillText(br.hp,br.x+br.w/2,br.y+14);} });
    brickParticles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);ctx.globalAlpha=1;});
    if(brickPaddle){ const px=brickPaddle.x-brickPaddle.w/2; const py=brickPaddle.y; const pg=ctx.createLinearGradient(px,py,px,py+brickPaddle.h); pg.addColorStop(0,'#86efac'); pg.addColorStop(.55,'#22c55e'); pg.addColorStop(1,'#15803d'); ctx.fillStyle=pg; roundRect(ctx,px,py,brickPaddle.w,brickPaddle.h,8,true); ctx.fillStyle='rgba(255,255,255,.55)'; roundRect(ctx,px+6,py+2,Math.max(0,brickPaddle.w-12),3,3,true); }
    brickBalls.forEach(b=>{ctx.fillStyle=b.pierce>0?'#c084fc':'#fefce8';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(0,0,0,.2)';ctx.stroke();});
    ctx.fillStyle='rgba(255,255,255,.92)';ctx.font='900 13px sans-serif';ctx.textAlign='left';ctx.fillText(`STAGE ${brickStage}`,12,24);ctx.textAlign='right';ctx.fillText(`${nfmt(brickScore)}점`,W-12,24);
    if(brickMessage){ctx.fillStyle='rgba(2,6,23,.72)';roundRect(ctx,34,H/2-38,W-68,76,18,true);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='900 22px sans-serif';ctx.fillText(brickMessage.split(' ')[0],W/2,H/2-4);ctx.font='800 13px sans-serif';ctx.fillText(brickMessage.replace(brickMessage.split(' ')[0],'').trim(),W/2,H/2+22);} renderBrickInfo();
  }
  function roundRect(ctx,x,y,w,h,r,fill){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); if(fill)ctx.fill(); else ctx.stroke(); }
  function showBrickView(){
    ensureBrickUi(); currentMainView='brick'; document.querySelectorAll('.view-page').forEach(v=>v.classList.toggle('active',v.id==='brickView')); const add=$b('addBtn'); if(add)add.style.display='none'; ['showBudgetBtn','showTetrisBtn','showDinoBtn','showBambooBtn','showJumpBtn','showOmokBtn','showBrickBtn'].forEach(id=>{const el=$b(id); if(el)el.classList.toggle('active',id==='showBrickBtn');}); if(typeof closeDrawer==='function')closeDrawer(); if(!brickPlayer&&currentPlayerName())brickLoadByName(); else {renderBrickInfo(); brickDraw(); brickLoadPublicStats();}
  }
  const oldSetMainView=setMainView;
  setMainView=function(view){ if(view==='brick'){showBrickView();return;} const r=oldSetMainView(view); const bv=$b('brickView'); if(bv)bv.classList.remove('active'); return r; };
  setTimeout(ensureBrickUi,0);
})();

/* === Idle Life RPG Addon: 백수 키우기 === */
(function(){
  const IDLE_NAME_KEY='jbaaaam_idle_player_name_v1';
  const IDLE_TAB_KEY='jbaaaam_idle_tab_v1';
  const $i=id=>document.getElementById(id);
  const html=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const n=v=>Number(v||0);
  const won=v=>Math.floor(n(v)).toLocaleString('ko-KR')+'원';
  const compact=v=>{v=n(v); if(v>=1e12)return (v/1e12).toFixed(2)+'조'; if(v>=1e8)return (v/1e8).toFixed(2)+'억'; if(v>=1e4)return (v/1e4).toFixed(1)+'만'; return Math.floor(v).toLocaleString('ko-KR');};
  const nowIso=()=>new Date().toISOString();
  let idleReady=false,idlePlayer=null,idleUpgrades={},idleStats=null,idleTickTimer=null,idleRenderTimer=null,idleSaveTimer=null,idleEventTimer=null,idleCasinoBusy=false,idleLastRender=0;
  const IDLE_TABS=[['click','클릭'],['job','알바'],['side','부업'],['auto','자동화'],['invest','투자'],['life','생활']];
  const IDLE_UPGRADES=[
    {key:'finger',cat:'click',name:'손가락 단련',max:80,base:120,growth:1.16,click:7,desc:'클릭 수익 증가'},
    {key:'coffee',cat:'click',name:'커피 한잔',max:50,base:450,growth:1.18,click:18,desc:'잠이 확 깨서 클릭 수익 증가'},
    {key:'focus',cat:'click',name:'집중력 폭발',max:45,base:1200,growth:1.20,clickMult:.018,desc:'클릭 전체 배율 증가'},
    {key:'typing',cat:'click',name:'타자 속도',max:60,base:900,growth:1.17,click:26,desc:'일하기 버튼 효율 증가'},
    {key:'critical',cat:'click',name:'크리티컬 클릭',max:30,base:2500,growth:1.23,crit:.012,desc:'가끔 클릭 수익이 크게 터짐'},
    {key:'conveni',cat:'job',name:'편의점 야간알바',max:70,base:300,growth:1.16,income:4,desc:'초반 자동수익'},
    {key:'delivery',cat:'job',name:'배달 알바',max:70,base:900,growth:1.17,income:12,desc:'꾸준한 자동수익'},
    {key:'warehouse',cat:'job',name:'물류센터',max:60,base:1800,growth:1.18,income:24,desc:'힘들지만 수익 좋음'},
    {key:'cafe',cat:'job',name:'카페 알바',max:55,base:2600,growth:1.19,income:34,desc:'멘탈 관리형 수익'},
    {key:'event_staff',cat:'job',name:'행사 스태프',max:45,base:5200,growth:1.21,income:75,desc:'단기 고수익 알바'},
    {key:'used_market',cat:'side',name:'중고거래',max:70,base:1200,growth:1.17,income:18,desc:'안 쓰는 물건 팔기'},
    {key:'blog',cat:'side',name:'블로그 광고',max:60,base:4500,growth:1.19,income:70,desc:'잠자는 동안 광고수익'},
    {key:'shorts',cat:'side',name:'쇼츠 수익',max:55,base:8000,growth:1.20,income:125,desc:'터지면 은근 큼'},
    {key:'design_gig',cat:'side',name:'디자인 외주',max:45,base:16000,growth:1.22,income:270,desc:'부업 수익 증가'},
    {key:'coding_gig',cat:'side',name:'코딩 외주',max:45,base:24000,growth:1.22,income:410,desc:'돈 되는 부업'},
    {key:'macro',cat:'auto',name:'매크로 만들기',max:55,base:12000,growth:1.20,income:180,desc:'반복작업 자동화'},
    {key:'excel_auto',cat:'auto',name:'엑셀 자동화',max:50,base:26000,growth:1.21,income:430,desc:'사무 자동화 수익'},
    {key:'ai_doc',cat:'auto',name:'AI 문서작성',max:45,base:52000,growth:1.22,income:920,desc:'AI로 부업 자동화'},
    {key:'ai_code',cat:'auto',name:'AI 코딩보조',max:40,base:90000,growth:1.23,income:1700,desc:'외주 처리속도 증가'},
    {key:'agency_bot',cat:'auto',name:'외주 수주봇',max:35,base:180000,growth:1.24,income:3600,desc:'일감이 자동으로 굴러옴'},
    {key:'saving',cat:'invest',name:'적금 풍차돌리기',max:60,base:10000,growth:1.19,income:110,incomeMult:.004,desc:'안전한 복리'},
    {key:'dividend',cat:'invest',name:'배당주 모으기',max:55,base:35000,growth:1.21,income:520,incomeMult:.006,desc:'초당수익 배율 증가'},
    {key:'etf',cat:'invest',name:'ETF 장기투자',max:50,base:90000,growth:1.22,income:1350,incomeMult:.008,desc:'방치수익 배율 증가'},
    {key:'estate_piece',cat:'invest',name:'부동산 조각투자',max:42,base:260000,growth:1.24,income:4300,incomeMult:.010,desc:'후반 투자 수익'},
    {key:'building',cat:'invest',name:'건물 매입',max:30,base:1100000,growth:1.27,income:22000,incomeMult:.014,desc:'건물주 루트'},
    {key:'chair',cat:'life',name:'좋은 의자',max:30,base:6000,growth:1.20,clickMult:.012,incomeMult:.003,desc:'허리가 살아나서 전체 효율 증가'},
    {key:'monitor',cat:'life',name:'듀얼모니터',max:30,base:16000,growth:1.21,clickMult:.016,incomeMult:.004,desc:'작업효율 증가'},
    {key:'pc',cat:'life',name:'고성능 PC',max:28,base:42000,growth:1.23,clickMult:.020,incomeMult:.006,desc:'클릭/자동화 효율 증가'},
    {key:'sleep',cat:'life',name:'수면 패턴 개선',max:25,base:85000,growth:1.24,offline:.18,incomeMult:.006,desc:'오프라인 보상 시간 증가'},
    {key:'mental',cat:'life',name:'멘탈 관리',max:25,base:120000,growth:1.25,eventLuck:.010,incomeMult:.008,desc:'나쁜 이벤트 완화, 좋은 이벤트 증가'}
  ];
  const UPG=Object.fromEntries(IDLE_UPGRADES.map(u=>[u.key,u]));
  function idleLevel(key){return Math.max(0,Number(idleUpgrades[key]||0));}
  function idleCost(u,lv=idleLevel(u.key)){ return Math.ceil(u.base*Math.pow(u.growth,lv)*Math.pow(1.035,Math.floor(lv/10)*lv)); }
  function idleTitle(life){ life=n(life); if(life>=1e13)return '우주 자본가'; if(life>=1e11)return '재벌'; if(life>=1e9)return '건물주'; if(life>=1e8)return '투자자'; if(life>=2e7)return '스타트업 대표'; if(life>=5e6)return '팀장'; if(life>=1e6)return '시니어 개발자'; if(life>=2e5)return '주니어 개발자'; if(life>=5e4)return '프리랜서'; if(life>=8000)return '알바생'; return '이불 밖은 위험해'; }
  function deriveIdleStats(){
    let click=10,income=0,clickMult=1,incomeMult=1,crit=0,offlineHours=2,eventLuck=0,totalLv=0;
    for(const u of IDLE_UPGRADES){ const lv=idleLevel(u.key); totalLv+=lv; if(!lv)continue; click+=n(u.click)*lv; income+=n(u.income)*lv*(1+Math.floor(lv/10)*0.12); clickMult+=n(u.clickMult)*lv; incomeMult+=n(u.incomeMult)*lv; crit+=n(u.crit)*lv; offlineHours+=n(u.offline)*lv; eventLuck+=n(u.eventLuck)*lv; }
    const prestige=Number(idlePlayer&&idlePlayer.prestige_level)||0; const prestigeMult=1+prestige*.08;
    let activeMult=1; const ev=idlePlayer&&idlePlayer.active_event_key; const until=idlePlayer&&idlePlayer.active_event_until?new Date(idlePlayer.active_event_until).getTime():0;
    if(until>Date.now()){ if(ev==='awakening')activeMult*=2; if(ev==='burnout')activeMult*=0.7; if(ev==='lucky_day')activeMult*=1.45; }
    click=Math.max(1,click*clickMult*prestigeMult*activeMult); income=Math.max(0,income*incomeMult*prestigeMult*activeMult);
    return {click,income,crit:Math.min(.35,crit),offlineHours:Math.min(12,offlineHours),eventLuck:Math.min(.22,eventLuck),totalLv,activeMult};
  }
  function idleDefaultPlayer(name){ return {name,money:0,lifetime_money:0,total_clicks:0,prestige_level:0,title:'이불 밖은 위험해',click_power:10,income_per_sec:0,active_event_key:null,active_event_until:null,last_seen_at:nowIso(),updated_at:nowIso()}; }
  async function idleLoadByName(){
    const input=$i('idleNameInput'); const name=String((input&&input.value)||localStorage.getItem(IDLE_NAME_KEY)||'').trim(); if(!name){idleToast('이름을 입력해줘','error'); input&&input.focus(); return;}
    localStorage.setItem(IDLE_NAME_KEY,name);
    try{
      let rows=await sbFetch(`/idle_players?select=*&name=eq.${encodeURIComponent(name)}&limit=1`);
      if(!rows||!rows.length){ rows=await sbFetch('/idle_players',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([idleDefaultPlayer(name)])}); }
      idlePlayer=rows[0]; await idleLoadUpgrades(); await idleApplyOfflineReward(); idleStartTimers(); idleRenderAll(); idleToast(`${name} 불러옴`);
    }catch(e){ console.error(e); idleToast('불러오기 실패: '+idleErr(e),'error'); }
  }
  async function idleLoadUpgrades(){ if(!idlePlayer)return; const rows=await sbFetch(`/idle_upgrades?select=upgrade_key,level&player_id=eq.${encodeURIComponent(idlePlayer.id)}&limit=1000`); idleUpgrades={}; (rows||[]).forEach(r=>idleUpgrades[r.upgrade_key]=Number(r.level)||0); idleStats=deriveIdleStats(); }
  async function idleSavePlayer(patch={}){ if(!idlePlayer)return; idleStats=deriveIdleStats(); const body={...patch,title:idleTitle(n(patch.lifetime_money??idlePlayer.lifetime_money)),click_power:idleStats.click,income_per_sec:idleStats.income,last_seen_at:nowIso(),updated_at:nowIso()}; const rows=await sbFetch(`/idle_players?id=eq.${encodeURIComponent(idlePlayer.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(body)}); if(rows&&rows[0])idlePlayer=rows[0]; return idlePlayer; }
  async function idleSaveUpgrade(key,level){ await sbFetch('/idle_upgrades?on_conflict=player_id,upgrade_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{player_id:idlePlayer.id,upgrade_key:key,level,updated_at:nowIso()}])}); }
  async function idleApplyOfflineReward(){ if(!idlePlayer)return; idleStats=deriveIdleStats(); const last=idlePlayer.last_seen_at?new Date(idlePlayer.last_seen_at).getTime():Date.now(); const sec=Math.max(0,(Date.now()-last)/1000); const cap=idleStats.offlineHours*3600; const paidSec=Math.min(sec,cap); const reward=Math.floor(idleStats.income*paidSec); if(reward>0){ await idleSavePlayer({money:n(idlePlayer.money)+reward,lifetime_money:n(idlePlayer.lifetime_money)+reward}); idleLogEvent('offline','오프라인 보상',`${Math.floor(paidSec/60)}분치 수익`,reward); idleToast(`오프라인 보상 ${won(reward)}`); } else { await idleSavePlayer({}); } }
  function idleStartTimers(){
    idleStopTimers(); let last=Date.now(); idleTickTimer=setInterval(()=>{ if(!idlePlayer)return; const t=Date.now(); const dt=Math.min(3,(t-last)/1000); last=t; idleStats=deriveIdleStats(); const gain=idleStats.income*dt; if(gain>0){ idlePlayer.money=n(idlePlayer.money)+gain; idlePlayer.lifetime_money=n(idlePlayer.lifetime_money)+gain; } if(Date.now()-idleLastRender>500){idleRenderAll(); idleLastRender=Date.now();} },500);
    idleSaveTimer=setInterval(()=>idleFlushSave(),9000);
    idleEventTimer=setInterval(()=>idleMaybeRandomEvent(),45000);
  }
  function idleStopTimers(){ [idleTickTimer,idleRenderTimer,idleSaveTimer,idleEventTimer].forEach(t=>t&&clearInterval(t)); idleTickTimer=idleRenderTimer=idleSaveTimer=idleEventTimer=null; }
  async function idleFlushSave(){ if(!idlePlayer)return; try{ await idleSavePlayer({money:n(idlePlayer.money),lifetime_money:n(idlePlayer.lifetime_money),total_clicks:n(idlePlayer.total_clicks)}); idleLoadPublic(); }catch(e){console.warn(e);} }
  async function idleWorkClick(){ if(!idlePlayer){idleToast('이름을 먼저 불러와줘','error');return;} idleStats=deriveIdleStats(); let gain=idleStats.click; if(Math.random()<idleStats.crit){gain*=5; idleToast('크리티컬 클릭 x5!');} idlePlayer.money=n(idlePlayer.money)+gain; idlePlayer.lifetime_money=n(idlePlayer.lifetime_money)+gain; idlePlayer.total_clicks=n(idlePlayer.total_clicks)+1; idleRenderAll(); if(n(idlePlayer.total_clicks)%20===0)idleFlushSave(); }
  async function idleBuyUpgrade(key){ if(!idlePlayer){idleToast('이름을 먼저 불러와줘','error');return;} const u=UPG[key]; if(!u)return; const lv=idleLevel(key); if(lv>=u.max){idleToast('이미 최대 레벨이야');return;} const cost=idleCost(u,lv); if(n(idlePlayer.money)<cost){idleToast(`돈 부족: ${won(cost)}`,'error');return;} idlePlayer.money=n(idlePlayer.money)-cost; idleUpgrades[key]=lv+1; idleStats=deriveIdleStats(); await idleSaveUpgrade(key,lv+1); await idleSavePlayer({money:n(idlePlayer.money),lifetime_money:n(idlePlayer.lifetime_money)}); idleRenderAll(); idleToast(`${u.name} Lv.${lv+1}`); }
  function idleMaybeRandomEvent(){ if(!idlePlayer||Math.random()>.38)return; const luck=idleStats?idleStats.eventLuck:0; const events=[
    {key:'awakening',label:'각성',text:'60초간 모든 수익 2배',dur:60,good:true},
    {key:'lucky_day',label:'운수 좋은 날',text:'90초간 수익 +45%',dur:90,good:true},
    {key:'bonus',label:'월급날 착각',text:'2분치 수익 즉시 획득',money:()=>Math.max(500,(idleStats&&idleStats.income||0)*120),good:true},
    {key:'chicken',label:'치킨 유혹',text:'치킨값 지출',money:()=>-Math.min(n(idlePlayer.money)*.05,Math.max(20000,n(idlePlayer.money)*.12)),bad:true},
    {key:'burnout',label:'번아웃',text:'60초간 수익 -30%',dur:60,bad:true},
    {key:'server_down',label:'서버 터짐',text:'1분치 수익 증발',money:()=>-Math.min(n(idlePlayer.money)*.08,(idleStats&&idleStats.income||0)*60),bad:true}
  ];
    const pool=events.filter(e=>e.good||Math.random()>(.45+luck)); const ev=pool[Math.floor(Math.random()*pool.length)]||events[0]; idleApplyEvent(ev);
  }
  async function idleApplyEvent(ev){ if(!idlePlayer)return; let amount=0,patch={}; if(ev.money){amount=Math.floor(ev.money()); idlePlayer.money=Math.max(0,n(idlePlayer.money)+amount); if(amount>0)idlePlayer.lifetime_money=n(idlePlayer.lifetime_money)+amount; patch.money=n(idlePlayer.money); patch.lifetime_money=n(idlePlayer.lifetime_money); } if(ev.dur){ patch.active_event_key=ev.key; patch.active_event_until=new Date(Date.now()+ev.dur*1000).toISOString(); idlePlayer.active_event_key=patch.active_event_key; idlePlayer.active_event_until=patch.active_event_until; } idleLogEvent(ev.key,ev.label,ev.text,amount); await idleSavePlayer(patch); idleRenderAll(); idleToast(`${ev.label}: ${ev.text}`+(amount?` (${amount>0?'+':''}${won(amount)})`:''),ev.bad?'error':'ok'); }
  async function idleLogEvent(key,label,text,amount=0){ if(!idlePlayer)return; try{ await sbFetch('/idle_event_logs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify([{player_id:idlePlayer.id,event_key:key,event_label:label,effect_text:text,amount:Math.floor(amount)}])}); }catch(e){} }
  function idleCasinoBet(type,money){
    const m=Math.max(0,n(money));
    if(type==='coin')return Math.max(100,Math.min(m*.035,3000000));
    if(type==='slot')return Math.max(300,Math.min(m*.055,8000000));
    if(type==='lotto')return Math.max(1000,Math.min(m*.085,25000000));
    return 100;
  }
  function idleCasinoInfo(){
    return {
      coin:{label:'동전 뒤집기',hint:'승률 48% · 적중 시 배팅금 2배',desc:'가장 무난하지만 평균은 살짝 손해'},
      slot:{label:'삼단 슬롯',hint:'소박/중박/대박 · 꽝 있음',desc:'변동성이 있는 중간 위험 게임'},
      lotto:{label:'인생역전 로또',hint:'승률 8% · 적중 시 배팅금 10배',desc:'거의 잃지만 터지면 큼'}
    };
  }
  async function idleCasino(type){
    if(!idlePlayer||idleCasinoBusy)return;
    idleCasinoBusy=true;
    try{
      const money=n(idlePlayer.money);
      if(money<100){idleToast('카지노는 최소 100원부터','error');return;}
      const info=idleCasinoInfo()[type]||idleCasinoInfo().coin;
      const bet=Math.floor(Math.min(money,idleCasinoBet(type,money)));
      let result=0,text='';
      if(type==='coin'){
        const win=Math.random()<.48;
        result=win?bet:-bet;
        text=win?'앞면 적중':'뒷면 꽝';
      }else if(type==='slot'){
        const r=Math.random();
        let mult=0;
        if(r<.015)mult=8;
        else if(r<.07)mult=3.2;
        else if(r<.24)mult=1.6;
        else if(r<.42)mult=.55;
        else mult=0;
        result=Math.floor(bet*(mult-1));
        text=mult>=1?`${mult.toFixed(1)}배 당첨`:mult>0?`일부 회수 ${mult.toFixed(2)}배`:'꽝';
      }else if(type==='lotto'){
        const win=Math.random()<.08;
        result=win?bet*9:-bet;
        text=win?'인생역전 당첨':'낙첨';
      }
      result=Math.floor(result);
      idlePlayer.money=Math.max(0,money+result);
      if(result>0)idlePlayer.lifetime_money=n(idlePlayer.lifetime_money)+result;
      await idleSavePlayer({money:n(idlePlayer.money),lifetime_money:n(idlePlayer.lifetime_money)});
      await idleLogEvent('casino_'+type,info.label,`${text} · 배팅 ${won(bet)}`,result);
      idleRenderAll();
      idleToast(`${info.label} ${text} · ${result>=0?'+':''}${won(result)}`,result<0?'error':'ok');
    }finally{ setTimeout(()=>idleCasinoBusy=false,650); }
  }
  function renderIdleCasino(){
    const box=$i('idleCasinoBox'); if(!box)return;
    const info=idleCasinoInfo(); const money=idlePlayer?n(idlePlayer.money):0;
    box.innerHTML=`<div class="idle-panel idle-casino-panel"><h3>카지노</h3><p class="idle-muted">카지노는 업그레이드가 아니라 별도 도박 콘텐츠야. 확률은 고정이고, 평균적으로는 조금 손해라서 성장 핵심은 업그레이드가 맞아.</p><div class="idle-casino-grid">${Object.entries(info).map(([k,v])=>`<button type="button" data-casino="${k}" ${!idlePlayer||money<100?'disabled':''}><b>${html(v.label)}</b><small>${html(v.hint)}</small><small>예상 배팅 ${idlePlayer?won(idleCasinoBet(k,money)):'-'}</small></button>`).join('')}</div></div>`;
    box.querySelectorAll('[data-casino]').forEach(b=>b.onclick=()=>idleCasino(b.dataset.casino));
  }
  async function idleLoadPublic(){ const box=$i('idlePublicBox'); if(!box)return; try{ const [rank,recent]=await Promise.all([sbFetch('/idle_player_rankings?select=*&order=lifetime_money.desc&limit=20'),sbFetch('/idle_recent_events?select=*&order=created_at.desc&limit=16')]); const me=idlePlayer&&idlePlayer.name; box.innerHTML=`<div class="idle-panel"><h3>전체 자산 랭킹</h3>${(rank||[]).length?(rank||[]).map((r,i)=>`<div class="idle-rank ${me===r.name?'me':''}"><b>${i+1}</b><span>${html(r.name)}<small>${html(r.title||'')}</small></span><strong>${compact(r.lifetime_money)}원</strong></div>`).join(''):'<p class="idle-muted">아직 랭킹 없음</p>'}</div><div class="idle-panel"><h3>최근 성장/도박 이력</h3>${(recent||[]).length?(recent||[]).map(r=>`<div class="idle-log"><span>${html(r.name||'-')} · ${html(r.event_label||'이벤트')}<small>${html(r.effect_text||'')}</small></span><strong class="${n(r.amount)<0?'bad':'good'}">${n(r.amount)?(n(r.amount)>0?'+':'')+compact(r.amount)+'원':''}</strong></div>`).join(''):'<p class="idle-muted">최근 이력 없음</p>'}</div>`; }catch(e){ box.innerHTML='<p class="idle-muted">랭킹/이력을 불러오지 못했어. SQL 실행 여부를 확인해줘.</p>'; } }
  function idleRenderAll(){ idleStats=deriveIdleStats(); if(!$i('idlePlayerName'))return; const p=idlePlayer; $i('idlePlayerName').textContent=p?p.name:'-'; $i('idleTitleText').textContent=p?idleTitle(p.lifetime_money):'-'; $i('idleMoneyText').textContent=p?won(p.money):'0원'; $i('idleLifeText').textContent=p?won(p.lifetime_money):'0원'; $i('idleCpsText').textContent=p?won(idleStats.income)+'/s':'0원/s'; $i('idleClickText').textContent=p?won(idleStats.click):'0원'; $i('idleOfflineText').textContent=p?`최대 ${idleStats.offlineHours.toFixed(1)}시간`:'-'; const ev=$i('idleEventText'); if(ev){ const until=p&&p.active_event_until?new Date(p.active_event_until).getTime():0; ev.textContent=until>Date.now()?`${eventName(p.active_event_key)} ${Math.ceil((until-Date.now())/1000)}초`:'이벤트 없음'; }
    renderIdleUpgrades(); }
  function eventName(k){return {awakening:'각성',burnout:'번아웃',lucky_day:'운수 좋은 날'}[k]||'이벤트';}
  function renderIdleUpgrades(){ const list=$i('idleUpgradeList'); if(!list)return; const savedTab=localStorage.getItem(IDLE_TAB_KEY)||'click'; const tab=IDLE_TABS.some(([k])=>k===savedTab)?savedTab:'click'; if(tab!==savedTab)localStorage.setItem(IDLE_TAB_KEY,tab);
    const arr=IDLE_UPGRADES.filter(u=>u.cat===tab); list.innerHTML=arr.map(u=>{ const lv=idleLevel(u.key),cost=idleCost(u,lv),max=lv>=u.max,can=idlePlayer&&!max&&n(idlePlayer.money)>=cost; return `<div class="idle-upgrade ${can?'can':''}"><div><b>${html(u.name)} <em>Lv.${lv}/${u.max}</em></b><small>${html(u.desc)}</small><small>다음 비용 ${max?'MAX':won(cost)}</small></div><button type="button" data-up="${u.key}" ${!can?'disabled':''}>${max?'MAX':'구매'}</button></div>`; }).join(''); list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>idleBuyUpgrade(b.dataset.up)); renderIdleCasino(); }
  function setIdleTab(tab){ localStorage.setItem(IDLE_TAB_KEY,tab); document.querySelectorAll('.idle-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); renderIdleUpgrades(); }
  function currentName(){return localStorage.getItem(IDLE_NAME_KEY)||localStorage.getItem('simple_budget_last_game_name')||'';}
  function idleErr(e){return e&&e.message?e.message:String(e||'알 수 없는 오류');}
  function idleToast(msg,type='ok'){ if(typeof showToast==='function')showToast(msg,type==='error'?'error':''); else console.log(msg); }
  function injectIdleStyle(){ if($i('idleStyle'))return; const st=document.createElement('style'); st.id='idleStyle'; st.textContent=`
    .idle-card .app-icon{background:linear-gradient(135deg,#fef3c7,#fb923c)!important}.idle-page{display:none}.idle-page.active{display:block}.idle-shell{display:grid;gap:12px}.idle-login{display:flex;gap:8px;align-items:center}.idle-login input{flex:1}.idle-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.idle-status-grid>div{background:rgba(15,23,42,.06);border:1px solid rgba(15,23,42,.08);border-radius:14px;padding:10px}.idle-status-grid span{display:block;font-size:12px;color:#64748b}.idle-status-grid strong{font-size:17px}.idle-work-btn{width:100%;border:0;border-radius:22px;padding:20px;font-weight:1000;font-size:22px;background:linear-gradient(135deg,#fde68a,#fb923c);color:#111827;box-shadow:0 10px 22px rgba(251,146,60,.25)}.idle-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}.idle-tab{white-space:nowrap;border:1px solid rgba(15,23,42,.1);background:#fff;border-radius:999px;padding:8px 11px;font-weight:900}.idle-tab.active{background:#111827;color:#fff}.idle-upgrade-list{display:grid;gap:8px}.idle-upgrade{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(15,23,42,.1);border-radius:14px;padding:10px;background:#fff}.idle-upgrade.can{border-color:#fb923c;box-shadow:0 0 0 2px rgba(251,146,60,.12)}.idle-upgrade b{display:block}.idle-upgrade em{font-style:normal;color:#f97316}.idle-upgrade small{display:block;color:#64748b;font-size:12px}.idle-upgrade button,.idle-casino-grid button{border:0;border-radius:12px;padding:10px 12px;background:#111827;color:#fff;font-weight:900}.idle-upgrade button:disabled{background:#cbd5e1}.idle-casino-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.idle-casino-panel{background:linear-gradient(135deg,#fff7ed,#fff)!important}.idle-casino-grid button{min-height:102px;background:linear-gradient(135deg,#111827,#7c2d12)}.idle-casino-grid button:disabled{background:#cbd5e1;color:#64748b}.idle-casino-grid small{display:block;color:#fed7aa;font-size:11px;margin-top:6px}.idle-casino-grid button:disabled small{color:#64748b}.idle-public{display:grid;grid-template-columns:1fr 1fr;gap:10px}.idle-panel{border:1px solid rgba(15,23,42,.1);border-radius:16px;background:#fff;padding:10px}.idle-panel h3{margin:0 0 8px}.idle-rank,.idle-log{display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid rgba(15,23,42,.06);padding:7px 0}.idle-rank:first-of-type,.idle-log:first-of-type{border-top:0}.idle-rank.me{background:#fef3c7;border-radius:10px;padding-left:6px;padding-right:6px}.idle-rank span,.idle-log span{display:flex;flex-direction:column}.idle-rank small,.idle-log small,.idle-muted{color:#64748b;font-size:12px}.idle-log strong.good{color:#16a34a}.idle-log strong.bad{color:#dc2626}@media(max-width:720px){.idle-public{grid-template-columns:1fr}.idle-casino-grid{grid-template-columns:1fr}.idle-status-grid{grid-template-columns:1fr 1fr}.idle-work-btn{padding:18px}}
  `; document.head.appendChild(st); }
  function ensureIdleUi(){
    if(idleReady)return; idleReady=true; injectIdleStyle();
    const homeGrid=document.querySelector('#homeView .app-grid,.app-grid,#homeView .home-grid,.home-grid,.game-grid');
    if(homeGrid&&!$i('homeIdleCard')){ const card=document.createElement('button'); card.id='homeIdleCard'; card.type='button'; card.className=homeGrid.classList.contains('app-grid')?'app-card idle-card':'home-card game-card idle-card'; card.innerHTML=homeGrid.classList.contains('app-grid')?'<div class="app-icon">🛌</div><div><div class="app-name">백수 키우기</div><div class="app-desc">일하고 투자하고 가끔 도박하기</div></div>':'<span class="home-card-icon">🛌</span><strong>백수 키우기</strong><small>방치형 인생역전 RPG</small>'; card.onclick=()=>setMainView('idle'); homeGrid.appendChild(card); }
    if(!$i('showIdleBtn')){ const btn=document.createElement('button'); btn.id='showIdleBtn'; btn.type='button'; btn.className='drawer-btn'; btn.innerHTML='<span>🛌</span> 백수 키우기'; btn.onclick=()=>setMainView('idle'); ($i('showBrickBtn')||$i('showOmokBtn')||document.querySelector('.drawer-menu button:last-child'))?.insertAdjacentElement('afterend',btn); }
    const main=document.querySelector('main')||document.body;
    if(!$i('idleView')){ const view=document.createElement('section'); view.id='idleView'; view.className='view-page idle-page'; view.innerHTML=`
      <div class="game-card idle-shell">
        <div class="game-header-row"><div><h2>백수 키우기</h2><p>일하기로 시작해서 알바, 부업, 자동화, 투자, 카지노까지 굴리는 방치형 RPG.</p></div><button id="idleRefreshBtn" class="mini-btn" type="button">랭킹 새로고침</button></div>
        <div class="idle-login card-soft"><input id="idleNameInput" class="text-input" maxlength="20" placeholder="이름 입력"/><button id="idleLoadBtn" class="primary-btn" type="button">불러오기</button><button id="idleSaveBtn" class="ghost-btn" type="button">저장</button></div>
        <div class="idle-status-grid"><div><span>이름</span><strong id="idlePlayerName">-</strong></div><div><span>칭호</span><strong id="idleTitleText">-</strong></div><div><span>현재 자산</span><strong id="idleMoneyText">0원</strong></div><div><span>총 번 돈</span><strong id="idleLifeText">0원</strong></div><div><span>초당 수익</span><strong id="idleCpsText">0원/s</strong></div><div><span>클릭 수익</span><strong id="idleClickText">0원</strong></div><div><span>오프라인 보상</span><strong id="idleOfflineText">-</strong></div><div><span>상태 이벤트</span><strong id="idleEventText">이벤트 없음</strong></div></div>
        <button id="idleWorkBtn" class="idle-work-btn" type="button">일하기</button>
        <div class="idle-tabs">${IDLE_TABS.map(([k,t])=>`<button class="idle-tab" data-tab="${k}" type="button">${t}</button>`).join('')}</div>
        <div id="idleUpgradeList" class="idle-upgrade-list"></div>
        <div id="idleCasinoBox" class="idle-casino-wrap"></div>
        <div id="idlePublicBox" class="idle-public"></div>
      </div>`; main.appendChild(view); }
    $i('idleNameInput').value=currentName(); $i('idleLoadBtn').onclick=idleLoadByName; $i('idleSaveBtn').onclick=()=>idleFlushSave().then(()=>idleToast('저장 완료')); $i('idleWorkBtn').onclick=idleWorkClick; $i('idleRefreshBtn').onclick=idleLoadPublic; const activeIdleTab=IDLE_TABS.some(([k])=>k===(localStorage.getItem(IDLE_TAB_KEY)||'click'))?(localStorage.getItem(IDLE_TAB_KEY)||'click'):'click'; document.querySelectorAll('.idle-tab').forEach(b=>{b.onclick=()=>setIdleTab(b.dataset.tab); b.classList.toggle('active',b.dataset.tab===activeIdleTab);}); renderIdleUpgrades(); idleLoadPublic();
  }
  function showIdleView(){ ensureIdleUi(); currentMainView='idle'; document.querySelectorAll('.view-page').forEach(v=>v.classList.toggle('active',v.id==='idleView')); const add=$i('addBtn'); if(add)add.style.display='none'; ['showBudgetBtn','showTetrisBtn','showDinoBtn','showBambooBtn','showJumpBtn','showOmokBtn','showBrickBtn','showIdleBtn'].forEach(id=>{const el=$i(id); if(el)el.classList.toggle('active',id==='showIdleBtn');}); if(typeof closeDrawer==='function')closeDrawer(); idleRenderAll(); }
  const prevSetMainView=setMainView;
  setMainView=function(view){ if(view==='idle'){showIdleView();return;} const r=prevSetMainView(view); const iv=$i('idleView'); if(iv)iv.classList.remove('active'); return r; };
  if(typeof testGithubConnection==='function'){ const oldTest=testGithubConnection; testGithubConnection=async function(){ await oldTest(); try{ await sbFetch('/idle_players?select=id&limit=1'); await sbFetch('/idle_upgrades?select=player_id&limit=1'); await sbFetch('/idle_player_rankings?select=name&limit=1'); idleToast('백수 키우기 테이블 연결 성공'); }catch(e){ alert('백수 키우기 테이블 확인 실패: '+idleErr(e)+'\n전달한 supabase_idle_life.sql을 먼저 실행해줘.'); } }; const btn=$i('testGithubBtn'); if(btn)btn.onclick=testGithubConnection; }
  window.addEventListener('beforeunload',()=>{try{idleFlushSave();}catch{}});
  setTimeout(ensureIdleUi,0);
})();
