const socket = io();
let allEvents = [], currentFilter = "all", severityFilter = "all";
let autoScroll = true, sessionSeconds = 0, sessionTimer = null;
const TYPE_ICONS = { process:"⚙️", cpu:"🔥", memory:"💾", file:"📁", network:"🌐", error:"⛔" };

const lineOpts = { responsive:true, animation:{duration:300}, plugins:{legend:{display:false}}, scales:{ x:{display:false}, y:{min:0,max:100,ticks:{color:"#4b5563"},grid:{color:"#1f2333"}} }, elements:{point:{radius:0},line:{tension:0.4,borderWidth:2}} };

const cpuChart = new Chart(document.getElementById("cpuChart"), { type:"line", data:{ labels:Array(30).fill(""), datasets:[{data:Array(30).fill(0),borderColor:"#f59e0b",backgroundColor:"rgba(245,158,11,0.08)",fill:true}] }, options:JSON.parse(JSON.stringify(lineOpts)) });
const memChart = new Chart(document.getElementById("memChart"), { type:"line", data:{ labels:Array(30).fill(""), datasets:[{data:Array(30).fill(0),borderColor:"#a855f7",backgroundColor:"rgba(168,85,247,0.08)",fill:true}] }, options:JSON.parse(JSON.stringify(lineOpts)) });
const pieChart = new Chart(document.getElementById("pieChart"), { type:"doughnut", data:{ labels:["Process","CPU","Memory","File","Network","Error"], datasets:[{data:[0,0,0,0,0,0],backgroundColor:["#3b82f6","#f59e0b","#a855f7","#22c55e","#06b6d4","#ef4444"],borderWidth:0}] }, options:{ responsive:true, plugins:{legend:{display:true,position:"bottom",labels:{color:"#6b7280",font:{size:9},padding:8,boxWidth:10}}} } });

function updateCharts(cpu,mem){
  cpuChart.data.datasets[0].data.shift(); cpuChart.data.datasets[0].data.push(cpu); cpuChart.update("none");
  memChart.data.datasets[0].data.shift(); memChart.data.datasets[0].data.push(mem); memChart.update("none");
  document.getElementById("cpuBar").style.width=cpu+"%";
  document.getElementById("memBar").style.width=mem+"%";
  document.getElementById("cpuValue").textContent=cpu+"%";
  document.getElementById("memValue").textContent=mem+"%";
}

function updatePie(){
  var c={process:0,cpu:0,memory:0,file:0,network:0,error:0};
  allEvents.forEach(function(e){ if(c[e.type]!==undefined) c[e.type]++; });
  pieChart.data.datasets[0].data=Object.values(c);
  pieChart.update();
}

function updateStats(){
  var c={process:0,cpu:0,memory:0,error:0};
  allEvents.forEach(function(e){
    if(e.type==="error"||e.severity==="critical") c.error++;
    else if(c[e.type]!==undefined) c[e.type]++;
  });
  document.getElementById("statProcess").textContent=c.process;
  document.getElementById("statCPU").textContent=c.cpu;
  document.getElementById("statMemory").textContent=c.memory;
  document.getElementById("statError").textContent=c.error;
  document.getElementById("totalEventCount").textContent=allEvents.length;
}

socket.on("init",function(data){
  allEvents=data.events||[];
  allEvents.forEach(function(e){ addRow(e,false); });
  applyFilters(); updatePie(); updateStats(); updateStatus(data.isLogging);
});

socket.on("new-event",function(event){
  allEvents.push(event);
  var es=document.getElementById("emptyState");
  if(es) es.remove();
  addRow(event,true);
  applyFilters(); updateStats(); updatePie();
  if(event.severity==="critical"||event.type==="error") showToast("🚨 "+event.message.slice(0,60));
});

socket.on("stats",function(data){ updateCharts(data.cpuUsage,data.memUsage); });

socket.on("logging-status",function(data){
  updateStatus(data.isLogging);
  if(data.isLogging){
    sessionSeconds=0; clearInterval(sessionTimer);
    sessionTimer=setInterval(function(){
      sessionSeconds++;
      var m=String(Math.floor(sessionSeconds/60)).padStart(2,"0");
      var s=String(sessionSeconds%60).padStart(2,"0");
      document.getElementById("sessionTime").textContent=m+":"+s;
    },1000);
  } else { clearInterval(sessionTimer); }
});

