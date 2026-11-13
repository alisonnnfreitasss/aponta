#!/usr/bin/env node
// Aponta: instala. Confere o computador, instala as dependências se faltarem, e coloca a skill do Aponta no Claude Code
// (~/.claude/skills/aponta/SKILL.md), com o caminho desta pasta, pra que "abre o Aponta nesse vídeo" funcione em qualquer projeto.
//   node scripts/install.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!fs.existsSync(path.join(KIT, "node_modules", "@hyperframes", "player"))) {
  console.log("Instalando as dependências (npm install)...");
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], { cwd: KIT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("O npm install falhou. Veja a mensagem acima."); process.exit(1); }
}

const { checks } = await import("./../src/doctor.mjs");
const skillsDir = process.env.APONTA_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
const dest = path.join(skillsDir, "aponta");
fs.mkdirSync(dest, { recursive: true });
const tpl = fs.readFileSync(path.join(KIT, "skill", "SKILL.md"), "utf8");
// Barras normais em todo sistema: o Node aceita C:/Users/..., e no Windows o Claude Code roda os comandos no Git Bash,
// onde uma barra invertida dentro de aspas pode virar escape.
fs.writeFileSync(path.join(dest, "SKILL.md"), tpl.split("{{APONTA_DIR}}").join(KIT.split(path.sep).join("/")));
console.log(`Skill instalada: ${path.join(dest, "SKILL.md")}`);

console.log("");
let bad = 0;
for (const c of checks()) {
  console.log(`${c.ok ? "[ok]   " : c.need ? "[falta]" : "[opcional, falta]"} ${c.name}${c.ok ? "" : `: ${c.how}`}`);
  if (c.need && !c.ok) bad++;
}
console.log(bad ? "\nFalta algo obrigatório: resolva o que está acima e rode de novo." :
  "\nPronto. Abra o Claude Code na pasta do seu vídeo e diga: \"abre o Aponta nesse vídeo\".\nPra testar antes: node src/server.mjs exemplo --open");
process.exitCode = bad ? 1 : 0;
