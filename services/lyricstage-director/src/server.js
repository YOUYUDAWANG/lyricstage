import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { FileCache } from "./cache.js";
import {
  buildFullscreenPromptInput,
  directorVersion,
  finalizeFullscreenResponse,
  fullscreenSystemPrompt,
  responseVersion,
  sanitizeFullscreenRequest,
} from "./contract.js";
import {
  buildMusicIdentityPromptInput,
  finalizeMusicIdentityResponse,
  musicIdentityRequestVersion,
  musicIdentityResolverVersion,
  musicIdentityResponseSchema,
  musicIdentityResponseVersion,
  musicIdentitySystemPrompt,
  sanitizeMusicIdentityRequest,
} from "./music-identity.js";
import { callMusicIdentityWithFallback, callVertexDirector } from "./provider.js";

const maximumBodyBytes = 96_000;
const cacheTTL = 30 * 24 * 60 * 60 * 1000;
const inFlight = new Map();
let activeUpstreamRequests = 0;

export function loadEnvironment(source = process.env) {
  return {
    API_KEY: source.API_KEY || "",
    GCP_API_KEY: source.GCP_API_KEY || "",
    UPSTREAM_BASE_URL: source.UPSTREAM_BASE_URL || "https://aiplatform.googleapis.com",
    MODEL: source.MODEL || "gemini-3.7-flash",
    IDENTITY_API_KEY: source.IDENTITY_API_KEY || "",
    IDENTITY_UPSTREAM_BASE_URL: source.IDENTITY_UPSTREAM_BASE_URL || "https://generativelanguage.googleapis.com",
    IDENTITY_MODEL: source.IDENTITY_MODEL || "gemma-4-26b-a4b-it",
    IDENTITY_FALLBACK_MODEL: source.IDENTITY_FALLBACK_MODEL || source.MODEL || "gemini-3.5-flash",
    IDENTITY_RESOLVER_VERSION: source.IDENTITY_RESOLVER_VERSION || musicIdentityResolverVersion,
    DIRECTOR_VERSION: source.DIRECTOR_VERSION || directorVersion,
    CACHE_DIR: source.CACHE_DIR || "/var/lib/lyricstage-director/cache",
  };
}

