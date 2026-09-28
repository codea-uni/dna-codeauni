/**
 * Textos de la interfaz (G8, D-11): español (claves) e inglés. `satisfies` exige las mismas
 * claves en ambos idiomas: si falta o sobra una, no compila.
 */
export const es = {
  'common.warning': 'Advertencia',
};

export const en = {
  'common.warning': 'Warning',
} satisfies Record<keyof typeof es, string>;
