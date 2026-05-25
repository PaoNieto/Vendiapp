/** Mini gráfico SVG inline para acompañar KPIs (MetricTile). */

import { cn } from "@/lib/utils";

export type SparklineProps = {
  /** Serie de datos (ej últimos 7 días). Mín. 2 puntos para que se vea algo. */
  values: number[];
  /**
   * Color del path + dot final. Acepta cualquier color válido CSS — el caller
   * suele pasar `var(--accent)`, `var(--vd-sage-strong)` o `var(--vd-clay)`.
   * Default: `var(--accent)` (sage-strong en light, sage claro en dark).
   */
  color?: string;
  /**
   * Ancho lógico del viewBox en px. Default 100. NO controla el ancho
   * renderizado — el SVG es responsive (width=100%) y se escala al contenedor.
   * Sirve para mantener proporciones internas (stepX, radios, paddings).
   */
  width?: number;
  /**
   * Alto lógico del viewBox en px. Default 44. Misma semántica que `width` —
   * lógico, no renderizado. El alto físico lo da el contenedor padre vía CSS.
   */
  height?: number;
  /**
   * Opacity del área fill bajo la curva. Default 0.2. Subido desde 0.12 para
   * darle más presencia visual sobre el cream de la card.
   */
  fillOpacity?: number;
  /**
   * Grosor de la línea. Default 2. Subido desde 1.5 para que el sparkline se
   * sienta más "vivo" y legible a tamaños chicos.
   */
  strokeWidth?: number;
  /** className passthrough sobre el SVG. Default ancho/alto responsive. */
  className?: string;
};

/**
 * Sparkline
 *
 * Renderiza una serie como path SVG suave (catmull-rom→bezier) + área fill al
 * 20% del color + dot grande en el último punto con halo. Pure SVG, server
 * component.
 *
 * SVG responsive: el viewBox es fijo (100×44 por default) pero el SVG ocupa
 * 100% del contenedor padre vía CSS (`w-* h-*` o style). Esto permite que el
 * MetricTile elija tamaños distintos por breakpoint sin necesidad de medir el
 * viewport desde JS.
 *
 * Diseño visual (decisión deliberada):
 *  - Smooth curve (cardinal interpolation muy sutil, tension 0.5) — los KPIs
 *    de Vendí son tendencias, no datos high-frequency. Una curva suave se ve
 *    editorial / premium; una poligonal recta se ve técnica.
 *  - Dot final 4px sólido + halo 8px al 28% — visible y bonito.
 *  - stroke-linecap/linejoin round — sin esquinas duras.
 *  - drop-shadow muy sutil sobre la línea para darle "vida" sin ensuciar.
 *  - El padding interno deja espacio para que el halo (r=8) no se recorte.
 */
export function Sparkline({
  values,
  color = "var(--accent)",
  width = 100,
  height = 44,
  fillOpacity = 0.2,
  strokeWidth = 2,
  className,
}: SparklineProps) {
  // Edge case: sin datos o un solo punto, no dibujamos nada (devolvemos un
  // placeholder visualmente vacío del mismo tamaño para que el layout no salte).
  if (!values || values.length < 2) {
    return (
      <svg
        role="img"
        aria-label="Sin datos suficientes"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("block", className)}
      />
    );
  }

  // Normalizamos al rango [padY, height-padY] para que el dot y su halo (r=8)
  // no se recorten. padY=5 acomoda el halo arriba/abajo; padX=8 deja aire al
  // dot final cuando cae en el extremo derecho.
  const padY = 5;
  const padX = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // evitar /0 si la serie es constante
  const stepX = (width - padX * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    // SVG y crece hacia abajo: valores altos → y bajo.
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return { x, y };
  });

  // Smooth path con catmull-rom → cubic bezier (tension 0.5). Mucho más
  // editorial que un polyline. La fórmula calcula control points a partir de
  // los 4 puntos adyacentes; en los extremos duplicamos el punto.
  const buildSmoothPath = () => {
    const tension = 0.5;
    const get = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  };

  const linePath = buildSmoothPath();
  // Área = línea + cierre hasta el borde inferior + vuelta al inicio.
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height} L ${points[0].x.toFixed(2)} ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      role="img"
      aria-label={`Tendencia: ${values.length} puntos, de ${min} a ${max}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block overflow-visible", className)}
    >
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Glow muy sutil para dar "vida" sin ensuciar. Color neutro oscuro
        // funciona en ambos modos (no compite con la tinta del color).
        style={{ filter: "drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.08))" }}
      />
      {/* Halo del dot final (más grande, más translúcido) */}
      <circle cx={last.x} cy={last.y} r={8} fill={color} fillOpacity={0.28} />
      {/* Dot final sólido */}
      <circle cx={last.x} cy={last.y} r={4} fill={color} />
    </svg>
  );
}
