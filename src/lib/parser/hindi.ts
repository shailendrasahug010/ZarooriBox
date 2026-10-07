// Basic Hindi and Hinglish for the offline Quick Add parser. With AI switched on,
// Claude understands any Indian language; without it, this rewrites the common date,
// repeat, amount, lending and shopping phrases into the English the rule parser knows,
// and leaves the rest (the title) exactly as the person wrote it.

/** Not a letter or mark: a word boundary that also works for Devanagari. */
const B = '(?<![\\p{L}\\p{M}\\p{N}])';
const E = '(?![\\p{L}\\p{M}\\p{N}])';
const w = (re: string) => new RegExp(`${B}(?:${re})${E}`, 'giu');

const DIGITS = '०१२३४५६७८९';

const MONTHS: [string, string][] = [
  ['जनवरी', 'January'],
  ['फ़रवरी|फरवरी', 'February'],
  ['मार्च', 'March'],
  ['अप्रैल|अप्रेल', 'April'],
  ['मई', 'May'],
  ['जून', 'June'],
  ['जुलाई', 'July'],
  ['अगस्त', 'August'],
  ['सितंबर|सितम्बर', 'September'],
  ['अक्टूबर|अक्तूबर', 'October'],
  ['नवंबर|नवम्बर', 'November'],
  ['दिसंबर|दिसम्बर', 'December'],
];

const UNIT = '(दिन|din|हफ़्ते|हफ्ते|हफ़्ता|हफ्ता|सप्ताह|hafte|hafta|महीने|महीना|माह|mahine|mahina|साल|वर्ष|saal|sal)';

