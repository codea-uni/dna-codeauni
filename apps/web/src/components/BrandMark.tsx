/**
 * Marca Cronos: tres curvas de nivel que forman un cerro (el banco y su voladura) y el nombre en
 * versalitas espaciadas. El trazo usa `currentColor`, así hereda el acento del contexto.
 */
export function BrandMark({ wordmark = true, size = 26 }: { wordmark?: boolean; size?: number }) {
  return (
    <span className="brand-mark" translate="no">
      <svg
        className="brand-glyph"
        width={(size * 48) / 28}
        height={size}
        viewBox="0 0 48 28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M2 25C11 25 14 5 24 3.5C34 5 37 25 46 25" />
        <path d="M8.5 25C14.5 25 17.5 11 24 9.8C30.5 11 33.5 25 39.5 25" opacity="0.75" />
        <path d="M15 25C18.5 25 20.5 16.5 24 15.8C27.5 16.5 29.5 25 33 25" opacity="0.5" />
      </svg>
      {wordmark ? (
        <span className="brand-word">Cronos</span>
      ) : (
        <span className="visually-hidden">Cronos</span>
      )}
    </span>
  );
}
