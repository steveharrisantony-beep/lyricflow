export const identityWords = (value: string) => value.normalize('NFKC')
 .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2')
 .replace(/(\p{L})\$(?=\p{L})/gu, '$1s')
 .toLowerCase()
 // Keep vowel signs and other marks in Malayalam, Tamil and Hindi titles.
 .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
 .trim().split(/\s+/).filter(Boolean);
