#!/usr/bin/env node
// Aponta: assista o vídeo do HyperFrames direto do código, aponte o que está errado no quadro, e o Claude corrige.
//
//   node src/server.mjs <pasta do vídeo> [--port 8840] [--open]
//
// Toca as composições (os .html do HyperFrames) com o player oficial, e os renders (.mp4) com o player do navegador.
// Só escreve em <pasta do vídeo>/.aponta/, onde ficam as notas. Escuta só em 127.0.0.1.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import * as N from "./notes.mjs";
import { Capturer } from "./capture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, "..");
const PLAYER = path.join(KIT, "node_modules", "@hyperframes", "player", "dist", "hyperframes-player.global.js");
const RUNTIME = path.join(KIT, "node_modules", "@hyperframes", "core", "dist", "hyperframe.runtime.iife.js");

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--port");
const ROOT = path.resolve(positional[0] || process.cwd());
let PORT = parseInt(opt("--port", "8840"), 10);

const SKIP = new Set(["node_modules", ".git", ".aponta", ".hyperframes", ".cache", "__pycache__"]);
const RENDER_DIRS = new Set(["renders", "render", "out", "output", "outputs", "export", "exports", "final"]);
const TEXT_EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);
const WATCH_DIRS = new Set(["assets", "js", "css", "lib", "src", "compositions", "components", "scenes"]);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".hdr": "application/octet-stream", ".txt": "text/plain; charset=utf-8", ".vtt": "text/vtt",
};
const rel = p => path.relative(ROOT, p).split(path.sep).join("/");
const inside = p => { const r = path.relative(ROOT, p); return r && !r.startsWith("..") && !path.isAbsolute(r); };

// ---------- o que a pasta tem ----------

const headCache = new Map();
function compInfo(file) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  const k = file + ":" + st.mtimeMs;
  if (headCache.has(k)) return headCache.get(k);
  let head = "";
  try { const fd = fs.openSync(file, "r"), buf = Buffer.alloc(Math.min(st.size, 200000)); fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd); head = buf.toString("utf8"); } catch {}
  const m = head.match(/data-composition-id="([^"]+)"([^>]*)/);
  let info = null;
  if (m) {
    const g = (a, d) => { const x = m[2].match(new RegExp(a + '="([\\d.]+)"')); return x ? parseFloat(x[1]) : d; };
    info = { id: m[1], w: Math.round(g("data-width", 1920)), h: Math.round(g("data-height", 1080)), dur: g("data-duration", 0), fps: g("data-fps", 30) };
  }
  headCache.set(k, info);
  return info;
}

function walk(dir, depth, onFile, onDir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name) && (!onDir || onDir(e.name, depth)) && depth > 0) walk(p, depth - 1, onFile, onDir); }
    else onFile(p, e.name);
  }
}

function comps() {
  const out = [];
  walk(ROOT, 2, (p, name) => {
    if (!name.endsWith(".html")) return;
    const info = compInfo(p);
    if (info) out.push({ path: rel(p), ...info });
  }, name => !RENDER_DIRS.has(name) && name !== "assets" && name !== "media");
  const depth = p => p.split("/").length;
  out.sort((a, b) => (depth(a.path) - depth(b.path)) || ((a.path.endsWith("index.html") ? 0 : 1) - (b.path.endsWith("index.html") ? 0 : 1)) || a.path.localeCompare(b.path));
  return out;
}

function renders() {
  const out = [];
  const add = p => { const st = fs.statSync(p); out.push({ path: rel(p), mtime: st.mtimeMs, mb: Math.round(st.size / 1e5) / 10 }); };
  const isVid = n => /\.(mp4|webm|mov)$/i.test(n);
  try { for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) if (e.isFile() && isVid(e.name)) add(path.join(ROOT, e.name)); } catch {}
  const scan = (dir, depth) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (RENDER_DIRS.has(e.name.toLowerCase())) { for (const f of fs.readdirSync(p)) if (isVid(f) && !f.startsWith(".")) add(path.join(p, f)); }
        else if (depth > 0) scan(p, depth - 1);
      }
    }
  };
  scan(ROOT, 2);
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

