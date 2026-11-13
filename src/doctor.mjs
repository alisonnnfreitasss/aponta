#!/usr/bin/env node
// Aponta: confere se o computador tem o que precisa, e diz o que falta e como instalar.
//   node src/doctor.mjs           (sai com código 1 se faltar algo obrigatório)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { findBrowser } from "./capture.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plat = process.platform;

function version(cmd) {
  try { return execFileSync(cmd, ["-version"], { timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n")[0].split(" ")[2] || "ok"; }
  catch { return null; }
}

export function checks() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  const deps = ["@hyperframes/player", "@hyperframes/core", "puppeteer-core"].every(d => fs.existsSync(path.join(KIT, "node_modules", ...d.split("/"), "package.json")));
  const ff = version("ffmpeg"), fp = version("ffprobe"), browser = findBrowser();
  const skill = path.join(process.env.APONTA_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills"), "aponta", "SKILL.md");
  const ffHow = plat === "win32" ? "winget install --id Gyan.FFmpeg -e" : plat === "darwin" ? "brew install ffmpeg" : "sudo apt install ffmpeg";
  return [
    { name: "Node.js 18 ou mais novo", ok: major >= 18, need: true, have: process.versions.node, how: "instale a versão LTS em https://nodejs.org" },
    { name: "Dependências do Aponta", ok: deps, need: true, have: deps ? "instaladas" : null, how: "npm install (na pasta do Aponta)" },
    { name: "Chrome ou Edge (fotos dos quadros)", ok: !!browser, need: true, have: browser, how: plat === "darwin" ? "instale o Google Chrome" : plat === "win32" ? "o Windows já vem com o Edge; se ele foi removido, instale o Google Chrome" : "instale o Google Chrome ou o Chromium" },
    { name: "ffmpeg (fotos de quadros de renders .mp4)", ok: !!(ff && fp), need: false, have: ff, how: ffHow },
    { name: "Skill do Aponta no Claude Code", ok: fs.existsSync(skill), need: false, have: fs.existsSync(skill) ? skill : null, how: "node scripts/install.mjs" },
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = checks();
  console.log(`Aponta: conferindo este computador (${plat}, ${os.arch()})\n`);
  for (const c of list) console.log(`${c.ok ? "[ok]   " : c.need ? "[falta]" : "[opcional, falta]"} ${c.name}${c.ok && c.have ? `: ${c.have}` : ""}${c.ok ? "" : `\n         como resolver: ${c.how}`}`);
  const missing = list.filter(c => c.need && !c.ok);
  console.log(missing.length ? `\nFalta ${missing.length} coisa(s) obrigatória(s).` : "\nTudo certo pra usar o Aponta.");
  process.exitCode = missing.length ? 1 : 0;
}