export async function handleRequest(request, environment, dependencies = {}) {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return json({
      ok: true,
      service: "lyricstage-fullscreen-director",
      version: responseVersion,
      directorVersion: environment.DIRECTOR_VERSION,
      model: environment.MODEL,
      identityModel: environment.IDENTITY_MODEL,
      identityFallbackModel: environment.IDENTITY_FALLBACK_MODEL,
      endpoint: "POST /v1/fullscreen/direct",
      endpoints: ["POST /v1/fullscreen/direct", "POST /v1/music/identity"],
      upstream: "vertex-ai-express",
      upstreamConfigured: Boolean(environment.GCP_API_KEY),
      identityUpstream: "gemini-api-google-search+vertex-ai-express-fallback",
      identityUpstreamConfigured: Boolean(environment.IDENTITY_API_KEY || environment.GCP_API_KEY),
    });
  }
  const isDirectorRequest = request.method === "POST" && url.pathname === "/v1/fullscreen/direct";
  const isMusicIdentityRequest = request.method === "POST" && url.pathname === "/v1/music/identity";
  if (!isDirectorRequest && !isMusicIdentityRequest) {
    return json({ error: "not_found" }, 404);
  }
  if (!environment.API_KEY || request.headers.get("authorization") !== `Bearer ${environment.API_KEY}`) {
    return json({ error: "unauthorized" }, 401);
  }
  let raw;
  try {
    raw = await readJSON(request);
  } catch (error) {
    return json({ error: error?.message === "payload_too_large" ? "payload_too_large" : "invalid_request" }, error?.message === "payload_too_large" ? 413 : 400);
  }
  if (isMusicIdentityRequest) {
    return handleMusicIdentity(raw, environment, dependencies);
  }
  let input;
  try {
    input = sanitizeFullscreenRequest(raw);
  } catch (error) {
    return json({ error: "invalid_request", reason: String(error?.message || "invalid_request").slice(0, 80) }, 400);
  }
  const key = sha256(`${environment.DIRECTOR_VERSION}:${JSON.stringify(input)}`);
  const cache = dependencies.cache || new FileCache(environment.CACHE_DIR);
  const cached = await cache.get(key);
  if (cached) return json({ ...cached, cache: "hit" });
  if (inFlight.has(key)) return json(await inFlight.get(key));
  if (activeUpstreamRequests >= 2) return json({ error: "busy" }, 429, { "retry-after": "5" });

  const task = (async () => {
    activeUpstreamRequests += 1;
    try {
      const provider = dependencies.provider || callVertexDirector;
      const upstream = await provider(environment, fullscreenSystemPrompt, buildFullscreenPromptInput(input));
      const response = finalizeFullscreenResponse(input, upstream.value, environment.DIRECTOR_VERSION);
      const envelope = { ...response, model: upstream.model || environment.MODEL, cache: "miss" };
      if (!response.degraded) await cache.put(key, envelope, cacheTTL);
      return envelope;
    } catch (error) {
      return {
        version: responseVersion,
        directorVersion: environment.DIRECTOR_VERSION,
        trackID: input.trackID,
        recordingID: input.recordingID,
        lyricsHash: input.lyricsHash,
        lyricsIdentity: input.lyricsIdentity,
        degraded: true,
        degradedReason: String(error?.message || "upstream_error").slice(0, 120),
        cache: "miss",
      };
    } finally {
      activeUpstreamRequests -= 1;
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return json(await task);
}

async function handleMusicIdentity(raw, environment, dependencies) {
  let input;
  try {
    input = sanitizeMusicIdentityRequest(raw);
  } catch (error) {
    return json({ error: "invalid_request", reason: String(error?.message || "invalid_request").slice(0, 80) }, 400);
  }
  const resolverVersion = environment.IDENTITY_RESOLVER_VERSION || musicIdentityResolverVersion;
  const key = sha256(`music-identity:${resolverVersion}:${JSON.stringify(input)}`);
  const cache = dependencies.cache || new FileCache(environment.CACHE_DIR);
  const cached = await cache.get(key);
  if (cached) return json({ ...cached, cache: "hit" });
  if (inFlight.has(key)) return json(await inFlight.get(key));
  if (activeUpstreamRequests >= 2) return json({ error: "busy" }, 429, { "retry-after": "5" });

  const task = (async () => {
    activeUpstreamRequests += 1;
    try {
      const provider = dependencies.identityProvider || callMusicIdentityWithFallback;
      const upstream = await provider(
        environment,
        musicIdentitySystemPrompt,
        buildMusicIdentityPromptInput(input),
        musicIdentityResponseSchema,
      );
      const response = finalizeMusicIdentityResponse(input, upstream.value, upstream.groundingMetadata);
      const envelope = { ...response, resolverVersion, model: upstream.model || environment.IDENTITY_MODEL, cache: "miss" };
      if (response.status === "grounded") await cache.put(key, envelope, cacheTTL);
      return envelope;
    } catch (error) {
      return {
        version: musicIdentityResponseVersion,
        resolverVersion,
        trackID: input.trackID,
        status: "unavailable",
        canonicalTitle: "",
        titleAliases: [],
        performers: [],
        originalArtists: [],
        creators: [],
        isCover: input.localHints.isCover,
        confidence: 0,
        evidenceSummary: "",
        searchQueries: [],
        sources: [],
        reason: String(error?.message || "identity_upstream_error").slice(0, 120),
        model: environment.IDENTITY_MODEL,
        cache: "miss",
      };
    } finally {
      activeUpstreamRequests -= 1;
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return json(await task);
}

export function createNodeServer(environment = loadEnvironment(), dependencies = {}) {
  return createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > maximumBodyBytes) throw new Error("payload_too_large");
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = incoming.method || "GET";
      const protocol = headers.get("x-forwarded-proto") || "http";
      const host = headers.get("host") || "127.0.0.1";
      const response = await handleRequest(new Request(`${protocol}://${host}${incoming.url || "/"}`, {
        method,
        headers,
        ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
      }), environment, dependencies);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const status = error?.message === "payload_too_large" ? 413 : 500;
      outgoing.statusCode = status;
      outgoing.setHeader("content-type", "application/json; charset=utf-8");
      outgoing.end(JSON.stringify({ error: status === 413 ? "payload_too_large" : "internal_error" }));
      if (status === 500) console.error("request_failed", error);
    }
  });
}

async function readJSON(request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBodyBytes) throw new Error("payload_too_large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximumBodyBytes) throw new Error("payload_too_large");
  return JSON.parse(new TextDecoder().decode(bytes));
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function startServer(source = process.env) {
  const environment = loadEnvironment(source);
  if (!environment.API_KEY || !environment.GCP_API_KEY) throw new Error("required_secrets_missing");
  const server = createNodeServer(environment);
  server.requestTimeout = 125_000;
  server.headersTimeout = 10_000;
  const host = source.HOST || "0.0.0.0";
  const port = Number(source.PORT || 8787);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.log(`lyricstage-fullscreen-director listening on ${host}:${port}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startServer();
