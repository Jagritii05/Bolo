import { settingsStore } from '../../main/settings-store.js';
import { logger } from '../../main/logger.js';
import { getLanguageConfig } from '../gnani/config.js';

function buildExplanationMessages({ screenText, question, language, history = [] }) {
  const langConf = getLanguageConfig(language);
  const systemPrompt = `You are a friendly, screen-explaining voice assistant for Indian users. You are given the text extracted from the user's screen and their question.
Your goal is to explain what is happening on screen in simple, everyday language that anyone can easily understand.

CRITICAL LANGUAGE INSTRUCTIONS:
- Speak in natural, everyday conversational ${langConf.name}.
- ${langConf.styleGuide || 'Use natural conversational language mixed with common English UI terms.'}
- Real people in India NEVER speak formal, bookish, or dictionary language. Do NOT use archaic pure words (e.g., in Hindi do NOT say "त्रुटि", "प्रपत्र", "सत्यापित", "पृष्ठ"; in Tamil do NOT say "படிவம்", "பிழை"; in Bengali do NOT say "ত্রুটি").
- Always use the familiar English words for technology and UI elements (such as "screen", "button", "box", "form", "error", "click", "submit", "upload", "link", "card", "check", "field").
- When referring to labels, fields, or buttons from the screen, refer to them by their actual English names as displayed on screen so the user knows exactly where to look.
- Answer in at most 3 to 4 short, simple sentences.
- Do NOT invent information not present on the screen.
- Do NOT use markdown, bold asterisks, bullet points, numbers lists, or emojis because your response will be read aloud by Text-to-Speech.
- Write numbers as words so they are spoken naturally.`;

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Screen text context provided to assistant
  const screenContextPrompt = `Extracted text currently visible on user's screen:\n\"\"\"\n${screenText || 'No screen text available.'}\n\"\"\"`;
  messages.push({ role: 'user', content: screenContextPrompt });
  messages.push({ role: 'assistant', content: `Understood. I have reviewed the screen text and will explain it in ${langConf.name} according to the user's questions.` });

  // Include up to last 3 conversation turns from history
  const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
  for (const turn of recentHistory) {
    if (turn.role && turn.content) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  // Current question
  messages.push({ role: 'user', content: question || langConf.defaultQuestion });

  return { messages, systemPrompt, langConf };
}

function buildReplyMessages({ screenText, userPrompt, language }) {
  const langConf = getLanguageConfig(language);
  const systemPrompt = `You are a smart email and message drafting assistant.
The user is viewing an incoming email, message thread, or document on their active screen.
You are given the text visible on their screen, along with the user's spoken instructions in ${langConf.name} (e.g. "Iska reply likh do ki main kal subah 10 baje mil sakta hoon", or "Reply saying thank you and accept the invite").

TASK:
Draft the exact response to reply to the visible email or message based on the user's instructions.

RULES:
1. Output ONLY the drafted reply text to be pasted directly into the compose or reply box.
2. Do NOT output any intro or meta-text (like "Here is your draft:" or "Subject:").
3. Unless the user explicitly asked for the reply in Hindi/Tamil/Bengali, default to drafting the reply in clean, polite, professional English.
4. If it is an email thread, include an appropriate greeting (e.g. "Hi [Name],") and professional sign-off (e.g. "Best regards,").
5. If it is a short chat message (Slack/WhatsApp), keep the reply concise and conversational.
6. Make sure the reply specifically references details from the message on screen if relevant.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Text visible on user's active screen:\n\"\"\"\n${screenText || 'No screen text visible.'}\n\"\"\"\n\nUser's spoken instructions for reply:\n\"\"\"\n${userPrompt}\n\"\"\"` },
  ];

  return { messages, systemPrompt, langConf };
}

const CANDIDATE_GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

const CANDIDATE_GEMINI_LLM_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
];

// Groq API with fallback
async function callGroq({ messages, timeoutMs = 15000 }) {
  const apiKey = settingsStore.get('groqApiKey') || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY missing. Set it in .env or Settings.');
  }

  const preferredModel = settingsStore.get('groqModel') || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const models = [...new Set([preferredModel, ...CANDIDATE_GROQ_MODELS])];

  let lastErr = null;
  for (const model of models) {
    try {
      logger.info(`[LLM] Calling Groq model ${model}...`);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 450,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || res.statusText;
        lastErr = new Error(`Groq HTTP ${res.status} (${model}): ${msg}`);
        logger.warn(`[LLM] Groq model ${model} failed (${msg}). Trying next...`);
        continue;
      }

      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content || '').trim();
      if (!text) continue;

      logger.info(`[LLM] Groq response received from ${model}.`);
      return {
        text,
        provider: 'groq',
        model,
      };
    } catch (err) {
      lastErr = err;
      logger.warn(`[LLM] Groq model ${model} error (${err.message}). Trying next...`);
      continue;
    }
  }

  throw lastErr || new Error('All Groq candidate models failed.');
}

