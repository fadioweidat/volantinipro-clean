import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processedDir = path.join(rootDir, "data", "osm", "processed");

function args() {
  const values = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("="); return [key, value];
  }));
  return { file: values.file, municipality: values.municipality, code: values.code, dryRun: values["dry-run"] === "true" };
}

function loadEnv() {
  const p = path.join(rootDir, ".env"); if (!fs.existsSync(p)) return {};
  return Object.fromEntries(fs.readFileSync(p,"utf8").split(/\r?\n/).filter((line)=>line&&!line.trim().startsWith("#")&&line.includes("=")).map((line)=>{const i=line.indexOf("=");return [line.slice(0,i).trim(),line.slice(i+1).trim()]}));
}

function filesAt(input) {
  const p = path.resolve(rootDir,input); if (!fs.existsSync(p)) throw new Error(`OSM input not found: ${p}`);
  return fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((n)=>n.toLowerCase().endsWith(".xml")).map((n)=>path.join(p,n)).sort() : [p];
}

function attrs(text) {
  return Object.fromEntries([...String(text).matchAll(/([\w:.-]+)="([^"]*)"/g)].map((m)=>[m[1],m[2].replaceAll("&quot;",'"').replaceAll("&amp;","&").replaceAll("&lt;","<").replaceAll("&gt;",">")]));
}

export function parseOsmXml(text) {
  const nodes = new Map(); const addresses = [];
  for (const match of String(text).matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const a=attrs(match[1]), lat=Number(a.lat), lng=Number(a.lon); if(!a.id||!Number.isFinite(lat)||!Number.isFinite(lng)) continue;
    nodes.set(a.id,{lat,lng}); const tags=Object.fromEntries([...(match[2]||"").matchAll(/<tag\b([^>]*?)\/>/g)].map((m)=>{const t=attrs(m[1]);return [t.k,t.v]}));
    if(tags["addr:housenumber"]) addresses.push({type:"node",id:a.id,lat,lng,tags});
  }
  for (const match of String(text).matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a=attrs(match[1]),body=match[2]||"",tags=Object.fromEntries([...body.matchAll(/<tag\b([^>]*?)\/>/g)].map((m)=>{const t=attrs(m[1]);return [t.k,t.v]}));
    if(!a.id||!tags["addr:housenumber"]) continue;
    const points=[...body.matchAll(/<nd\b([^>]*?)\/>/g)].map((m)=>nodes.get(attrs(m[1]).ref)).filter(Boolean);
    if(!points.length) continue; const lat=points.reduce((s,p)=>s+p.lat,0)/points.length,lng=points.reduce((s,p)=>s+p.lng,0)/points.length;
    addresses.push({type:"way",id:a.id,lat,lng,tags});
  }
  return addresses;
}

function inRing(point,ring) { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>point[1])!==(yj>point[1]))&&(point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi))inside=!inside} return inside; }
function inGeometry(lng,lat,g) { const polygons=g?.type==="Polygon"?[g.coordinates]:g?.type==="MultiPolygon"?g.coordinates:[]; return polygons.some((rings)=>rings.length&&inRing([lng,lat],rings[0])&&!rings.slice(1).some((ring)=>inRing([lng,lat],ring))); }

async function boundary(url,key,code) {
  const r=await fetch(`${url}/rest/v1/geo_municipalities?select=geom&municipality_code=eq.${encodeURIComponent(code)}&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!r.ok) throw new Error(`Municipality boundary failed (${r.status})`); const rows=await r.json(); if(!rows[0]?.geom)throw new Error(`Boundary missing for ${code}`); return typeof rows[0].geom==="string"?JSON.parse(rows[0].geom):rows[0].geom;
}

async function main() {
  const o=args(); if(!o.file||!o.municipality||!o.code)throw new Error("Provide --file, --municipality and --code");
  const env={...loadEnv(),...process.env},url=env.VITE_SUPABASE_URL||env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Missing local Supabase URL or service role key"); const geom=await boundary(url,key,o.code);
  const dedup=new Map(); let parsed=0;
  for(const file of filesAt(o.file))for(const item of parseOsmXml(fs.readFileSync(file,"utf8"))){parsed++;if(!inGeometry(item.lng,item.lat,geom))continue;const number=String(item.tags["addr:housenumber"]||"").trim();if(!number)continue;dedup.set(`${item.type}-${item.id}`,{source:"osm",source_id:`${item.type}-${item.id}`,comune:o.municipality,codice_comune:o.code,via:item.tags["addr:street"]||item.tags["addr:place"]||null,numero_civico:number,lat:item.lat,lng:item.lng,confidence:1,raw_tags:{...item.tags,osm_type:item.type,osm_id:item.id,source_url:`https://www.openstreetmap.org/${item.type}/${item.id}`,license:"ODbL"}})}
  const rows=[...dedup.values()],report={source:"OpenStreetMap API 0.6 / ODbL",municipality:o.municipality,municipality_code:o.code,files_read:filesAt(o.file).length,addresses_parsed:parsed,addresses_inside_municipality:rows.length,with_street:rows.filter((r)=>r.via).length,dry_run:o.dryRun,inserted:0,updated:0,skipped:0};
  if(!o.dryRun)for(let i=0;i<rows.length;i+=500){const r=await fetch(`${url}/rest/v1/rpc/upsert_address_points_batch`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({rows:rows.slice(i,i+500)})});if(!r.ok)throw new Error(`Address import failed (${r.status}): ${await r.text()}`);const x=await r.json();report.inserted+=Number(x.inserted||0);report.updated+=Number(x.updated||0);report.skipped+=Number(x.skipped||0)}
  fs.mkdirSync(processedDir,{recursive:true});fs.writeFileSync(path.join(processedDir,`osm_addresses_${o.code}.json`),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}

if(pathToFileURL(process.argv[1]||"").href===import.meta.url)main().catch((e)=>{console.error(e.message);process.exit(1)});