function unitWord(u: string): 'day' | 'week' | 'month' | 'year' {
  if (/^(दिन|din)$/i.test(u)) return 'day';
  if (/^(हफ़्ते|हफ्ते|हफ़्ता|हफ्ता|सप्ताह|hafte|hafta)$/i.test(u)) return 'week';
  if (/^(महीने|महीना|माह|mahine|mahina)$/i.test(u)) return 'month';
  return 'year';
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH = /\b(aaj|kal|parso|parson|agle|har|tareekh|tarikh|ko|se|diye|diya|liye|liya|lena|lana|kharidna|hai|rupaye|rupay|baje|subah|shaam|sham|raat|dopahar|mujhe|yaad)\b/i;

/** True when the sentence looks like Hindi or Hinglish. */
export function looksHindi(text: string): boolean {
  return DEVANAGARI.test(text) || HINGLISH.test(text);
}

/** Rewrites Hindi/Hinglish date, repeat, amount, lending and shopping phrases into English. */
export function normalizeHindi(raw: string): string {
  if (!looksHindi(raw)) return raw;
  let s = raw.replace(/[०-९]/g, (d) => String(DIGITS.indexOf(d)));

  // Shopping: "दूध और ब्रेड खरीदने हैं", "doodh aur bread lena hai"
  const shop = /^(.+?)\s+(?:खरीदना|खरीदने|खरीदनी|ख़रीदना|ख़रीदने|लाना|लाने|लेना|लेने|kharidna|kharidne|lana|lane|lena|lene)\s*(?:है|हैं|hai|hain)?\s*[।.!]?$/iu.exec(s);
  if (shop && !/\d/.test(shop[1])) return `buy ${shop[1].replace(w('और|aur'), ' and ').replace(/\s+/g, ' ')}`;

  // Lending: "राहुल को 500 दिए", "Rahul ko 500 diye", "अमित से सीढ़ी ली"
  s = s.replace(/^(.+?)\s+(?:को|ko)\s+(.+?)\s+(?:उधार\s+)?(?:दिए|दिये|दिया|दी|दे\s+दिए|diye|diya|di)\s*(?:हैं|है|hai|hain)?\s*[।.!]?$/iu, (_, who: string, what: string) => `lent ${what} to ${who}`);
  s = s.replace(/^(.+?)\s+(?:से|se)\s+(.+?)\s+(?:उधार\s+)?(?:लिए|लिये|लिया|ली|liye|liya|li)\s*(?:हैं|है|hai|hain)?\s*[।.!]?$/iu, (_, who: string, what: string) => `borrowed ${what} from ${who}`);

  // Times: "सुबह 8 बजे", "shaam 6:30 baje", "8 baje raat", "9 बजे"
  const PART = '(सुबह|subah|subeh|सवेरे|savere|दोपहर|dopahar|dopehar|शाम|shaam|sham|रात|raat|rat)';
  const CLOCK = '(\\d{1,2})(?:[:.](\\d{2}))?';
  const BAJE = '(?:\\s*(?:बजे|baje|bje))';
  const at = (part: string | undefined, h: string, m?: string) => {
    let hour = Number(h);
    const p = (part ?? '').toLowerCase();
    if (/^(दोपहर|dopahar|dopehar|शाम|shaam|sham)$/.test(p) && hour < 12) hour += 12;
    if (/^(रात|raat|rat)$/.test(p) && hour >= 5 && hour < 12) hour += 12;
    if (/^(रात|raat|rat)$/.test(p) && hour === 12) hour = 0;
    // Without a part of the day, "4 बजे" means the afternoon, "9 बजे" the morning.
    if (!p && hour >= 1 && hour <= 6) hour += 12;
    return ` at ${String(hour).padStart(2, '0')}:${m ?? '00'} `;
  };
  s = s.replace(new RegExp(`${B}${PART}(?:\\s+(?:को|ko|में|mein))?\\s+${CLOCK}${BAJE}?${E}`, 'giu'), (_, part: string, h: string, m?: string) => at(part, h, m));
  s = s.replace(new RegExp(`${B}${CLOCK}${BAJE}\\s+${PART}${E}`, 'giu'), (_, h: string, m: string | undefined, part: string) => at(part, h, m));
  s = s.replace(new RegExp(`${B}${CLOCK}${BAJE}${E}`, 'giu'), (_, h: string, m?: string) => at(undefined, h, m));

  // Repeats: "हर 6 महीने", "हर महीने", "har saal", "रोज़"
  s = s.replace(new RegExp(`${B}(?:हर|har)\\s+(\\d+)\\s+${UNIT}${E}`, 'giu'), (_, n: string, u: string) => ` every ${n} ${unitWord(u)}s `);
  s = s.replace(new RegExp(`${B}(?:हर|har)\\s+${UNIT}${E}`, 'giu'), (_, u: string) => ` every ${unitWord(u)} `);
  s = s.replace(w('रोज़|रोज|रोजाना|रोज़ाना|roz|rozana'), ' every day ');

  // "5 तारीख को" -> "on the 5th"
  s = s.replace(new RegExp(`${B}(\\d{1,2})\\s*(?:तारीख़|तारीख|tareekh|tarikh)(?:\\s+(?:को|ko))?${E}`, 'giu'), (_, d: string) => ` on the ${ordinal(Number(d))} `);
  // "5 दिन में / बाद", "2 mahine baad"
  s = s.replace(new RegExp(`${B}(\\d+)\\s+${UNIT}\\s+(?:में|बाद|mein|baad)${E}`, 'giu'), (_, n: string, u: string) => ` in ${n} ${unitWord(u)}s `);
  // "अगले हफ़्ते / महीने / साल"
  s = s.replace(new RegExp(`${B}(?:अगले|अगला|agle|agla)\\s+${UNIT}${E}`, 'giu'), (_, u: string) => ` next ${unitWord(u)} `);

  for (const [hi, en] of MONTHS) s = s.replace(w(hi), en);
  s = s.replace(w('परसों|परसो|parso|parson'), ' day after tomorrow ');
  s = s.replace(w('आज|aaj'), ' today ');
  // In a reminder, "कल" means tomorrow.
  s = s.replace(w('कल|kal'), ' tomorrow ');

  // "500 रुपये" -> "₹500"
  s = s.replace(new RegExp(`${B}(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:रुपये|रुपए|रुपया|रु\\.?|rupaye|rupay|rupees?|rs\\.?)${E}`, 'giu'), (_, n: string) => ` ₹${n} `);

  // Little words left at the ends: "मुझे …", "… लेना है", "… को"
  s = s.replace(/^\s*(?:मुझे|mujhe|muje|humein|hume|हमें|याद\s+(?:दिलाना|दिला\s+देना)|yaad\s+(?:dilana|dila\s+dena))\s+/iu, '');
  for (let i = 0; i < 3; i++) {
    s = s.replace(
      /\s+(?:को|ko|है|हैं|hai|hain|करना|भरना|देना|लेना|लेनी|खाना|खानी|पीना|lena|leni|khana|khani|peena|karna|bharna|dena|yaad\s+dilana)(?=\s*[।.!]?\s*$|\s+(?:on|every|today|tomorrow|next|in|at)\b)/giu,
      ' ',
    );
  }
  s = s
    .replace(/[।]/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const HINTS: [RegExp, string][] = [
  [w('बिजली|bijli'), 'electricity bill'],
  [w('बिल'), 'bill'],
  [w('बीमा|इंश्योरेंस|इन्श्योरेंस|bima'), 'insurance'],
  [w('पासपोर्ट'), 'passport'],
  [w('लाइसेंस|लाइसेन्स'), 'licence'],
  [w('जन्मदिन|बर्थडे|janamdin'), 'birthday'],
  [w('सालगिरह'), 'anniversary'],
  [w('किराया|kiraya'), 'rent'],
  [w('गाड़ी|गाडी|कार|gaadi|gadi'), 'car'],
  [w('बाइक|स्कूटर'), 'bike'],
  [w('सर्विस'), 'service'],
  [w('डॉक्टर|डाक्टर'), 'doctor'],
  [w('रिचार्ज'), 'recharge'],
  [w('फ़िल्टर|फिल्टर'), 'filter'],
  [w('गैस|सिलेंडर'), 'gas cylinder'],
  [w('पानी'), 'water bill'],
  [w('वारंटी'), 'warranty'],
];

/** English keywords for a Hindi sentence, used only to pick its category. */
export function hindiHints(text: string): string {
  if (!DEVANAGARI.test(text) && !HINGLISH.test(text)) return '';
  return HINTS.filter(([re]) => {
    re.lastIndex = 0;
    return re.test(text);
  })
    .map(([, en]) => en)
    .join(' ');
}
