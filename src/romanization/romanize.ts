import { musicBackendBase } from '../network/backend';

export type LanguageCode =
  | 'en'
  | 'ml'
  | 'ta'
  | 'hi'
  | 'bn'
  | 'te'
  | 'kn'
  | 'gu'
  | 'pa'
  | 'or'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'ru'
  | 'ar'
  | 'he'
  | 'th'
  | 'unknown';

/**
 * Script types ported from haroldalan/spotify-karaoke (`lib/lyrics/scriptDetector.ts`).
 */
export type ScriptType =
  | 'japanese'
  | 'chinese'
  | 'korean'
  | 'cyrillic'
  | 'devanagari'
  | 'gujarati'
  | 'gurmukhi'
  | 'telugu'
  | 'kannada'
  | 'odia'
  | 'tamil'
  | 'malayalam'
  | 'bengali'
  | 'arabic'
  | 'hebrew'
  | 'thai'
  | 'latin'
  | 'other';

export const GOOGLE_ROMANIZE_SCRIPTS = new Set<ScriptType>([
  'malayalam',
  'tamil',
  'devanagari',
  'telugu',
  'kannada',
  'bengali',
  'gujarati',
  'gurmukhi',
  'odia',
  'japanese',
  'korean',
  'chinese',
  'cyrillic',
  'arabic',
  'hebrew',
  'thai',
  'other',
]);

export const SCRIPT_NATIVE_LANG: Partial<Record<ScriptType, string>> = {
  korean: 'ko',
  japanese: 'ja',
  thai: 'th',
  telugu: 'te',
  kannada: 'kn',
  gujarati: 'gu',
  gurmukhi: 'pa',
  odia: 'or',
  tamil: 'ta',
  devanagari: 'hi',
  cyrillic: 'ru',
};

export const SCRIPT_TO_LANG: Partial<Record<ScriptType, string>> = {
  ...SCRIPT_NATIVE_LANG,
  malayalam: 'ml',
  bengali: 'bn',
  arabic: 'ar',
  hebrew: 'iw',
  chinese: 'zh-CN',
};

const NON_LATIN_SCRIPT_RE =
  /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0900-\u0D7F\u0B80-\u0BFF\u0600-\u06FF\u0590-\u05FF\u0E00-\u0E7F]/;

export function detectScript(lines: string[]): ScriptType {
  const text = lines.join('');
  if (/[\u3040-\u30FF]/.test(text)) return 'japanese';
  const scores: [ScriptType, number][] = [
    ['chinese', (text.match(/[\u4E00-\u9FFF]/g) ?? []).length],
    ['korean', (text.match(/[\uAC00-\uD7AF]/g) ?? []).length],
    ['cyrillic', (text.match(/[\u0400-\u04FF]/g) ?? []).length],
    ['devanagari', (text.match(/[\u0900-\u097F]/g) ?? []).length],
    ['gujarati', (text.match(/[\u0A80-\u0AFF]/g) ?? []).length],
    ['gurmukhi', (text.match(/[\u0A00-\u0A7F]/g) ?? []).length],
    ['telugu', (text.match(/[\u0C00-\u0C7F]/g) ?? []).length],
    ['kannada', (text.match(/[\u0C80-\u0CFF]/g) ?? []).length],
    ['odia', (text.match(/[\u0B00-\u0B7F]/g) ?? []).length],
    ['tamil', (text.match(/[\u0B80-\u0BFF]/g) ?? []).length],
    ['malayalam', (text.match(/[\u0D00-\u0D7F]/g) ?? []).length],
    ['bengali', (text.match(/[\u0980-\u09FF]/g) ?? []).length],
    ['arabic', (text.match(/[\u0600-\u06FF]/g) ?? []).length],
    ['hebrew', (text.match(/[\u0590-\u05FF]/g) ?? []).length],
    ['thai', (text.match(/[\u0E00-\u0E7F]/g) ?? []).length],
  ];
  const dominant = scores.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
  if (dominant[1] > 0) return dominant[0];
  return /\p{L}/u.test(text) ? 'latin' : 'other';
}

export function isLatinScript(lines: string | readonly string[]): boolean {
  const text = typeof lines === 'string' ? lines : lines.join('');
  return !NON_LATIN_SCRIPT_RE.test(text) && /\p{L}/u.test(text);
}

