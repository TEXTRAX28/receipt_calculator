// Paired HTTPS access to the OpenAI receipt app already running on loopback.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { X509Certificate, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { freemem, networkInterfaces } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  isPrivateAddress,
  startPhonePreview,
} from "../server/phone-preview.mjs";

const root = resolve(import.meta.dirname, "..");
assert(
  freemem() >= 2 * 1024 ** 3,
  "At least 2 GiB RAM must be available for the phone preview.",
);
const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string", default: "5443" },
    "certificate-port": { type: "string", default: "5080" },
    "app-port": { type: "string", default: "4175" },
  },
});
const choices = Object.entries(networkInterfaces()).flatMap(([name, rows]) =>
  /wsl|virtual|vethernet|docker|loopback/i.test(name)
    ? []
    : rows
        .filter(
          (row) =>
            row.family === "IPv4" &&
            !row.internal &&
            isPrivateAddress(row.address),
        )
        .map((row) => ({ name, ...row })),
);
const selected = values.host
  ? choices.find((row) => row.address === values.host)
  : choices.find((row) => /wi-?fi|wlan/i.test(row.name)) || choices[0];
assert(
  selected,
  "Connect the PC to your phone's local network, or select its private address with --host.",
);
const directory = resolve(root, "dist");
assert(existsSync(resolve(directory, "index.html")), "Build the app first.");
const state = resolve(root, ".receipt-reader-state", "phone-preview");
await mkdir(state, { recursive: true, mode: 0o700 });
const stateRelative = relative(await realpath(root), await realpath(state));
assert(
  stateRelative !== ".." &&
    !stateRelative.startsWith(".." + sep) &&
    !isAbsolute(stateRelative),
  "Preview state must stay inside this checkout.",
);
const session = await mkdtemp(resolve(state, "session-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    [
      "systemroot",
      "windir",
      "path",
      "pathext",
      "temp",
      "tmp",
      "userprofile",
      "appdata",
      "localappdata",
      "comspec",
    ].includes(name.toLowerCase()),
  ),
);
env.RANDFILE = resolve(session, "random-state");
const openssl = existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
  ? "C:/Program Files/Git/usr/bin/openssl.exe"
  : "openssl";
const run = (values) =>
  execFileSync(openssl, values, {
    cwd: session,
    env,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
const host = selected.address,
  port = Number(values.port),
  certificatePort = Number(values["certificate-port"]),
  openAiPort = Number(values["app-port"]);
assert(
  [port, certificatePort, openAiPort].every(
    (value) => Number.isInteger(value) && value >= 1024 && value <= 65535,
  ) && new Set([port, certificatePort, openAiPort]).size === 3,
  "Select distinct non-system TCP ports.",
);
const backend = "http://127.0.0.1:" + openAiPort;
const config = await fetch(backend + "/api/receipts/openai/config", {
  signal: AbortSignal.timeout(5000),
}).catch(() => null);
assert(config?.ok, "Start the local Gather app with npm start first.");
const name = "Gather iPhone Test " + new Date().toISOString().slice(0, 10);
await writeFile(
  resolve(session, "request.cnf"),
  "[req]\ndistinguished_name=dn\n[dn]\n",
  { flag: "wx" },
);
run([
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  "ca-key.pem",
  "-out",
  "ca.pem",
  "-days",
  "1",
  "-sha256",
  "-config",
  "request.cnf",
  "-subj",
  "/CN=" + name,
  "-addext",
  "basicConstraints=critical,CA:TRUE,pathlen:0",
  "-addext",
  "keyUsage=critical,keyCertSign,cRLSign",
]);
run([
  "req",
  "-new",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  "server-key.pem",
  "-out",
  "server.csr",
  "-config",
  "request.cnf",
  "-subj",
  "/CN=" + host,
]);
await writeFile(
  resolve(session, "server.cnf"),
  "[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:" +
    host +
    "\n",
  { flag: "wx" },
);
run([
  "x509",
  "-req",
  "-in",
  "server.csr",
  "-CA",
  "ca.pem",
  "-CAkey",
  "ca-key.pem",
  "-CAcreateserial",
  "-out",
  "server-cert.pem",
  "-days",
  "1",
  "-sha256",
  "-extfile",
  "server.cnf",
  "-extensions",
  "extensions",
]);
run([
  "x509",
  "-in",
  "ca.pem",
  "-outform",
  "DER",
  "-out",
  "gather-phone-test.cer",
]);
run(["verify", "-CAfile", "ca.pem", "server-cert.pem"]);
const ca = new X509Certificate(await readFile(resolve(session, "ca.pem")));
const code = randomBytes(6).toString("hex").toUpperCase(),
  codeFile = resolve(session, "access-code.txt");
await writeFile(codeFile, code + "\n", { flag: "wx", mode: 0o600 });
const preview = await startPhonePreview({
  host,
  netmask: selected.netmask,
  port,
  certificatePort,
  openAiPort,
  directory,
  accessCode: code,
  cert: await readFile(resolve(session, "server-cert.pem")),
  key: await readFile(resolve(session, "server-key.pem")),
  publicCertificate: await readFile(resolve(session, "gather-phone-test.cer")),
});
console.log(
  `Phone preview: https://${host}:${port}/\nCertificate: http://${host}:${certificatePort}/gather-phone-test.cer\nInstall and trust: ${name}\nCertificate fingerprint: ${ca.fingerprint256}\nOpen this access-code file on the PC: ${codeFile}\nScans send prepared images to OpenAI after consent. Keep the PC awake. Stop with Ctrl+C; automatic expiry is eight hours. Remove the test certificate from your phone afterward.`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void preview.close();
  });
