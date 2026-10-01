# Levantamientos de origen

`surveys/new-topo.dxf.gz` conserva, comprimido sin pérdida, el levantamiento `new topo.dxf`
aportado para el ejemplo **Mina sobre levantamiento DXF**. Contiene el TIN de caras 3DFACE
en coordenadas UTM. El crudo de la raíz se conserva localmente y está excluido de Git.

Desde la raíz del repositorio:

```sh
node scripts/topo-example.js
```

El script lee DXF o DXF gzip, recorta el tajo y extrae la cresta y el pie del banco 3465.
Regenera y formatea `packages/core/src/examples/mineTopoData.ts` de manera determinista.
También acepta otra ruta: `node scripts/topo-example.js "new topo.dxf"`.