/** Numa composição que junta outras (data-composition-src), qual delas está tocando no tempo t. */
function subAt(compPath, t) {
  let html; try { html = fs.readFileSync(path.join(ROOT, compPath), "utf8"); } catch { return null; }
  const re = /<[^>]*data-composition-src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0], num = a => { const x = tag.match(new RegExp(a + '="([\\d.]+)"')); return x ? parseFloat(x[1]) : null; };
    const st = num("data-start"), d = num("data-duration");
    if (st !== null && d !== null && t >= st && t < st + d) {
      const file = rel(path.resolve(path.dirname(path.join(ROOT, compPath)), m[1]));
      return { file, t: Math.round((t - st) * 1000) / 1000 };
    }
  }
  return null;
}

function watchStamp(kind, src) {
  const f = path.join(ROOT, src);
  if (kind === "render") { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }
  let best = 0, count = 0;
  const dir = path.dirname(f);
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && TEXT_EXT.has(path.extname(e.name))) best = Math.max(best, fs.statSync(p).mtimeMs);
      else if (e.isDirectory() && WATCH_DIRS.has(e.name)) {
        const stack = [p];
        while (stack.length && count < 6000) {
          const d = stack.pop();
          let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
          for (const x of ents) {
            if (x.name.startsWith(".") || SKIP.has(x.name)) continue;
            const q = path.join(d, x.name);
            if (x.isDirectory()) stack.push(q);
            else if (TEXT_EXT.has(path.extname(x.name))) { count++; try { best = Math.max(best, fs.statSync(q).mtimeMs); } catch {} }
          }
        }
      }
    }
  } catch {}
  return best;
}

function hasCmd(cmd) {
  try { execFileSync(cmd, ["-version"], { stdio: "ignore", timeout: 10000 }); return true; } catch { return false; }
}

function renderFps(src) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=nw=1:nk=1", path.join(ROOT, src)], { timeout: 10000 }).toString().trim();
    const [a, b] = out.split("/").map(Number); return Math.round((a / b) * 1000) / 1000 || 30;
  } catch { return 30; }
}

// ---------- fotos dos quadros ----------

const capturer = new Capturer(0);

async function captureNote(id) {
  const n = N.load(ROOT).notes.find(x => x.id === id);
  if (!n) return;
  const d = N.notesDir(ROOT), tag = String(id).padStart(3, "0");
  const raw = path.join(d, "img", `.n${tag}-raw.png`);
  let status = "ok", hasCrop = false;
  try {
    if (n.source.kind === "render") {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", n.t.toFixed(3), "-i", path.join(ROOT, n.source.path), "-frames:v", "1", raw], { timeout: 60000 });
    } else {
      const info = compInfo(path.join(ROOT, n.source.path)) || { w: 1920, h: 1080 };
      const src = "/f/" + n.source.path.split("/").map(encodeURIComponent).join("/");
      await capturer.shot({ src, key: src + "?" + watchStamp("comp", n.source.path), t: n.t, w: info.w, h: info.h, out: raw });
    }
    hasCrop = await capturer.annotate({ raw, shapes: n.shapes, full: path.join(d, "img", `n${tag}.jpg`), crop: path.join(d, "img", `n${tag}-crop.jpg`) });
  } catch (e) {
    status = "failed: " + String(e.message || e).slice(0, 200);
    console.error(e);
  } finally { fs.rmSync(raw, { force: true }); }
  N.update(ROOT, data => {
    const x = data.notes.find(y => y.id === id);
    if (!x) return;
    x.capture = status;
    if (status === "ok") { x.img = `img/n${tag}.jpg`; if (hasCrop) x.crop = `img/n${tag}-crop.jpg`; }
  });
}

// ---------- HTTP ----------

