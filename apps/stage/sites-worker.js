const SHOWCASE_BVID = "BV1hSZFBwE6g";
const BILIBILI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

const bilibiliJSON = async (url) => {
  const response = await fetch(url, { headers: BILIBILI_HEADERS });
  if (!response.ok) throw new Error("bilibili-http");
  const payload = await response.json();
  if (payload?.code !== 0) throw new Error("bilibili-api");
  return payload.data;
};

export const audioCandidates = (playInfo) => {
  const dash = playInfo?.dash;
  const candidates = [...(dash?.audio ?? [])];
  if (dash?.flac?.audio) candidates.push(dash.flac.audio);
  candidates.sort((left, right) => (right.id ?? 0) - (left.id ?? 0));
  const urls = [];
  for (const candidate of candidates) {
    for (const url of [candidate.baseUrl, candidate.base_url, ...(candidate.backupUrl ?? candidate.backup_url ?? [])]) {
      if (typeof url === "string" && url.startsWith("https://") && !urls.includes(url)) urls.push(url);
    }
  }
  return urls.slice(0, 4);
};

const proxyShowcaseAudio = async (request) => {
  const info = await bilibiliJSON(`https://api.bilibili.com/x/web-interface/view?bvid=${SHOWCASE_BVID}`);
  const cid = info?.pages?.[0]?.cid;
  if (!Number.isFinite(cid)) throw new Error("bilibili-page");
  const playInfo = await bilibiliJSON(
    `https://api.bilibili.com/x/player/playurl?bvid=${SHOWCASE_BVID}&cid=${cid}&fnval=16&fourk=1`,
  );
  const range = request.headers.get("Range");
  const headers = {
    ...BILIBILI_HEADERS,
    Origin: "https://www.bilibili.com",
    ...(range ? { Range: range } : {}),
  };
  for (const url of audioCandidates(playInfo)) {
    const upstream = await fetch(url, { headers });
    if (!upstream.ok && upstream.status !== 206) continue;
    const responseHeaders = new Headers({
      "Accept-Ranges": upstream.headers.get("Accept-Ranges") ?? "bytes",
      "Cache-Control": "private, max-age=300",
      "Content-Type": "audio/mp4",
    });
    for (const name of ["Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }
  throw new Error("bilibili-cdn");
};

const assetRequest = (request, pathname) => {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return new Request(url, request);
};

const audioAssetResponse = async (request, bundled) => {
  const headers = new Headers(bundled.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Content-Type", "audio/mp4");
  const range = request.headers.get("Range")?.match(/^bytes=(\d+)-(\d*)$/u);
  if (range && bundled.status === 200) {
    const source = await bundled.arrayBuffer();
    const start = Math.min(source.byteLength - 1, Number(range[1]));
    const requestedEnd = range[2] ? Number(range[2]) : source.byteLength - 1;
    const end = Math.min(source.byteLength - 1, Math.max(start, requestedEnd));
    const body = source.slice(start, end + 1);
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Content-Range", `bytes ${start}-${end}/${source.byteLength}`);
    return new Response(request.method === "HEAD" ? null : body, { status: 206, headers });
  }
  return new Response(request.method === "HEAD" ? null : bundled.body, {
    status: bundled.status,
    headers,
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/showcase/you-and-aizu/audio") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      if (env?.ASSETS?.fetch) {
        const bundled = await env.ASSETS.fetch(assetRequest(request, "/showcase/you-and-aizu.m4a"));
        if (bundled.ok || bundled.status === 206) return audioAssetResponse(request, bundled);
      }
      try {
        return await proxyShowcaseAudio(request);
      } catch {
        return new Response("Showcase audio is temporarily unavailable", {
          status: 502,
          headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }
    if (!env?.ASSETS?.fetch) {
      return new Response("LyricStage assets are unavailable", { status: 503 });
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || request.method !== "GET") return asset;
    const acceptsHTML = request.headers.get("Accept")?.includes("text/html") ?? false;
    if (url.pathname !== "/" && !acceptsHTML) return asset;
    return env.ASSETS.fetch(assetRequest(request, "/index.html"));
  },
};
