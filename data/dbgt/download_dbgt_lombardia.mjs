import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const downloadsDir = path.join(__dirname, "downloads");
const processedDir = path.join(__dirname, "processed");

const LIMTI_COMUNALI_URL = "https://www.cartografia.servizirl.it/arcgis5/rest/services/BaseMap/DBGT_Strato03_Gestione_viabilit%C3%A0_e_indirizzi/MapServer/29/query";
const PROVINCES = ["BG", "BS", "CO", "CR", "LC", "LO", "MB", "MI", "MN", "PV", "SO", "VA"];

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  return {
    province: args.province?.toUpperCase() || null,
    allProvinces: args["all-provinces"] === "true",
    retries: Number(args.retries || 3),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Request failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchMunicipalDownloads(province) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const payload = await fetchJson(LIMTI_COMUNALI_URL, {
      where: `SIG_PRO='${province}' AND DISP_DBT='SI' AND DOWNLOAD IS NOT NULL`,
      outFields: "COD_ISTATN,NOME_COM,SIG_PRO,NOME_PRO,DOWNLOAD,DISP_DBT,CONTENUTO,ANNO_RIL_AGG",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: "2000",
      f: "json",
    });
    const features = payload.features || [];
    rows.push(...features.map((f) => f.attributes));
    if (!payload.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }
  return rows;
}

async function downloadWithResume(url, target, retries) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const existing = fs.existsSync(target) ? fs.statSync(target).size : 0;
    const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
    try {
      const res = await fetch(url, { headers });
      if (!res.ok && !(res.status === 416 && existing > 0)) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      if (res.status === 416) return { skipped: true, bytes: existing };
      const stream = fs.createWriteStream(target, { flags: existing > 0 && res.status === 206 ? "a" : "w" });
      await new Promise((resolve, reject) => {
        res.body.pipeTo(new WritableStream({
          write(chunk) { stream.write(Buffer.from(chunk)); },
          close() { stream.end(resolve); },
          abort(err) { stream.destroy(err); reject(err); },
        })).catch(reject);
      });
      return { skipped: false, bytes: fs.statSync(target).size };
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1000 * attempt);
    }
  }
  return { skipped: false, bytes: fs.existsSync(target) ? fs.statSync(target).size : 0 };
}

function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(targetDir);
  return {
    files: files.map((file) => ({
      path: path.relative(rootDir, file),
      bytes: fs.statSync(file).size,
    })),
    gpkg: files.filter((file) => path.basename(file).toLowerCase() === "dbgt.gpkg"),
  };
}

async function main() {
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.mkdirSync(processedDir, { recursive: true });
  const options = parseArgs();
  const provinces = options.allProvinces ? PROVINCES : [options.province || "MI"];
  const report = { provinces: [], packages: 0, gpkg_found: 0 };

  for (const province of provinces) {
    const municipalities = await fetchMunicipalDownloads(province);
    const provinceReport = { province, municipalities: municipalities.length, packages: [] };
    const provinceDir = path.join(downloadsDir, province);
    fs.mkdirSync(provinceDir, { recursive: true });

    for (const row of municipalities) {
      const code = String(row.COD_ISTATN || "").replace(/^03/, "");
      const name = String(row.NOME_COM || code).replace(/[^\w.-]+/g, "_");
      const zipPath = path.join(provinceDir, `${code}_${name}.zip`);
      const extractDir = path.join(provinceDir, `${code}_${name}`);
      const dl = await downloadWithResume(row.DOWNLOAD, zipPath, options.retries);
      const extracted = extractZip(zipPath, extractDir);
      report.packages += 1;
      report.gpkg_found += extracted.gpkg.length;
      provinceReport.packages.push({
        codice_comune: code,
        comune: row.NOME_COM,
        url: row.DOWNLOAD,
        zip: path.relative(rootDir, zipPath),
        zip_bytes: dl.bytes,
        gpkg: extracted.gpkg.map((file) => path.relative(rootDir, file)),
        files: extracted.files,
      });
    }
    report.provinces.push(provinceReport);
  }

  fs.writeFileSync(path.join(processedDir, "dbgt_download_report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
