/* S3-совместимое хранилище (AWS / Yandex Object Storage / R2) + локальный диск. */
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = join(ROOT, 'uploads');

export function s3Enabled() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

function cfg() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/$/, '');
  const access = process.env.S3_ACCESS_KEY;
  const secret = process.env.S3_SECRET_KEY;
  const publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
  return { bucket, region, endpoint, access, secret, publicBase };
}

function hmac(key, data) { return createHmac('sha256', key).update(data, 'utf8').digest(); }
function sha256Hex(buf) { return createHash('sha256').update(buf).digest('hex'); }
function isoBasic(d) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function signedFetch(method, key, body, contentType) {
  const c = cfg();
  const host = c.endpoint
    ? new URL(c.endpoint).host
    : `${c.bucket}.s3.${c.region}.amazonaws.com`;
  const path = c.endpoint ? `/${c.bucket}/${key}` : `/${key}`;
  const url = c.endpoint ? `${c.endpoint}/${c.bucket}/${key}` : `https://${host}/${key}`;
  const now = new Date();
  const amzDate = isoBasic(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body || Buffer.alloc(0));
  const headers = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (contentType) headers['content-type'] = contentType;
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
  const res = await fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`S3 ${method} ${res.status}: ${t.slice(0, 200)}`);
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

export function publicUrl(key) {
  const c = cfg();
  if (c.publicBase) return `${c.publicBase}/${key}`;
  return null;
}
