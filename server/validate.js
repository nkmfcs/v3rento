/* Валидация пользовательского ввода на входе (defense-in-depth).
 * XSS на выводе уже закрыт экранированием в шаблонах — это ВТОРОЙ слой: не пускаем
 * заведомо мусорные/инъекционные значения в БД. Все проверки «мягкие»: пустое/не
 * присланное значение пропускаем (поля необязательные / COALESCE в апдейтах),
 * ругаемся только на реально переданный некорректный ввод.
 *
 * Каждая функция возвращает строку-ошибку (для 400) либо null, если всё ок. */

const ANGLE_QUOTE = /[<>"']/; // символы, ломающие HTML/атрибуты — запрещаем во «входном» тексте

/** gradient: 1–3 hex-цвета вида #RRGGBB через запятую. UI шлёт ровно "#RRGGBB,#RRGGBB". */
export function checkGradient(g) {
  if (g == null || g === '') return null;
  if (typeof g !== 'string') return 'gradient: неверный формат';
  return /^#[0-9a-fA-F]{6}(\s*,\s*#[0-9a-fA-F]{6}){0,2}$/.test(g)
    ? null
    : 'gradient: только 1–3 цвета вида #RRGGBB через запятую';
}

/** avatar_text: короткие инициалы (UI шлёт 1–2 символа). Ограничиваем длину и режем скобки/кавычки. */
export function checkAvatarText(s) {
  if (s == null || s === '') return null;
  if (typeof s !== 'string') return 'avatar_text: неверный формат';
  if ([...s].length > 4) return 'avatar_text: не более 4 символов';
  if (ANGLE_QUOTE.test(s)) return 'avatar_text: недопустимые символы (< > " \')';
  return null;
}

/** Свободный текст (напр. type костюма — слаг): ограничение длины + без < > " '. */
export function checkFreeText(s, { field = 'значение', max = 40 } = {}) {
  if (s == null || s === '') return null;
  if (typeof s !== 'string') return `${field}: неверный формат`;
  if ([...s].length > max) return `${field}: не более ${max} символов`;
  if (ANGLE_QUOTE.test(s)) return `${field}: недопустимые символы (< > " ')`;
  return null;
}

/** Значение из фиксированного набора (напр. type клиента: person/org). */
export function checkEnum(s, allowed, field = 'значение') {
  if (s == null || s === '') return null;
  return allowed.includes(s) ? null : `${field}: допустимо ${allowed.join(' / ')}`;
}
