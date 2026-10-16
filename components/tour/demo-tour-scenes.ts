/**
 * Escenas del «mini video» del tour (demo animada). Son HTML estático armado
 * acá con constantes propias (nada de input del usuario), así que se inyecta
 * con dangerouslySetInnerHTML. Toda la animación es CSS (demo-tour.css): cada
 * pieza termina en su cuadro final, así que con movimiento reducido igual se
 * entiende.
 *
 * El producto es una ILUSTRACIÓN (frasco de vela «Olivo»), no una foto real.
 */

const ICONS: Record<string, string> = {
  up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  spark: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  redo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
};

function ico(name: keyof typeof ICONS | string, cls?: string): string {
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}
function jar(): string {
  return '<span class="jar"><i class="lid"></i><i class="glass"></i><i class="lbl">Olivo</i></span>';
}
function ph(scene: string, extra = "", attrs = ""): string {
  return `<span${attrs} class="ph ${scene}">${jar()}${extra}</span>`;
}

const CUR =
  '<span class="dm-cur"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2v17.5l4.6-4.2 3 6.5 3-1.3-3-6.4h6.2z"/></svg></span>';

/* fotos de la tanda */
const TANDA = [
  { sc: "sc-studio", l: 65, t: 150, s: 118, d: 1.72 },
  { sc: "sc-clay", l: 199, t: 138, s: 118, d: 1.56 },
  { sc: "sc-noir", l: 333, t: 116, s: 152, d: 1.4 },
  { sc: "sc-sage", l: 501, t: 138, s: 118, d: 1.56 },
  { sc: "sc-linen", l: 635, t: 150, s: 118, d: 1.72 },
];
function tanda(anim: boolean): string {
  return TANDA.map((p, i) => {
    const a = anim ? `animation-delay:${(0.95 + i * 0.05).toFixed(2)}s` : "";
    const pa = anim ? ` style="animation-delay:${p.d}s"` : "";
    return (
      `<span class="dm-tile lift" style="left:${p.l}px;top:${p.t}px;width:${p.s}px;height:${p.s}px;${a}">` +
      ph(p.sc, "", pa) +
      `<span class="dm-stamp"${pa}>V${i + 1}</span></span>`
    );
  }).join("");
}
const STARS: [number, number, number, number][] = [
  [318, 102, 22, 1.55], [502, 110, 14, 1.7], [482, 262, 12, 1.85], [50, 134, 12, 2],
  [764, 136, 15, 1.95], [186, 264, 10, 2.1], [650, 126, 10, 2.2], [270, 116, 9, 2.25],
];
function stars(): string {
  return STARS.map(
    (s) =>
      `<i class="dm-star" style="left:${s[0]}px;top:${s[1]}px;width:${s[2]}px;height:${s[2]}px;animation:vdtour-star .7s ${s[3]}s both,vdtour-twinkle 1.6s ${(s[3] + 0.9).toFixed(2)}s ease-in-out infinite alternate"></i>`,
  ).join("");
}

/* 1 · Producto: el frasco en la cámara, se saca la foto y se sube al catálogo */
const S1 =
  '<div class="dm-s1">' +
  '<span class="dm-phone"><span class="dm-scr">' + ph("sc-linen") +
  '<i class="dm-vf tl"></i><i class="dm-vf tr"></i><i class="dm-vf bl"></i><i class="dm-vf br"></i><i class="dm-shut"></i><i class="dm-flash"></i></span><i class="dm-notch"></i></span>' +
  '<span class="dm-wire"></span><span class="dm-go"></span>' +
  '<span class="dm-up dm-gl"><span class="dm-ic">' + ico("up", "dm-a") + ico("check", "dm-b") + "</span>" +
  '<span class="dm-lb"><span class="dm-sw"><b class="dm-a">Subiendo 3 fotos…</b><b class="dm-b">3 fotos subidas</b></span><small>Vela Olivo</small></span>' +
  '<span class="dm-pb"><i></i></span></span>' +
  '<span class="dm-card dm-gl">' + ph("sc-linen") + '<span class="dm-badge">' + ico("check") + "</span>" +
  '<span class="dm-pn">Vela Olivo</span><span class="dm-pm">' + ico("image") + "3 fotos · en tu catálogo</span></span>" +
  "</div>";

