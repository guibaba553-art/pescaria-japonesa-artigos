/**
 * Validates credit card data using Luhn algorithm + brand detection.
 */

/**
 * Luhn algorithm checksum.
 */
export function luhnCheck(number: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Detect card brand from number prefix.
 */
export function detectBrand(number: string): string | null {
  const patterns: Record<string, RegExp> = {
    visa: /^4/,
    mastercard: /^(5[1-5]|2[2-7])/,
    elo: /^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/,
    amex: /^3[47]/,
    discover: /^(6011|65|64[4-9])/,
    hipercard: /^(606282|3841)/,
    diners: /^(30[0-5]|36|38)/,
  };
  for (const [brand, pattern] of Object.entries(patterns)) {
    if (pattern.test(number)) return brand;
  }
  return null;
}

/**
 * Returns a human-readable brand label in Portuguese.
 */
export function getBrandLabel(brand: string | null): string {
  const labels: Record<string, string> = {
    visa: 'VISA',
    mastercard: 'MASTERCARD',
    elo: 'ELO',
    amex: 'AMEX',
    discover: 'DISCOVER',
    hipercard: 'HIPERCARD',
    diners: 'DINERS',
  };
  return brand ? labels[brand] ?? brand.toUpperCase() : 'Desconhecido';
}

/**
 * Validate card number using Luhn + brand detection.
 * Returns `{ valid, brand }` — brand is null when invalid or undetected.
 */
export function validateCardNumber(number: string): { valid: boolean; brand: string | null } {
  const cleaned = number.replace(/\D/g, '');
  // Regra de negócio: Asaas (gateway de pagamento) só aceita cartões com 13-16 dígitos.
  // Cartões Discover/Hipercard (17-19 dígitos) não são suportados.
  if (cleaned.length < 13 || cleaned.length > 16) return { valid: false, brand: null };
  const valid = luhnCheck(cleaned);
  const brand = valid ? detectBrand(cleaned) : null;
  return { valid, brand };
}

/**
 * Validate expiry month/year (future date check).
 * Accepts month as 1-12, year as 2 or 4 digits.
 */
export function validateExpiry(month: string, year: string): boolean {
  const cleanMonth = month.replace(/\D/g, '');
  const cleanYear = year.replace(/\D/g, '');

  const m = parseInt(cleanMonth, 10);
  let y = parseInt(cleanYear, 10);

  if (cleanYear.length === 2) y += 2000;

  // Basic range checks
  if (cleanMonth.length < 1 || cleanMonth.length > 2) return false;
  if (cleanYear.length < 2 || cleanYear.length > 4) return false;
  if (Number.isNaN(m) || Number.isNaN(y)) return false;
  if (m < 1 || m > 12) return false;
  if (y < 2000 || y > 2100) return false;

  // Future-or-current date check
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  if (y < currentYear) return false;
  if (y === currentYear && m < currentMonth) return false;

  return true;
}

/**
 * Validate CVV: 3-4 digits.
 */
export function validateCVV(cvv: string): boolean {
  return /^\d{3,4}$/.test(cvv);
}

/**
 * Validate holder name: minimum 3 characters.
 */
export function validateHolderName(name: string): boolean {
  return name.trim().length >= 3;
}
