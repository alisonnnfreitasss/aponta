#!/usr/bin/env node
// Aponta: as notas de um projeto, e o comando que o Claude usa pra ler e fechar.
// Ficam em <projeto>/.aponta/: notes.json e img/nNNN.jpg (o quadro com o desenho), img/nNNN-crop.jpg (a área desenhada, limpa).
//
//   node src/notes.mjs list <projeto>                  as notas abertas, com o caminho das imagens
//   node src/notes.mjs list <projeto> --all            todas, inclusive as corrigidas
//   node src/notes.mjs done <projeto> <id> "<o que mudou>"
//   node src/notes.mjs reopen <projeto> <id>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const now = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const notesDir = root => path.join(root, ".aponta");

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function withLock(root, fn) {
  const d = notesDir(root);
  fs.mkdirSync(path.join(d, "img"), { recursive: true });
  const gi = path.join(d, ".gitignore");
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, ".lock\n.notes-*.json\nimg/.n*-raw.png\n");
  const lock = path.join(d, ".lock");
  for (let i = 0; ; i++) {
    try { fs.closeSync(fs.openSync(lock, "wx")); break; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmSync(lock, { force: true }); } catch {}
      if (i > 400) throw new Error("notes.json ocupado (lock)");
      sleep(25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

export function load(root) {
  const f = path.join(notesDir(root), "notes.json");
  if (!fs.existsSync(f)) return { next: 1, notes: [] };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function save(root, data) {
  const d = notesDir(root);
  const tmp = path.join(d, `.notes-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  // No Windows, trocar um arquivo que outro processo está lendo naquele instante dá EPERM ou EBUSY: tenta de novo.
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, path.join(d, "notes.json")); return; }
    catch (e) { if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || i >= 40) { fs.rmSync(tmp, { force: true }); throw e; } sleep(50); }
  }
}

/** Lê, muda e grava o notes.json com o lock; devolve o que fn devolver. */
export function update(root, fn) {
  return withLock(root, () => { const data = load(root); const out = fn(data); save(root, data); return out; });
}

export function find(data, id) {
  const n = data.notes.find(x => x.id === id);
  if (!n) throw new Error(`nota #${id} não existe`);
  return n;
}

export const stamp = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`; };

export function describe(root, n) {
  const d = notesDir(root), src = n.source;
  let where = `${src.kind === "comp" ? "composição" : "render"} ${src.path} em ${stamp(n.t)} (quadro ${n.frame} a ${n.fps} fps)`;
  if (n.scene) where += `; dentro de ${n.scene.file} em ${stamp(n.scene.t)}`;
  const out = [`#${n.id} [${n.status}] ${where}`, `   nota: ${n.text || "(sem texto, só o desenho)"}`];
  if (n.shapes && n.shapes.length) out.push(`   desenho: ${n.shapes.map(s => s.type).join(", ")} (em vermelho na imagem)`);
  if (n.capture === "ok") {
    out.push(`   imagem: ${path.join(d, n.img)}`);
    if (n.crop) out.push(`   recorte: ${path.join(d, n.crop)}`);
  } else out.push(`   imagem: ${n.capture || "nenhuma"}`);
  if (n.fix) out.push(`   corrigida ${n.fix.at}: ${n.fix.text}`);
  return out.join("\n");
}

function main(argv) {
  const usage = "uso: notes.mjs list <projeto> [--all] | done <projeto> <id> \"<o que mudou>\" | reopen <projeto> <id>";
  const [cmd, dir, ...rest] = argv;
  if (!cmd || !dir) { console.log(usage); return 1; }
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) { console.error(`pasta não existe: ${root}`); return 1; }
  if (cmd === "list") {
    const data = load(root), all = rest.includes("--all");
    const show = all ? data.notes : data.notes.filter(n => n.status === "open");
    if (!show.length) { console.log(all ? "Nenhuma nota." : "Nenhuma nota aberta."); return 0; }
    console.log(`${show.length} nota(s) em ${root}. Olhe cada imagem antes de mudar qualquer coisa.\n`);
    for (const n of show) console.log(describe(root, n) + "\n");
    return 0;
  }
  if (cmd === "done" || cmd === "reopen") {
    const id = parseInt(String(rest[0] || "").replace("#", ""), 10), text = rest.slice(1).join(" ").trim();
    if (!id) { console.log(usage); return 1; }
    if (cmd === "done" && !text) { console.error("diga o que mudou: done <projeto> <id> \"<o que mudou>\""); return 1; }
    const n = update(root, data => {
      const x = find(data, id);
      if (cmd === "done") { x.status = "fixed"; x.fix = { at: now(), text }; } else { x.status = "open"; delete x.fix; }
      return x;
    });
    console.log(`#${n.id} ${n.status}`);
    return 0;
  }
  console.log(usage); return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
