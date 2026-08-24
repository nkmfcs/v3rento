/* Транслитерация и генерация slug — единый источник (используется в auth и admin). */
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',
  й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',
  у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',
  ь:'',э:'e',ю:'yu',я:'ya',
};
export function translitChar(c) {
  return TRANSLIT[c.toLowerCase()] ?? '';
}
export function makeSlug(text, maxLen = 40) {
  return text.trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, '')
    .replace(/[а-яё]/gi, (c) => translitChar(c))
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, maxLen) || `shop-${Date.now()}`;
}
export async function makeUniqueSlug(base, checkExists) {
  let slug = base;
  let i = 1;
  while (await checkExists(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}
