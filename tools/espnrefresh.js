// ESPN refresh of the Trade Analyzer built into index.html.
// usage: node espnrefresh.js <live index.html> <espn.json> <out index.html> [summary.md]
// Parses the ESPN league file with the app's own parseESPN, re-applies the FantasyPros rows already in
// the live seed (keeping their date), re-embeds the analyzer, and writes a markdown summary:
// roster moves, trade-counter changes, odds old -> new, page-error check. Prints "changed=true|false".
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const os=require('os');
const [inF,espnF,outF,sumF]=process.argv.slice(2);
const OWN={1:'Brad',2:'Justin',3:'Arnold',4:'Shears',5:'Luke',6:'Bryan',7:'Kyle',8:'Harrison',9:'Conor',10:'Chris M',11:'Chris B',12:'Zane'};
const x=fs.readFileSync(inF,'utf8');const tag='<script type="text/plain" id="ll-doc">';
const i=x.indexOf(tag)+tag.length,j=x.indexOf('</script>',i);
const h=Buffer.from(x.slice(i,j),'base64').toString('utf8');
const S0=h.indexOf('<script>/* Lineup Ledger built-in data.'),S1=h.indexOf('</script>',S0);
const seedTxt=h.slice(S0+8,S1);const oldSeed=JSON.parse(seedTxt.slice(seedTxt.indexOf('=')+1,seedTxt.lastIndexOf(';')));
const espnTxt=fs.readFileSync(espnF,'utf8');const E=JSON.parse(espnTxt);
if(!E.teams||E.teams.length!==12||!E.schedule)throw new Error('ESPN file does not look like the full league data');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ll-'));const llF=path.join(tmp,'ll.html');fs.writeFileSync(llF,h);
 const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+llF);await p.waitForTimeout(500);
 const res=await p.evaluate(([S,espn])=>{
   const now=Date.now();const L=parseESPN(espn);L.importedAt=now;
   const rows=S.fp.rows,fpAt=S.fp.at;applyFP(L,rows,fpAt);
   const snap={at:now,leagueId:S.leagueId,me:S.me,league:L,fp:{at:fpAt,rows}};
   const txt='/* Lineup Ledger built-in data. Replace this file with one downloaded from the Update data window to refresh it for everyone. */\nwindow.LL_SEED='+JSON.stringify(snap).replace(/</g,'\\u003c')+';\n';
   const strip=o=>{const c=JSON.parse(JSON.stringify(o));delete c.importedAt;delete c.fp;return JSON.stringify(c)};
   const sim=SS=>{const LL=finalize(JSON.parse(JSON.stringify(SS.league)));useLeague(LL);const R=simulate(LL,rostersMap(LL),4000);
     return {R,teams:LL.teams.map(t=>({id:t.id,rec:t.w+'-'+t.l,roster:t.roster.map(id=>LL.P[id]?LL.P[id].name:id)}))}};
   return {txt,changed:strip(S.league)!==strip(L),fp:L.fp,week:L.week,a:sim(S),b:sim(snap)};
 },[oldSeed,espnTxt]);
 const nh=h.slice(0,S0)+'<script>'+res.txt+h.slice(S1);
 fs.writeFileSync(outF,x.slice(0,i)+Buffer.from(nh,'utf8').toString('base64')+x.slice(j));
 const errs2=[];const pills=[];
 for(const [w,hh] of [[1280,900],[390,844]]){const q=await b.newPage({viewport:{width:w,height:hh}});q.on('pageerror',e=>errs2.push(e.message));
   await q.goto('file://'+path.resolve(outF)+'#/trades');await q.waitForTimeout(2500);
   pills.push(await q.evaluate(()=>{const fr=document.querySelector('iframe');const d=fr&&fr.contentDocument;const el=d&&d.querySelector('#leaguePill');return el?el.textContent:'(no pill)'}));await q.close()}
 await b.close();
 const allErr=errs.concat(errs2);
 // trade counters: compare against the trade-data block's 2026 count per owner
 const f=v=>(v*100).toFixed(1)+'%';const lines=[];
 lines.push(`ESPN refresh: week ${res.week}. FantasyPros projections unchanged (matched ${res.fp.matched}/${res.fp.total}).`,'');
 const moves=[];res.b.teams.forEach((t,k)=>{const o=new Set(res.a.teams[k].roster),n=new Set(t.roster);
   const add=[...n].filter(z=>!o.has(z)),drop=[...o].filter(z=>!n.has(z));if(add.length||drop.length)moves.push(`- ${OWN[t.id]}: ${add.length?'added '+add.join(', '):''}${add.length&&drop.length?'; ':''}${drop.length?'dropped '+drop.join(', '):''}`)});
 lines.push('**Roster moves**',...(moves.length?moves:['- none']),'');
 const tm=JSON.parse((x.match(/<script[^>]*id="trade-data"[^>]*>([\s\S]*?)<\/script>/)||[])[1]||'{"data":{}}');
 const site={};for(const t of (tm.data&&tm.data[String(E.seasonId)])||[])for(const o in t.got)site[o]=(site[o]||0)+1;
 const tr=E.teams.filter(t=>((t.transactionCounter||{}).trades||0)!==(site[OWN[t.id]]||0)).map(t=>`${OWN[t.id]} (ESPN ${t.transactionCounter.trades}, site ${site[OWN[t.id]]||0})`);
 if(tr.length)lines.push('**Trade check:** ESPN trade counts differ from the Trade History tab for '+tr.join(', ')+'. A trade may have gone through; ask Claude to add it to Trade History.','');
 lines.push('| Owner | Record | Playoffs | Title |','|---|---|---|---|');
 res.b.teams.forEach((t,k)=>{const o=res.a.R[k],n=res.b.R[k];lines.push(`| ${OWN[t.id]} | ${t.rec} | ${f(o.po)} → ${f(n.po)} | ${f(o.title)} → ${f(n.title)} |`)});
 lines.push('',`Site check: ${pills.join(' / ')}. Page errors: ${allErr.length?allErr.join('; '):'none'}.`);
 if(sumF)fs.writeFileSync(sumF,lines.join('\n')+'\n');
 console.log(lines.join('\n'));console.log('changed='+res.changed);
 if(allErr.length)process.exit(2);
})();
