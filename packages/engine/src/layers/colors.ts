import { Color } from 'three';

export const COLORS = {
  background: new Color(0x12161c),
  hole: new Color(0x7fb2ff),
  holeSelected: new Color(0xffb020),
  holeHover: new Color(0xffffff),
  trace: new Color(0x4a6280),
  label: new Color(0xc9d1d9),
  boundary: new Color(0xff7b54),
  overlay: new Color(0x58d0ff),
  snap: new Color(0x7ee787),
  gridMinor: new Color(0x1f2733),
  gridMajor: new Color(0x2c3848),
  // Comparación de versiones (D-14)
  diffAdded: new Color(0x3fb950),
  diffRemoved: new Color(0xf85149),
  diffMoved: new Color(0xffb020),
  diffChanged: new Color(0x58a6ff),
} as const;