/**
 * Ported from haroldalan/spotify-karaoke (`lib/lyrics/casePreserver.ts`).
 */
export function preserveCasing(original: string, romanized: string): string {
  if (!original || !romanized) return romanized;
  const latinWords = [...original.matchAll(/[a-zA-Z]+/g)].map(m => m[0]);
  if (latinWords.length === 0) return romanized;
  let wordIndex = 0;
  return romanized.replace(/[a-zA-Z]+/g, match => {
    if (
      wordIndex < latinWords.length &&
      match.toLowerCase() === latinWords[wordIndex].toLowerCase()
    ) {
      return latinWords[wordIndex++];
    }
    return match;
  });
}

/**
 * Strips diacritics (macrons, dots, tone marks) from text to produce a clean
 * "texting style" ASCII Latin output (`haroldalan/spotify-karaoke`).
 */
export function stripDiacritics(text: string): string {
  if (!text) return text;
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Ported from haroldalan/spotify-karaoke (`lib/translate/chunkUtils.ts`).
 */
export function chunkByCharCount(
  lines: string[],
  maxChars = 500
): { chunks: string[][]; wasTruncated: boolean } {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const line of lines) {
    const nextLen = current.length === 0 ? line.length : currentLen + 1 + line.length;
    if (current.length > 0 && nextLen > maxChars) {
      chunks.push(current);
      current = [line];
      currentLen = line.length;
    } else {
      current.push(line);
      currentLen = nextLen;
    }
  }
  if (current.length > 0) chunks.push(current);
  return { chunks, wasTruncated: false };
}

export function detectLanguageCode(text: string): LanguageCode {
  const script = detectScript([text]);
  switch (script) {
    case 'malayalam':
      return 'ml';
    case 'tamil':
      return 'ta';
    case 'devanagari':
      return 'hi';
    case 'bengali':
      return 'bn';
    case 'telugu':
      return 'te';
    case 'kannada':
      return 'kn';
    case 'gujarati':
      return 'gu';
    case 'gurmukhi':
      return 'pa';
    case 'odia':
      return 'or';
    case 'japanese':
      return 'ja';
    case 'korean':
      return 'ko';
    case 'chinese':
      return 'zh';
    case 'cyrillic':
      return 'ru';
    case 'arabic':
      return 'ar';
    case 'hebrew':
      return 'he';
    case 'thai':
      return 'th';
    case 'latin':
      return 'en';
    default:
      return 'unknown';
  }
}

export function languageName(code: LanguageCode): string {
  return (
    {
      en: 'English / Latin',
      ml: 'Malayalam',
      ta: 'Tamil',
      hi: 'Hindi / Devanagari',
      bn: 'Bengali',
      te: 'Telugu',
      kn: 'Kannada',
      gu: 'Gujarati',
      pa: 'Punjabi (Gurmukhi)',
      or: 'Odia',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      ru: 'Cyrillic',
      ar: 'Arabic',
      he: 'Hebrew',
      th: 'Thai',
      unknown: 'Auto',
    }[code] || 'Auto'
  );
}

export function detectLanguage(text: string): string {
  return languageName(detectLanguageCode(text));
}

export type RomanizationLanguageCode = Exclude<LanguageCode, 'en' | 'unknown'>;

export interface SupportedRomanizationLanguage {
  code: RomanizationLanguageCode;
  script: ScriptType;
  name: string;
}

export const SUPPORTED_ROMANIZATION_LANGUAGES: readonly SupportedRomanizationLanguage[] = [
  { code: 'ml', script: 'malayalam', name: 'Malayalam' },
  { code: 'ta', script: 'tamil', name: 'Tamil' },
  { code: 'hi', script: 'devanagari', name: 'Hindi / Devanagari' },
  { code: 'te', script: 'telugu', name: 'Telugu' },
  { code: 'kn', script: 'kannada', name: 'Kannada' },
  { code: 'bn', script: 'bengali', name: 'Bengali' },
  { code: 'gu', script: 'gujarati', name: 'Gujarati' },
  { code: 'pa', script: 'gurmukhi', name: 'Punjabi (Gurmukhi)' },
  { code: 'or', script: 'odia', name: 'Odia' },
  { code: 'ja', script: 'japanese', name: 'Japanese' },
  { code: 'ko', script: 'korean', name: 'Korean' },
  { code: 'zh', script: 'chinese', name: 'Chinese' },
  { code: 'ru', script: 'cyrillic', name: 'Russian / Cyrillic' },
  { code: 'ar', script: 'arabic', name: 'Arabic' },
  { code: 'he', script: 'hebrew', name: 'Hebrew' },
  { code: 'th', script: 'thai', name: 'Thai' },
] as const;

