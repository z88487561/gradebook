'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),uid=()=>Math.random().toString(36).slice(2,9),cmp=(a,b)=>a.localeCompare(b,'zh-Hant');
const norm=d=>({memos:[],notes:{},...d});let S=norm({grades:[],students:[],exams:[],scores:{}}),ui={tab:'exams',exam:null,stu:null,mt:[],tf:'',mode:'input',subj:null,sort:'total',ng:null,baks:[]},fm='csv';
/* storage: IndexedDB + rolling auto-backups */
const dbp=new Promise((ok,no)=>{const r=indexedDB.open('gradebook',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result)};r.onerror=()=>no(r.error)});
const kv=async(m,k,v)=>{const d=await dbp;return new Promise((ok,no)=>{const o=d.transaction('kv',m==='get'||m==='keys'?'readonly':'readwrite').objectStore('kv');const r=m==='get'?o.get(k):m==='put'?o.put(v,k):m==='del'?o.delete(k):o.getAllKeys();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})};
let tm;const save=()=>{clearTimeout(tm);tm=setTimeout(async()=>{await kv('put','state',S);await backup()},300)};
async function backup(){const ks=(await kv('keys')).filter(k=>k.startsWith('bak:')).sort();if(ks.length&&Date.now()-+ks.at(-1).slice(4)<6e5)return;await kv('put','bak:'+Date.now(),JSON.stringify(S));for(const k of ks.slice(0,Math.max(0,ks.length-7)))await kv('del',k)}
const flush=()=>{clearTimeout(tm);return kv('put','state',S)};addEventListener('visibilitychange',()=>{if(document.hidden)flush()});addEventListener('pagehide',flush);
const loadBaks=async()=>{ui.baks=(await kv('keys')).filter(k=>k.startsWith('bak:')).sort().reverse()};
/* model */
const G=id=>S.grades.find(g=>g.id===id),ST=id=>S.students.find(s=>s.id===id),EX=id=>S.exams.find(e=>e.id===id),SB=(g,id)=>G(g)?.subjects.find(s=>s.id===id);
const parts=e=>{const ids=new Set(S.students.filter(s=>s.grade===e.grade).map(s=>s.id));Object.keys(S.scores[e.id]||{}).forEach(i=>ST(i)&&ids.add(i));return[...ids].map(ST).sort((a,b)=>cmp(a.name,b.name))};
const sc=(e,sid,sub)=>S.scores[e.id]?.[sid]?.[sub];
const total=(e,sid)=>{const v=e.subjects.map(x=>sc(e,sid,x));return v.every(x=>x!=null)?v.reduce((a,b)=>a+b,0):null};
const rkP=(P,fn)=>{const l=P.map(s=>[s.id,fn(s.id)]).filter(x=>x[1]!=null),m={};l.forEach(([i,v])=>m[i]=1+l.filter(x=>x[1]>v).length);return m};
const ranks=(e,fn)=>rkP(parts(e),fn);
const partsM=ex=>{const m=new Map();ex.forEach(e=>parts(e).forEach(s=>m.set(s.id,s)));return[...m.values()]};
const pairsOf=rd=>rd.exams.flatMap(e=>e.subjects.map(id=>[e,id]));
const tot2=(pr,sid)=>{const v=pr.map(([e,id])=>sc(e,sid,id));return v.length&&v.every(x=>x!=null)?v.reduce((a,b)=>a+b,0):null};
const rdRanks=rd=>rkP(partsM(rd.exams),i=>tot2(pairsOf(rd),i));
function rounds(){const m=new Map();
 for(const e of S.exams){const k=e.grp?'g:'+e.grade+':'+e.grp:'e:'+e.id;if(!m.has(k))m.set(k,{key:k,label:e.grp||e.name,exams:[]});m.get(k).exams.push(e)}
 const l=[...m.values()];l.forEach(r=>{r.exams.sort((a,b)=>a.date.localeCompare(b.date));r.date=r.exams[0].date;r.end=r.exams.at(-1).date});
 return l.sort((a,b)=>a.date.localeCompare(b.date))}
