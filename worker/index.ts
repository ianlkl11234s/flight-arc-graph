// Flight Arc 的 Cloudflare Worker：只處理 /data/*（R2）與 /airports/*（大寫 301），
// 其他路徑由 wrangler.jsonc 的 assets 直接回靜態檔，不經過這裡。
// 對應原本 nginx.conf 的 location /data/ 與 location ^~ /airports/。

interface R2ObjectLike {
  httpEtag: string;
  size: number;
  range?: { offset?: number; length?: number; suffix?: number };
  writeHttpMetadata(headers: Headers): void;
}
interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream;
}
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DATA: {
    get(
      key: string,
      options?: { range?: Headers; onlyIf?: Headers },
    ): Promise<R2ObjectBodyLike | R2ObjectLike | null>;
    head(key: string): Promise<R2ObjectLike | null>;
  };
}

// nginx 用 types 補的兩個 mime；R2 物件從 S3 複製過來時 content-type 不一定可靠，一律依副檔名覆寫
const CONTENT_TYPES: Record<string, string> = {
  jsonl: "application/x-ndjson",
  geojson: "application/geo+json",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
};

// 檔名帶日期的逐日 shard 內容不可變 → 長效快取；其餘（manifest 等）1 小時
const IMMUTABLE_SHARD = /\/[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/;

async function serveData(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const key = decodeURIComponent(url.pathname.slice("/data/".length));
  if (!key || key.endsWith("/") || key.split("/").includes("..")) {
    return new Response("Not Found", { status: 404 });
  }

  const object =
    request.method === "HEAD"
      ? await env.DATA.head(key)
      : await env.DATA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  if (CONTENT_TYPES[ext]) headers.set("Content-Type", CONTENT_TYPES[ext]);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Cache-Control",
    IMMUTABLE_SHARD.test(key) ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  );

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(object.size));
    return new Response(null, { headers });
  }
  // onlyIf 條件不成立（If-None-Match 命中）時 R2 回不帶 body 的物件
  if (!("body" in object)) return new Response(null, { status: 304, headers });

  if (object.range && request.headers.has("Range")) {
    const { offset = 0, length = object.size - offset } = object.range;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/data/")) return serveData(request, env, url);

    // 機場頁網址契約是小寫：大寫一律 301 到小寫；不存在的機場由靜態資產回 404
    if (url.pathname.startsWith("/airports/") && url.pathname !== url.pathname.toLowerCase()) {
      url.pathname = url.pathname.toLowerCase();
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
