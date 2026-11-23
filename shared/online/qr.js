// QR codes rendered locally as SVG. The invite link holds the secret, so it is
// never sent to an external QR service.
import qrcode from '../vendor/qrcode.mjs';

/** Boolean module grid (true = dark) for `text`, without quiet zone. */
export function qrModules(text, ecc = 'M') {
  const qr = qrcode(0, ecc);
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const grid = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    grid.push(row);
  }
  return grid;
}

/** SVG markup for `text`, one path for all dark modules, 4-module quiet zone. */
export function qrSvg(text, { ecc = 'M', quiet = 4, dark = '#111111', light = '#ffffff', label = 'QR code' } = {}) {
  const grid = qrModules(text, ecc);
  const size = grid.length + quiet * 2;
  let d = '';
  grid.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }),
  );
  const safeLabel = String(label).replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${safeLabel}">` +
    `<rect width="${size}" height="${size}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/></svg>`
  );
}
