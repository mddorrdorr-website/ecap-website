// Local preview:  node tests/dev-server.js   then open http://127.0.0.1:8793
// Serves the site AND runs the real /api functions, backed by an in-memory
// stand-in for Supabase/Resend (see fake-backend.js) — so registration, code
// lookup and card sending all work locally with no accounts. Data resets when
// the server stops. Not used in production (Vercel runs the functions there).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { world, install } = require("./fake-backend.js");

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "sb_secret_local";
process.env.RESEND_API_KEY = "re_local";
install();

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8793);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon" };

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try { resolve(raw ? JSON.parse(raw) : undefined); } catch (e) { resolve(undefined); }
    });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
    let handler;
    try { handler = require(path.join(ROOT, "api", name + ".js")); } catch (e) { res.writeHead(404); return res.end("No such function"); }
    const shim = {
      statusCode: 200,
      setHeader: (k, v) => res.setHeader(k, v),
      status(n) { this.statusCode = n; return this; },
      json(o) { res.writeHead(this.statusCode, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); return this; },
    };
    const query = Object.fromEntries(url.searchParams);
    const body = req.method === "POST" ? await readBody(req) : undefined;
    return handler({ method: req.method, body, query }, shim);
  }

  if (url.pathname === "/__dev/state") { // handy for checking what was "stored" and "emailed"
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ rows: world.rows, emails: world.emails.map((e) => ({ subject: e.subject, attachments: (e.attachments || []).length })) }));
  }

  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
  if (!file.startsWith(ROOT) || /[\\/](tests|supabase|api|\.git)[\\/]/.test(file)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => console.log("ECAP local preview on http://127.0.0.1:" + PORT));