export const ALL_ROMANIZATION_LANGUAGE_CODES: readonly Exclude<LanguageCode, 'en' | 'unknown'>[] =
  SUPPORTED_ROMANIZATION_LANGUAGES.map(l => l.code);

let romanizationMasterEnabled = true;
let enabledRomanizationLangSet = new Set<string>(ALL_ROMANIZATION_LANGUAGE_CODES);

try {
  if (typeof localStorage !== 'undefined') {
    const savedMaster = localStorage.getItem('lyricflow.romanizationEnabled');
    if (savedMaster === 'false') romanizationMasterEnabled = false;
    const savedLangs = localStorage.getItem('lyricflow.enabledRomanizationLanguages');
    if (savedLangs) {
      const parsed = JSON.parse(savedLangs) as unknown;
      if (Array.isArray(parsed)) {
        enabledRomanizationLangSet = new Set(parsed.map(x => String(x)));
      }
    }
  }
} catch {
  // Ignore localStorage access errors
}

export function getRomanizationMasterEnabled(): boolean {
  return romanizationMasterEnabled;
}

export function setRomanizationMasterEnabled(enabled: boolean): void {
  romanizationMasterEnabled = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lyricflow.romanizationEnabled', String(romanizationMasterEnabled));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getEnabledRomanizationLanguages(): RomanizationLanguageCode[] {
  return [...enabledRomanizationLangSet] as RomanizationLanguageCode[];
}

export function setEnabledRomanizationLanguages(codes: readonly string[]): void {
  enabledRomanizationLangSet = new Set(codes);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        'lyricflow.enabledRomanizationLanguages',
        JSON.stringify([...enabledRomanizationLangSet])
      );
    }
  } catch {
    // Ignore storage errors
  }
}

export function isLanguageAllowedForRomanization(
  textOrCode: string,
  overrideAllowedCodes?: readonly string[]
): boolean {
  if (!romanizationMasterEnabled && !overrideAllowedCodes) return false;
  const code =
    textOrCode.length <= 3 && ALL_ROMANIZATION_LANGUAGE_CODES.includes(textOrCode as Exclude<LanguageCode, 'en' | 'unknown'>)
      ? (textOrCode as LanguageCode)
      : detectLanguageCode(textOrCode);
  if (code === 'en' || code === 'unknown') return false;
  if (overrideAllowedCodes) {
    return overrideAllowedCodes.includes(code);
  }
  return enabledRomanizationLangSet.has(code);
}

// In-memory cache populated by spotify-karaoke async Google dt=rm romanizer & local romanizer
const romanizeLineCache = new Map<string, string>();

export function cacheRomanizedLine(original: string, romanized: string): void {
  const key = original.trim();
  if (!key || !romanized.trim()) return;
  if (romanizeLineCache.size > 4000) {
    const firstKey = romanizeLineCache.keys().next().value;
    if (firstKey !== undefined) romanizeLineCache.delete(firstKey);
  }
  romanizeLineCache.set(key, romanized.trim());
}

export function getCachedRomanizedLine(original: string): string | undefined {
  return romanizeLineCache.get(original.trim());
}

// ============================================================================
// Context-Aware Synchronous Local Romanizer (Offline & Instant Fallback)
// ============================================================================

const indicOffsets: [number, number][] = [
  [0x0900, 0x097f], // Devanagari
  [0x0980, 0x09ff], // Bengali
  [0x0a00, 0x0a7f], // Gurmukhi
  [0x0a80, 0x0aff], // Gujarati
  [0x0b00, 0x0b7f], // Odia
  [0x0b80, 0x0bff], // Tamil
  [0x0c00, 0x0c7f], // Telugu
  [0x0c80, 0x0cff], // Kannada
  [0x0d00, 0x0d7f], // Malayalam
];

const indicVowels: Record<number, string> = {
  0x05: 'a',
  0x06: 'aa',
  0x07: 'i',
  0x08: 'ee',
  0x09: 'u',
  0x0a: 'oo',
  0x0b: 'ri',
  0x0c: 'li',
  0x0d: 'e',
  0x0e: 'e',
  0x0f: 'ee',
  0x10: 'ai',
  0x11: 'o',
  0x12: 'o',
  0x13: 'oo',
  0x14: 'au',
  0x60: 'ri',
  0x61: 'li',
};

