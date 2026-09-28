// Piezas comunes de los cuadros de mando (1.4.0): gráficos SVG sin librería, exportación CSV, etiquetas de
// certeza (Medido / Estimado / Sin datos) y selector de periodo. Lo usan cuadro.html y superadmin.html.
(function () {
  'use strict';
  var E = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var css = '' +
    '.dx-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}' +
    '@media(min-width:720px){.dx-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}' +
    '.dx-kpi{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:12px 14px;min-width:0}' +
    '.dx-kpi .v{font-size:24px;font-weight:900;color:var(--ink);line-height:1.15;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}' +
    '.dx-kpi .v small{font-size:13px;color:var(--muted);font-weight:700}' +
    '.dx-kpi .l{font-size:12.5px;font-weight:700;color:var(--body);margin-top:3px}' +
    '.dx-kpi .d{font-size:11.5px;color:var(--muted);line-height:1.4;margin-top:5px}' +
    '.dx-c{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:6px;vertical-align:middle;white-space:nowrap}' +
    '.dx-c.m{background:rgba(84,199,154,.14);color:var(--green)}.dx-c.e{background:rgba(240,198,69,.14);color:var(--gold)}.dx-c.s{background:rgba(150,142,164,.16);color:var(--muted)}' +
    '.dx-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px;min-width:0}' +
    '.dx-card h2{font-family:var(--ff);font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.dx-card h2 .sp{flex:1}' +
    '.dx-def{font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px}' +
    '.dx-empty{font-size:13.5px;color:var(--muted);padding:6px 0}' +
    '.dx-lead{font-size:13.5px;color:var(--body);line-height:1.5;border:1px dashed var(--line);border-radius:12px;padding:10px 12px;margin-bottom:14px}' +
    '.dx-lead b{color:var(--ink)}' +
    '.dx-tabs{display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--line)}' +
    '.dx-tab{background:none;border:0;border-bottom:2.5px solid transparent;color:var(--muted);font:800 12.5px var(--ff);letter-spacing:.08em;text-transform:uppercase;padding:12px 10px;cursor:pointer;min-height:44px}' +
    '.dx-tab.on{color:var(--ink);border-bottom-color:var(--teal2)}' +
    '.dx-per{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden}' +
    '.dx-per button{background:none;border:0;color:var(--body);font:700 12.5px var(--ff);padding:8px 12px;min-height:40px;cursor:pointer}' +
    '.dx-per button.on{background:var(--grad);color:#fff}' +
    '.dx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:0;border-radius:12px;padding:8px 14px;font:800 12px var(--ff);letter-spacing:.07em;text-transform:uppercase;color:#fff;cursor:pointer;background:linear-gradient(120deg,var(--teal),var(--aub));text-decoration:none;white-space:nowrap}' +
    '.dx-btn.gh{background:none;border:1.5px solid var(--line);color:#fff}' +
    ':root[data-theme="light"] .dx-btn.gh{color:var(--ink)}' +
    '.dx-btn:disabled{opacity:.5;cursor:default}.dx-btn.sm{min-height:34px;padding:6px 10px;font-size:11px;border-radius:10px}' +
    '.dx-tbl{width:100%;border-collapse:collapse;font-size:13px}' +
    '.dx-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:8px;border-bottom:1px solid var(--line);font-weight:700;white-space:nowrap;cursor:pointer;user-select:none}' +
    '.dx-tbl th[data-k]:hover{color:var(--ink)}' +
    '.dx-tbl td{padding:9px 8px;border-bottom:1px solid var(--line);color:var(--body);vertical-align:top}' +
    '.dx-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.dx-scroll{overflow-x:auto}' +
    // Tabla a tarjetas en móvil: cada fila es una tarjeta con etiqueta por celda.
    '@media(max-width:720px){.dx-tbl.cards thead{display:none}.dx-tbl.cards tr{display:block;border:1px solid var(--line);border-radius:14px;padding:8px 10px;margin-bottom:10px}' +
    '.dx-tbl.cards td{display:flex;justify-content:space-between;gap:10px;border:0;padding:5px 0;text-align:right}.dx-tbl.cards td.n{text-align:right}' +
    '.dx-tbl.cards td::before{content:attr(data-l);font-size:11.5px;font-weight:700;color:var(--muted);text-align:left;text-transform:uppercase;letter-spacing:.03em}' +
    '.dx-tbl.cards td.first{display:block;text-align:left;font-size:15px}.dx-tbl.cards td.first::before{content:none}}' +
    '.dx-pill{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--body);white-space:nowrap}' +
    '.dx-pill.red{color:var(--red);background:rgba(226,80,106,.12)}.dx-pill.gold{color:var(--gold);background:rgba(240,198,69,.12)}.dx-pill.green{color:var(--green);background:rgba(84,199,154,.12)}' +
    '.dx-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted);margin-top:6px}.dx-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
    '.dx-ins{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:var(--panel)}' +
    '.dx-ins.warn{border-color:rgba(240,198,69,.45)}.dx-ins.bad{border-color:rgba(226,80,106,.45)}' +
    '.dx-ins p{margin:0 0 8px;color:var(--body);font-size:14px;line-height:1.5}.dx-ins p b{color:var(--ink)}' +
    '.dx-ins .src{font-size:12px;color:var(--muted);margin-bottom:8px}' +
    '.dx-ins .acts{display:flex;flex-wrap:wrap;gap:8px}' +
    '.dx-grid2{display:grid;grid-template-columns:1fr;gap:14px}@media(min-width:900px){.dx-grid2{grid-template-columns:1fr 1fr}}' +
    '.dx-fun .st{display:grid;grid-template-columns:minmax(90px,130px) 1fr 44px;align-items:center;gap:8px;font-size:12px;margin-top:4px;color:var(--body)}' +
    '.dx-fun .bt{height:12px;border-radius:6px;background:var(--soft);overflow:hidden}.dx-fun .bt i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--teal2),var(--aub2))}' +
    '.dx-fun .st em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}' +
    '.dx-fun .fr{margin:10px 0}.dx-fun .fr b{font-size:13.5px;color:var(--ink)}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function nf(v, dec) { if (v == null || v === '') return '—'; var n = Number(v); if (!isFinite(n)) return String(v); return n.toLocaleString('es-ES', { maximumFractionDigits: dec == null ? 1 : dec }); }
  function cert(kind, n) {
    if (kind === 'm') return '<span class="dx-c m">Medido' + (n != null ? ' · n=' + nf(n, 0) : '') + '</span>';
    if (kind === 'e') return '<span class="dx-c e">Estimado' + (n != null ? ' · n=' + nf(n, 0) : '') + '</span>';
    return '<span class="dx-c s">Sin datos</span>';
  }
  function kpi(v, label, def, c, suffix) {
    return '<div class="dx-kpi"><div class="v">' + (v == null ? '<span style="color:var(--muted)">Sin datos</span>' : E(v) + (suffix ? ' <small>' + E(suffix) + '</small>' : '')) + '</div><div class="l">' + E(label) + ' ' + (c || '') + '</div>' + (def ? '<div class="d">' + E(def) + '</div>' : '') + '</div>';
  }
  function hasData(series, keys) { return series && series.length && series.some(function (d) { return keys.some(function (k) { return Number(d[k]) > 0; }); }); }
  function axis(series, w, h, pad) {
    return '<text x="' + pad + '" y="' + (h - 4) + '" font-size="10.5" fill="var(--muted)">' + E(series[0].day) + '</text><text x="' + w + '" y="' + (h - 4) + '" font-size="10.5" fill="var(--muted)" text-anchor="end">' + E(series[series.length - 1].day) + '</text>';
  }
  /** Barras diarias; opts.ref = clave de una línea de referencia (p. ej. ingresos por día). */
  function bars(series, key, opts) {
    opts = opts || {}; var keys = [key].concat(opts.ref ? [opts.ref] : []);
    if (!hasData(series, keys)) return '<div class="dx-empty">Sin datos en el periodo.</div>';
    var w = 640, h = 160, pad = 26, top = 16, fmt = opts.fmt || function (v) { return nf(v); };
    var mx = Math.max.apply(null, series.map(function (d) { return Math.max(Number(d[key]) || 0, opts.ref ? Number(d[opts.ref]) || 0 : 0); })) || 1;
    var bw = (w - pad) / series.length, ch = h - pad - top, color = opts.color || 'var(--teal2)';
    var out = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + E(opts.label || key) + '">';
    series.forEach(function (d, i) { var v = Number(d[key]) || 0, bh = (v / mx) * ch;
      out += '<rect x="' + (pad + i * bw + 1).toFixed(1) + '" y="' + (top + ch - bh).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + color + '"><title>' + E(d.day) + ': ' + E(fmt(v)) + '</title></rect>'; });
    if (opts.ref && series[0][opts.ref] != null) { var ry = top + ch - (Number(series[0][opts.ref]) / mx) * ch;
      out += '<line x1="' + pad + '" x2="' + w + '" y1="' + ry.toFixed(1) + '" y2="' + ry.toFixed(1) + '" stroke="var(--gold)" stroke-width="2" stroke-dasharray="6 4"><title>' + E(opts.refLabel || opts.ref) + ': ' + E(fmt(series[0][opts.ref])) + '</title></line>'; }
    out += '<text x="' + pad + '" y="11" font-size="11" fill="var(--muted)">máx. ' + E(fmt(mx)) + '</text>' + axis(series, w, h, pad) + '</svg>';
    return out;
  }
  /** Varias líneas sobre el mismo eje de días. lines = [{key,label,color}] */
  function lines(series, ls, opts) {
    opts = opts || {};
    if (!hasData(series, ls.map(function (l) { return l.key; }))) return '<div class="dx-empty">Sin datos en el periodo.</div>';
    var w = 640, h = 160, pad = 26, top = 16, ch = h - pad - top, n = series.length;
    var mx = Math.max.apply(null, series.map(function (d) { return Math.max.apply(null, ls.map(function (l) { return Number(d[l.key]) || 0; })); })) || 1;
    var x = function (i) { return pad + (n > 1 ? i * (w - pad) / (n - 1) : (w - pad) / 2); };
    var out = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + E(opts.label || '') + '">';
    ls.forEach(function (l) {
      var pts = series.map(function (d, i) { return x(i).toFixed(1) + ',' + (top + ch - ((Number(d[l.key]) || 0) / mx) * ch).toFixed(1); });
      out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + l.color + '" stroke-width="2.2" stroke-linejoin="round"/>';
      series.forEach(function (d, i) { out += '<circle cx="' + x(i).toFixed(1) + '" cy="' + (top + ch - ((Number(d[l.key]) || 0) / mx) * ch).toFixed(1) + '" r="' + (n > 40 ? 1.5 : 2.5) + '" fill="' + l.color + '"><title>' + E(d.day + ' · ' + l.label + ': ' + nf(d[l.key])) + '</title></circle>'; });
    });
    out += '<text x="' + pad + '" y="11" font-size="11" fill="var(--muted)">máx. ' + E(nf(mx)) + '</text>' + axis(series, w, h, pad) + '</svg>';
    return out + '<div class="dx-leg">' + ls.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + E(l.label) + '</span>'; }).join('') + '</div>';
  }
  function spark(vals, w, h) {
    w = w || 120; h = h || 28;
    if (!vals || !vals.some(function (v) { return v > 0; })) return '<span style="font-size:11.5px;color:var(--muted)">Sin datos</span>';
    var mx = Math.max.apply(null, vals) || 1, st = w / Math.max(1, vals.length - 1);
    var pts = vals.map(function (v, i) { return (i * st).toFixed(1) + ',' + (h - 2 - (v / mx) * (h - 5)).toFixed(1); });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Tendencia"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--teal2)" stroke-width="1.8"/></svg>';
  }
  function funnel(rows) {
    if (!rows || !rows.length) return '<div class="dx-empty">Sin datos.</div>';
    return '<div class="dx-fun">' + rows.map(function (f) { var mx = f.started || 1;
      var st = [['Empezado', f.started], ['Bloque aprobado', f.blockPassed], ['Examen final', f.finalTaken], ['Certificado', f.certified]];
      return '<div class="fr"><b>' + E(f.title) + '</b>' + st.map(function (s) { return '<div class="st"><span>' + s[0] + '</span><span class="bt"><i style="width:' + Math.round((s[1] / mx) * 100) + '%"></i></span><em>' + s[1] + '</em></div>'; }).join('') + '</div>'; }).join('') + '</div>';
  }
  /** Descarga CSV (separador «;» y BOM para que Excel en español lo abra bien). */
  function csv(name, head, rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '﻿' + [head].concat(rows).map(function (r) { return r.map(q).join(';'); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvBtn(id) { return '<button class="dx-btn gh" type="button" data-csv="' + E(id) + '">Exportar CSV</button>'; }
  function period(cur) { return '<span class="dx-per" role="group" aria-label="Periodo">' + [7, 30, 90].map(function (d) { return '<button type="button" data-days="' + d + '"' + (d === cur ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + d + ' días</button>'; }).join('') + '</span>'; }
  /** Tabla ordenable (clic en la cabecera). cols = [{k,label,num,fmt(row)}] */
  function table(id, cols, rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="dx-empty">' + E(opts.empty || 'Sin datos.') + '</div>';
    return '<div class="dx-scroll"><table class="dx-tbl' + (opts.cards ? ' cards' : '') + '" id="' + E(id) + '"><thead><tr>' + cols.map(function (c) { return '<th data-k="' + E(c.k) + '"' + (c.num ? ' style="text-align:right"' : '') + '>' + E(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c, i) { return '<td data-l="' + E(c.label) + '" class="' + (c.num ? 'n' : '') + (i === 0 ? ' first' : '') + '">' + (c.fmt ? c.fmt(r) : E(r[c.k] == null ? '—' : r[c.k])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  /** Ordena una tabla por columna al pulsar su cabecera (re-render con el mismo html). */
  function sortable(box, id, cols, rows, render, opts) {
    var dir = {}; box.querySelectorAll('#' + id + ' th[data-k]').forEach(function (th) {
      th.onclick = function () { var k = th.getAttribute('data-k'); dir[k] = -(dir[k] || -1);
        rows.sort(function (a, b) { var x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * dir[k]; });
        render(); };
    });
  }
  window.SkillDash = { E: E, nf: nf, cert: cert, kpi: kpi, bars: bars, lines: lines, spark: spark, funnel: funnel, csv: csv, csvBtn: csvBtn, period: period, table: table, sortable: sortable };
})();