socket.on("logs-cleared",function(){
  allEvents=[];
  document.getElementById("logContainer").innerHTML="<div id=emptyState style=text-align:center;padding:60px;color:#4b5563><div style=font-size:3rem>🖥️</div><p>Logs cleared. Click Start Logging to begin.</p></div>";
  updateStats(); updatePie(); showToast("🗑️ Logs cleared");
});

socket.on("download-data",function(data){
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  var url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;
  a.download="os-event-log-"+new Date().toISOString().slice(0,19).replace(/:/g,"-")+".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast("✅ Log downloaded");
});

function addRow(event,animate){
  var c=document.getElementById("logContainer");
  var time=new Date(event.timestamp).toLocaleTimeString();
  var div=document.createElement("div");
  div.className="log-entry log-"+event.type+" sev-"+event.severity;
  if(animate===false) div.style.animation="none";
  div.dataset.type=event.type;
  div.dataset.severity=event.severity;
  div.dataset.message=event.message.toLowerCase();
  var icon=TYPE_ICONS[event.type]||"";
  div.innerHTML="<span style=color:#6b7280;font-size:11px;white-space:nowrap>"+time+"</span>"
    +"<span class=type-badge style=margin:0_4px>"+icon+" "+event.type+"</span>"
    +"<span class=sev-badge>"+event.severity+"</span>"
    +"<span style=flex:1;color:#d1d5db;font-size:11px;margin:0_8px>"+event.message+"</span>"
    +"<span style=color:#4b5563;font-size:10px;white-space:nowrap>CPU:"+event.cpuUsage+"% MEM:"+event.memUsage+"%</span>";
  c.appendChild(div);
  if(autoScroll) c.scrollTop=c.scrollHeight;
}

function applyFilters(){
  var search=document.getElementById("searchInput").value.toLowerCase();
  var count=0;
  document.querySelectorAll(".log-entry").forEach(function(row){
    var show=(currentFilter==="all"||row.dataset.type===currentFilter)
      &&(severityFilter==="all"||row.dataset.severity===severityFilter)
      &&(!search||row.dataset.message.includes(search));
    row.style.display=show?"":"none";
    if(show) count++;
  });
  document.getElementById("filteredCount").textContent=count+" events";
}

function setFilter(f){
  currentFilter=f;
  document.querySelectorAll(".filter-btn").forEach(function(b){ b.classList.toggle("active-filter",b.dataset.filter===f); });
  applyFilters();
}

function setSeverityFilter(s){
  severityFilter=s;
  document.querySelectorAll(".severity-btn").forEach(function(b){ b.classList.toggle("active-severity",b.dataset.severity===s); });
  applyFilters();
}

function updateStatus(active){
  var dot=document.getElementById("statusDot"),txt=document.getElementById("statusText");
  var bs=document.getElementById("btnStart"),bst=document.getElementById("btnStop");
  if(active){
    dot.className="w-2.5 h-2.5 rounded-full live";
    txt.textContent="Live"; txt.className="text-xs text-green-400 uppercase tracking-wider";
    bs.disabled=true; bs.classList.add("opacity-50","cursor-not-allowed");
    bst.disabled=false; bst.classList.remove("opacity-50","cursor-not-allowed");
  } else {
    dot.className="w-2.5 h-2.5 rounded-full bg-gray-600";
    txt.textContent="Idle"; txt.className="text-xs text-gray-400 uppercase tracking-wider";
    bs.disabled=false; bs.classList.remove("opacity-50","cursor-not-allowed");
    bst.disabled=true; bst.classList.add("opacity-50","cursor-not-allowed");
  }
}

function startLogging(){ socket.emit("start-logging"); }
function stopLogging(){ socket.emit("stop-logging"); }
function clearLogs(){ if(confirm("Clear all logs?")) socket.emit("clear-logs"); }
function downloadLogs(){ socket.emit("request-download"); }
function toggleAutoScroll(cb){ autoScroll=cb.checked; }

function showToast(msg){
  var t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  setTimeout(function(){ t.classList.remove("show"); },3000);
}

document.addEventListener("keydown",function(e){
  if(e.ctrlKey||e.metaKey){
    if(e.key==="Enter"){ e.preventDefault(); startLogging(); }
    if(e.key==="."){ e.preventDefault(); stopLogging(); }
  }
});
