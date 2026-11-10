import { GNANI_CONFIG } from './config.js';

// Number words dictionaries for Indic languages (Native Script)
const HINDI_UNITS = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
];
const HINDI_TENS = [
  '', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे',
];

// Number words dictionaries for Romanized Hinglish
const HINDI_UNITS_LATIN = [
  'shunya', 'ek', 'do', 'teen', 'chaar', 'paanch', 'chheh', 'saat', 'aath', 'nau',
  'das', 'gyarah', 'baarah', 'terah', 'chaudah', 'pandrah', 'solah', 'satrah', 'athaarah', 'unnees',
];
const HINDI_TENS_LATIN = [
  '', '', 'bees', 'tees', 'chalees', 'pachaas', 'saath', 'sattar', 'assi', 'nabbe',
];

const TAMIL_UNITS = [
  'சுழியம்', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது',
  'பத்து', 'பதினொன்று', 'பன்னிரண்டு', 'பதின்மூன்று', 'பதினான்கு', 'பதினைந்து', 'பதினாறு', 'பதினேழு', 'பதினெட்டு', 'பத்தொன்பது',
];
const TAMIL_TENS = [
  '', '', 'இருபது', 'முப்பது', 'நாற்பது', 'ஐம்பது', 'அறுபது', 'எழுபது', 'எண்பது', 'தொண்ணூறு',
];

const BENGALI_UNITS = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চোদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
];
const BENGALI_TENS = [
  '', '', 'বিশ', 'ত্রিশ', 'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই',
];

export function numberToWordsHindi(num) {
  if (num < 0) return 'माइनस ' + numberToWordsHindi(-num);
  if (num < 20) return HINDI_UNITS[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    return units === 0 ? HINDI_TENS[tens] : `${HINDI_TENS[tens]} ${HINDI_UNITS[units]}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    const hText = `${HINDI_UNITS[hundreds]} सौ`;
    return rest === 0 ? hText : `${hText} ${numberToWordsHindi(rest)}`;
  }
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    const tText = `${numberToWordsHindi(thousands)} हज़ार`;
    return rest === 0 ? tText : `${tText} ${numberToWordsHindi(rest)}`;
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    const rest = num % 100000;
    const lText = `${numberToWordsHindi(lakhs)} लाख`;
    return rest === 0 ? lText : `${lText} ${numberToWordsHindi(rest)}`;
  }
  const crores = Math.floor(num / 10000000);
  const rest = num % 10000000;
  const cText = `${numberToWordsHindi(crores)} करोड़`;
  return rest === 0 ? cText : `${cText} ${numberToWordsHindi(rest)}`;
}

export function numberToWordsHindiLatin(num) {
  if (num < 0) return 'minus ' + numberToWordsHindiLatin(-num);
  if (num < 20) return HINDI_UNITS_LATIN[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    return units === 0 ? HINDI_TENS_LATIN[tens] : `${HINDI_TENS_LATIN[tens]} ${HINDI_UNITS_LATIN[units]}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    const hText = `${HINDI_UNITS_LATIN[hundreds]} sau`;
    return rest === 0 ? hText : `${hText} ${numberToWordsHindiLatin(rest)}`;
  }
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    const tText = `${numberToWordsHindiLatin(thousands)} hazaar`;
    return rest === 0 ? tText : `${tText} ${numberToWordsHindiLatin(rest)}`;
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    const rest = num % 100000;
    const lText = `${numberToWordsHindiLatin(lakhs)} lakh`;
    return rest === 0 ? lText : `${lText} ${numberToWordsHindiLatin(rest)}`;
  }
  const crores = Math.floor(num / 10000000);
  const rest = num % 10000000;
  const cText = `${numberToWordsHindiLatin(crores)} crore`;
  return rest === 0 ? cText : `${cText} ${numberToWordsHindiLatin(rest)}`;
}

