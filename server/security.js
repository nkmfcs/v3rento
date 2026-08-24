/* Централизованная безопасность: заголовки + CSRF-защита по Origin + генерация паролей.
 * Без внешних зависимостей — полный контроль над каждым правилом. */
import crypto from 'node:crypto';
import { publicImgOrigins } from './s3.js';

// Алфавит без неоднозначных символов (0/O, 1/l/I) — удобно диктовать по телефону.
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Криптостойкий читаемый пароль. len символов из 56-буквенного алфавита
 * (~5.8 бит/символ → 14 символов ≈ 81 бит энтропии). Без modulo-смещения
 * (rejection sampling). Формат: "Rento-XXXXXXXXXXXXXX".
 */
export function generatePassword(len = 14) {
  const cutoff = Math.floor(256 / PW_ALPHABET.length) * PW_ALPHABET.length;
  let out = '';
  while (out.length < len) {
    const b = crypto.randomBytes(1)[0];
    if (b < cutoff) out += PW_ALPHABET[b % PW_ALPHABET.length];
  }
  return 'Rento-' + out;
}

// Content-Security-Policy. Приложение исторически построено на inline-скриптах
// и inline-обработчиках (onclick), поэтому script/style требуют 'unsafe-inline'.
// НО остальное закрыто максимально жёстко:
//   - connect-src 'self'  → украденные XSS-данные некуда отправить (нет exfiltration)
//   - frame-ancestors 'none' + object-src 'none' + base-uri/form-action 'self'
//   - default-src 'self'  → всё, что не разрешено явно, блокируется
// Внешне грузятся: Google Fonts (styles+fonts) и Yandex Maps (iframe карты доставки).
const isProd = process.env.NODE_ENV === 'production';

const CSP = [
  "default-src 'self'",
  // telegram.org — SDK Telegram Mini App (telegram-web-app.js): даёт ready()/expand()
  // и безопасные зоны (safeAreaInset). Грузится только в мобильной версии /m.
  "script-src 'self' 'unsafe-inline' https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: ${publicImgOrigins().join(' ')}`,
  "connect-src 'self'",
  "frame-src https://yandex.uz https://*.yandex.uz https://*.yandex.ru",
  isProd ? "frame-ancestors 'none'" : "frame-ancestors *",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join('; ');

const PERMISSIONS_POLICY = [
  'geolocation=()', 'camera=()', 'microphone=()', 'payment=()',
  'usb=()', 'magnetometer=()', 'gyroscope=()', 'accelerometer=()',
  'interest-cohort=()',
].join(', ');

/** Выставляет security-заголовки на КАЖДЫЙ ответ. */
export function securityHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
}

/** Хосты запроса: сам Host + всё, что проставил прокси (превью / Railway). */
function requestHosts(req) {
  const out = new Set();
  const add = (raw) => {
    if (!raw) return;
    for (const part of String(raw).split(',')) {
      const h = part.trim().toLowerCase();
      if (!h) continue;
      out.add(h);
      const name = h.startsWith('[')
        ? (h.slice(1, h.indexOf(']')) || h)
        : h.split(':')[0];
      if (name) out.add(name);
    }
  };
  add(req.headers.host);
  add(req.headers['x-forwarded-host']);
  add(req.headers['x-original-host']);
  return out;
}

function urlHost(value) {
  try {
    const u = new URL(value);
    return { host: u.host.toLowerCase(), hostname: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** true, если Origin/Referer совпадает с хостом сервера или прокси. */
function isSameOrigin(req) {
  const hosts = requestHosts(req);
  const origin = urlHost(req.headers.origin);
  if (origin) return hosts.has(origin.host) || hosts.has(origin.hostname);
  const ref = urlHost(req.headers.referer);
  if (ref) return hosts.has(ref.host) || hosts.has(ref.hostname);
  return false;
}

/**
 * CSRF-защита (defense in depth поверх SameSite cookie).
 * В превью страница открывается через прокси: Origin браузера ≠ внутренний Host,
 * из-за этого строгая сверка ломала вход. За прокси доверяем Origin, если
 * запрос уже пришёл с X-Forwarded-*. В проде — только совпадение хоста.
 */
export function verifyOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (isSameOrigin(req)) return next();
  // Превью / локалка: прокси подменяет Host, Origin при этом настоящий.
  if (process.env.NODE_ENV !== 'production') return next();
  if (req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']) {
    const origin = urlHost(req.headers.origin) || urlHost(req.headers.referer);
    if (origin && (origin.hostname === 'localhost' || origin.hostname.endsWith('.localhost'))) {
      return next();
    }
  }
  return res.status(403).json({ ok: false, error: 'Запрос отклонён: неверный источник (CSRF)' });
}
