import { crsLabel, LOCAL_MINE_CRS, searchCrsPresets, type CrsCountry } from '@cronos/core';
import { useState } from 'react';
import { t as translate, useT } from '../i18n';

/** Nombre del sistema para la interfaz: el de la zona, o «Coordenadas locales de mina». */
export function crsDisplayName(epsg: number): string {
  return epsg === LOCAL_MINE_CRS ? translate('crs.local') : crsLabel(epsg);
}

const COUNTRIES: CrsCountry[] = ['PE', 'CL', 'AR', 'local'];

/**
 * Elegir el sistema de coordenadas sin saber el código EPSG: buscador por país o zona, atajos de
 * Perú, Chile y Argentina, «Coordenadas locales de mina» y, si no está, el código a mano.
 */
export function CrsPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: number | undefined;
  onChange: (epsg: number) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [code, setCode] = useState(value !== undefined ? String(value) : '');
  const found = searchCrsPresets(query);
  return (
    <div className="crs-picker">
      <p className="hint">{t('crs.help')}</p>
      <label className="crs-search">
        <span>{t('crs.search')}</span>
        <input
          type="search"
          name="crs-search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={t('crs.searchPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </label>
      {found.length === 0 && <p className="muted">{t('crs.none')}</p>}
      {COUNTRIES.map((country) => {
        const presets = found.filter((p) => p.country === country);
        if (presets.length === 0) return null;
        return (
          <div
            key={country}
            className="crs-group"
            role="group"
            aria-label={t(`crs.country.${country}`)}
          >
            <strong>{t(`crs.country.${country}`)}</strong>
            <div className="crs-options">
              {presets.map((p) => (
                <button
                  key={p.epsg}
                  type="button"
                  className={value === p.epsg ? 'active' : ''}
                  aria-pressed={value === p.epsg}
                  title={`EPSG ${String(p.epsg)}`}
                  onClick={() => {
                    setCode(String(p.epsg));
                    onChange(p.epsg);
                  }}
                >
                  {p.country === 'local' ? t('crs.local') : p.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <label className="crs-code">
        <span>{t('crs.other')}</span>
        <input
          type="number"
          inputMode="numeric"
          name="crs-epsg"
          min={1024}
          max={32767}
          step={1}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1024 && n <= 32767) onChange(n);
          }}
        />
      </label>
      <p className={value === undefined ? 'warn' : 'muted'} role="status">
        {value === undefined
          ? t('crs.notChosen')
          : t('crs.chosen', {
              name:
                value === LOCAL_MINE_CRS
                  ? crsDisplayName(value)
                  : `${crsDisplayName(value)} (EPSG ${String(value)})`,
            })}
      </p>
    </div>
  );
}
