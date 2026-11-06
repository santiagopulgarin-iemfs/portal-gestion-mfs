/* Exportación a Excel (.xlsx) sin dependencias propias: SpreadsheetML mínimo empaquetado con JSZip
 * (ya presente en el proyecto). Una "hoja" es:
 *   { name, cols:[{h, w, num?, center?}], rows:[[celda,…]], footer?:[[celda,…]], freezeCols?:n }
 * celda = string | number | null | {f:"SUM(B2:B9)", v:número}  (fórmula con valor en caché)
 * Los encabezados llevan el verde de marca, fila 1 inmovilizada y autofiltro sobre encabezado + filas. */

var MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
var NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
var NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/* Texto seguro para XML 1.0: sin caracteres de control ni sustitutos sueltos; tope de Excel por celda */
function limpio(s) {
  s = String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
  return s.length > 32000 ? s.slice(0, 32000) : s;
}
function esc(s) {
  return limpio(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function colLetra(n) { /* 1 -> A */
  var s = "";
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
/* Nombre de hoja: sin : \ / ? * [ ], sin apóstrofo en los extremos, máx. 31, único sin distinguir mayúsculas */
function nombresUnicos(names) {
  var usados = {};
  return names.map(function (n) {
    var base = limpio(n).replace(/[:\\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").trim() || "Hoja";
    var nom = base.slice(0, 31).trim().replace(/^'+|'+$/g, "") || "Hoja", i = 1;
    while (usados[nom.toLowerCase()]) {
      i++;
      var suf = " (" + i + ")";
      nom = (base.slice(0, 31 - suf.length).trim() || "Hoja") + suf;
    }
    usados[nom.toLowerCase()] = true;
    return nom;
  });
}

/* estilos (cellXfs): 0 base · 1 encabezado · 2 texto · 3 número · 4 total texto · 5 total número · 6 número centrado */
var STYLES = HDR + '<styleSheet ' + NS + '>' +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF395723"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function hojaXml(h, sst) {
  var ncols = h.cols.length, nrows = h.rows.length, footer = h.footer || [];
  var ultima = 1 + nrows + footer.length;
  var rowsXml = "";
  function celda(c, r, i, esTotal, col) {
    var ref = colLetra(i + 1) + r;
    if (c == null || c === "") return '<c r="' + ref + '" s="' + (esTotal ? 4 : 2) + '"/>';
    if (typeof c === "object" && c.f != null)
      return '<c r="' + ref + '" s="' + (esTotal ? 5 : 3) + '"><f>' + esc(c.f) + '</f><v>' + Number(c.v) + '</v></c>';
    if (typeof c === "number" && isFinite(c))
      return '<c r="' + ref + '" s="' + (esTotal ? 5 : (col && col.center ? 6 : 3)) + '"><v>' + c + '</v></c>';
    var t = limpio(c), k = sst.map[t];
    if (k == null) { k = sst.list.length; sst.map[t] = k; sst.list.push(t); }
    sst.n++;
    return '<c r="' + ref + '" s="' + (esTotal ? 4 : 2) + '" t="s"><v>' + k + '</v></c>';
  }
  rowsXml += '<row r="1" ht="30" customHeight="1">' + h.cols.map(function (c, i) {
    var t = limpio(c.h), k = sst.map[t];
    if (k == null) { k = sst.list.length; sst.map[t] = k; sst.list.push(t); }
    sst.n++;
    return '<c r="' + colLetra(i + 1) + '1" s="1" t="s"><v>' + k + '</v></c>';
  }).join("") + '</row>';
  h.rows.forEach(function (f, ri) {
    var r = ri + 2;
    rowsXml += '<row r="' + r + '">' + h.cols.map(function (col, i) { return celda(f[i], r, i, false, col); }).join("") + '</row>';
  });
  footer.forEach(function (f, ri) {
    var r = nrows + 2 + ri;
    rowsXml += '<row r="' + r + '">' + h.cols.map(function (col, i) { return celda(f[i], r, i, true, col); }).join("") + '</row>';
  });
  var fc = h.freezeCols || 0;
  var pane = fc
    ? '<pane xSplit="' + fc + '" ySplit="1" topLeftCell="' + colLetra(fc + 1) + '2" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="' + colLetra(fc + 1) + '2" sqref="' + colLetra(fc + 1) + '2"/>'
    : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  var filtro = "A1:" + colLetra(ncols) + (1 + nrows);
  return HDR + '<worksheet ' + NS + ' ' + NS_R + '>' +
    '<dimension ref="A1:' + colLetra(ncols) + ultima + '"/>' +
    '<sheetViews><sheetView workbookViewId="0">' + pane + '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols>' + h.cols.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 16) + '" customWidth="1"/>';
    }).join("") + '</cols>' +
    '<sheetData>' + rowsXml + '</sheetData>' +
    '<autoFilter ref="' + filtro + '"/>' +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape"/>' +
    '</worksheet>';
}

/* Devuelve Promise<Blob>. JSZip se inyecta (window.JSZip en el navegador). */
export function construirXlsx(hojas, JSZip) {
  if (!hojas || !hojas.length) hojas = [{ name: "Hoja", cols: [{ h: "—" }], rows: [] }];
  var nombres = nombresUnicos(hojas.map(function (h) { return h.name; }));
  var sst = { list: [], map: Object.create(null), n: 0 };
  var zip = new JSZip();
  /* sin entradas de carpeta: el paquete OPC solo lleva las partes */
  var put = function (n, d) { zip.file(n, d, { createFolders: false }); };
  var partes = hojas.map(function (h) { return hojaXml(h, sst); });
  put("[Content_Types].xml", HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    hojas.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>');
  put("_rels/.rels", HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  put("xl/workbook.xml", HDR + '<workbook ' + NS + ' ' + NS_R + '>' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    '<sheets>' + nombres.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + '</sheets>' +
    '<definedNames>' + hojas.map(function (h, i) {
      return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + esc(nombres[i].replace(/'/g, "''")) + '\'!$A$1:$' + colLetra(h.cols.length) + '$' + (1 + h.rows.length) + '</definedName>';
    }).join("") + '</definedNames></workbook>');
  put("xl/_rels/workbook.xml.rels", HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    hojas.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
    '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId' + (hojas.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
  partes.forEach(function (p, i) { put("xl/worksheets/sheet" + (i + 1) + ".xml", p); });
  put("xl/styles.xml", STYLES);
  put("xl/sharedStrings.xml", HDR + '<sst ' + NS + ' count="' + sst.n + '" uniqueCount="' + sst.list.length + '">' +
    sst.list.map(function (t) { return '<si><t xml:space="preserve">' + esc(t) + '</t></si>'; }).join("") + '</sst>');
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: MIME });
}

/* Una tabla {titulo, cols, anchos(twips), filas(strings), texto} -> hoja. Sin `texto`, la última columna es numérica. */
export function hojaDeTabla(t, nombre) {
  var n = t.cols.length;
  return {
    name: nombre || t.titulo,
    cols: t.cols.map(function (c, i) {
      return { h: c, w: Math.max(8, Math.min(70, Math.round(t.anchos[i] / 130))), num: !t.texto && i === n - 1 };
    }),
    rows: t.filas.map(function (f) {
      return f.map(function (v, i) { return !t.texto && i === n - 1 && v !== "" && isFinite(Number(v)) ? Number(v) : v; });
    })
  };
}

function estadoHoras(total, tope) {
  var d = total - tope;
  return d === 0 ? "Completa" : d < 0 ? "Faltan " + (-d) + " h" : "Sobran " + d + " h";
}

/* Cargas: "Matriz" (docente x grupo, horas numéricas, totales con fórmulas) + "Detalle" (una fila por carga) */
export function hojasCargas(items, tope, cmp) {
  var uni = function (arr) { var o = []; arr.forEach(function (v) { if (v && o.indexOf(v) < 0) o.push(v); }); return o.sort(cmp); };
  var docs = uni(items.map(function (a) { return a.docente; })), grupos = uni(items.map(function (a) { return a.grupo; }));
  var horas = {};
  items.forEach(function (a) { var k = a.docente + "\u0001" + a.grupo; horas[k] = (horas[k] || 0) + a.horas; });
  var g0 = 2, gN = 1 + grupos.length, cTot = gN + 1; /* columnas B..(gN) = grupos; luego Total, Tope, Estado */
  var rows = docs.map(function (d, ri) {
    var r = ri + 2, tot = 0;
    var celdas = grupos.map(function (g) { var v = horas[d + "\u0001" + g]; if (v) tot += v; return v || null; });
    var totCell = grupos.length ? { f: "SUM(" + colLetra(g0) + r + ":" + colLetra(gN) + r + ")", v: tot } : tot;
    return [d].concat(celdas, [totCell, tope, estadoHoras(tot, tope)]);
  });
  var ult = 1 + docs.length, granTotal = 0;
  rows.forEach(function (f) { granTotal += (typeof f[cTot - 1] === "object" ? f[cTot - 1].v : f[cTot - 1]); });
  var footer = docs.length ? [["Horas por grupo"].concat(
    grupos.map(function (g, i) {
      var s = 0; docs.forEach(function (d) { s += horas[d + "\u0001" + g] || 0; });
      return { f: "SUM(" + colLetra(g0 + i) + "2:" + colLetra(g0 + i) + ult + ")", v: s };
    }),
    [{ f: "SUM(" + colLetra(cTot) + "2:" + colLetra(cTot) + ult + ")", v: granTotal }, null, null])] : [];
  var matriz = {
    name: "Matriz",
    cols: [{ h: "Docente", w: 34 }].concat(grupos.map(function (g) { return { h: g, w: 8, num: true, center: true }; }),
      [{ h: "Total docente", w: 14, num: true }, { h: "Tope", w: 8, num: true }, { h: "Estado", w: 16 }]),
    rows: rows, footer: footer, freezeCols: 1
  };
  var det = items.slice().sort(function (a, b) { return cmp(a.docente, b.docente) || cmp(a.asignatura, b.asignatura) || cmp(a.grupo, b.grupo); });
  var tdet = det.reduce(function (t, a) { return t + a.horas; }, 0);
  var detalle = {
    name: "Detalle",
    cols: [{ h: "Docente", w: 34 }, { h: "Asignatura", w: 40 }, { h: "Grupo", w: 10 }, { h: "Horas", w: 9, num: true }],
    rows: det.map(function (a) { return [a.docente, a.asignatura, a.grupo, a.horas]; }),
    /* SUBTOTAL(109) respeta los filtros aplicados en la hoja */
    footer: det.length ? [["Total", null, null, { f: "SUBTOTAL(109,D2:D" + (1 + det.length) + ")", v: tdet }]] : []
  };
  return [matriz, detalle];
}

/* Direcciones de grupo: "Direcciones <año>" (con grupo) y "Sin dirección" (solo si hay docentes sin grupo). `lista` ya viene ordenada. */
export function hojasDirecciones(lista, anio) {
  var con = lista.filter(function (a) { return a.grupo; }), sin = lista.filter(function (a) { return !a.grupo; });
  var hojas = [{
    name: ("Direcciones " + (anio || "")).trim(),
    cols: [{ h: "Grupo", w: 10 }, { h: "Docente", w: 40 }, { h: "Jornada", w: 14 }, { h: "Sede", w: 24 }],
    rows: con.map(function (a) { return [a.grupo, a.docente, a.jornada || "", a.sede || ""]; }), freezeCols: 0
  }];
  if (sin.length) hojas.push({
    name: "Sin dirección",
    cols: [{ h: "Docente", w: 40 }, { h: "Jornada", w: 14 }, { h: "Sede", w: 24 }],
    rows: sin.map(function (a) { return [a.docente, a.jornada || "", a.sede || ""]; })
  });
  return hojas;
}

export var XLSX_MIME = MIME;
