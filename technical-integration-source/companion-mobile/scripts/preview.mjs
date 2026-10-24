import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";

const root = process.env.PREVIEW_DIR ? path.resolve(process.env.PREVIEW_DIR) : fileURLToPath(new URL("../dist/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
let port = Number(process.env.PORT || 4178);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (
      file !== path.resolve(root) &&
      !file.startsWith(path.resolve(root) + path.sep)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory())
      file = path.join(file, "index.html");
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Export missing. Run npm run export:web first.");
  }
});
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < 4200) {
    port++;
    server.listen(port, "127.0.0.1");
  } else {
    console.error(error.message);
    process.exitCode = 1;
  }
});
server.on("listening", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Auric Mechanics web preview: ${url} (not Android validation)`);
  if (process.env.OPEN_BROWSER === "1" && process.platform === "win32") {
    execFile("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process '${url}'`,
    ]);
  }
});
server.listen(port, "127.0.0.1");