const rankLive=(e,sub)=>{const rk=ranks(e,i=>sc(e,i,sub));document.querySelectorAll('[data-r]').forEach(m=>m.textContent=rk[m.dataset.r]?'第'+rk[m.dataset.r]+'名':'')};
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const gOpts=sel=>S.grades.map(g=>`<option value="${g.id}"${g.id===sel?' selected':''}>${esc(g.name)}</option>`).join('');
const SL={t:['需追蹤','s-t'],f:['持平','s-f'],u:['進步中','s-u']};
const nts=(e,sid,sub)=>S.notes[e.id]?.[sid]?.[sub]||{};
const cur=sid=>{const out=[],seen=new Set();
 for(const e of[...S.exams].sort((a,b)=>b.date.localeCompare(a.date)))for(const id of e.subjects){const nm=SB(e.grade,id)?.name,n=S.notes[e.id]?.[sid]?.[id];
  if(!nm||seen.has(nm)||(sc(e,sid,id)==null&&!n))continue;seen.add(nm);if(n?.s)out.push({nm,s:n.s})}
 return out};
const pills=l=>l.map(x=>`<i class="pill ${SL[x.s][1]}">${esc(x.nm)}：${SL[x.s][0]}</i>`).join('');
const needG='<p class="hint">請先到「設定」新增年級與科目。</p>';
/* views */
function render(){
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===ui.tab));
 const e=ui.exam&&EX(ui.exam),p=!e&&ui.stu&&ST(ui.stu);
 $('#ttl').innerHTML=e||p?`<button data-act="back" aria-label="返回">‹</button><h1>${esc((e||p).name)}</h1>`:'<h1>成績簿</h1>';
 $('#app').innerHTML=e?vExam(e):p?vStu(p):ui.tab==='exams'?vExams():ui.tab==='students'?vStudents():vSettings();
}
function vExams(){
 if(!S.grades.length)return needG;
 const g0=G(ui.ng)?ui.ng:S.grades[0].id,g=G(g0);
 const list=[...S.exams].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<div class="row"><button class="ex" data-act="open" data-id="${e.id}"><b>${esc(e.name)}</b><span>${e.grp?esc(e.grp)+'　':''}${esc(G(e.grade)?.name)}　${e.date}</span></button><button class="x" data-act="delExam" data-id="${e.id}" aria-label="刪除考試">✕</button></div>`).join('')||'<p class="hint">還沒有考試，先在上方建立第一次考試。</p>';
 return`<form class="card" data-f="exam"><h2>新增考試</h2><select name="grade" data-act="ng">${gOpts(g0)}</select><div class="chips">${g.subjects.filter(s=>s.on).map(s=>`<label><input type="checkbox" name="sub" value="${s.id}" checked>${esc(s.name)}</label>`).join('')||'<small>此年級尚無啟用的科目</small>'}</div><input name="name" placeholder="考試名稱，例如：第一次段考－國文" required><input name="grp" list="grps" placeholder="所屬考試（選填）：分多天考時，同一次考試填相同名稱"><datalist id="grps">${[...new Set(S.exams.filter(e=>e.grade===g0&&e.grp).map(e=>e.grp))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist><input name="date" type="date" value="${today()}" required><button class="pri">建立考試</button></form>${list}`}
function vStudents(){
 if(!S.grades.length)return needG;
 const g0=G(ui.ng)?ui.ng:S.grades[0].id;
 return`<div class="chips">${[['','全部'],['t','需追蹤'],['f','持平'],['u','進步中']].map(([k,l])=>`<button data-act="tf" data-id="${k}" class="${ui.tf===k?'on':''}">${l}</button>`).join('')}</div>`+S.grades.map(g=>{const l=S.students.filter(s=>s.grade===g.id&&(!ui.tf||cur(s.id).some(x=>x.s===ui.tf))).sort((a,b)=>cmp(a.name,b.name));return`<h3>${esc(g.name)}　${l.length} 人</h3>`+l.map(s=>`<div class="row"><b><button class="nm" data-act="stu" data-id="${s.id}">${esc(s.name)}</button>${pills(cur(s.id))}</b><select data-act="sg" data-id="${s.id}">${gOpts(s.grade)}</select><button class="x" data-act="delStu" data-id="${s.id}" aria-label="刪除">✕</button></div>`).join('')}).join('')+`<form class="card" data-f="stu"><h2>新增學生</h2><select name="grade">${gOpts(g0)}</select><textarea name="names" rows="3" placeholder="姓名，一行一位" required></textarea><button class="pri">加入學生</button></form>`}
function vSettings(){
 return`<form class="card" data-f="grade"><h2>新增年級</h2><input name="name" placeholder="例如：國一" required><button class="pri">新增年級</button></form>`+S.grades.map(g=>`<section class="card"><h2>${esc(g.name)}<button class="lnk" data-act="rnG" data-id="${g.id}">改名</button></h2>${g.subjects.map((s,i)=>{const a=`data-g="${g.id}" data-id="${s.id}"`;return`<div class="row sr${s.on?'':' off'}"><b>${esc(s.name)}</b><button class="sm" data-act="tog" ${a}>${s.on?'停用':'啟用'}</button><button class="sm" data-act="rnS" ${a}>改名</button><button class="sm" data-act="mv" ${a} data-d="-1"${i?'':' disabled'} aria-label="上移">↑</button><button class="sm" data-act="mv" ${a} data-d="1"${i<g.subjects.length-1?'':' disabled'} aria-label="下移">↓</button></div>`}).join('')||'<p class="hint">尚無科目，請在下方新增。</p>'}<form data-f="sub" data-g="${g.id}" class="inl"><input name="name" placeholder="新增科目，可用逗號分隔" required><button>新增</button></form></section>`).join('')+`<section class="card"><h2>備份</h2><div class="btns"><button data-act="expJ">匯出 JSON</button><button data-act="impJ">匯入 JSON</button></div>${ui.baks.length?`<select id="bak">${ui.baks.map(k=>`<option value="${k}">${new Date(+k.slice(4)).toLocaleString('zh-TW')}</option>`).join('')}</select><button data-act="rest">還原所選自動備份</button>`:'<small>尚無自動備份（編輯資料後會自動建立）</small>'}</section>`}
/* charts (hand-rolled SVG) */
const COL=['#3b6fd1','#e0584a','#2f9e6b','#d98a00','#8b5fd0','#12a0b8','#a8704f','#d0609f'];
const svgw=(h,b)=>`<svg viewBox="0 0 320 ${h}" class="ch" role="img">${b}</svg>`;
const lg=a=>`<div class="lg">${a.map(([n,c])=>`<span>${c?`<i style="background:${c}"></i>`:''}${esc(n)}</span>`).join('')}</div>`;
function line(labels,ser,o={}){
 const H=190,L=30,R=12,T=14,B=26,W=320,n=labels.length,min=o.min??0,max=o.max??100,
 X=i=>n<2?(L+W-R)/2:L+(W-L-R)*i/(n-1),Y=v=>{const r=(v-min)/(max-min||1);return T+(H-T-B)*(o.inv?r:1-r)};
 let b='';
 const nt=o.inv?Math.min(4,Math.max(1,max-min)):4;
 for(let k=0;k<=nt;k++){const v=min+(max-min)*k/nt,y=Y(v);b+=`<line class="g" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text class="t" x="${L-4}" y="${y+3}" text-anchor="end">${Math.round(v)}</text>`}
 labels.forEach((l,i)=>{if(n<9||i%2===0)b+=`<text class="t" x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`});
 ser.forEach((s,k)=>{const c=COL[k%COL.length];let d='';s.v.forEach((v,i)=>{d+=v==null?'':(i>0&&s.v[i-1]!=null?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)});
  b+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="2"/>`;
  s.v.forEach((v,i)=>{if(v==null)return;b+=`<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${c}"/>`;if(o.lab)b+=`<text class="t" x="${X(i)}" y="${Y(v)-7}" text-anchor="middle">${v}</text>`})});
 return svgw(H,b)+(ser.length>1?lg(ser.map((x,k)=>[x.name,COL[k%COL.length]])):'')}
