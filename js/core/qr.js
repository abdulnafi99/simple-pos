// TAPJERR.io — QR code helpers (uses vendored qrcode-generator, MIT)
import qrcode from '../vendor/qrcode.mjs';

export function qrSVG(text, { size = 220, margin = 2, dark = '#0b1250', light = '#ffffff' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export function qrDataURL(text, opts) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSVG(text, opts));
}

/** Base URL for customer links (Settings → Base URL, else current origin). */
export function baseUrl(settings) {
  const b = (settings?.baseUrl || '').trim().replace(/\/+$/, '');
  if (b) return /^https?:\/\//.test(b) ? b : `https://${b}`;
  return location.origin + location.pathname.replace(/\/[^/]*$/, '');
}

export function tableUrl(settings, table) {
  return `${baseUrl(settings)}/order/table/${encodeURIComponent(table.number)}`;
}

export function takeawayUrl(settings) {
  return `${baseUrl(settings)}/order/takeaway`;
}
