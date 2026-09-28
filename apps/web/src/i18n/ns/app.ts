/**
 * Textos de la interfaz (G8, D-11): español (claves) e inglés. `satisfies` exige las mismas
 * claves en ambos idiomas: si falta o sobra una, no compila.
 */
export const es = {
  'common.cancel': 'Cancelar',
};

export const en = {
  'common.cancel': 'Cancel',
} satisfies Record<keyof typeof es, string>;