const indicMatras: Record<number, string> = {
  0x3e: 'aa',
  0x3f: 'i',
  0x40: 'ee',
  0x41: 'u',
  0x42: 'oo',
  0x43: 'ri',
  0x44: 'rii',
  0x45: 'e',
  0x46: 'e',
  0x47: 'ee',
  0x48: 'ai',
  0x49: 'o',
  0x4a: 'o',
  0x4b: 'oo',
  0x4c: 'au',
  0x56: 'ai',
  0x57: 'au',
  0x62: 'i',
  0x63: 'ee',
};

const indicSigns: Record<number, string> = {
  0x01: 'n',
  0x02: 'n',
  0x03: 'h',
  0x3c: '',
  0x3d: '',
  0x50: 'om',
  0x70: 'n',
  0x71: '',
};

const indicConsonants: Record<number, string> = {
  0x15: 'k',
  0x16: 'kh',
  0x17: 'g',
  0x18: 'gh',
  0x19: 'ng',
  0x1a: 'ch',
  0x1b: 'chh',
  0x1c: 'j',
  0x1d: 'jh',
  0x1e: 'nj',
  0x1f: 't',
  0x20: 'th',
  0x21: 'd',
  0x22: 'dh',
  0x23: 'n',
  0x24: 'th',
  0x25: 'thh',
  0x26: 'd',
  0x27: 'dh',
  0x28: 'n',
  0x29: 'n',
  0x2a: 'p',
  0x2b: 'ph',
  0x2c: 'b',
  0x2d: 'bh',
  0x2e: 'm',
  0x2f: 'y',
  0x30: 'r',
  0x31: 'r',
  0x32: 'l',
  0x33: 'l',
  0x34: 'zh',
  0x35: 'v',
  0x36: 'sh',
  0x37: 'sh',
  0x38: 's',
  0x39: 'h',
  0x3a: 'tt',
  // Devanagari nuqta precomposed
  0x58: 'q',
  0x59: 'kh',
  0x5a: 'gh',
  0x5b: 'z',
  0x5c: 'r',
  0x5d: 'rh',
  0x5e: 'f',
  0x5f: 'y',
};

const malayalamChillus: Record<number, string> = {
  0x0d7a: 'n',
  0x0d7b: 'n',
  0x0d7c: 'r',
  0x0d7d: 'l',
  0x0d7e: 'l',
  0x0d7f: 'k',
};

function offsetOfIndic(code: number): [number, number] | null {
  for (const [start, end] of indicOffsets) {
    if (code >= start && code <= end) return [start, code - start];
  }
  return null;
}

function isIndicWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return offsetOfIndic(code) !== null;
}

/**
 * Context-aware Malayalam word romanizer handling chillu letters, samvruthokaram (word-final u),
 * nasal+stop assimilation (ങ്ക->nka, ഞ്ച->nja, ണ്ട->nda, ന്ത->ntha, മ്പ->mpa, ന്റ->nta), and geminate റ്റ->tta.
 */
