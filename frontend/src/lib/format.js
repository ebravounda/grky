// Muestra el consumo en MB cuando es < 1 GB, y en GB a partir de 1 GB.
export function fmtData(gb) {
  if (gb == null || isNaN(gb)) return "—";
  const mb = gb * 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(2)} GB`;
}
