/**
 * Luhn algorithm (Mod 10) validation for credit/debit card numbers.
 * Card numbers are typically 13 to 19 digits.
 */
export function isValidLuhn(rawNumber) {
  if (!rawNumber || typeof rawNumber !== 'string') return false;
  const digits = rawNumber.replace(/[\s-]/g, '');

  // Card numbers must be between 13 and 19 digits and purely numeric
  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}