function romanizeMalayalamWord(word: string): string {
  // Pre-normalize common Malayalam conjuncts for natural phonetic reading
  const normalized = word
    .replace(/ന്റെ/g, 'nte')
    .replace(/ന്റ/g, 'nta')
    .replace(/റ്റ/g, 'tt')
    .replace(/ങ്ക/g, 'nk')
    .replace(/ഞ്ച/g, 'nj')
    .replace(/ണ്ട/g, 'nd')
    .replace(/ന്ത/g, 'nth')
    .replace(/മ്പ/g, 'mp')
    .replace(/ങ്ങ/g, 'ng')
    .replace(/ഞ്ഞ/g, 'nj');

  const chars = [...normalized];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    if (malayalamChillus[code]) {
      out += malayalamChillus[code];
      continue;
    }
    const off = offsetOfIndic(code);
    if (!off || off[0] !== 0x0d00) {
      out += ch;
      continue;
    }
    const rel = off[1];
    const nextCode = chars[i + 1]?.charCodeAt(0) ?? -1;
    const nextRel = nextCode >= 0x0d00 && nextCode <= 0x0d7f ? nextCode - 0x0d00 : -1;

    if (indicVowels[rel]) {
      out += indicVowels[rel];
      continue;
    }
    if (indicMatras[rel]) {
      // Check for samvruthokaram: ു (0x41) followed by ് (0x4d) at end of word
      if (rel === 0x41 && nextRel === 0x4d) {
        out += 'u';
        i++;
        continue;
      }
      out += indicMatras[rel];
      continue;
    }
    if (rel === 0x02) {
      // Anusvara ം in Malayalam is always 'm'
      out += 'm';
      continue;
    }
    if (indicSigns[rel] !== undefined) {
      out += indicSigns[rel];
      continue;
    }
    if (rel === 0x4d) {
      // Virama / Chandrakkala at the end of a Malayalam word produces half-u ('u')
      if (i === chars.length - 1) {
        out += 'u';
      }
      continue;
    }
    if (indicConsonants[rel]) {
      const base = indicConsonants[rel];
      if (nextRel === 0x4d) {
        // Consonant + virama
        if (i + 1 === chars.length - 1) {
          out += base + 'u';
        } else {
          out += base;
        }
        i++;
      } else if (nextRel >= 0 && indicMatras[nextRel]) {
        if (nextRel === 0x41 && chars[i + 2]?.charCodeAt(0) === 0x0d4d) {
          out += base + 'u';
          i += 2;
        } else {
          out += base + indicMatras[nextRel];
          i++;
        }
      } else {
        out += base + 'a';
      }
      continue;
    }
  }
  return out;
}

/**
 * Context-aware Tamil word romanizer modeled on `tamil-romanizer`:
 * Handles contextual intervocalic and post-nasal voicing (k/g, ch/s/j, t/d, th/dh, p/b, tr/ndr).
 */
function romanizeTamilWord(word: string): string {
  const normalized = word
    .replace(/ன்ற/g, 'ndr')
    .replace(/ற்ற/g, 'tr')
    .replace(/ங்க/g, 'ng')
    .replace(/ஞ்ச/g, 'nj')
    .replace(/ண்ட/g, 'nd')
    .replace(/ந்த/g, 'ndh')
    .replace(/ம்ப/g, 'mb')
    .replace(/க்க/g, 'kk')
    .replace(/ச்ச/g, 'ch')
    .replace(/ட்ட/g, 'tt')
    .replace(/த்த/g, 'tth')
    .replace(/ப்ப/g, 'pp');

  const chars = [...normalized];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    const off = offsetOfIndic(code);
    if (!off || off[0] !== 0x0b80) {
      out += ch;
      continue;
    }
    const rel = off[1];
    const nextCode = chars[i + 1]?.charCodeAt(0) ?? -1;
    const nextRel = nextCode >= 0x0b80 && nextCode <= 0x0bff ? nextCode - 0x0b80 : -1;
    const isInitial = i === 0;

    if (indicVowels[rel]) {
      out += indicVowels[rel];
      continue;
    }
    if (indicMatras[rel]) {
      out += indicMatras[rel];
      continue;
    }
    if (rel === 0x02) {
      out += 'm';
      continue;
    }
    if (rel === 0x4d) continue;

    if (indicConsonants[rel]) {
      let base = indicConsonants[rel];
      // Contextual Tamil voicing rules
      if (rel === 0x15) base = isInitial ? 'k' : 'g'; // க
      else if (rel === 0x1a) base = 's'; // ச
      else if (rel === 0x1f) base = isInitial ? 't' : 'd'; // ட
      else if (rel === 0x24) base = isInitial ? 'th' : 'dh'; // த
      else if (rel === 0x2a) base = isInitial ? 'p' : 'b'; // ப

      if (nextRel === 0x4d) {
        // Pulli suppresses inherent vowel; க் at end or before consonant is 'k', த் is 'th', ப் is 'p'
        if (rel === 0x15) base = 'k';
        else if (rel === 0x1a) base = 'ch';
        else if (rel === 0x1f) base = 't';
        else if (rel === 0x24) base = 'th';
        else if (rel === 0x2a) base = 'p';
        out += base;
        i++;
      } else if (nextRel >= 0 && indicMatras[nextRel]) {
        out += base + indicMatras[nextRel];
        i++;
      } else {
        out += base + 'a';
      }
      continue;
    }
  }
  return out;
}

