/* S3-совместимое хранилище: Cloudflare R2 / AWS / Yandex + локальный диск.
   Если R2/S3 не заданы — файлы пишутся в /uploads (для локальной разработки). */
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = join(ROOT, 'uploads');

function envFirst(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function cfg() {
  const endpoint = envFirst('S3_ENDPOINT', 'R2_ENDPOINT').replace(/\/$/, '');
  const isR2 = /r2\.cloudflarestorage\.com/i.test(endpoint);
  return {
    bucket: envFirst('S3_BUCKET', 'R2_BUCKET', 'R2_BUCKET_NAME'),
    region: envFirst('S3_REGION', 'R2_REGION') || (isR2 ? 'auto' : 'us-east-1'),
    endpoint,
    access: envFirst('S3_ACCESS_KEY', 'S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID', 'R2_ACCESS_KEY'),
    secret: envFirst('S3_SECRET_KEY', 'S3_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY', 'R2_SECRET_KEY'),
    publicBase: envFirst('S3_PUBLIC_URL', 'R2_PUBLIC_URL', 'R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
    isR2,
  };
}

export function s3Enabled() {
  const c = cfg();
  return !!(c.bucket && c.access && c.secret);
}

export function publicUrl(key) {
  const c = cfg();
  if (!c.publicBase || !key) return null;
  return `${c.publicBase}/${String(key).replace(/^\/+/, '')}`;
}

export function publicImgOrigins() {
  const out = ['https://*.r2.dev'];
  const c = cfg();
  if (c.publicBase) {
    try { out.push(new URL(c.publicBase).origin); } catch { /* ignore */ }
  }
  return out;
}

function hmac(key, data) { return createHmac('sha256', key).update(data, 'utf8').digest(); }
function sha256Hex(buf) { return createHash('sha256').update(buf).digest('hex'); }
function isoBasic(d) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/** SigV4 URI-encode: encode each path segment, keep slashes. */
function encodePath(path) {
  return path.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (ch) =>
    '%' + ch.charCodeAt(0).toString(16).toUpperCase()
  )).join('/');
}

async function signedFetch(method, key, body, contentType) {
  const c = cfg();
  if (!c.bucket || !c.access || !c.secret) throw new Error('R2/S3 не настроен');
  const encodedKey = encodePath(String(key).replace(/^\/+/, ''));
  const host = c.endpoint
    ? new URL(c.endpoint).host
    : `${c.bucket}.s3.${c.region}.amazonaws.com`;
  const path = c.endpoint ? `/${c.bucket}/${encodedKey}` : `/${encodedKey}`;
  const url = c.endpoint
    ? `${c.endpoint}/${c.bucket}/${encodedKey}`
    : `https://${host}/${encodedKey}`;
  const payload = body && method !== 'GET' && method !== 'HEAD' ? body : Buffer.alloc(0);
  const now = new Date();
  const amzDate = isoBasic(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const headers = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (contentType) headers['content-type'] = contentType;
  if (payload.length) headers['content-length'] = String(payload.length);
  const signedHeaderNames = Object.keys(headers).sort();
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const canonical = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${c.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const kDate = hmac(`AWS4${c.secret}`, dateStamp);
  const kRegion = hmac(kDate, c.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2/S3 ${method} ${res.status}: ${t.slice(0, 240)}`);
  }
  return res;
}

export async function putObject(key, body, contentType) {
  if (s3Enabled()) {
    await signedFetch('PUT', key, body, contentType);
    return { storage: 's3', key };
  }
  const dest = join(UPLOADS, key);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body);
  return { storage: 'local', key };
}

export async function deleteObject(key, storage) {
  try {
    if (storage === 's3' || (storage !== 'local' && s3Enabled())) {
      await signedFetch('DELETE', key, Buffer.alloc(0));
      return;
    }
    await unlink(join(UPLOADS, key));
  } catch { /* уже нет — ок */ }
}

export async function readObject(key, storage) {
  if (storage === 's3' || (storage !== 'local' && s3Enabled())) {
    const res = await signedFetch('GET', key, Buffer.alloc(0));
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(join(UPLOADS, key));
}
