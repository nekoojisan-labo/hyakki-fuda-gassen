import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png" };
const server = createServer(async (request, response) => {
  try {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname)).replace(/^\/+/, "");
    if (path.split("/").some((part) => part.startsWith("."))) throw new Error("hidden path denied");
    let file = join(root, path || "index.html");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(root)) throw new Error("invalid path");
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control":"no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () => console.log("百鬼札合戦: http://127.0.0.1:4173"));