function radar(names,a,b){
 const cx=160,cy=96,r=68,n=names.length,P=(i,v)=>{const t=-Math.PI/2+2*Math.PI*i/n;return[(cx+r*v/100*Math.cos(t)).toFixed(1),(cy+r*v/100*Math.sin(t)).toFixed(1)]};
 let o='';[25,50,75,100].forEach(g=>o+=`<polygon class="g" points="${names.map((_,i)=>P(i,g).join(',')).join(' ')}"/>`);
 names.forEach((m,i)=>{const[x,y]=P(i,100),[lx,ly]=P(i,120);o+=`<line class="g" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text class="t" x="${lx}" y="${+ly+3}" text-anchor="middle">${esc(m)}</text>`});
 const poly=(v,c,f)=>`<polygon points="${v.map((x,i)=>P(i,x??0).join(',')).join(' ')}" fill="${f}" stroke="${c}" stroke-width="2"/>`;
 return svgw(150,o+poly(b,COL[2],'none')+poly(a,COL[0],'rgba(59,111,209,.22)'))+lg([['本人',COL[0]],['年級平均',COL[2]]])}
function range(it){
 const L=64,W=320,R=40,rh=26,X=v=>L+(W-L-R)*v/100;
 return svgw(it.length*rh+8,it.map((m,i)=>{const y=i*rh+16;return`<text class="t" x="${L-6}" y="${y+3}" text-anchor="end">${esc(m.n)}</text><line class="g" x1="${X(0)}" x2="${X(100)}" y1="${y}" y2="${y}"/><line x1="${X(m.min)}" x2="${X(m.max)}" y1="${y}" y2="${y}" stroke="${COL[0]}" stroke-width="6" stroke-linecap="round" opacity=".4"/><circle cx="${X(m.avg)}" cy="${y}" r="5" fill="${COL[0]}"/><text class="t" x="${W-R+6}" y="${y+3}">${m.avg.toFixed(1)}</text>`}).join(''))+lg([['線段為最低到最高，圓點為平均']])}
