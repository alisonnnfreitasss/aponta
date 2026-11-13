// Aponta: as fotos dos quadros. Um navegador invisível fica aberto enquanto o servidor roda:
// tira a foto de uma composição no tempo exato da nota, e desenha a marcação em cima (num canvas, sem biblioteca nativa).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Um Chrome, Chromium ou Edge pra rodar invisível: o que o HyperFrames baixou, o do puppeteer, ou o do sistema. */
export function findBrowser() {
  if (process.env.APONTA_BROWSER && fs.existsSync(process.env.APONTA_BROWSER)) return process.env.APONTA_BROWSER;
  const home = os.homedir(), win = process.platform === "win32";
  const exe = win ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const cached = [];
  for (const base of [path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), path.join(home, ".cache", "puppeteer", "chrome-headless-shell")]) {
    try {
      for (const ver of fs.readdirSync(base).sort().reverse())
        for (const sub of fs.readdirSync(path.join(base, ver))) {
          const p = path.join(base, ver, sub, exe);
          if (fs.existsSync(p)) cached.push(p);
        }
    } catch {}
  }
  if (cached.length) return cached[0];
  const pf = process.env["PROGRAMFILES"] || "C:\\Program Files", pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", local = process.env.LOCALAPPDATA || "";
  const system = win ? [
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"), path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"), path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
  ] : process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"];
  return system.find(p => p && fs.existsSync(p)) || null;
}

export class Capturer {
  constructor(port) { this.port = port; this.browser = null; this.pages = new Map(); this.chain = Promise.resolve(); }

  async _browser() {
    if (this.browser && this.browser.connected) return this.browser;
    const exe = findBrowser();
    if (!exe) throw new Error("nenhum Chrome ou Edge encontrado (rode node src/doctor.mjs)");
    const { default: puppeteer } = await import("puppeteer-core");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aponta-"));
    this.browser = await puppeteer.launch({
      executablePath: exe, headless: true,
      args: ["--autoplay-policy=no-user-gesture-required", "--no-first-run", "--mute-audio", "--hide-scrollbars", "--user-data-dir=" + profile],
    });
    return this.browser;
  }

  // Fecha o navegador depois de 2 minutos sem fotos: libera memória e não deixa um Chrome/Edge invisível aberto
  // se o servidor for encerrado à força (no Windows, o processo filho pode sobreviver ao pai).
  _queue(fn) {
    clearTimeout(this.idle);
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => {}).then(() => { this.idle = setTimeout(() => this._close(), 120000); this.idle.unref?.(); });
    return p;
  }

  async _close() {
    for (const pg of this.pages.values()) await pg.close().catch(() => {});
    this.pages.clear();
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }

  /** A foto do quadro t de uma composição, em PNG. */
  shot({ src, key, t, w, h, out }) {
    return this._queue(async () => {
      let page = this.pages.get(key);
      if (!page) {
        while (this.pages.size >= 2) { const [k, p] = this.pages.entries().next().value; this.pages.delete(k); await p.close().catch(() => {}); }
        const b = await this._browser();
        page = await b.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
        await page.goto(`http://127.0.0.1:${this.port}/capture?src=${encodeURIComponent(src)}&w=${w}&h=${h}`, { waitUntil: "load", timeout: 60000 });
        await page.waitForFunction("window.__ready || window.__err", { timeout: 90000 });
        const err = await page.evaluate("window.__err");
        if (err) { await page.close().catch(() => {}); throw new Error(err); }
        this.pages.set(key, page);
      }
      await page.evaluate(x => window.__seek(x), t);
      await page.screenshot({ path: out, type: "png", clip: { x: 0, y: 0, width: w, height: h } });
    });
  }

  /** O quadro com a marcação desenhada (até 1600 px) e o recorte limpo da área marcada, em JPEG. Devolve se houve recorte. */
  annotate({ raw, shapes, full, crop }) {
    return this._queue(async () => {
      const b = await this._browser();
      const page = await b.newPage();
      try {
        const data = "data:image/png;base64," + fs.readFileSync(raw).toString("base64");
        const res = await page.evaluate(async (data, shapes) => {
          const img = new Image(); img.src = data; await img.decode();
          const W = img.naturalWidth, H = img.naturalHeight, lw = Math.max(4, Math.round(W / 280));
          const P = p => [p[0] * W, p[1] * H], xs = [], ys = [];
          const ann = document.createElement("canvas"); ann.width = W; ann.height = H;
          const g = ann.getContext("2d"); g.drawImage(img, 0, 0);
          g.strokeStyle = "rgb(255,59,48)"; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
          for (const s of shapes || []) {
            g.beginPath();
            if (s.type === "pen" && s.pts && s.pts.length > 1) { s.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); xs.push(x); ys.push(y); }); g.stroke(); }
            else if (s.type === "box") { const [x0, y0] = P(s.a), [x1, y1] = P(s.b); g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); xs.push(x0, x1); ys.push(y0, y1); }
            else if (s.type === "arrow") {
              const [x0, y0] = P(s.a), [x1, y1] = P(s.b), a = Math.atan2(y1 - y0, x1 - x0), L = lw * 5;
              g.moveTo(x0, y0); g.lineTo(x1, y1);
              for (const da of [2.6, -2.6]) { g.moveTo(x1, y1); g.lineTo(x1 + L * Math.cos(a + da), y1 + L * Math.sin(a + da)); }
              g.stroke(); xs.push(x0, x1); ys.push(y0, y1);
            } else if (s.type === "pin") { const [x, y] = P(s.p), r = lw * 4; g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); xs.push(x - r * 6, x + r * 6); ys.push(y - r * 6, y + r * 6); }
          }
          const sc = Math.min(1, 1600 / Math.max(W, H)), sm = document.createElement("canvas");
          sm.width = Math.round(W * sc); sm.height = Math.round(H * sc); sm.getContext("2d").drawImage(ann, 0, 0, sm.width, sm.height);
          const out = { full: sm.toDataURL("image/jpeg", 0.88), crop: null };
          if (xs.length) {
            const pad = Math.max(0.07 * W, 110 * W / 1920);
            const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.min(W, Math.max(...xs) + pad), y0 = Math.max(0, Math.min(...ys) - pad), y1 = Math.min(H, Math.max(...ys) + pad);
            const cw = x1 - x0, ch = y1 - y0, cs = Math.min(1, 1600 / Math.max(cw, ch)), c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(cw * cs)); c.height = Math.max(1, Math.round(ch * cs));
            c.getContext("2d").drawImage(img, x0, y0, cw, ch, 0, 0, c.width, c.height);
            out.crop = c.toDataURL("image/jpeg", 0.92);
          }
          return out;
        }, data, shapes);
        fs.writeFileSync(full, Buffer.from(res.full.split(",")[1], "base64"));
        if (res.crop) fs.writeFileSync(crop, Buffer.from(res.crop.split(",")[1], "base64"));
        return !!res.crop;
      } finally { await page.close().catch(() => {}); }
    });
  }

  async stop() { clearTimeout(this.idle); await this._close(); }
}