/* 2 · Versión: «Nueva Versión», el nombre y las 4 elecciones (referencia, estilo, formato, por tanda) */
const CK = '<span class="dm-ck">' + ico("check") + "</span>";
function ing(label: string, opt: boolean, vis: string, foot: string): string {
  return (
    '<span class="dm-ing">' + CK +
    '<span class="dm-ing-h"><span class="dm-mono">' + label + "</span>" + (opt ? '<span class="dm-opt">opcional</span>' : "") + "</span>" +
    '<span class="dm-vis">' + vis + "</span>" + foot + "</span>"
  );
}
const S2 =
  '<div class="dm-s2">' +
  '<span class="dm-card dm-gl">' + ph("sc-linen") + '<span class="dm-pn">Vela Olivo</span><span class="dm-pm">' + ico("image") + "3 fotos</span></span>" +
  '<span class="dm-nv dm-cta">' + ico("spark") + "Nueva Versión</span>" +
  '<span class="dm-rip"></span>' +
  '<span class="dm-sheet dm-gl">' +
  '<span class="dm-sh-top"><span class="dm-mono">Nueva versión</span><span class="dm-sh-chip">' + ph("sc-plain") + "Vela Olivo</span></span>" +
  '<span class="dm-sh-nm"><span class="dm-tw">Día de la Madre</span><i class="dm-caret"></i></span>' +
  '<span class="dm-ings">' +
  ing("Referencia", true, ph("sc-life") + '<span class="dm-up2">' + ico("up") + "</span>", "<small>Una foto que te guste. Toma la vibra, no copia tu producto.</small>") +
  ing("Estilo", true, ph("sc-studio") + '<span class="dm-sug">' + ico("spark") + "Sugerido</span>", '<b class="dm-v">Estudio limpio</b><small>Si no elegís, Vendí lo propone.</small>') +
  ing("Formato", false, '<span class="dm-fm"><i class="on" style="width:20px;height:20px"></i><i style="width:17px;height:21px"></i><i style="width:13px;height:24px"></i><i style="width:26px;height:15px"></i></span>', '<b class="dm-v">Cuadrado 1:1</b><small>Feed, historia o banner.</small>') +
  ing("Por tanda", false, '<span class="dm-tn"><span class="bt">−</span><span class="num"><span class="dm-a">3</span><span class="dm-b">5</span></span><span class="bt plus">+</span></span>', '<b class="dm-v">5 fotos</b><small>Hasta 10. 1 foto = 1 crédito.</small>') +
  "</span>" +
  '<span class="dm-ready"><small>Lista la receta.</small><span class="dm-cta">Revisar y generar →</span></span>' +
  "</span>" + CUR +
  "</div>";

/* 3 · Generar: «Generar primera tanda», destellos y aparecen las 5 fotos */
const S3 =
  '<div class="dm-s3">' +
  '<span class="dm-st"><span class="dm-s-gen dm-cta">' + ico("spark") + "Generar primera tanda</span>" +
  '<span class="dm-s-wait dm-pillg dm-gl"><i class="dm-spin"></i>Creando tus imágenes…</span>' +
  '<span class="dm-s-ok dm-pillg dm-gl">' + ico("check") + "Esta tanda · 5 fotos</span></span>" +
  '<span class="dm-glow"></span><span class="dm-burst"></span>' + tanda(true) + stars() +
  "</div>";

/* 4 · Descargar: se elige una foto y «Descargar» */
const GRID = ["sc-studio", "sc-clay", "sc-noir", "sc-sage", "sc-linen"];
const S4 =
  '<div class="dm-s4">' +
  '<span class="dm-ghd"><span class="dm-gnm">Día de la Madre</span><span class="dm-mono">Vela Olivo · 5 fotos · Listo</span></span>' +
  '<span class="dm-grid">' + GRID.map((sc, i) => ph(sc + (i === 3 ? " sel" : ""))).join("") + "</span>" +
  '<span class="dm-pv">' + ph("sc-sage") + '<span class="dm-stamp">V4</span><span class="dm-dl dm-cta">' + ico("down") + "Descargar</span></span>" +
  '<span class="dm-rip"></span>' +
  '<span class="dm-fly">' + ph("sc-sage") + "</span>" +
  '<span class="dm-toast dm-gl"><span class="dm-ic">' + ico("down", "dm-a") + ico("check", "dm-b") + "</span>" +
  '<span class="dm-lb"><b>Vela Olivo · V4</b><span class="dm-sw"><span class="dm-a">Descargando…</span><span class="dm-b">Descargada</span></span></span>' +
  '<span class="dm-pb"><i></i></span></span>' + CUR +
  "</div>";

/* final: fin de la demo */
const S5 =
  '<div class="dm-s5"><span class="dm-fade">' + tanda(false) + "</span>" +
  '<span class="dm-end"><span class="dm-mono">Fin de la demo</span>' +
  '<span class="vt-title">Probalo <span class="vt-acc">vos</span>.</span>' +
  '<button type="button" class="dm-again dm-gl" data-go="0">' + ico("redo") + "Ver de nuevo</button></span></div>";

export const DEMO_SCENES = [S1, S2, S3, S4, S5];