function hist(v){
 const bins=Array(10).fill(0);v.forEach(x=>bins[Math.min(9,Math.floor(x/10))]++);
 const mx=Math.max(1,...bins),L=10,bw=30,H=150;
 return svgw(H,bins.map((c,i)=>{const h=(H-44)*c/mx,x=L+i*bw+bw/2;return`<rect x="${x-bw/2+3}" y="${H-24-h}" width="${bw-6}" height="${h}" rx="2" fill="${i<6?COL[1]:COL[0]}"/><text class="t" x="${x}" y="${H-27-h}" text-anchor="middle">${c||''}</text><text class="t" x="${x}" y="${H-8}" text-anchor="middle">${i*10}</text>`}).join(''))+lg([['每 10 分一格，紅色為 60 分以下']])}
function examCharts(e,P,key,fn){
 const v=P.map(s=>fn(s.id)).filter(x=>x!=null).map(x=>key==='total'?x/e.subjects.length:x);if(!v.length)return'';
 const it=e.subjects.map(id=>{const a=P.map(s=>sc(e,s.id,id)).filter(x=>x!=null);return a.length?{n:SB(e.grade,id)?.name||'?',min:Math.min(...a),max:Math.max(...a),avg:a.reduce((x,y)=>x+y,0)/a.length}:null}).filter(Boolean);
 return`<h3>分數分布（${key==='total'?'均分':esc(SB(e.grade,key)?.name)}）</h3>`+hist(v)+`<h3>各科概況</h3>`+range(it)}
function stuCharts(s,up,noRank){
 const rs=rounds().filter(r=>(!up||r.date<=up.date)&&pairsOf(r).some(([e,id])=>sc(e,s.id,id)!=null));
 if(!rs.length)return'';
 const lb=rs.map(r=>r.date.slice(5)),nm=[...new Set(rs.flatMap(r=>pairsOf(r).map(([e,id])=>SB(e.grade,id)?.name).filter(Boolean)))];
 const byName=(r,n)=>{const p=pairsOf(r).find(([e,id])=>SB(e.grade,id)?.name===n);return p?sc(p[0],s.id,p[1])??null:null};
 const ser=nm.map(n=>({name:n,v:rs.map(r=>byName(r,n))})).filter(x=>x.v.some(v=>v!=null));
 const rk=rs.map(r=>{const m=rdRanks(r);return[m[s.id]??null,Object.keys(m).length]}),mx=Math.max(2,...rk.map(r=>r[1]));
 let h=noRank?'':'<h3>各科成績趨勢</h3>'+line(lb,ser);
 if(!noRank&&rk.some(r=>r[0]))h+='<h3>總分名次變化</h3>'+line(lb,[{name:'名次',v:rk.map(r=>r[0])}],{min:1,max:mx,inv:true,lab:true});
 const r0=rs.at(-1),pr=pairsOf(r0);
 if(pr.length>=3){const av=pr.map(([e,id])=>avg(parts(e).map(p=>sc(e,p.id,id)).filter(x=>x!=null))??0);
  h+=(noRank?'<h3>最近一次考試能力雷達圖（與年級平均對照）</h3>':`<h3>最近一次：${esc(r0.label)}</h3>`)+radar(pr.map(([e,id])=>SB(e.grade,id)?.name||'?'),pr.map(([e,id])=>sc(e,s.id,id)),av)}
 return h}
