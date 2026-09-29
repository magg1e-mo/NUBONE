// NUBONE: send "exam tomorrow" web-push notifications. Run daily by GitHub Actions.
import webpush from "web-push";
const SITE=process.env.SITE_URL||"https://magg1e-mo.github.io/NUBONE/";
const FS=process.env.FS_BASE||"https://firestore.googleapis.com/v1/projects/nubone-exam/databases/(default)/documents";
const KEY=process.env.FS_KEY||"AIzaSyAv30oQema1x2kE3BAW55GY6nZCmorBePc";
const PUB=process.env.VAPID_PUBLIC_KEY||"BLZiO47fMnhbauI_p8LMYQpBypIQX_d4NKwUP09HtrV48xbqFKCd15X6IlDZjoPeKjxF1aebksd8i7r19sjwmWM";
const PRIV=process.env.VAPID_PRIVATE_KEY;
const DRY=process.env.DRY_RUN==="1", TEST=process.env.TEST_MODE==="1";
if(!DRY&&!PRIV){console.error("VAPID_PRIVATE_KEY missing");process.exit(1);}
if(PRIV)webpush.setVapidDetails("mailto:nubone@example.com",PUB,PRIV);

const now=process.env.NOW_OVERRIDE?new Date(process.env.NOW_OVERRIDE):new Date();
const bkk=new Date(now.getTime()+7*3600e3);            // Bangkok wall clock (UTC+7)
bkk.setUTCDate(bkk.getUTCDate()+1);
const tomorrow=bkk.toISOString().slice(0,10);

async function j(url,opt){const r=await fetch(url,opt);if(!r.ok&&r.status!==404)throw new Error(url+" "+r.status);return r.status===404?{}:r.json();}
const dec=f=>{if(!f)return null;if("stringValue" in f)return f.stringValue;if("integerValue" in f)return Number(f.integerValue);if("booleanValue" in f)return f.booleanValue;if("arrayValue" in f)return (f.arrayValue.values||[]).map(dec);if("mapValue" in f)return Object.fromEntries(Object.entries(f.mapValue.fields||{}).map(([k,v])=>[k,dec(v)]));return null;};
async function listAll(col){let out=[],tok="";do{const d=await j(`${FS}/${col}?pageSize=300&key=${KEY}${tok?"&pageToken="+tok:""}`);out=out.concat(d.documents||[]);tok=d.nextPageToken||"";}while(tok);return out;}

// 1) common (major) exams are read from the live site so there is a single source of truth
async function majorExams(){
  const html=await (await fetch(SITE+"?nc="+Date.now())).text();
  const m=html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const tpl=m?JSON.parse(m[1]):html;
  const a=tpl.match(/const MAJOR_EXAMS=(\[[\s\S]*?\n\]);/);
  if(!a)throw new Error("MAJOR_EXAMS not found in site");
  return new Function("return "+a[1])();
}
const line=e=>[e.subject,e.start?`${e.start}${e.end?"–"+e.end:""} น.`:null,e.room].filter(Boolean).join(" · ");

const major=(await majorExams()).filter(e=>e.date===tomorrow);
const ge={};for(const d of await listAll("ge")){const id=d.name.split("/").pop();const l=dec(d.fields&&d.fields.geList);ge[id]=Array.isArray(l)?l:[];}
const subs=(await listAll("push")).map(d=>({docId:d.name.split("/").pop(),uid:dec(d.fields.uid),enabled:dec(d.fields.enabled),sub:JSON.parse(dec(d.fields.sub))})).filter(s=>s.enabled);
console.log(`tomorrow=${tomorrow} major=${major.length} devices=${subs.length} test=${TEST} dry=${DRY}`);

let sent=0,skipped=0,removed=0,failed=0;
for(const s of subs){
  const mine=[...major,...(ge[s.uid]||[]).filter(e=>e&&e.date===tomorrow)].sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  let payload;
  if(TEST)payload={title:"NUBONE ทดสอบแจ้งเตือน",body:"ถ้าเห็นข้อความนี้ แสดงว่าแจ้งเตือนใช้งานได้แล้ว",tag:"nubone-test"};
  else if(!mine.length){skipped++;continue;}
  else payload={title:mine.length>1?`พรุ่งนี้มีสอบ ${mine.length} วิชา`:"พรุ่งนี้มีสอบ",body:mine.slice(0,4).map(line).join("\n"),tag:"nubone-"+tomorrow};
  if(DRY){console.log("DRY",s.uid,JSON.stringify(payload));sent++;continue;}
  try{await webpush.sendNotification(s.sub,JSON.stringify(payload),{TTL:6*3600,urgency:"high"});sent++;}
  catch(e){
    if(e.statusCode===404||e.statusCode===410){removed++;try{await fetch(`${FS}/push/${s.docId}?key=${KEY}`,{method:"DELETE"});}catch(_){}}
    else{failed++;console.error("send failed",s.uid,e.statusCode||e.message);}
  }
}
console.log(`sent=${sent} skipped=${skipped} removed=${removed} failed=${failed}`);
if(failed&&!sent)process.exit(1);
