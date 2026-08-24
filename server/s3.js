/* S3-совместимое хранилище: Cloudflare R2 / AWS + локальный диск.
   Если R2/S3 не заданы — файлы пишутся в /uploads (для локальной разработки). */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

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
  return !!(c.bucket && c.access && c.secret && c.endpoint);
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

let client = null;
function s3() {
  if (client) return client;
  const c = cfg();
  if (!c.endpoint || !c.access || !c.secret) throw new Error('R2/S3 не настроен');
  if (/r2\.dev/i.test(c.endpoint)) {
    throw new Error('S3_ENDPOINT должен быть https://<ACCOUNT_ID>.r2.cloudflarestorage.com, а не r2.dev');
  }
  client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.access, secretAccessKey: c.secret },
    forcePathStyle: true,
    // AWS SDK v3 по умолчанию шлёт CRC32 — R2 это отвергает.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  console.log('[s3] client', { host: new URL(c.endpoint).host, bucket: c.bucket, region: c.region, r2: c.isR2 });
  return client;
}

export async function putObject(key, body, contentType) {
  if (s3Enabled()) {
    const c = cfg();
    try {
      await s3().send(new PutObjectCommand({
        Bucket: c.bucket,
        Key: String(key).replace(/^\/+/, ''),
        Body: body,
        ContentType: contentType || 'application/octet-stream',
      }));
    } catch (e) {
      const status = e.$metadata?.httpStatusCode || e.name || '';
      console.error('[s3] PUT', status, e.message);
      throw new Error(`R2/S3 PUT ${status}: ${String(e.message || e).slice(0, 240)}`);
    }
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
      const c = cfg();
      await s3().send(new DeleteObjectCommand({
        Bucket: c.bucket,
        Key: String(key).replace(/^\/+/, ''),
      }));
      return;
    }
    await unlink(join(UPLOADS, key));
  } catch { /* уже нет — ок */ }
}

export async function readObject(key, storage) {
  if (storage === 's3' || (storage !== 'local' && s3Enabled())) {
    const c = cfg();
    const out = await s3().send(new GetObjectCommand({
      Bucket: c.bucket,
      Key: String(key).replace(/^\/+/, ''),
    }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  return readFile(join(UPLOADS, key));
}