/* report card (JPG) */
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null,f1=x=>x==null?'–':x.toFixed(1);
const RCSS=`.rp{width:640px;padding:28px;background:#fff;color:#15202b;font:16px/1.5 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;box-sizing:border-box}
.rp .hd{border-bottom:3px solid #234a8c;padding-bottom:10px;margin-bottom:14px}.rp .hd b{font-size:28px}.rp .hd div{color:#667485;font-size:14px}
.rp table{width:100%;border-collapse:collapse}.rp th,.rp td{padding:8px 10px;border-bottom:1px solid #d5dbe3;text-align:center}
.rp th{color:#667485;font-weight:500;font-size:13px}.rp td:first-child,.rp th:first-child{text-align:left}
.rp .tt td{font-weight:700;border-bottom:0;border-top:2px solid #234a8c}.rp h3{font-size:15px;margin:16px 0 4px}
.rp .cu{color:#c8372d;font-weight:600}.rp .ct{color:#b7791f;font-weight:600}.rp .cf{color:#667485}.rp .hm td{border-bottom:0}.rp .mm td{text-align:left;font-size:14px;padding:0 10px 8px 22px;color:#33414f}
.rp .ch{width:100%;max-width:440px;height:auto;display:block;margin:0 auto}.rp .g{stroke:#d5dbe3;fill:none}.rp .t{fill:#667485;font-size:10px}
.rp .lg{display:flex;gap:4px 12px;font-size:12px;color:#667485;max-width:440px;margin:2px auto 8px}.rp .lg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px}
.rp td small{display:block;color:#667485;font-size:12px;line-height:1.3}.rp .ft{margin-top:16px;color:#99a3af;font-size:12px}`;
function reportHtml(s,rd){
 const pr=pairsOf(rd),multi=rd.exams.length>1,P=partsM(rd.exams),t=tot2(pr,s.id),tv=P.map(p=>tot2(pr,p.id)).filter(x=>x!=null);
 const rows=pr.map(([e,id])=>{const a=parts(e).map(p=>sc(e,p.id,id)).filter(x=>x!=null),n=nts(e,s.id,id),l=n.s?SL[n.s]:null;
  return`<tr class="${n.t?'hm':''}"><td>${esc(SB(e.grade,id)?.name)}${multi?`<small>${e.date.slice(5)} ${esc(e.name)}</small>`:''}</td><td>${sc(e,s.id,id)??'缺考'}</td><td>${f1(avg(a))}</td><td class="c${n.s||''}">${l?l[0]:'–'}</td></tr>${n.t?`<tr class="mm"><td colspan="4">${esc(n.t)}</td></tr>`:''}`}).join('');
 return`<div class="rp"><style>${RCSS}</style><div class="hd"><b>${esc(s.name)}</b><div>${esc(G(rd.exams[0].grade)?.name)}　${esc(rd.label)}　${multi?rd.date+' ～ '+rd.end+'，共 '+rd.exams.length+' 場':rd.date}</div></div><table><tr><th>科目</th><th>分數</th><th>年級平均</th><th>狀況</th></tr>${rows}<tr class="tt"><td>總分（均分 ${t!=null?f1(t/pr.length):'–'}）</td><td>${t??'–'}</td><td>${f1(avg(tv))}</td><td></td></tr></table>${stuCharts(s,rd,1)}<div class="ft">製作日期 ${today()}　年級平均為同年級學生的平均分數</div></div>`}
