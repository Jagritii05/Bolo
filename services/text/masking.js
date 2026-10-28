import { isValidLuhn } from './luhn.js';
import { isValidAadhaar } from './verhoeff.js';

/**
 * Masks sensitive tokens in the given text according to options.
 * @param {string} text
 * @param {object} options
 * @returns {string}
 */
export function maskSensitiveData(text, options = {}) {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  const opt = {
    maskCard: options.maskCard !== false,
    maskAadhaar: options.maskAadhaar !== false,
    maskPan: options.maskPan !== false,
    maskApiKey: options.maskApiKey !== false,
    maskPassword: options.maskPassword !== false,
    maskEmail: Boolean(options.maskEmail),
    maskPhone: Boolean(options.maskPhone),
    ...options,
  };

  // 1. API Keys & Sensitive Tokens
  if (opt.maskApiKey) {
    // Bearer token
    result = result.replace(/Bearer\s+[A-Za-z0-9_\-\.]{20,}/g, 'Bearer [KEY-MASKED]');

    // Known provider key patterns (with optional whitespace around separators)
    result = result.replace(/\b(sk\s*-\s*[A-Za-z0-9_\-]{20,})\b/gi, '[KEY-MASKED]');
    result = result.replace(/\b(gsk\s*_\s*[A-Za-z0-9_\-]{20,})\b/gi, '[KEY-MASKED]');
    result = result.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[KEY-MASKED]');
    result = result.replace(/\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/g, '[KEY-MASKED]');
    result = result.replace(/\b(xox[baprs]-[0-9A-Za-z_\-]{10,})\b/g, '[KEY-MASKED]');
    result = result.replace(/\b([rs]k_(live|test)_[0-9a-zA-Z]{24,})\b/g, '[KEY-MASKED]');

    // Generic key assignments like api_key = "..." or "my api key is ..."
    result = result.replace(
      /(?<=\b(?:my\s+)?(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token)\s*(?:is\s+|[:=]\s*)["']?)[A-Za-z0-9_\-]{16,}(?=["']?)/gi,
      '[KEY-MASKED]'
    );
  }

  // 2. Indian PAN Card (5 letters + 4 digits + 1 letter)
  if (opt.maskPan) {
    result = result.replace(/\b([A-Za-z]{5}\d{4}[A-Za-z]{1})\b/g, '[PAN-MASKED]');
  }

  // 3. Indian Aadhaar Number (12 digits, doesn't start with 0 or 1, passes Verhoeff)
  // Formats: "XXXX XXXX XXXX", "XXXX-XXXX-XXXX", "XXXXXXXXXXXX"
  if (opt.maskAadhaar) {
    // Contextual match: "Aadhaar / Aadhar / Aadhaal card number is <10-15 digits>"
    result = result.replace(
      /(?<=\b(?:aadhaar|aadhar|aadhaal)(?:\s+(?:card|number|id|no\.?)){0,3}\s+(?:is\s+|:\s*|=+\s*))(\d[\d\s-]{9,15}\d)/gi,
      '[AADHAAR-MASKED]'
    );

    // Regex looks for 12 digits formatted with optional spaces or dashes
    const aadhaarRegex = /\b([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/g;
    result = result.replace(aadhaarRegex, (match) => {
      if (isValidAadhaar(match)) {
        return '[AADHAAR-MASKED]';
      }
      return match;
    });
  }

  // 4. Credit / Debit Card Numbers (13-19 digits, passes Luhn)
  // Formats: "XXXX XXXX XXXX XXXX", "XXXX-XXXX-XXXX-XXXX", or continuous
  if (opt.maskCard) {
    // Contextual match: "credit / debit card number is <12-19 digits>"
    result = result.replace(
      /(?<=\b(?:credit|debit)?\s*card\s+(?:number\s+)?(?:is\s+|:\s*|=+\s*))(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4})/gi,
      '[CARD-MASKED]'
    );

    // Matches 13 to 19 digits with optional spaces or dashes separating digit blocks
    const cardRegex = /\b(?:\d{4}[\s-]?){3,4}\d{1,4}\b|\b\d{13,19}\b/g;
    result = result.replace(cardRegex, (match) => {
      // Avoid matching if it was already masked or if it fails Luhn
      if (match.includes('[') || match.includes(']')) return match;
      if (isValidLuhn(match)) {
        return '[CARD-MASKED]';
      }
      return match;
    });
  }

  // 5. Passwords / Passcodes
  if (opt.maskPassword) {
    result = result.replace(
      /(?<=\b(?:my\s+)?(?:password|passcode)\s+(?:is\s+|:\s*|=+\s*))([^\n\r,.;]+?)(?=[,.;]|$)/gi,
      '[PASSWORD-MASKED]'
    );
  }

  // 6. Optional Email
  if (opt.maskEmail) {
    result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL-MASKED]');
  }

  // 6. Optional Phone
  if (opt.maskPhone) {
    // Standard international / Indian / US phone patterns
    result = result.replace(
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b[6-9]\d{9}\b/g,
      '[PHONE-MASKED]'
    );
  }

  return result;
}