const CAPTURE_PAGE = (w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}
hyperframes-player{display:block;width:${w}px;height:${h}px}</style></head><body>
<hyperframes-player id="p" muted runtime-src="/hf/runtime.js"></hyperframes-player>
<script src="/hf/player.js"></script>
<script>
const q = new URLSearchParams(location.search), p = document.getElementById("p");
window.__ready = false; window.__err = "";
p.addEventListener("ready", () => { window.__ready = true; });
p.addEventListener("error", e => { window.__err = String((e.detail && (e.detail.message || e.detail)) || "player error"); });
p.setAttribute("src", q.get("src"));
const frames = n => new Promise(r => { const k = () => (n-- <= 0 ? r() : requestAnimationFrame(k)); k(); });
window.__seek = async t => {
  p.pause(); p.seek(t);
  await frames(3);
  const fr = p.shadowRoot && p.shadowRoot.querySelector("iframe"), doc = fr && fr.contentDocument;
  const t0 = performance.now();
  while (doc && performance.now() - t0 < 10000) {
    const vids = [...doc.querySelectorAll("video")];
    if (vids.every(v => !v.seeking && (v.readyState >= 2 || v.error || (!v.src && !v.currentSrc)))) break;
    await new Promise(r => setTimeout(r, 80));
  }
  if (doc && doc.fonts) await doc.fonts.ready;
  await frames(3); await new Promise(r => setTimeout(r, 200));
  return p.currentTime;
};
</script></body></html>`;

function injectRuntime(html) {
  const tag = '<script src="/hf/runtime.js"></script>';
  const m = html.match(/<head[^>]*>/i);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  const b = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(b) });
  res.end(b);
}

function sendFile(req, res, file, inject) {
  const ext = path.extname(file).toLowerCase(), type = MIME[ext] || "application/octet-stream";
  if (inject && ext === ".html") return send(res, 200, injectRuntime(fs.readFileSync(file, "utf8")), type);
  const size = fs.statSync(file).size;
  let a = 0, b = size - 1, code = 200;
  const m = (req.headers.range || "").match(/bytes=(\d*)-(\d*)/);
  if (m) {
    if (m[1]) { a = parseInt(m[1], 10); if (m[2]) b = parseInt(m[2], 10); } else if (m[2]) a = Math.max(0, size - parseInt(m[2], 10));
    b = Math.min(b, size - 1);
    if (a > b || a >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    code = 206;
  }
  const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache", "Content-Length": b - a + 1 };
  if (code === 206) h["Content-Range"] = `bytes ${a}-${b}/${size}`;
  res.writeHead(code, h);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file, { start: a, end: b }).on("error", () => res.destroy()).pipe(res);
}

const body = req => new Promise((ok, bad) => { let s = ""; req.on("data", c => { s += c; if (s.length > 2e6) req.destroy(); }); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); });

async function handle(req, res) {
  const u = new URL(req.url, "http://x"), p = decodeURIComponent(u.pathname), q = Object.fromEntries(u.searchParams);
  if (req.method === "GET" || req.method === "HEAD") {
    if (p === "/") return sendFile(req, res, path.join(HERE, "page.html"));
    if (p === "/hf/player.js") return sendFile(req, res, PLAYER);
    if (p === "/hf/runtime.js") return sendFile(req, res, RUNTIME);
    if (p === "/capture") return send(res, 200, CAPTURE_PAGE(parseInt(q.w, 10) || 1920, parseInt(q.h, 10) || 1080), MIME[".html"]);
    if (p.startsWith("/f/")) {
      const f = path.resolve(ROOT, p.slice(3));
      if (!inside(f)) return send(res, 403, "proibido", "text/plain");
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, "não encontrado", "text/plain");
      return sendFile(req, res, f, q.raw !== "1");
    }
    if (p === "/api/project") return send(res, 200, { name: path.basename(ROOT), root: ROOT, comps: comps(), renders: renders(), notes: N.load(ROOT).notes });
    if (p === "/api/notes") {
      const f = path.join(N.notesDir(ROOT), "notes.json");
      return send(res, 200, { stamp: fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0, notes: N.load(ROOT).notes });
    }
    if (p === "/api/stamp") return send(res, 200, { stamp: watchStamp(q.kind, q.src) });
    if (p === "/api/fps") {
      if (q.kind === "render") return send(res, 200, { fps: renderFps(q.src) });
      const info = compInfo(path.join(ROOT, q.src));
      return send(res, 200, { fps: (info && info.fps) || 30 });
    }
    if (p.startsWith("/notes-img/")) {
      const f = path.join(N.notesDir(ROOT), "img", path.basename(p));
      return fs.existsSync(f) ? sendFile(req, res, f) : send(res, 404, "não encontrado", "text/plain");
    }
    return send(res, 404, "não encontrado", "text/plain");
  }
  if (req.method === "POST") {
    const b = await body(req);
    if (p === "/api/note") {
      const src = b.source || {};
      if (!["comp", "render"].includes(src.kind) || !src.path || !inside(path.resolve(ROOT, src.path)) || !fs.existsSync(path.resolve(ROOT, src.path)))
        return send(res, 400, { error: "fonte desconhecida" });
      const t = Math.max(0, Number(b.t) || 0), fps = Number(b.fps) || 30;
      const n = N.update(ROOT, data => {
        const id = data.next++;
        const note = { id, status: "open", created: N.now(), source: { kind: src.kind, path: src.path }, t: Math.round(t * 1000) / 1000,
          frame: Math.round(t * fps), fps, text: String(b.text || "").trim().slice(0, 2000), shapes: Array.isArray(b.shapes) ? b.shapes.slice(0, 50) : [], capture: "pending" };
        const sub = src.kind === "comp" ? subAt(src.path, t) : null;
        if (sub) note.scene = sub;
        data.notes.push(note);
        return note;
      });
      captureNote(n.id).catch(e => console.error(e));
      return send(res, 200, { note: n });
    }
    if (p === "/api/note-edit") {
      const id = Number(b.id);
      if (b.delete) {
        N.update(ROOT, data => { data.notes = data.notes.filter(x => x.id !== id); });
        const tag = String(id).padStart(3, "0");
        for (const f of [`n${tag}.jpg`, `n${tag}-crop.jpg`]) fs.rmSync(path.join(N.notesDir(ROOT), "img", f), { force: true });
        return send(res, 200, { ok: true });
      }
      const n = N.update(ROOT, data => {
        const x = N.find(data, id);
        if ("text" in b) x.text = String(b.text).trim().slice(0, 2000);
        if (b.status === "open" || b.status === "ok") { x.status = b.status; if (b.status === "open") delete x.fix; }
        return x;
      });
      return send(res, 200, { note: n });
    }
  }
  return send(res, 404, { error: "não encontrado" });
}

function openUrl(url) {
  const [cmd, a] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd, a, { stdio: "ignore", detached: true }).unref(); } catch {}
}

async function alreadyHere(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/project`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return path.resolve(j.root) === ROOT;
  } catch { return false; }
}

