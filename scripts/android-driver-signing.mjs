// Firma Android stabile per l'APK Driver (it.volantinipro.driver).
//
//   node scripts/android-driver-signing.mjs generate  <dir-fuori-dal-repo>
//   node scripts/android-driver-signing.mjs assetlinks <dir-fuori-dal-repo>
//
// generate: crea <dir>/volantinipro-driver.p12 (PKCS12, RSA 4096, 30 anni),
//   <dir>/keystore-password.txt (casuale, mai stampata) e
//   <dir>/keystore.base64.txt (da incollare nel secret GitHub
//   ANDROID_KEYSTORE_BASE64). Non sovrascrive mai un keystore esistente:
//   perderlo significa non poter piu' aggiornare l'app installata.
// assetlinks: legge lo SHA-256 REALE del certificato e scrive
//   public/.well-known/assetlinks.json (nessun fingerprint inventato).
//
// Richiede keytool (JDK) nel PATH o in JAVA_HOME. Password passate a keytool
// solo via variabile d'ambiente (:env), mai come argomento visibile.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "it.volantinipro.driver";
export const KEY_ALIAS = "volantinipro-driver";
const KEYSTORE_FILE = "volantinipro-driver.p12";
const PASSWORD_FILE = "keystore-password.txt";

const keytool = () => {
  const home = process.env.JAVA_HOME;
  const candidate = home ? path.join(home, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : null;
  return candidate && existsSync(candidate) ? candidate : "keytool";
};

function runKeytool(args, password) {
  return execFileSync(keytool(), args, {
    env: { ...process.env, VP_KS_PASS: password },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function parseSha256(keytoolOutput) {
  const match = String(keytoolOutput).match(/SHA256:\s*((?:[0-9A-F]{2}:){31}[0-9A-F]{2})/i);
  return match ? match[1].toUpperCase() : null;
}

export function buildAssetLinks(sha256) {
  if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(sha256 || "")) {
    throw new Error("Fingerprint SHA-256 non valido: assetlinks.json non generato.");
  }
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: [sha256] },
  }];
}

function assertOutsideRepo(dir) {
  const repo = path.resolve(process.cwd());
  const target = path.resolve(dir);
  if (target === repo || target.startsWith(repo + path.sep)) {
    throw new Error("La cartella del keystore deve stare FUORI dal repository.");
  }
}

function readFingerprint(dir) {
  const password = readFileSync(path.join(dir, PASSWORD_FILE), "utf8").trim();
  const out = runKeytool(
    ["-list", "-v", "-keystore", path.join(dir, KEYSTORE_FILE), "-storetype", "PKCS12", "-alias", KEY_ALIAS, "-storepass:env", "VP_KS_PASS"],
    password,
  );
  const sha = parseSha256(out);
  if (!sha) throw new Error("SHA-256 non trovato nell'output di keytool.");
  return sha;
}

function generate(dir) {
  assertOutsideRepo(dir);
  mkdirSync(dir, { recursive: true });
  const ks = path.join(dir, KEYSTORE_FILE);
  if (existsSync(ks)) throw new Error(`Keystore gia' presente (${ks}): non lo sovrascrivo.`);
  const password = randomBytes(24).toString("base64url");
  writeFileSync(path.join(dir, PASSWORD_FILE), password + "\n", { mode: 0o600 });
  runKeytool([
    "-genkeypair", "-keystore", ks, "-storetype", "PKCS12", "-alias", KEY_ALIAS,
    "-keyalg", "RSA", "-keysize", "4096", "-validity", "10950",
    "-dname", "CN=VolantiniPro Driver, O=VolantiniPro, C=IT",
    "-storepass:env", "VP_KS_PASS", "-keypass:env", "VP_KS_PASS",
  ], password);
  writeFileSync(path.join(dir, "keystore.base64.txt"), readFileSync(ks).toString("base64"), { mode: 0o600 });
  console.log(`Keystore creato in ${dir} (password in ${PASSWORD_FILE}, non stampata).`);
  console.log(`SHA-256: ${readFingerprint(dir)}`);
}

function writeAssetLinks(dir) {
  const sha = readFingerprint(dir);
  const out = path.resolve("public/.well-known/assetlinks.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildAssetLinks(sha), null, 2) + "\n");
  console.log(`assetlinks.json scritto con SHA-256 ${sha}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, dir] = process.argv.slice(2);
  try {
    if (!dir) throw new Error("Specifica la cartella del keystore (fuori dal repository).");
    if (cmd === "generate") generate(dir);
    else if (cmd === "assetlinks") writeAssetLinks(dir);
    else throw new Error("Comando: generate | assetlinks");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
