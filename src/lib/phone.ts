export interface NormalizedPhone {
  valid: boolean;
  formatted: string;     // e.g. "+923332916423"
  display: string;       // e.g. "0333-2916423"
  digits: string;        // e.g. "923332916423"
  internalEmail: string; // e.g. "phone_923332916423@apnisawari.pk"
}

export function normalizePakistaniPhone(raw: string): NormalizedPhone {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, formatted: '', display: '', digits: '', internalEmail: '' };
  }

  // Remove all spaces, dashes, brackets
  let clean = raw.replace(/[^0-9+]/g, '');

  if (clean.startsWith('03')) {
    clean = '+92' + clean.slice(1);
  } else if (clean.startsWith('3') && clean.length === 10) {
    clean = '+92' + clean;
  } else if (clean.startsWith('92') && clean.length === 12) {
    clean = '+' + clean;
  }

  const digits = clean.replace(/[^0-9]/g, '');
  const valid = digits.startsWith('923') && digits.length === 12;

  // Format display string like "0333-2916423"
  let display = clean;
  if (valid) {
    const local = '0' + digits.slice(2);
    display = `${local.slice(0, 4)}-${local.slice(4)}`;
  }

  return {
    valid,
    formatted: valid ? `+${digits}` : clean,
    display,
    digits,
    internalEmail: valid ? `phone_${digits}@apnisawari.pk` : '',
  };
}

export function getWhatsAppUrl(phone: string, message?: string): string {
  const norm = normalizePakistaniPhone(phone);
  const target = norm.valid ? norm.digits : phone.replace(/[^0-9]/g, '');
  const encodedMsg = message ? encodeURIComponent(message) : '';
  return `https://wa.me/${target}${encodedMsg ? `?text=${encodedMsg}` : ''}`;
}

export function getCallUrl(phone: string): string {
  const norm = normalizePakistaniPhone(phone);
  return `tel:${norm.formatted || phone}`;
}
