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
    if (v != null && String(v).trim()) {
      return String(v).trim().replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return '';
}

function cfg() {
  let endpoint = envFirst('S3_ENDPOINT', 'R2_ENDPOINT').replace(/\/$/, '');
  if (endpoint && !/^https?:\/\//i.test(endpoint)) endpoint = 'https://' + endpoint;
  const bucket = envFirst('S3_BUCKET', 'R2_BUCKET', 'R2_BUCKET_NAME');
  let origin = endpoint;
  try {
    if (endpoint) {
      const u = new URL(endpoint);
      const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      // Если в endpoint уже /bucket — не дублируем в path.
      if (bucket && parts[0] === bucket) origin = u.origin;
      else origin = `${u.protocol}//${u.host}`;
    }
  } catch { /* оставим как есть */ }
  const isR2 = /r2\.cloudflarestorage\.com/i.test(origin);
  const regionRaw = envFirst('S3_REGION', 'R2_REGION') || (isR2 ? 'auto' : 'us-east-1');
  return {
    bucket,
    region: isR2 ? 'auto' : regionRaw,
    endpoint: origin,
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
  if (/r2\.dev/i.test(c.endpoint)) {
    throw new Error('S3_ENDPOINT должен быть https://<ACCOUNT_ID>.r2.cloudflarestorage.com, а не r2.dev');
  }
  const encodedKey = encodePath(String(key).replace(/^\/+/, ''));
  const host = c.endpoint
    ? new URL(c.endpoint).host
    : `${c.bucket}.s3.${c.region}.amazonaws.com`;
  const path = c.endpoint ? `/${c.bucket}/${encodedKey}` : `/${encodedKey}`;
  const url = c.endpoint
    ? `${c.endpoint.replace(/\/$/, '')}/${c.bucket}/${encodedKey}`
    : `https://${host}/${encodedKey}`;
  const payload = body && method !== 'GET' && method !== 'HEAD' ? body : Buffer.alloc(0);
  const now = new Date();
  const amzDate = isoBasic(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  // Подписываем только стабильные заголовки. Content-Length/Type fetch может
  // переписать — из‑за этого R2 отвечает 401 Unauthorized.
  const headers = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
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
  const reqHeaders = {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${c.access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (contentType) reqHeaders['content-type'] = contentType;
  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[s3]', method, res.status, {
      host, bucket: c.bucket, region: c.region, key,
      access: c.access.slice(0, 4) + '…',
    }, t.slice(0, 300));
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
