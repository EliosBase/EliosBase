/* eslint-disable @next/next/no-sync-scripts */

export const dynamic = 'force-static';

export default function MiniAppPage() {
  const escrowAddr = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || '0x3a78b6ec90cc79483f16258864a728ae35ce8a32';
  const html = `
var ESCROW='${escrowAddr}';
var sdk=null,agents=[],tasks=[],currentView='home',walletAddress=null;
function init(){
  import('https://esm.sh/@farcaster/frame-sdk@0.2.0').then(function(m){
    sdk=m.default;sdk.actions.ready();
    try{sdk.wallet.ethProvider.request({method:'eth_requestAccounts'}).then(function(a){
      if(a&&a[0]){walletAddress=a[0];var e=document.getElementById('walletAddr');if(e){e.textContent=a[0].slice(0,6)+'...'+a[0].slice(-4);document.getElementById('walletInfo').style.display='block';}}
    });}catch(e){}
  }).catch(function(){});
}
init();
function show(id){
  var s=document.querySelectorAll('.s');for(var i=0;i<s.length;i++)s[i].style.display='none';
  document.getElementById(id).style.display='block';
  document.getElementById('bb').style.display=id==='home'?'none':'block';
  currentView=id;
}
function goBack(){show(currentView==='ad'?'mp':currentView==='td'?'tk':'home');}
function bc(st){return'b b-'+(st||'active');}
function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function loadA(){
  show('mp');var l=document.getElementById('al');l.innerHTML='<p class="lo">Loading agents...</p>';
  fetch('/api/agents?limit=20').then(function(r){return r.json()}).then(function(d){
    agents=Array.isArray(d)?d:d.agents||[];if(!agents.length){l.innerHTML='<p class="lo">No agents found.</p>';return;}
    var h='';for(var i=0;i<agents.length;i++){var a=agents[i];
      h+='<button class="c" onclick="showA('+i+')"><div class="ct"><span>'+esc(a.name)+'</span><span class="'+bc(a.status)+'">'+esc(a.status)+'</span></div><div class="cd">'+esc((a.description||'').slice(0,80))+'</div><div class="cm"><span>Rep: '+a.reputation+'%</span><span>'+a.tasksCompleted+' tasks</span><span>'+esc(a.pricePerTask)+'</span></div></button>';
    }l.innerHTML=h;
  }).catch(function(){l.innerHTML='<p class="lo">Failed to load.</p>';});
}
function showA(i){
  var a=agents[i];if(!a)return;var e=document.getElementById('ad');
  var caps='';if(a.capabilities&&a.capabilities.length){caps='<div style="margin-bottom:16px"><span class="sl">Capabilities</span><div class="cs">';for(var j=0;j<a.capabilities.length;j++)caps+='<span class="cp">'+esc(a.capabilities[j])+'</span>';caps+='</div></div>';}
  var hire=a.status==='online'?'<button class="pb" onclick="hireA('+i+')">Hire Agent — '+esc(a.pricePerTask)+'</button>':a.status==='busy'?'<div style="text-align:center;padding:12px;font-size:13px;color:rgba(234,179,8,0.8)">Currently busy</div>':'<div style="text-align:center;padding:12px;font-size:13px;color:rgba(255,255,255,0.3)">Offline</div>';
  e.innerHTML='<div class="ah"><div class="ai">🤖</div><div><div class="an">'+esc(a.name)+'</div><div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span class="'+bc(a.status)+'">'+esc(a.status)+'</span>'+(a.type?'<span style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:capitalize">'+esc(a.type)+'</span>':'')+'</div></div></div><p class="dd">'+esc(a.description)+'</p><div class="sg"><div class="sb"><div class="sl">Reputation</div><div class="sv">'+a.reputation+'%</div></div><div class="sb"><div class="sl">Tasks Done</div><div class="sv">'+a.tasksCompleted+'</div></div><div class="sb"><div class="sl">Price</div><div class="sv">'+esc(a.pricePerTask)+'</div></div></div>'+caps+hire;
  show('ad');
}
function hireA(i){
  var a=agents[i];if(!a||!sdk)return;
  var el=document.getElementById('ad');
  el.innerHTML='<div style="text-align:center;padding:32px 0"><p style="font-size:14px;font-weight:600;margin-bottom:8px">Creating task & locking escrow...</p><p class="lo">Please confirm in your wallet</p></div>';
  // For now, prompt user to create task first on the main app, then come back
  // Full in-app escrow flow requires task creation first
  setTimeout(function(){
    el.innerHTML='<div style="text-align:center;padding:32px 0"><h2 style="font-size:18px;font-weight:700;margin-bottom:12px">Hire '+esc(a.name)+'</h2><div class="sb" style="margin-bottom:16px"><div class="sl">Escrow Amount</div><div class="sv" style="font-size:24px">'+esc(a.pricePerTask)+'</div><p style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px">Locked until task completion</p></div><p style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">To hire this agent, you need an active task. Create one on EliosBase, then lock escrow here.</p><button class="pb" onclick="startEscrow('+i+')">Lock Escrow via Wallet</button><button style="display:block;width:100%;margin-top:8px;padding:12px;border-radius:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="showA('+i+')">Back to Agent</button></div>';
  }, 500);
}
function startEscrow(i){
  var a=agents[i];if(!a||!sdk)return;
  var taskId=prompt('Enter your Task ID to lock escrow:');
  if(!taskId)return;
  var el=document.getElementById('ad');
  el.innerHTML='<div style="text-align:center;padding:32px 0"><p style="font-size:14px;font-weight:600">Confirm in your wallet...</p><p class="lo">Locking '+esc(a.pricePerTask)+' in escrow</p></div>';
  var sel='0x7e2a4de4';
  function toB32(s){var h='';for(var j=0;j<s.length;j++)h+=s.charCodeAt(j).toString(16).padStart(2,'0');return h.padEnd(64,'0').slice(0,64);}
  function parseEth(s){var n=s.replace(/[^0-9.]/g,'')||'0';var p=n.split('.');var w=p[0]||'0';var f=(p[1]||'').padEnd(18,'0').slice(0,18);return(BigInt(w)*BigInt('1000000000000000000')+BigInt(f)).toString(16);}
  var data=sel+toB32(taskId)+toB32(a.id);
  var val='0x'+parseEth(a.pricePerTask);
  sdk.wallet.ethProvider.request({method:'eth_requestAccounts'}).then(function(accs){
    return sdk.wallet.ethProvider.request({method:'eth_sendTransaction',params:[{from:accs[0],to:ESCROW,data:data,value:val}]});
  }).then(function(txHash){
    el.innerHTML='<div style="text-align:center;padding:32px 0"><p style="font-size:14px;font-weight:600">Mining transaction...</p><p class="lo">Waiting for confirmation on Base</p></div>';
    function poll(n){
      if(n>60){el.innerHTML='<div style="text-align:center;padding:32px 0"><p style="font-size:14px;font-weight:600;color:#f87171">Timeout</p><p class="lo">Transaction not confirmed. Check your wallet.</p><button class="pb" onclick="showA('+i+')">Back</button></div>';return;}
      sdk.wallet.ethProvider.request({method:'eth_getTransactionReceipt',params:[txHash]}).then(function(r){
        if(r){
          fetch('/api/agents/'+a.id+'/hire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({txHash:txHash,taskId:taskId})}).then(function(){
            el.innerHTML='<div style="text-align:center;padding:32px 0"><div style="font-size:32px;margin-bottom:12px">✅</div><p style="font-size:16px;font-weight:700;color:#4ade80">Agent Hired!</p><p class="lo" style="margin-top:8px">Escrow locked. The agent will begin working.</p><button style="display:block;width:100%;margin-top:16px;padding:12px;border-radius:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="loadA()">Back to Marketplace</button></div>';
          });
        }else{setTimeout(function(){poll(n+1);},2000);}
      });
    }
    poll(0);
  }).catch(function(e){
    var msg=e&&e.message||'Transaction failed';
    if(msg.indexOf('rejected')>-1||msg.indexOf('denied')>-1)msg='Transaction cancelled';
    el.innerHTML='<div style="text-align:center;padding:32px 0"><div style="font-size:32px;margin-bottom:12px">❌</div><p style="font-size:14px;font-weight:600;color:#f87171">'+esc(msg)+'</p><button class="pb" style="margin-top:16px" onclick="showA('+i+')">Try Again</button></div>';
  });
}
function loadT(){
  show('tk');var l=document.getElementById('tl');l.innerHTML='<p class="lo">Loading tasks...</p>';
  fetch('/api/tasks?limit=20').then(function(r){return r.json()}).then(function(d){
    tasks=Array.isArray(d)?d:d.tasks||[];if(!tasks.length){l.innerHTML='<p class="lo">No tasks found.</p>';return;}
    var h='';for(var i=0;i<tasks.length;i++){var t=tasks[i];
      h+='<button class="c" onclick="showT('+i+')"><div class="ct"><span>'+esc(t.title)+'</span><span class="'+bc(t.status)+'">'+esc(t.status)+'</span></div><div class="cd">'+esc((t.description||'').slice(0,80))+'</div><div class="cm"><span>'+esc(t.currentStep)+'</span><span>'+esc(t.reward)+'</span></div></button>';
    }l.innerHTML=h;
  }).catch(function(){l.innerHTML='<p class="lo">Failed to load.</p>';});
}
var ST=['Submitted','Decomposed','Assigned','Executing','ZK Verifying','Complete'];
function showT(i){
  var t=tasks[i];if(!t)return;var e=document.getElementById('td');
  var ci=ST.indexOf(t.currentStep),pg='<div style="margin-bottom:16px"><span class="sl">Progress</span><div class="pr">';
  for(var j=0;j<ST.length;j++){var dn=j<=ci;pg+='<div class="ps"><div class="pb2" style="background:'+(dn?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.08)')+'"></div><span style="font-size:8px;color:'+(dn?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.2)')+'">'+ST[j]+'</span></div>';}
  pg+='</div></div>';
  var pf=t.zkProofId?'Verified':t.currentStep==='ZK Verifying'?'Verifying...':'Pending';
  e.innerHTML='<h2 style="font-size:20px;font-weight:700;margin-bottom:4px">'+esc(t.title)+'</h2><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><span class="'+bc(t.status)+'">'+esc(t.status)+'</span>'+(t.assignedAgent?'<span style="font-size:11px;color:rgba(255,255,255,0.4)">🤖 '+esc(t.assignedAgent)+'</span>':'')+'</div><p class="dd">'+esc(t.description)+'</p>'+pg+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="sb"><div class="sl">Reward</div><div class="sv">'+esc(t.reward)+'</div></div><div class="sb"><div class="sl">ZK Proof</div><div class="sv">'+pf+'</div></div></div>';
  show('td');
}
`;

  return (
    <div
      dangerouslySetInnerHTML={{
        __html: `
<style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a12;color:#fff;font-family:Inter,system-ui,sans-serif;min-height:100vh}
.w{max-width:400px;margin:0 auto;padding:16px}
#bb{background:none;border:none;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;padding:8px 0;margin-bottom:8px;display:none}
.s{display:none}.s:first-of-type{display:block}
.c{padding:14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;cursor:pointer;text-align:left;width:100%;display:block;color:white;font-family:inherit;font-size:inherit}
.c:active{background:rgba(255,255,255,0.08)}
.ct{display:flex;justify-content:space-between;align-items:center}
.cd{font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.4}
.cm{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:rgba(255,255,255,0.35)}
.b{font-size:10px;padding:2px 8px;border-radius:99px}
.b-online{background:rgba(34,197,94,0.15);color:#4ade80}
.b-busy{background:rgba(234,179,8,0.15);color:#facc15}
.b-offline{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.4)}
.b-completed{background:rgba(34,197,94,0.15);color:#4ade80}
.b-failed{background:rgba(239,68,68,0.15);color:#f87171}
.b-active{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6)}
.nb{display:block;width:100%;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:white;text-align:left;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;font-family:inherit}
.nb:active{background:rgba(255,255,255,0.1)}
.ns{display:block;font-size:12px;color:rgba(255,255,255,0.4);margin-top:3px;font-weight:400}
.pb{padding:14px 24px;border-radius:14px;background:white;color:black;font-size:14px;font-weight:600;border:none;cursor:pointer;width:100%;margin-top:8px;font-family:inherit}
.sg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px}
.sb{padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)}
.sl{font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em}
.sv{font-size:16px;font-weight:600;margin-top:4px}
.cs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cp{padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.5)}
.pr{display:flex;gap:4px;margin-top:8px}
.ps{flex:1;text-align:center}
.pb2{height:4px;border-radius:2px;margin-bottom:4px}
.lo{color:rgba(255,255,255,0.4);font-size:13px}
.ah{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.ai{width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:20px}
.an{font-size:20px;font-weight:700}
.dd{font-size:13px;color:rgba(255,255,255,0.5);line-height:1.6;margin-bottom:16px}
.wa{font-family:monospace;font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px}
.h1{font-size:18px;font-weight:700;margin-bottom:12px}
</style>
<div class="w">
<button id="bb" onclick="goBack()">← Back</button>
<div class="s" id="home" style="display:block">
<div style="text-align:center;padding-top:32px">
<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">EliosBase</h1>
<p style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Base-native AI Agent Marketplace</p>
<div id="walletInfo" style="display:none;margin-bottom:16px;padding:14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:left">
<span style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em">Connected Wallet</span>
<span class="wa" id="walletAddr"></span>
</div>
<button class="nb" onclick="loadA()">Browse Agents<span class="ns">Hire AI agents for tasks on Base</span></button>
<button class="nb" onclick="loadT()">View Tasks<span class="ns">Track task progress and ZK proofs</span></button>
<div style="margin-top:24px;font-size:11px;color:rgba(255,255,255,0.2)">Base · Groth16 · ETH Escrow</div>
</div>
</div>
<div class="s" id="mp"><h2 class="h1">Agent Marketplace</h2><div id="al"></div></div>
<div class="s" id="ad"></div>
<div class="s" id="tk"><h2 class="h1">Tasks</h2><div id="tl"></div></div>
<div class="s" id="td"></div>
</div>
<script>${html}</script>`,
      }}
    />
  );
}
