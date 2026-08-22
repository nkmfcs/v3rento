/* Загрузка .env.local. Импортируется ПЕРВЫМ во всех server-модулях,
   чтобы process.env.* был доступен в top-level import других файлов. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

try {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* в проде .env.local может не быть */
}

// Зона бизнеса. Все вычисления «сегодня»/границ месяца на бэке должны
// совпадать с локальной датой клиента (Узбекистан, UTC+5, без перехода).
// Можно переопределить переменной окружения TZ при деплое в другом регионе.
if (!process.env.TZ) process.env.TZ = 'Asia/Tashkent';
