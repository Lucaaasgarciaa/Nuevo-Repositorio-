/**
 * Normaliza un número de teléfono a solo dígitos con código de país.
 * Acepta "+34 600 11 22 33", "0034600112233" o "600112233" (se le añade
 * el prefijo por defecto). Devuelve null si no parece un número.
 */
export function normalizePhone(input, defaultCountryCode) {
  const raw = input.trim();
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    // ya trae prefijo
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length <= 9) {
    digits = defaultCountryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const phoneToJid = (digits) => `${digits}@s.whatsapp.net`;