/**
 * Context-aware Devanagari / Hindi word romanizer with word-final schwa ('a') deletion
 * and nuqta support so words like "तुम ही हो अब" become "tum ee ho ab" / "tum hi ho ab".
 */
function romanizeDevanagariWord(word: string): string {
  const chars = [...word];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    const off = offsetOfIndic(code);
    if (!off) {
      out += ch;
      continue;
    }
    const [block, rel] = off;
    let cursor = i;
    let nextCode = chars[cursor + 1]?.charCodeAt(0) ?? -1;
    let nextRel =
      nextCode >= block && nextCode <= block + 0x7f ? nextCode - block : -1;

    if (indicVowels[rel]) {
      out += indicVowels[rel];
      continue;
    }
    if (indicMatras[rel]) {
      out += indicMatras[rel];
      continue;
    }
    if (indicSigns[rel] !== undefined) {
      out += indicSigns[rel];
      continue;
    }
    if (rel === 0x4d) continue;

    if (indicConsonants[rel]) {
      let base = indicConsonants[rel];
      // Check for combining nuqta (0x3c)
      if (nextRel === 0x3c) {
        if (rel === 0x15) base = 'q';
        else if (rel === 0x16) base = 'kh';
        else if (rel === 0x17) base = 'gh';
        else if (rel === 0x1c) base = 'z';
        else if (rel === 0x21) base = 'r';
        else if (rel === 0x22) base = 'rh';
        else if (rel === 0x2b) base = 'f';
        cursor++;
        nextCode = chars[cursor + 1]?.charCodeAt(0) ?? -1;
        nextRel =
          nextCode >= block && nextCode <= block + 0x7f ? nextCode - block : -1;
      }

      if (nextRel === 0x4d) {
        out += base;
        i = cursor + 1;
      } else if (nextRel >= 0 && indicMatras[nextRel]) {
        // Short/long i/u in Hindi lyric style: keep natural
        const matra =
          block === 0x0900 && nextRel === 0x40 && cursor + 1 === chars.length - 1
            ? 'i'
            : indicMatras[nextRel];
        out += base + matra;
        i = cursor + 1;
      } else {
        // Inherent vowel 'a': delete word-final schwa on multi-character words in Hindi/Punjabi/Gujarati/Bengali
        const isWordFinal = cursor === chars.length - 1;
        const isSchwaDeletingScript =
          block === 0x0900 || block === 0x0a00 || block === 0x0a80 || block === 0x0980;
        const prevWasVirama =
          i > 0 && (chars[i - 1].charCodeAt(0) - block === 0x4d);
        if (isWordFinal && isSchwaDeletingScript && i > 0 && !prevWasVirama && rel !== 0x2f) {
          out += base;
        } else {
          out += base + 'a';
        }
        i = cursor;
      }
      continue;
    }
  }
  return out;
}

const kanaPairs: Record<string, string> = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
};

const kanaSingle: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ー: '',
};

const hira = (s: string) =>
  s.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));

const hangulL = [
  'g',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h',
];
const hangulV = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
];
const hangulT = [
  '',
  'k',
  'k',
  'ks',
  'n',
  'nj',
  'nh',
  't',
  'l',
  'lk',
  'lm',
  'lb',
  'ls',
  'lt',
  'lp',
  'lh',
  'm',
  'p',
  'ps',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
];

const cyrillic: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
};

const arabic: Record<string, string> = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'aa',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  و: 'w',
  ي: 'y',
  ى: 'a',
  ة: 'a',
  ء: '',
};

