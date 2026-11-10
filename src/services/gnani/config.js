/**
 * Configuration and language mappings for Gnani AI Vachana Speech Services
 */

export const GNANI_CONFIG = {
  sttEndpoint: 'https://api.vachana.ai/stt/v3',
  ttsEndpoint: 'https://api.vachana.ai/api/v1/tts/inference',
  sttModel: 'prisma-v2.5', // Optional fallback or override
  ttsModel: 'timbre-v2.5',
  maxRecordingSec: 30,
  maxTtsCharLimit: 300,
  timeoutMs: {
    stt: 20000,
    tts: 20000,
    llm: 20000,
  },
  supportedLanguages: {
    'hi-IN': {
      code: 'hi-IN',
      name: 'Hinglish / Conversational Hindi',
      nativeName: 'Hinglish / हिन्दी',
      sttCode: 'hi-IN',
      // Gnani Timbre catalog uses 'hi-en' voice mapping for Hinglish; voice 'Poorvi' is designated for Hinglish
      ttsCode: 'hi-en',
      ttsVoice: 'Poorvi',
      defaultQuestion: 'Is screen par kya karna hai, explain karo',
      styleGuide: 'Use natural everyday conversational Hinglish (spoken Hindi naturally mixed with common English UI terms like screen, error, button, form, box, click, submit, upload, link). Absolutely NEVER use formal or archaic pure Hindi words like "त्रुटि", "प्रपत्र", "संलग्न", "सत्यापित". Talk like a helpful friend explaining a screen.',
      numberScale: 'indian',
    },
    'ta-IN': {
      code: 'ta-IN',
      name: 'Conversational Tamil / Tanglish',
      nativeName: 'Tamil / தமிழ்',
      sttCode: 'ta-IN',
      ttsCode: 'ta-IN',
      ttsVoice: 'Trisha',
      defaultQuestion: 'Intha screen-la enna pannanum nu explain pannunga',
      styleGuide: 'Use natural everyday spoken Tamil mixed with English UI words (Tanglish) like screen, error, submit button, form, box, click pannunga, upload pannunga. Avoid archaic literary Tamil words like "படிவம்", "பிழை", "விண்ணப்பம்". Speak naturally as people speak daily in Tamil Nadu.',
      numberScale: 'indian',
    },
    'bn-IN': {
      code: 'bn-IN',
      name: 'Conversational Bengali / Benglish',
      nativeName: 'Bengali / বাংলা',
      sttCode: 'bn-IN',
      ttsCode: 'bn-IN',
      ttsVoice: 'Kirra',
      defaultQuestion: 'Ei screen-e ki korte hobe ektu explain koro',
      styleGuide: 'Use natural everyday spoken Bengali mixed with English UI words (Benglish) like screen, error, submit button, form, box, click korun/koro, upload korte hobe. Avoid formal or bookish Sanskritized Bengali words like "ত্রুটি", "ফর্ম পূরণ". Speak naturally as people talk in real life.',
      numberScale: 'indian',
    },
  },
};

export function getLanguageConfig(langCode) {
  if (!langCode) return GNANI_CONFIG.supportedLanguages['hi-IN'];
  const normalized = langCode.toLowerCase();
  for (const [key, conf] of Object.entries(GNANI_CONFIG.supportedLanguages)) {
    if (key.toLowerCase() === normalized || conf.sttCode.toLowerCase() === normalized || conf.name.toLowerCase().includes(normalized)) {
      return conf;
    }
  }
  return GNANI_CONFIG.supportedLanguages['hi-IN'];
}