export function numberToWordsTamil(num) {
  if (num < 0) return 'மைனஸ் ' + numberToWordsTamil(-num);
  if (num < 20) return TAMIL_UNITS[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    return units === 0 ? TAMIL_TENS[tens] : `${TAMIL_TENS[tens]} ${TAMIL_UNITS[units]}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    const hText = hundreds === 1 ? 'நூறு' : `${TAMIL_UNITS[hundreds]} நூறு`;
    return rest === 0 ? hText : `${hText} ${numberToWordsTamil(rest)}`;
  }
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    const tText = thousands === 1 ? 'ஆயிரம்' : `${numberToWordsTamil(thousands)} ஆயிரம்`;
    return rest === 0 ? tText : `${tText} ${numberToWordsTamil(rest)}`;
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    const rest = num % 100000;
    const lText = `${numberToWordsTamil(lakhs)} லட்சம்`;
    return rest === 0 ? lText : `${lText} ${numberToWordsTamil(rest)}`;
  }
  const crores = Math.floor(num / 10000000);
  const rest = num % 10000000;
  const cText = `${numberToWordsTamil(crores)} கோடி`;
  return rest === 0 ? cText : `${cText} ${numberToWordsTamil(rest)}`;
}

export function numberToWordsBengali(num) {
  if (num < 0) return 'মাইনাস ' + numberToWordsBengali(-num);
  if (num < 20) return BENGALI_UNITS[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    return units === 0 ? BENGALI_TENS[tens] : `${BENGALI_TENS[tens]} ${BENGALI_UNITS[units]}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    const hText = hundreds === 1 ? 'একশত' : `${BENGALI_UNITS[hundreds]} শত`;
    return rest === 0 ? hText : `${hText} ${numberToWordsBengali(rest)}`;
  }
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    const tText = `${numberToWordsBengali(thousands)} হাজার`;
    return rest === 0 ? tText : `${tText} ${numberToWordsBengali(rest)}`;
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    const rest = num % 100000;
    const lText = `${numberToWordsBengali(lakhs)} লাখ`;
    return rest === 0 ? lText : `${lText} ${numberToWordsBengali(rest)}`;
  }
  const crores = Math.floor(num / 10000000);
  const rest = num % 10000000;
  const cText = `${numberToWordsBengali(crores)} কোটি`;
  return rest === 0 ? cText : `${cText} ${numberToWordsBengali(rest)}`;
}

export function convertNumber(numStr, lang, isLatinContext = false) {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;

  // Very long numbers like phone numbers or account numbers: read digit by digit
  if (numStr.length > 7) {
    const digits = numStr.split('');
    if (lang.startsWith('ta')) {
      return digits.map((d) => TAMIL_UNITS[parseInt(d, 10)] || d).join(' ');
    }
    if (lang.startsWith('bn')) {
      return digits.map((d) => BENGALI_UNITS[parseInt(d, 10)] || d).join(' ');
    }
    if (isLatinContext) {
      return digits.map((d) => HINDI_UNITS_LATIN[parseInt(d, 10)] || d).join(' ');
    }
    return digits.map((d) => HINDI_UNITS[parseInt(d, 10)] || d).join(' ');
  }

  if (lang.startsWith('ta')) return numberToWordsTamil(num);
  if (lang.startsWith('bn')) return numberToWordsBengali(num);
  if (isLatinContext) return numberToWordsHindiLatin(num);
  return numberToWordsHindi(num);
}

// Prepares text for TTS: expands numbers/currency to words and strips markdown
export function normalizeForSpeech(text, lang = 'hi-IN', maxLimit = GNANI_CONFIG.maxTtsCharLimit) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/[*#`_~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasDevanagari = /[\u0900-\u097F]/.test(cleaned);
  const hasTamil = /[\u0B80-\u0BFF]/.test(cleaned);
  const hasBengali = /[\u0980-\u09FF]/.test(cleaned);
  const isPureLatinHinglish = !hasDevanagari && !hasTamil && !hasBengali && lang.startsWith('hi');

  // Currencies
  cleaned = cleaned.replace(/(?:₹|Rs\.?|INR)\s*(\d+)/gi, (_match, num) => {
    const words = convertNumber(num, lang, isPureLatinHinglish);
    if (lang.startsWith('ta')) return `${words} ரூபாய்`;
    if (lang.startsWith('bn')) return `${words} টাকা`;
    if (isPureLatinHinglish) return `${words} rupaye`;
    return `${words} रुपये`;
  });

  // Percentages
  cleaned = cleaned.replace(/(\d+)\s*%/g, (_match, num) => {
    const words = convertNumber(num, lang, isPureLatinHinglish);
    if (lang.startsWith('ta')) return `${words} சதவீதம்`;
    if (lang.startsWith('bn')) return `${words} শতাংশ`;
    if (isPureLatinHinglish) return `${words} percent`;
    return `${words} प्रतिशत`;
  });

  // Standalone numbers
  cleaned = cleaned.replace(/\b\d+\b/g, (match) => {
    return convertNumber(match, lang, isPureLatinHinglish);
  });

  // Truncate at sentence boundary if too long for TTS
  if (cleaned.length > maxLimit) {
    const slice = cleaned.slice(0, maxLimit);
    // Find last sentence boundary in the slice: Devanagari danda '।', period, question mark, exclamation
    const lastBoundary = Math.max(
      slice.lastIndexOf('।'),
      slice.lastIndexOf('.'),
      slice.lastIndexOf('?'),
      slice.lastIndexOf('!')
    );

    if (lastBoundary >= 100) {
      cleaned = slice.slice(0, lastBoundary + 1).trim();
    } else {
      // Fallback: truncate at last word boundary
      const lastSpace = slice.lastIndexOf(' ');
      cleaned = (lastSpace > 50 ? slice.slice(0, lastSpace) : slice).trim() + '...';
    }
  }

  return cleaned;
}
