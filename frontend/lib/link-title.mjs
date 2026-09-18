import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19)));
  }
  return isIP(address) === 6 && /^2[0-9a-f]{3}:/i.test(address);
}

async function downloadTitlePage(url, redirects = 0) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Unsupported URL");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error("Unsupported address");
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      headers: { "User-Agent": "MichelBlog-LinkPreview/1.0", Accept: "text/html" }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3 || !res.headers.location) return reject(new Error("Too many redirects"));
        downloadTitlePage(new URL(res.headers.location, url), redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 || !String(res.headers["content-type"]).includes("text/html")) {
        res.resume(); reject(new Error("No HTML metadata")); return;
      }
      const chunks = [];
      let length = 0;
      res.on("data", (chunk) => {
        length += chunk.length;
        if (length > 1024 * 1024) { req.destroy(new Error("Metadata page too large")); return; }
        chunks.push(chunk);
        if (Buffer.concat(chunks).includes(Buffer.from("</head>"))) {
          resolve(Buffer.concat(chunks).toString("utf8"));
          res.destroy();
        }
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("Metadata timeout")), 8000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}

export async function fetchLinkTitle(value) {
  const html = await downloadTitlePage(new URL(String(value || "")));
  const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  return raw.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    if (entity.startsWith("#")) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return {amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "}[entity.toLowerCase()] || match;
  }).replace(/\s+/g, " ").trim().slice(0, 240);
}