function romanizeSingleSpanSync(text: string): string {
  if (!text.trim() || !NON_LATIN_SCRIPT_RE.test(text)) return text;
  const cached = getCachedRomanizedLine(text);
  if (cached) return cached;

  // Tokenize Indic words so Malayalam, Tamil, and Devanagari word-level rules apply cleanly
  const tokenized = text.replace(
    /[\u0900-\u0D7F]+/g,
    word => {
      const code = word.charCodeAt(0);
      if (code >= 0x0d00 && code <= 0x0d7f) return romanizeMalayalamWord(word);
      if (code >= 0x0b80 && code <= 0x0bff) return romanizeTamilWord(word);
      return romanizeDevanagariWord(word);
    }
  );

  const normalized = hira(tokenized);
  const chars = [...normalized];
  let out = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    const pair = ch + (chars[i + 1] || '');

    if (kanaPairs[pair]) {
      out += kanaPairs[pair];
      i++;
      continue;
    }
    if (ch === 'っ' && chars[i + 1]) {
      const next = kanaPairs[chars[i + 1] + (chars[i + 2] || '')] || kanaSingle[chars[i + 1]] || '';
      if (next) out += next[0];
      continue;
    }
    if (kanaSingle[ch] !== undefined) {
      out += kanaSingle[ch];
      continue;
    }
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const l = Math.floor(s / 588);
      const v = Math.floor((s % 588) / 28);
      const t = s % 28;
      // Hangul liaison: if batchim is 'ㄹ' (t===8) followed by vowel-initial syllable (l===11), render 'r'
      let tail = hangulT[t];
      const nextCode = chars[i + 1]?.charCodeAt(0) ?? -1;
      if (t === 8 && nextCode >= 0xac00 && nextCode <= 0xd7a3) {
        const nextL = Math.floor((nextCode - 0xac00) / 588);
        if (nextL === 11) tail = 'r';
      }
      out += hangulL[l] + hangulV[v] + tail;
      continue;
    }
    const lower = ch.toLowerCase();
    if (cyrillic[lower] !== undefined) {
      const mapped = cyrillic[lower];
      out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      continue;
    }
    if (arabic[ch] !== undefined) {
      out += arabic[ch];
      continue;
    }
    if (!isIndicWordChar(ch)) {
      out += ch;
    }
  }

  return stripDiacritics(preserveCasing(text, out)).replace(/\s{2,}/g, ' ').trim();
}

