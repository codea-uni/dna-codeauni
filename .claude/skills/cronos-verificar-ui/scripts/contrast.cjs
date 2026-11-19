// Contraste WCAG entre dos colores hex. Uso: node contrast.cjs "#a3b5c0" "#111b22"  → 8.25
const lum = (h) => {
  const c = h.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const [a, b] = process.argv.slice(2);
const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
const r = (x + 0.05) / (y + 0.05);
console.log(`${r.toFixed(2)}:1  texto ${r >= 4.5 ? 'OK' : 'NO'} (4,5) · borde de control ${r >= 3 ? 'OK' : 'NO'} (3)`);