// Gemini fallback
async function callGemini({ messages, systemPrompt, timeoutMs = 15000 }) {
  const apiKey = settingsStore.get('geminiApiKey') || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing. Set it in .env or Settings.');
  }

  const preferredModel = settingsStore.get('geminiModel') || 'gemini-3-flash-preview';
  const candidateModels = [...new Set([preferredModel, ...CANDIDATE_GEMINI_LLM_MODELS])];

  // Convert messages to Gemini format
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body = {
    contents,
    system_instruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 450,
    },
  };

  let lastErr = null;
  for (const m of candidateModels) {
    try {
      logger.info(`[LLM] Calling Gemini model ${m}...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErr = new Error(`Gemini LLM error (${m}): ${msg}`);
        logger.warn(`[LLM] Gemini model ${m} failed (${msg}). Trying next...`);
        continue;
      }

      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (text) {
        logger.info(`[LLM] Gemini response received from ${m}.`);
        return {
          text,
          provider: 'gemini',
          model: m,
        };
      }
    } catch (err) {
      lastErr = err;
      logger.warn(`[LLM] Gemini model ${m} error (${err.message}). Trying next...`);
      continue;
    }
  }

  throw lastErr || new Error('All Gemini candidate models failed.');
}

// Routes requests to configured LLM (Groq / Gemini) with fallback
async function dispatchLlm({ messages, systemPrompt }) {
  const configuredProvider = (settingsStore.get('llmProvider') || process.env.LLM_PROVIDER || 'groq').toLowerCase();

  if (configuredProvider === 'gemini') {
    try {
      return await callGemini({ messages, systemPrompt });
    } catch (gemErr) {
      logger.warn(`[LLM] Gemini unavailable (${gemErr.message}). Falling back to Groq...`);
      return await callGroq({ messages });
    }
  }

  try {
    return await callGroq({ messages });
  } catch (groqErr) {
    logger.warn(`[LLM] Groq unavailable (${groqErr.message}). Falling back to Gemini...`);
    try {
      return await callGemini({ messages, systemPrompt });
    } catch (gemErr) {
      logger.error(`[LLM] All LLM providers failed: ${gemErr.message}`);
      throw new Error(`LLM call failed: ${gemErr.message}`);
    }
  }
}

export async function explain({ screenText, question, language = 'hi-IN', history = [] }) {
  const { messages, systemPrompt, langConf } = buildExplanationMessages({ screenText, question, language, history });
  logger.info(`[LLM] Explaining screen in ${langConf.name}...`);
  return await dispatchLlm({ messages, systemPrompt });
}

export async function draftReply({ screenText, userPrompt, language = 'hi-IN' }) {
  const { messages, systemPrompt, langConf } = buildReplyMessages({ screenText, userPrompt, language });
  logger.info(`[LLM] Drafting screen-aware reply from prompt: "${userPrompt}"...`);
  return await dispatchLlm({ messages, systemPrompt });
}

// Spoken punctuation cleanup and sentence casing
export function formatDictation(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  let cleaned = rawText
    .replace(/\b(full stop|period|purna viram)\b/gi, '.')
    .replace(/\b(comma|alpaviram)\b/gi, ',')
    .replace(/\b(question mark|prashna chinh)\b/gi, '?')
    .replace(/\b(exclamation mark|exclamation point)\b/gi, '!')
    .replace(/\b(new line|next line|line change)\b/gi, '\n');

  // Collapse horizontal spaces (preserving newlines)
  cleaned = cleaned.replace(/[^\S\r\n]+/g, ' ');

  // Remove spaces before punctuation
  cleaned = cleaned.replace(/\s+([,.!?])/g, '$1');

  // Ensure a space after punctuation if immediately followed by an alphanumeric / Indic char
  cleaned = cleaned.replace(/([,.!?])([a-zA-Z\u0900-\u0D7F])/g, '$1 $2');

  // Clean spaces around newlines
  cleaned = cleaned.replace(/ *\n */g, '\n').trim();

  // Capitalize first character of sentences (start of text, after . ? ! or newline)
  cleaned = cleaned.replace(/(^\s*|[.?!]\s+|\n\s*)([a-z])/g, (_match, prefix, char) => {
    return prefix + char.toUpperCase();
  });

  return cleaned;
}

// Transliterate Indic script to Latin alphabet without translating meaning
export async function transliterateToEnglishScript(rawText) {
  const formatted = formatDictation(rawText);
  if (!formatted) return '';

  // Check if text contains Indic Unicode characters (Devanagari, Tamil, Bengali, etc.)
  const hasIndic = /[\u0900-\u0D7F]/.test(formatted);
  if (!hasIndic) {
    return formatted;
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `You are an Indic-to-English script phonetic transliterator.
Your ONLY job is to write the given text using the English alphabet (Latin / Roman letters).

CRITICAL RULES:
1. Do NOT translate the words or change their meaning. Keep the exact words as spoken, just write them in English letters (e.g., Hinglish / Tanglish / Benglish).
   - "मेरा नाम राहुल है" -> "Mera naam Rahul hai" (NOT "My name is Rahul")
   - "நன்றி வணக்கம்" -> "Nandri vanakkam" (NOT "Thank you and greetings")
   - "কেমন আছেন" -> "Kemon aachen" (NOT "How are you")
2. Output ONLY the transliterated text in English alphabet. Do NOT add quotes, markdown, greetings, or explanations.
3. Preserve punctuation and proper capitalization.`,
      },
      {
        role: 'user',
        content: formatted,
      },
    ];

    const result = await dispatchLlm({
      messages,
      systemPrompt: 'You are an Indic-to-English script phonetic transliterator. Output only the Romanized text.',
    });

    return formatDictation(result.text.replace(/^["']|["']$/g, '').trim());
  } catch (err) {
    logger.warn(`[Dictation] Transliteration failed (${err.message}). Returning original.`);
    return formatted;
  }
}
