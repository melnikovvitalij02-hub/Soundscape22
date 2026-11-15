const CYRILLIC_ROOTS = /хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|бляд|блят|сука|суки|сучк|сукин|пидор|пидар|пидр|мудак|гандон|гондон|залуп|долбоеб|долбаеб|уеба|ебуч|манда|шлюх|дрочи|дрочк|шалав/;
const LATIN_ROOTS = /huy|hui|pizd|blyat|blya|suka|eban|ebat|pidor|pidar|mudak|dolboeb|dolbaeb|gandon|gondon/;
const LATIN_LOOKALIKES: Record<string, string> = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', k: 'к', x: 'х', y: 'у', h: 'н', m: 'м', t: 'т' };

const collapseRepeats = (s: string) => s.replace(/(.)\1+/g, '$1');

function matchesRoots(s: string): boolean {
  const cyrillic = collapseRepeats(
    s.replace(/[aeopckxyhmt]/g, (letter) => LATIN_LOOKALIKES[letter]).replace(/[^а-я]/g, '')
  );
  const latin = collapseRepeats(s.replace(/[^a-z]/g, ''));
  return CYRILLIC_ROOTS.test(cyrillic) || LATIN_ROOTS.test(latin);
}

function digitVariants(text: string): string[] {
  const base = text.toLowerCase().replace(/ё/g, 'е');
  const substitutes: Record<string, string> = {
    '1': 'и', '3': 'е', '4': 'а', '5': 'с', '7': 'т', '8': 'в', '@': 'а', '$': 'с',
  };
  const build = (zero: string, six: string) =>
    base.replace(/[0134578@$6]/g, (c) => (c === '0' ? zero : c === '6' ? six : substitutes[c]));
  return [build('о', 'б'), build('у', 'б'), build('о', 'b')];
}

export function isProfaneText(text: string): boolean {
  return digitVariants(text).some(matchesRoots);
}

export function maskProfanity(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => (isProfaneText(word) ? '***' : word))
    .join(' ');
}
