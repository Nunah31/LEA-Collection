// Build a WhatsApp deep link with a prefilled message for a customer
export function buildWhatsAppLink(item) {
  const phone = normalizePhone(item.customer_phone);
  const text = buildMessage(item);
  const encoded = encodeURIComponent(text);
  if (phone) return `https://wa.me/${phone}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

export function buildMailtoLink(item) {
  const subject = encodeURIComponent(`תזכורת לתשלום${item.invoice_number ? ' - חשבונית ' + item.invoice_number : ''}`);
  const body = encodeURIComponent(buildMessage(item));
  const to = item.customer_email || '';
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function buildMessage(item) {
  const name = item.customer_name || 'לקוח/ה יקר/ה';
  const amount = item.balance_due || item.debt_amount;
  let msg = `שלום ${name},\nתזכורת ידידותית בנוגע לחוב הפתוח`;
  if (item.invoice_number) msg += ` (חשבונית מס' ${item.invoice_number})`;
  if (amount) msg += `.\nהיתרה לתשלום עומדת על ${amount} ₪`;
  msg += '.\nנשמח להסדרת התשלום בהקדם. תודה!';
  return msg;
}

// Normalize Israeli phone numbers for wa.me (international format without +/0)
function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9+]/g, '');
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('0')) return '972' + p.slice(1);
  if (p.startsWith('972')) return p;
  return p;
}

export function formatDate(d) {
  if (!d) return '';
  return d;
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr <= today;
}