async function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) { console.error(`Pasta não existe: ${ROOT}`); process.exit(1); }
  if (!fs.existsSync(PLAYER) || !fs.existsSync(RUNTIME)) { console.error("Faltam as dependências: rode `npm install` na pasta do Aponta."); process.exit(1); }
  if (!hasCmd("ffmpeg")) console.warn("Aviso: ffmpeg não encontrado. Notas em renders vão ficar sem foto; as composições funcionam.");
  for (let tries = 0; tries < 20; tries++, PORT++) {
    const ok = await new Promise(resolve => {
      const srv = http.createServer((req, res) => handle(req, res).catch(e => { console.error(e); try { send(res, 500, { error: String(e.message || e) }); } catch {} }));
      srv.once("error", e => resolve(e.code === "EADDRINUSE" ? null : Promise.reject(e)));
      srv.listen(PORT, "127.0.0.1", () => resolve(srv));
    });
    if (ok) {
      capturer.port = PORT;
      const url = `http://127.0.0.1:${PORT}`;
      console.log(`Aponta aberto em ${url}  (pasta: ${ROOT})  Ctrl+C para fechar.`);
      if (flag("--open")) openUrl(url);
      const stop = async () => { await capturer.stop(); process.exit(0); };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      return;
    }
    if (await alreadyHere(PORT)) {
      const url = `http://127.0.0.1:${PORT}`;
      console.log(`O Aponta já está aberto pra essa pasta em ${url}`);
      if (flag("--open")) openUrl(url);
      process.exit(0);
    }
  }
  console.error("Não achei uma porta livre entre 8840 e 8859."); process.exit(1);
}

main();
