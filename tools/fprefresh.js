// FantasyPros-only refresh of the Trade Analyzer built into index.html.
// usage: node fprefresh.js <live index.html> <rows.json> <out index.html>
// Re-applies new FantasyPros rows to the league already in the live seed (rosters/records unchanged),
// re-embeds the analyzer, then prints playoff/title/last-place odds (old | new), the biggest per-game
// projection changes, and a page-error check on the rebuilt site.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const os=require('os');
const [inF,rowsF,outF]=process.argv.slice(2);
const x=fs.readFileSync(inF,'utf8');const tag='<script type="text/plain" id="ll-doc">';
const i=x.indexOf(tag)+tag.length,j=x.indexOf('</script>',i);
const h=Buffer.from(x.slice(i,j),'base64').toString('utf8');
const S0=h.indexOf('<script>/* Lineup Ledger built-in data.'),S1=h.indexOf('</script>',S0);
const seedTxt=h.slice(S0+8,S1);const oldSeed=JSON.parse(seedTxt.slice(seedTxt.indexOf('=')+1,seedTxt.lastIndexOf(';')));
const rows=JSON.parse(fs.readFileSync(rowsF,'utf8'));
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ll-'));const llF=path.join(tmp,'ll.html');fs.writeFileSync(llF,h);
 const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+llF);await p.waitForTimeout(500);
 const res=await p.evaluate(([S,rows])=>{
   const now=Date.now();const L=JSON.parse(JSON.stringify(S.league));clearFP(L);applyFP(L,rows,now);
   const snap={at:now,leagueId:S.leagueId,me:S.me,league:L,fp:{at:now,rows}};
   const txt='/* Lineup Ledger built-in data. Replace this file with one downloaded from the Update data window to refresh it for everyone. */\nwindow.LL_SEED='+JSON.stringify(snap).replace(/</g,'\\u003c')+';\n';
   const sim=SS=>{const LL=finalize(JSON.parse(JSON.stringify(SS.league)));useLeague(LL);const R=simulate(LL,rostersMap(LL),4000);
     return {R,teams:LL.teams.map(t=>({id:t.id,name:t.name,rec:t.w+'-'+t.l})),P:Object.fromEntries(Object.values(LL.P).map(q=>[q.id,[q.name,q.ppg]]))}};
   return {txt,fp:L.fp,a:sim(S),b:sim(snap)};
 },[oldSeed,rows]);
 const nh=h.slice(0,S0)+'<script>'+res.txt+h.slice(S1);
 const out=x.slice(0,i)+Buffer.from(nh,'utf8').toString('base64')+x.slice(j);fs.writeFileSync(outF,out);
 const f=v=>(v*100).toFixed(1).padStart(5);
 console.log('FP match:',JSON.stringify(res.fp));
 console.log('id team                        rec    playoff title  last  |  playoff title  last');
 res.b.teams.forEach((t,k)=>{const o=res.a.R[k],n=res.b.R[k];console.log(String(t.id).padStart(2),t.name.padEnd(27),t.rec.padEnd(5),f(o.po),f(o.title),f(o.last),'|',f(n.po),f(n.title),f(n.last))});
 const ch=[];for(const id in res.b.P){const o=res.a.P[id],n=res.b.P[id];if(o&&Math.abs(o[1]-n[1])>=1)ch.push([n[1]-o[1],n[0],o[1],n[1]])}
 ch.sort((u,v)=>Math.abs(v[0])-Math.abs(u[0]));console.log('biggest ppg changes (rostered + pool):');for(const c of ch.slice(0,15))console.log(' ',c[0].toFixed(1).padStart(5),c[1],c[2],'->',c[3]);
 // smoke test the rebuilt site
 const errs2=[];for(const [w,hh] of [[1280,900],[390,844]]){const q=await b.newPage({viewport:{width:w,height:hh}});q.on('pageerror',e=>errs2.push(e.message));
   await q.goto('file://'+path.resolve(outF)+'#/trades');await q.waitForTimeout(2500);
   const pill=await q.evaluate(()=>{const fr=document.querySelector('iframe');const d=fr&&fr.contentDocument;const el=d&&d.querySelector('#leaguePill');return el?el.textContent:'(no pill)'});
   console.log('site',w,'px:',pill);await q.close()}
 console.log('page errors:',errs.concat(errs2).length?errs.concat(errs2):'none');await b.close();
})();