function romanizeLocallySync(text: string, allowedCodes?: readonly string[]): string {
  if (!text || !NON_LATIN_SCRIPT_RE.test(text)) return text;
  if (!isLanguageAllowedForRomanization(text, allowedCodes)) return text;
  return text
    .split(/\r?\n/)
    .map(line => {
      if (!NON_LATIN_SCRIPT_RE.test(line)) return line;
      if (!isLanguageAllowedForRomanization(line, allowedCodes)) return line;
      const leadingTagsMatch = line.match(/^((?:\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+)(.*)$/);
      if (leadingTagsMatch) {
        const [, tags, body] = leadingTagsMatch;
        return `${tags}${romanizeSingleSpanSync(body)}`;
      }
      return romanizeSingleSpanSync(line);
    })
    .join('\n');
}

export interface RomanizeResult {
  text: string;
  language: string;
  changed: boolean;
}

export function romanizeText(text: string, allowedCodes?: readonly string[]): RomanizeResult {
  const safe = typeof text === 'string' ? text : '';
  const language = detectLanguage(safe);
  const out = romanizeLocallySync(safe, allowedCodes);
  return {
    text: out,
    language,
    changed: out !== safe,
  };
}

// ============================================================================
// Asynchronous Spotify-Karaoke Romanization Pipeline (Google dt=rm + Cache)
// ============================================================================

async function googleRomanizeChunkDirect(
  text: string,
  sourceLang = 'auto',
  signal?: AbortSignal
): Promise<string | null> {
  const endpoints = [
    'https://translate.google.com/translate_a/single?client=at',
    'https://translate.googleapis.com/translate_a/single?client=gtx',
  ];
  for (const base of endpoints) {
    try {
      const params = new URLSearchParams({ sl: sourceLang, tl: 'en', q: text });
      params.append('dt', 't');
      params.append('dt', 'rm');
      const res = await fetch(`${base}&${params.toString()}`, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown[];
      const allSegments = ((data?.[0] as unknown[]) ?? []) as unknown[][];
      if (allSegments.length > 0) {
        const lastBlock = allSegments[allSegments.length - 1];
        if (Array.isArray(lastBlock) && !lastBlock[0] && !lastBlock[1]) {
          const firstString = lastBlock.find(val => typeof val === 'string');
          if (typeof firstString === 'string' && firstString.trim()) {
            return firstString;
          }
        }
      }
    } catch {
      // Try next endpoint or backend proxy
    }
  }
  return null;
}

/**
 * Ported from `haroldalan/spotify-karaoke` (`lib/lyrics/lyricsProcessor.ts` & `lib/translateClient.ts`).
 * Romanizes an array of lyric lines using Google's phonetic transliteration (`dt=rm`) via backend or direct API,
 * preserves Latin casing, strips diacritics for clean readability, and caches every line.
 */
export async function romanizeLinesAsync(
  lines: string[],
  signal?: AbortSignal,
  allowedCodes?: readonly string[]
): Promise<string[]> {
  if (!lines.length || isLatinScript(lines)) {
    return [...lines];
  }
  const joinedText = lines.join('\n');
  if (!isLanguageAllowedForRomanization(joinedText, allowedCodes)) {
    return [...lines];
  }

  // Check if all non-empty non-Latin lines are already cached
  const uncachedIndices: number[] = [];
  const uncachedLines: string[] = [];
  const output = lines.map((line, idx) => {
    if (!line.trim() || isLatinScript([line]) || !isLanguageAllowedForRomanization(line, allowedCodes)) {
      return line;
    }
    const hit = getCachedRomanizedLine(line);
    if (hit) return hit;
    uncachedIndices.push(idx);
    uncachedLines.push(line);
    return romanizeLocallySync(line, allowedCodes);
  });

  if (uncachedLines.length === 0) {
    return output;
  }

  const script = detectScript(uncachedLines);
  const sourceLang = SCRIPT_TO_LANG[script] || 'auto';

  // 1. Try backend `/music/romanize` endpoint first (avoids browser CORS and shares server cache)
  try {
    const res = await fetch(`${musicBackendBase()}/romanize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: uncachedLines, sourceLang }),
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { romanized?: string[] };
      if (Array.isArray(data?.romanized) && data.romanized.length === uncachedLines.length) {
        uncachedIndices.forEach((origIdx, i) => {
          const rawRom = data.romanized![i] || output[origIdx];
          const cleaned = stripDiacritics(preserveCasing(lines[origIdx], rawRom)).trim();
          if (cleaned) {
            output[origIdx] = cleaned;
            cacheRomanizedLine(lines[origIdx], cleaned);
          }
        });
        return output;
      }
    }
  } catch {
    // Fall back to direct chunked Google dt=rm calls
  }

  // 2. Direct chunked Google dt=rm calls (`spotify-karaoke` `googleProcess`)
  const { chunks } = chunkByCharCount(uncachedLines, 500);
  const romanizedFlat: string[] = [];
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    if (signal?.aborted) break;
    const chunk = chunks[cIdx];
    const joined = chunk.join('\n');
    const romText = await googleRomanizeChunkDirect(joined, sourceLang, signal);
    if (romText && romText.trim()) {
      const split = romText.trim().split('\n');
      for (let i = 0; i < chunk.length; i++) {
        romanizedFlat.push(split[i]?.trim() || romanizeLocallySync(chunk[i], allowedCodes));
      }
    } else {
      for (const l of chunk) {
        romanizedFlat.push(romanizeLocallySync(l, allowedCodes));
      }
    }
  }

  uncachedIndices.forEach((origIdx, i) => {
    const candidate = romanizedFlat[i];
    if (candidate) {
      const cleaned = stripDiacritics(preserveCasing(lines[origIdx], candidate)).trim();
      output[origIdx] = cleaned;
      cacheRomanizedLine(lines[origIdx], cleaned);
    }
  });

  return output;
}

/**
 * Romanizes an entire LRC text (preserving line and word timestamps) asynchronously
 * using the `spotify-karaoke` pipeline.
 */
export async function romanizeLrcTextAsync(
  lrcText: string,
  signal?: AbortSignal,
  allowedCodes?: readonly string[]
): Promise<string> {
  if (!lrcText.trim() || isLatinScript([lrcText])) return '';
  if (!isLanguageAllowedForRomanization(lrcText, allowedCodes)) return '';
  const rawLines = lrcText.split(/\r?\n/);
  const plainLines = rawLines.map(line =>
    line
      .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '')
      .replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '')
      .replace(/^\s*v\d+\s*:\s*/i, '')
      .trim()
  );
  if (isLatinScript(plainLines)) return '';
  const romanizedPlain = await romanizeLinesAsync(plainLines, signal, allowedCodes);
  return rawLines
    .map((rawLine, idx) => {
      const timeTags = (rawLine.match(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g) || []).join('');
      if (!timeTags) return rawLine;
      return `${timeTags}${romanizedPlain[idx] || plainLines[idx]}`;
    })
    .join('\n');
}

export function hasDistinctRomanized(original?: string, romanized?: string): boolean {
  if (!original || !romanized) return false;
  const clean = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return Boolean(romanized.trim()) && clean(original) !== clean(romanized);
}