async function exportReport(s,e,note,share){
 const box=document.createElement('div');box.style.cssText='position:fixed;left:-9999px;top:0';box.innerHTML=reportHtml(s,e);document.body.append(box);
 const el=box.firstElementChild,w=el.offsetWidth,h=el.offsetHeight;el.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
 const x=new XMLSerializer().serializeToString(el);box.remove();
 const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${x}</foreignObject></svg>`)});
 const c=document.createElement('canvas');c.width=w*2;c.height=h*2;const k=c.getContext('2d');k.scale(2,2);k.fillStyle='#fff';k.fillRect(0,0,w,h);k.drawImage(img,0,0,w,h);
 const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.92)),name=`${s.name}_${e.label}.jpg`,f=new File([b],name,{type:'image/jpeg'});
 if(share&&navigator.canShare?.({files:[f]}))await navigator.share({files:[f]}).catch(()=>{});
 else{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e4)}
 return b}
function repCard(s){
 const rs=rounds().filter(r=>pairsOf(r).some(([e,id])=>sc(e,s.id,id)!=null)).sort((a,b)=>b.date.localeCompare(a.date));
 if(!rs.length)return'';if(!rs.some(r=>r.key===ui.re))ui.re=rs[0].key;
 return`<div class="card"><h2>成績單</h2><select data-act="re">${rs.map(r=>`<option value="${esc(r.key)}"${r.key===ui.re?' selected':''}>${esc(r.label)}${r.exams.length>1?`（${r.exams.length} 場）`:''}　${r.date}</option>`).join('')}</select><div class="btns"><button data-act="rpt">儲存 JPG</button><button data-act="rps">分享</button></div></div>`}
function vStu(s){
 const ex=S.exams.filter(e=>e.grade===s.grade||S.scores[e.id]?.[s.id]||S.notes[e.id]?.[s.id]).sort((a,b)=>b.date.localeCompare(a.date));
 const hist=rounds().filter(r=>r.exams.some(e=>e.grade===s.grade||S.scores[e.id]?.[s.id])).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{const pr=pairsOf(r),t=tot2(pr,s.id),m=rdRanks(r);return`<tr><td>${esc(r.label)}</td><td>${r.date.slice(5)}</td><td>${t!=null?(t/pr.length).toFixed(1):'–'}</td><td>${m[s.id]?m[s.id]+' / '+Object.keys(m).length:'–'}</td></tr>`}).join('');
 const log=ex.map(e=>{const l=e.subjects.map(id=>{const n=nts(e,s.id,id);return n.s||n.t?`<div class="nl"><b>${esc(SB(e.grade,id)?.name)}</b>${n.s?`<i class="pill ${SL[n.s][1]}">${SL[n.s][0]}</i>`:''}${n.t?`<span>${esc(n.t)}</span>`:''}</div>`:''}).join('');return l?`<div class="card"><h2>${esc(e.name)} <small>${e.date}</small></h2>${l}</div>`:''}).join('')||'<p class="hint">尚無紀錄。在考試的成績輸入頁，可一併記錄每科的狀況與備忘。</p>';
 return`<p>${esc(G(s.grade)?.name)}　目前狀況：${pills(cur(s.id))||'<small>無</small>'}</p>${stuCharts(s)}${repCard(s)}<h3>學習狀況與備忘</h3>${log}<h3>歷次考試</h3>${hist?`<div class="scroll"><table class="h"><tr><th>考試</th><th>日期</th><th>均分</th><th>總分名次</th></tr>${hist}</table></div>`:'<p class="hint">尚無考試紀錄。</p>'}`}
function vExam(e){
 const sn=id=>esc(SB(e.grade,id)?.name||'?'),P=parts(e);
 let body;
 if(!P.length)body='<p class="hint">此年級還沒有學生，請先到「學生」新增。</p>';
 else if(ui.mode==='input'){
  const sub=e.subjects.includes(ui.subj)?ui.subj:e.subjects[0],rk=ranks(e,i=>sc(e,i,sub));
  body=`<div class="chips">${e.subjects.map(s=>`<button data-act="subj" data-id="${s}" class="${s===sub?'on':''}">${sn(s)}</button>`).join('')}</div>`+P.map(s=>{const n=nts(e,s.id,sub);return`<div class="card st"><div class="sh"><b>${esc(s.name)}</b><em data-r="${s.id}">${rk[s.id]?'第'+rk[s.id]+'名':''}</em><span class="lb">分數</span><input type="number" inputmode="decimal" min="0" max="100" enterkeyhint="next" placeholder="缺考" data-sid="${s.id}" data-sub="${sub}" value="${sc(e,s.id,sub)??''}"></div><div class="sb"><select class="ns s-${n.s||''}" data-xs="${s.id}" data-sub="${sub}" aria-label="狀況"><option value="">狀況</option>${Object.entries(SL).map(([k,l])=>`<option value="${k}"${n.s===k?' selected':''}>${l[0]}</option>`).join('')}</select><input type="text" placeholder="備忘（選填）" data-xt="${s.id}" data-sub="${sub}" value="${esc(n.t||'')}"></div></div>`}).join('');
 }else{
  const key=ui.sort==='total'||e.subjects.includes(ui.sort)?ui.sort:'total',fn=key==='total'?i=>total(e,i):i=>sc(e,i,key),rk=ranks(e,fn);
  const rows=P.map(s=>({s,r:rk[s.id]||999,t:total(e,s.id)})).sort((a,b)=>a.r-b.r||cmp(a.s.name,b.s.name));
  const v=P.map(s=>fn(s.id)).filter(x=>x!=null),f=x=>v.length?x:'–';
  body=`<div class="chips">${[['total','總分'],...e.subjects.map(s=>[s,SB(e.grade,s)?.name])].map(([k,t])=>`<button data-act="sort" data-id="${k}" class="${k===key?'on':''}">${esc(t)}</button>`).join('')}</div><div class="scroll"><table><tr><th>名次</th><th>姓名</th>${e.subjects.map(s=>`<th>${sn(s)}</th>`).join('')}<th>總分</th><th>均分</th></tr>${rows.map(({s,r,t})=>`<tr><td>${r<999?r:'–'}</td><td>${esc(s.name)}</td>${e.subjects.map(x=>`<td>${sc(e,s.id,x)??'–'}</td>`).join('')}<td>${t??'–'}</td><td>${t!=null?(t/e.subjects.length).toFixed(1):'–'}</td></tr>`).join('')}</table></div><p class="hint">有效 ${v.length} 人，平均 ${f((v.reduce((a,b)=>a+b,0)/v.length).toFixed(1))}，最高 ${f(Math.max(...v))}，最低 ${f(Math.min(...v))}。總分排名只計入全科都有分數的學生。</p>`+examCharts(e,P,key,fn);
 }
 return`<div class="seg">${[['input','輸入'],['rank','排名']].map(([k,t])=>`<button data-act="mode" data-id="${k}" class="${ui.mode===k?'on':''}">${t}</button>`).join('')}</div>${body}<div class="btns"><button data-act="grp">所屬考試：${e.grp?esc(e.grp):'無'}</button><button data-act="expC">匯出 CSV</button><button data-act="impC">匯入 CSV</button><button class="dg" data-act="delExam">刪除考試</button></div>`}
/* csv + files */
const dl=(n,t,m='text/plain')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m+';charset=utf-8'}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e4)};
const csv=t=>{const r=[];let c=[],f='',q=false;for(let i=0;i<t.length;i++){const h=t[i];if(q){if(h==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=h}else if(h==='"')q=true;else if(h===',')c.push(f),f='';else if(h==='\n'){c.push(f);r.push(c);c=[];f=''}else if(h!=='\r')f+=h}if(f||c.length){c.push(f);r.push(c)}return r};
function impCsv(t){
 const e=EX(ui.exam),g=G(e.grade),r=csv(t.replace(/^\uFEFF/,'')).filter(x=>x.some(c=>c.trim()));
 if(r.length<2)return alert('檔案沒有資料');
 const cols=r[0].map(h=>h.trim()).map(h=>{if(!h||h==='姓名'||h==='年級')return null;let s=g.subjects.find(x=>x.name===h);if(!s){s={id:uid(),name:h,on:true};g.subjects.push(s)}if(!e.subjects.includes(s.id))e.subjects.push(s.id);return s.id});
 S.scores[e.id]??={};let n=0;
 for(const row of r.slice(1)){const nm=row[0].trim();if(!nm)continue;let st=S.students.find(s=>s.grade===g.id&&s.name===nm);if(!st){st={id:uid(),name:nm,grade:g.id};S.students.push(st)}
  const o=S.scores[e.id][st.id]??={};cols.forEach((sid,i)=>{const x=(row[i]||'').trim(),v=Number(x);if(sid&&x!==''&&v>=0&&v<=100)o[sid]=v});n++}
 save();alert(`已匯入 ${n} 位學生`)}
/* events */
async function rp(share){try{await exportReport(ST(ui.stu),rounds().find(r=>r.key===ui.re),'',share)}catch(err){alert('無法產生圖片，請改用 Chrome 或 Edge 再試')}}
const A={
 back(){if(ui.exam)ui.exam=null;else ui.stu=null},
 open(t){ui.exam=t.dataset.id;ui.mode='input';ui.subj=null;ui.sort='total'},
 stu(t){ui.stu=t.dataset.id;ui.mt=[];ui.re=null},
 async rpt(){await rp(0);return 1},async rps(){await rp(1);return 1},tf(t){ui.tf=t.dataset.id},
 mode(t){ui.mode=t.dataset.id},subj(t){ui.subj=t.dataset.id},sort(t){ui.sort=t.dataset.id},
 grp(){const e=EX(ui.exam),n=prompt('所屬考試名稱（分多天考時，同一次考試填相同名稱；留空＝單獨一場）',e.grp||'');if(n!=null){e.grp=n.trim();save()}},
 mv(t){const g=G(t.dataset.g),l=g.subjects,i=l.findIndex(x=>x.id===t.dataset.id),j=i+ +t.dataset.d;if(j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];const ix=id=>l.findIndex(x=>x.id===id);S.exams.filter(e=>e.grade===g.id).forEach(e=>e.subjects.sort((a,b)=>ix(a)-ix(b)));save()},
 tog(t){const s=SB(t.dataset.g,t.dataset.id);s.on=!s.on;save()},
 rnG(t){const g=G(t.dataset.id),n=prompt('年級名稱',g.name);if(n?.trim()){g.name=n.trim();save()}},
 rnS(t){const s=SB(t.dataset.g,t.dataset.id),n=prompt('科目名稱',s.name);if(n?.trim()){s.name=n.trim();save()}},
 delStu(t){const s=ST(t.dataset.id);if(confirm(`刪除「${s.name}」及其所有成績？`)){S.students=S.students.filter(x=>x!==s);for(const k in S.notes)delete S.notes[k][s.id];for(const k in S.scores)delete S.scores[k][s.id];save()}},
 delExam(t){const e=EX(t.dataset.id||ui.exam);if(confirm('刪除此考試與全部成績？')){S.exams=S.exams.filter(x=>x!==e);delete S.scores[e.id];delete S.notes[e.id];ui.exam=null;save()}},
 expC(){const e=EX(ui.exam),g=G(e.grade),q=v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
  dl(e.name+'.csv','\uFEFF'+[['姓名','年級',...e.subjects.map(x=>SB(g.id,x).name)],...parts(e).map(s=>[s.name,g.name,...e.subjects.map(x=>sc(e,s.id,x)??'')])].map(r=>r.map(q).join(',')).join('\r\n'),'text/csv');return 1},
 impC(){fm='csv';$('#file').click();return 1},
 expJ(){dl('gradebook-'+today()+'.json',JSON.stringify(S),'application/json');return 1},
 impJ(){fm='json';$('#file').click();return 1},
 async rest(){const k=$('#bak').value;if(confirm('用此備份取代目前全部資料？')){S=norm(JSON.parse(await kv('get',k)));save()}}
};
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-act],[data-tab]');if(!t||['SELECT','INPUT'].includes(t.tagName))return;
 if(t.dataset.tab){ui.tab=t.dataset.tab;ui.exam=null;ui.stu=null;if(ui.tab==='settings')await loadBaks();return render()}
 const f=A[t.dataset.act];if(f&&await f(t)!==1)render()});
document.addEventListener('change',ev=>{const t=ev.target;
 if(t.dataset.sid){const e=EX(ui.exam),sub=t.dataset.sub,v=t.value.trim()===''?null:Number(t.value);
  if(v!==null&&!(v>=0&&v<=100)){t.value=sc(e,t.dataset.sid,sub)??'';return}
  const o=(S.scores[e.id]??={})[t.dataset.sid]??={};if(v===null)delete o[sub];else o[sub]=v;save();return rankLive(e,sub)}
 if(t.dataset.xs||t.dataset.xt){const e=EX(ui.exam),sid=t.dataset.xs||t.dataset.xt,sub=t.dataset.sub,m=(S.notes[e.id]??={})[sid]??={},o=m[sub]??={};
  if(t.dataset.xs){o.s=t.value;t.className='ns s-'+t.value}else o.t=t.value.trim();
  if(!o.s&&!o.t)delete m[sub];save();return}
 if(t.dataset.act==='re')ui.re=t.value;
 if(t.dataset.act==='ng'){ui.ng=t.value;render()}
 if(t.dataset.act==='sg'){ST(t.dataset.id).grade=t.value;save();render()}});
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.dataset?.sid){ev.preventDefault();const l=[...document.querySelectorAll('[data-sid]')],i=l.indexOf(ev.target);ev.target.blur();l[i+1]?.focus()}});
document.addEventListener('submit',ev=>{ev.preventDefault();const f=ev.target,d=new FormData(f),k=f.dataset.f;
 if(k==='grade')S.grades.push({id:uid(),name:d.get('name').trim(),subjects:[]});
 if(k==='sub')d.get('name').split(/[,，、]+/).map(x=>x.trim()).filter(Boolean).forEach(n=>G(f.dataset.g).subjects.push({id:uid(),name:n,on:true}));
 if(k==='stu')d.get('names').split('\n').map(x=>x.trim()).filter(Boolean).forEach(n=>S.students.push({id:uid(),name:n,grade:d.get('grade')}));
 if(k==='exam'){const sub=d.getAll('sub');if(!sub.length)return alert('請至少選一個科目');const e={id:uid(),name:d.get('name').trim(),date:d.get('date'),grade:d.get('grade'),subjects:sub,grp:(d.get('grp')||'').trim()};S.exams.push(e);ui.exam=e.id;ui.mode='input';ui.subj=null}
 save();flush();render()});
$('#file').onchange=async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;const t=await f.text();
 try{if(fm==='csv')impCsv(t);else if(confirm('匯入會取代目前全部資料，確定？')){const d=JSON.parse(t);if(!d.grades||!d.students)throw 0;S=norm(d);save()}}catch{alert('檔案格式錯誤')}render()};
(async()=>{try{const s=await kv('get','state');if(s)S=norm(s)}catch{}render();navigator.storage?.persist?.();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js')})();
