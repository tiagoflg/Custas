/* ═══════════════════════════════════════════════════════════════
   Custas — export.js  (v5 — geração de XML puro, sem biblioteca)
   O .docx é construído directamente como ZIP com XML válido,
   usando os ficheiros estáticos do template como base.
═══════════════════════════════════════════════════════════════ */

/* ── Formatação ── */
function fmtEuroDoc(v) {
  const rounded = Math.round((v || 0) * 100) / 100;
  return 'EUR ' + rounded.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPctDoc(v) {
  return parseFloat(v.toFixed(4)).toString().replace('.', ',') + '%';
}
function fmtFracao(peso) {
  for (let d = 1; d <= 1000; d++) {
    const n = Math.round(peso * d);
    if (Math.abs(n / d - peso) < 0.0001) return n + '/' + d;
  }
  return fmtPctDoc(peso * 100);
}
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Namespaces comuns do Word ── */
const W_NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
  + 'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
  + 'xmlns:o="urn:schemas-microsoft-com:office:office" '
  + 'xmlns:v="urn:schemas-microsoft-com:vml" '
  + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
  + 'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
  + 'mc:Ignorable="w14 w15"';

/* ════════════════════════════════════════════════════════════
   PRIMITIVAS XML
════════════════════════════════════════════════════════════ */

/* rPr — propriedades de run */
function rPr({ bold, italic, underline, size = 18, szCs, color } = {}) {
  let s = '<w:rPr>';
  if (bold)      s += '<w:b/>';
  if (italic)    s += '<w:i/><w:iCs/>';
  if (underline) s += '<w:u w:val="single"/>';
  s += `<w:sz w:val="${size}"/><w:szCs w:val="${szCs || size}"/>`;
  if (color)     s += `<w:color w:val="${color}"/>`;
  s += '<w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>';
  s += '</w:rPr>';
  return s;
}

/* run simples */
function run(texto, opts = {}) {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

/* run com referência a footnote */
function fnRef(id) {
  return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

/* pPr — propriedades de parágrafo */
function pPr({ jc = 'both', spacing, ind, numId, ilvl = 0, border, shading } = {}) {
  let s = '<w:pPr>';
  if (border) s += border;
  if (shading) s += shading;
  s += `<w:spacing ${spacing || 'w:after="120" w:line="360" w:lineRule="auto"'}/>`;
  if (jc !== 'left') s += `<w:jc w:val="${jc}"/>`;
  if (ind) s += `<w:ind ${ind}/>`;
  if (numId != null) s += `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;
  s += '</w:pPr>';
  return s;
}

/* parágrafo genérico */
function para(pprStr, ...runs) {
  return `<w:p>${pprStr}${runs.join('')}</w:p>`;
}

/* parágrafo vazio (espaçamento) */
function paraEsp(after = 120) {
  return `<w:p><w:pPr><w:spacing w:after="${after}" w:line="360" w:lineRule="auto"/></w:pPr></w:p>`;
}

/* ════════════════════════════════════════════════════════════
   CAIXA CINZENTA (cabeçalho)
   Usa bordas em todos os lados + fill E7E6E6
════════════════════════════════════════════════════════════ */
const BORDA_CAIXA = '<w:pBdr>'
  + '<w:top w:val="single" w:sz="4" w:space="1" w:color="auto"/>'
  + '<w:left w:val="single" w:sz="4" w:space="4" w:color="auto"/>'
  + '<w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/>'
  + '<w:right w:val="single" w:sz="4" w:space="4" w:color="auto"/>'
  + '</w:pBdr>';
const SHADING_CAIXA = '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>';
const SPACING_CAIXA = 'w:after="0" w:line="276" w:lineRule="auto"';

function paraCaixa(texto, opts = {}) {
  const pr = pPr({
    jc: opts.jc || 'center',
    spacing: SPACING_CAIXA,
    border: BORDA_CAIXA,
    shading: SHADING_CAIXA,
  });
  const r = texto ? run(texto, { bold: opts.bold, size: opts.size || 18 }) : '';
  return `<w:p>${pr}${r}</w:p>`;
}

/* ════════════════════════════════════════════════════════════
   TÍTULOS DE SECÇÃO (numId=3 → romano automático)
   bold + sublinhado, ind left=567 hanging=425
════════════════════════════════════════════════════════════ */
function paraTituloSec(texto) {
  const pr = pPr({
    jc: 'both',
    spacing: 'w:after="0" w:line="360" w:lineRule="auto"',
    ind: 'w:left="567" w:hanging="425"',
    numId: 3,
    ilvl: 0,
  });
  return `<w:p>${pr}${run(texto, { bold: true, underline: true })}</w:p>`;
}

/* Referência legal (7pt, itálico, indentado) */
function paraRefLegal(texto) {
  const pr = pPr({
    jc: 'both',
    spacing: 'w:after="120" w:line="360" w:lineRule="auto"',
    ind: 'w:firstLine="567"',
  });
  return `<w:p>${pr}${run(texto, { italic: true, size: 14 })}</w:p>`;
}

/* ════════════════════════════════════════════════════════════
   ALÍNEAS (numId=1 → letra automática a. b. c.)
   bold, ind left=567 hanging=567
   restart=true → força reinício da contagem nesta alínea
════════════════════════════════════════════════════════════ */
function paraAlinea(texto, restart = false) {
  // Para reiniciar: inserir parágrafo fantasma com numId=0 antes (chamado externamente)
  // ou usar w:numId val=1 com w:lvlOverride via parágrafo vazio antes.
  const pr = pPr({
    jc: 'both',
    spacing: 'w:after="0" w:line="360" w:lineRule="auto"',
    ind: 'w:left="567" w:hanging="567"',
    numId: 1,
    ilvl: 0,
  });
  return (restart ? paraResetLista() : '') + `<w:p>${pr}${run(texto, { bold: true })}</w:p>`;
}

/* Parágrafo invisível que reinicia a lista lowerLetter (numId=1) */
function paraResetLista() {
  return '<w:p>'
    + '<w:pPr>'
    + '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
    + '<w:ind w:left="567" w:hanging="567"/>'
    + '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>'
    + '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>'
    + '</w:pPr>'
    + '</w:p>';
}

/* ════════════════════════════════════════════════════════════
   ITEMS DE IDENTIFICAÇÃO (numId=2 → bullet –)
   chave sublinhada, ind left=851 hanging=284
════════════════════════════════════════════════════════════ */
function paraItem(chave, valor, highlight = false) {
  const pr = pPr({
    jc: 'both',
    spacing: 'w:after="60" w:line="360" w:lineRule="auto"',
    ind: 'w:left="851" w:hanging="284"',
    numId: 2,
    ilvl: 0,
  });
  const valXml = highlight || valor == null
    ? run(' ') + runHighlight('[indicar]')
    : run(' ' + valor);
  return `<w:p>${pr}${run(chave + ':', { underline: true })}${valXml}</w:p>`;
}

/* paraItem com valor em highlight (para campos a preencher) */
function paraItemHL(chave) {
  return paraItem(chave, null, true);
}


/* ════════════════════════════════════════════════════════════
   TABELAS
   Larguras e bordas conforme o documento de exemplo.
════════════════════════════════════════════════════════════ */
// Larguras: col1=2410, col2=4253, col3=1841  (total 8504 DXA, igual ao exemplo)
const TC1 = 2410, TC2 = 4253, TC3 = 1841;
const TC_TOTAL = TC1 + TC2 + TC3;

const BRD_NONE  = '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
               + '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
               + '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
               + '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>';

/* ── Bordas das células de dados (exactamente como no exemplo) ──────────────
   Regras do exemplo:
   · Cabeçalho: top=nil; bottom=sz4; left=nil (col1) ou sz4 (col2/3); right=sz4 (col1/2) ou nil (col3)
   · Dados normais: top=sz4, bottom=sz4, left=nil (col1) ou sz4 (col2/3), right=sz4 (col1/2) ou nil (col3)
   · Última linha de instância: idem mas bottom=sz12
   · Primeira linha após separador: top=sz12 (em vez de sz4)
   · Linha de total final: top=sz4, bottom=nil (sem linha inferior)
   As bordas são definidas por coluna e por variante (normal/thickBot/thickTop/total).
──────────────────────────────────────────────────────────────────────────── */

// col1: left=nil, right=sz4
function brdC1(top, bot) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="nil"/>`
       + `<w:bottom w:val="single" w:sz="${bot}" w:space="0" w:color="auto"/>`
       + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
}
// col2: left=sz4, right=sz4
function brdC2(top, bot) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
       + `<w:bottom w:val="single" w:sz="${bot}" w:space="0" w:color="auto"/>`
       + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
}
// col3: left=sz4, right=nil
function brdC3(top, bot) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
       + `<w:bottom w:val="single" w:sz="${bot}" w:space="0" w:color="auto"/>`
       + `<w:right w:val="nil"/>`;
}
// col3 com bottom=nil (linha de total final — sem linha inferior)
function brdC3Total(top) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
       + `<w:bottom w:val="nil"/>`
       + `<w:right w:val="nil"/>`;
}
function brdC1Total(top) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="nil"/>`
       + `<w:bottom w:val="nil"/>`
       + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
}
function brdC2Total(top) {
  return `<w:top w:val="single" w:sz="${top}" w:space="0" w:color="auto"/>`
       + `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
       + `<w:bottom w:val="nil"/>`
       + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
}

// Cabeçalho: top=nil
const BRD_HEAD_FIRST = `<w:top w:val="nil"/><w:left w:val="nil"/>`
                     + `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
                     + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
const BRD_HEAD_MID   = `<w:top w:val="nil"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
                     + `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
                     + `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
const BRD_HEAD_LAST  = `<w:top w:val="nil"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
                     + `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
                     + `<w:right w:val="nil"/>`;

// Highlight amarelo para campos a preencher
function runHighlight(texto) {
  return `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/>`
    + `<w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>`
    + `<w:highlight w:val="yellow"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

// Versão para notas de rodapé (tamanho 14 = 7pt)
function runHighlightFn(texto) {
  return `<w:r><w:rPr><w:sz w:val="14"/><w:szCs w:val="14"/>`
    + `<w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>`
    + `<w:highlight w:val="yellow"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

/* célula genérica: recebe o XML de borda já calculado externamente */
function tCell(runsXml, width, align, brdXml) {
  return `<w:tc>`
    + `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>`
    + `<w:tcBorders>${brdXml}</w:tcBorders>`
    + `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/>`
    + `<w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>`
    + `</w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="${align}"/>`
    + `<w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr>`
    + runsXml
    + `</w:p></w:tc>`;
}

function tRowHead() {
  return `<w:tr>`
    + tCell(run('Tipo de Despesa',                   { bold: true }), TC1, 'center', BRD_HEAD_FIRST)
    + tCell(run('Fase Processual / Peça Processual', { bold: true }), TC2, 'center', BRD_HEAD_MID)
    + tCell(run('Montante',                          { bold: true }), TC3, 'center', BRD_HEAD_LAST)
    + `</w:tr>`;
}

/* linha de dados
   topSz:  espessura do top (4 = normal, 12 = após separador de instância)
   botSz:  espessura do bottom (4 = normal, 12 = separador de instância, 0 = linha de total final)
*/
function tRowData(col1, col2, col3, opts = {}) {
  const { topSz = 4, botSz = 4, isTotal = false } = opts;
  function toXml(v, bold) {
    if (typeof v !== 'string') return v || '';
    if (v === '') return '';
    if (v.startsWith('<w:') || v.includes('</w:')) return v;
    return run(v, { bold });
  }
  // Linha de total final: sem bottom (botSz=0 → usar brdC*Total)
  const useTotalBrd = botSz === 0;
  const b1 = useTotalBrd ? brdC1Total(topSz) : brdC1(topSz, botSz);
  const b2 = useTotalBrd ? brdC2Total(topSz) : brdC2(topSz, botSz);
  const b3 = useTotalBrd ? brdC3Total(topSz) : brdC3(topSz, botSz);
  return `<w:tr>`
    + tCell(toXml(col1, isTotal), TC1, 'center', b1)
    + tCell(toXml(col2, isTotal), TC2, 'center', b2)
    + tCell(toXml(col3, isTotal), TC3, 'center', b3)
    + `</w:tr>`;
}

/* linha de subtotal (itálico + cinzento) — mesmas bordas de dados normais */
function tRowSubtotal(label, valor, topSz = 4) {
  const rXml = run(label, { italic: true, color: '808080' });
  const vXml = run(valor, { italic: true, color: '808080' });
  return `<w:tr>`
    + tCell(rXml, TC1, 'center', brdC1(topSz, 4))
    + tCell('',   TC2, 'center', brdC2(topSz, 4))
    + tCell(vXml, TC3, 'center', brdC3(topSz, 4))
    + `</w:tr>`;
}

function mkTable(rows) {
  return `<w:tbl>`
    + `<w:tblPr>`
    + `<w:tblW w:w="0" w:type="auto"/>`
    + `<w:tblBorders>${BRD_NONE}</w:tblBorders>`
    + `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>`
    + `</w:tblPr>`
    + `<w:tblGrid>`
    + `<w:gridCol w:w="${TC1}"/><w:gridCol w:w="${TC2}"/><w:gridCol w:w="${TC3}"/>`
    + `</w:tblGrid>`
    + rows.join('')
    + `</w:tbl>`;
}

/* ════════════════════════════════════════════════════════════
   GERAÇÃO DO document.xml
════════════════════════════════════════════════════════════ */

/**
 * Devolve o nome de exibição de uma parte.
 * Para litisconsórcio com múltiplos membros: "A, B e C".
 * Para os restantes casos: parte.nome.
 */
function nomeParteDisplay(parte) {
  if (!parte) return '';
  if (parte.relacao === 'litis' && parte.membros && parte.membros.length > 1) {
    const nomes = parte.membros.map(m => m.nome || '').filter(Boolean);
    if (nomes.length === 0) return parte.nome || '';
    if (nomes.length === 1) return nomes[0];
    const ultimo = nomes[nomes.length - 1];
    return nomes.slice(0, -1).join(', ') + ' e ' + ultimo;
  }
  return parte.nome || '';
}

function gerarDocumentXml(r, st, nota) {
  const cliente = r.cliente;

  // Parte vencedora: cliente (pode estar em litisconsórcio)
  const nomeVencedor = nomeParteDisplay(cliente) || 'Parte vencedora';

  // Parte vencida: identificar a parte pelo parteId da nota e expandir litis se necessário
  const parteVencida = r.todasPartes?.find(p => p.id === nota.parteId);
  const nomeVencido  = (parteVencida ? nomeParteDisplay(parteVencida) : '') || nota.nome || nota.grupo || 'Parte vencida';
  const numProcesso  = st.numProcesso || '[N.º do processo]';
  const tribunal     = st.tribunal    || '[Tribunal]';
  // mandatário preenchido directamente na nota (campo com highlight)

  /* footnote counter — começa em 1 */
  let fnId = 0;
  const footnotes = []; // { id, xml }

  function addFn(xmlConteudo) {
    fnId++;
    footnotes.push({ id: fnId, xml: xmlConteudo });
    return fnRef(fnId);
  }

  function addFnTexto(texto) {
    return addFn(run(texto, { size: 14 }));
  }
  function addFnMisto(runs) {
    // runs: array de {texto, opts}
    const xml = runs.map(r => run(r.texto, { size: 14, ...r.opts })).join('');
    return addFn(xml);
  }

  const paras = [];

  /* ── Cabeçalho ── */
  // Data: obtida do sistema no momento da geração
  const hoje = new Date();
  const dataDoc = hoje.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });

  paras.push(paraCaixa(''));
  paras.push(paraCaixa('NOTA DISCRIMINATIVA E JUSTIFICATIVA DE CUSTAS DE PARTE', { bold: true }));
  paras.push(paraCaixa(nomeVencedor, { bold: true }));
  paras.push(paraCaixa(nomeVencido, { size: 14 }));
  paras.push(paraCaixa(''));
  paras.push(paraEsp(80));
  paras.push(para(
    pPr({ jc: 'center', spacing: 'w:after="200" w:line="360" w:lineRule="auto"' }),
    run('Nos termos e para os efeitos do Regulamento de Custas Processuais (“RCP”).')
  ));

  /* ── SECÇÃO I ── */
  paras.push(paraTituloSec('Identificação das partes, do processo e dos mandatários'));
  paras.push(paraRefLegal('Artigo 25.º, n.º 2, al. a), do RCP'));
  paras.push(paraAlinea('Identificação das partes'));
  paras.push(paraItem('Parte vencedora', nomeVencedor));
  paras.push(paraItem('Parte vencida', nomeVencido));
  paras.push(paraEsp(80));
  paras.push(paraAlinea('Identificação do processo'));
  paras.push(paraItem('Tribunal', tribunal));
  paras.push(paraItem('Processo', numProcesso));
  paras.push(paraEsp(80));
  paras.push(paraAlinea('Identificação dos mandatários'));
  paras.push(paraItemHL('Parte vencedora'));
  paras.push(paraItem('Parte vencida', null, true)); // highlight — preencher na nota
  paras.push(paraEsp(160));

  /* ── SECÇÃO II ── */
  paras.push(paraTituloSec('Identificação das taxas de justiça e encargos devidos pelas partes'));
  paras.push(paraRefLegal('Artigo 25.º, n.º 2, als. b) e c), do RCP'));

  // Tabela a) — vencedor
  // nextTopSz: controla a espessura do top da linha seguinte (12 após separador de instância)
  const rowsVenc = [tRowHead()];
  let totalTJVenc = 0, totalEncVenc = 0;
  let nextTopVenc = 4;
  r.instDetalhe.forEach(inst => {
    const lbl    = TIPOS_PRINCIPAIS.find(t => t.v === inst.tipo)?.l || inst.tipo;
    const tpCli  = inst.tjPartesCorrigidas?.find(tp => tp.partId === cliente.id);
    const tjPaga = tpCli?.tjPaga || 0;
    const remEf  = tpCli?.remEfectivo || 0;
    const disp   = inst.dispensaRem > 0 ? ' (dispensa ' + fmtPctDoc(inst.dispensaRem) + ')' : '';
    const isLastRow = remEf <= 0; // a última linha desta instância tem linha grossa (botSz=12)
    if (tjPaga > 0) {
      rowsVenc.push(tRowData('Taxa de Justiça', lbl, fmtEuroDoc(tjPaga), { topSz: nextTopVenc, botSz: isLastRow ? 12 : 4 }));
      nextTopVenc = isLastRow ? 12 : 4;
      totalTJVenc += tjPaga;
    }
    if (remEf > 0) {
      const fn = addFn(
          run('Estimativa do remanescente conforme art. 6.º, n.º 7, do RCP — ' + lbl + disp + '. Ref.ª Citius ', { size: 14 })
          + runHighlightFn('[indicar]')
          + run('.', { size: 14 })
        );
      rowsVenc.push(tRowData(run('Remanescente') + fn, lbl, fmtEuroDoc(remEf), { topSz: nextTopVenc, botSz: 12 }));
      nextTopVenc = 12;
      totalTJVenc += remEf;
    }
  });
  if (r.encargos?.length > 0) {
    const encs = r.encargos;
    encs.forEach((enc, idx) => {
      const isLast = idx === encs.length - 1;
      rowsVenc.push(tRowData('Encargos', enc.desc, fmtEuroDoc(enc.val), { topSz: nextTopVenc, botSz: isLast ? 12 : 4 }));
      nextTopVenc = isLast ? 12 : 4;
      totalTJVenc += 0; // encargos não entram no total de TJ
      totalEncVenc += enc.val;
    });
  }
  rowsVenc.push(tRowSubtotal('Total Taxas',    fmtEuroDoc(totalTJVenc),  nextTopVenc));
  rowsVenc.push(tRowSubtotal('Total Encargos', fmtEuroDoc(totalEncVenc), 4));

  paras.push(paraAlinea('Pelas partes vencedoras', true));
  paras.push(paraEsp(80));
  paras.push(mkTable(rowsVenc));
  paras.push(paraEsp(160));

  // Tabela b) — vencida
  const rowsVd = [tRowHead()];
  let totalTJVd = 0;
  let nextTopVd = 4;
  r.instDetalhe.forEach(inst => {
    const lbl    = TIPOS_PRINCIPAIS.find(t => t.v === inst.tipo)?.l || inst.tipo;
    const tpV    = inst.tjPartesCorrigidas?.find(tp => tp.partId === nota.parteId);
    const tjPaga = tpV?.tjPaga || 0;
    const remEf  = tpV?.remEfectivo || 0;
    const disp   = inst.dispensaRem > 0 ? ' (dispensa ' + fmtPctDoc(inst.dispensaRem) + ')' : '';
    const isLastRow = remEf <= 0;
    if (tjPaga > 0) {
      rowsVd.push(tRowData('Taxa de Justiça', lbl, fmtEuroDoc(tjPaga), { topSz: nextTopVd, botSz: isLastRow ? 12 : 4 }));
      nextTopVd = isLastRow ? 12 : 4;
      totalTJVd += tjPaga;
    }
    if (remEf > 0) {
      const fn = addFnTexto('Estimativa do remanescente da parte vencida conforme art. 6.º, n.º 7, do RCP — ' + lbl + disp + '.');
      rowsVd.push(tRowData(run('Remanescente') + fn, lbl, fmtEuroDoc(remEf), { topSz: nextTopVd, botSz: 12 }));
      nextTopVd = 12;
      totalTJVd += remEf;
    }
  });
  rowsVd.push(tRowSubtotal('Total Taxas', fmtEuroDoc(totalTJVd), nextTopVd));

  paras.push(paraAlinea('Pela parte vencida'));
  paras.push(paraEsp(80));
  paras.push(mkTable(rowsVd));
  paras.push(paraEsp(160));

  /* ── SECÇÃO III ── */
  paras.push(paraTituloSec('Identificação da compensação da parte vencedora face às despesas com honorários do mandatário judicial'));
  paras.push(paraRefLegal('Artigos 25.º, n.º 2, al. d), e 26.º, n.º 3, al. c), do RCP'));

  const tjVencBase = r.tjBasePagaCliente;
  const limComp    = (tjVencBase + totalTJVd) * 0.5;
  const fnRubrC    = addFnTexto('Nos termos e para os efeitos do disposto no artigo 26.º, n.º 3, al. c), do RCP.');

  paras.push(paraEsp(80));
  paras.push(mkTable([
    tRowHead(),
    tRowData('Taxas de Justiça — Parte Vencedora', 'Total', fmtEuroDoc(tjVencBase), { topSz: 4, botSz: 4 }),
    tRowData('Taxas de Justiça — Parte Vencida',   'Total', fmtEuroDoc(totalTJVd),  { topSz: 4, botSz: 4 }),
    tRowData(run('Total (50%)') + fnRubrC, '', fmtEuroDoc(limComp), { topSz: 4, botSz: 0, isTotal: true }),
  ]));
  paras.push(paraEsp(160));

  /* ── SECÇÃO IV ── */
  paras.push(paraTituloSec('Identificação do valor a receber a título de custas de parte'));
  paras.push(paraRefLegal('Artigos 25.º, n.º 2, al. e), e 26.º do RCP'));

  // Footnote Rubrica A — critério único: proporcional ao decaimento individual
  const tjCliTotal = r.tjBasePagaCliente;
  const pctDecNota = fmtPctDoc(nota.coefParte * 100);
  const somaDecFn = r.notasIndividuais.reduce((s, n) => s + n.coefParte, 0);
  const somaDecLabel = fmtPctDoc(somaDecFn * 100);
  const textoFnA = 'Correspondente a ' + fmtFracao(nota.pesoRubrA)
    + ' da taxa de justiça efetivamente liquidada pela parte vencedora'
    + ' – EUR ' + tjCliTotal.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' –,'
    + ' calculada proporcionalmente ao decaimento individual de ' + nomeVencido
    + ' (' + pctDecNota + ') face à soma dos decaimentos de todos os vencidos (' + somaDecLabel + '),'
    + ' para que, desta forma, a parte vencedora não obtenha qualquer enriquecimento face ao montante efetivamente pago.'
    + (r.encargos?.length > 0 ? ' O mesmo critério foi aplicado aos encargos (Rubrica B).' : '');
  const fnA = addFnTexto(textoFnA);

  const decLabel = nota.coefParte * 100 === 100 ? 'Total' : fmtPctDoc(nota.coefParte * 100);

  paras.push(paraEsp(80));
  const rowsIV = [tRowHead()];
  rowsIV.push(tRowData(run('Taxa de Justiça (Rubrica A)') + fnA, '', fmtEuroDoc(nota.rubrA), { topSz: 4, botSz: 4 }));
  if (nota.rubrB > 0) rowsIV.push(tRowData('Encargos (Rubrica B)', '', fmtEuroDoc(nota.rubrB), { topSz: 4, botSz: 4 }));
  rowsIV.push(tRowData('Compensação de honorários (Rubrica C)', '', fmtEuroDoc(nota.rubrC), { topSz: 4, botSz: 4 }));
  rowsIV.push(tRowData(run('Total (' + decLabel + ')', { bold: true }), '', fmtEuroDoc(nota.total), { topSz: 4, botSz: 0, isTotal: true }));
  paras.push(mkTable(rowsIV));
  paras.push(paraEsp(240));

  /* ── Parágrafo final ── */
  // Footnote reserva de retificação
  const fnRes = addFnMisto([
    { texto: 'A parte vencedora reserva-se o direito de retificar a presente nota nos termos e para os efeitos do artigo 25.º, n.º 1, ' },
    { texto: 'in fine', opts: { italic: true } },
    { texto: ', do RCP.' },
  ]);

  paras.push(para(
    pPr({ jc: 'both', spacing: 'w:after="320" w:line="360" w:lineRule="auto"' }),
    run('Atendendo à presente '),
    run('Nota Discriminativa e Justificativa de Custas de Parte', { bold: true }),
    run(' e aos cálculos elaborados e melhor discriminados '),
    run('supra', { italic: true }),
    run(', deverá ' + nomeVencido + ' proceder à liquidação a ' + nomeVencedor + ' da quantia total de '),
    run(fmtEuroDoc(nota.total), { bold: true, underline: true }),
    run(', mediante transferência bancária para o IBAN n.º '),
    runHighlight('[indicar]'),
    run(', sendo remetido o respetivo comprovativo para o e-mail: '),
    runHighlight('[indicar]'),
    run('.'),
    fnRes
  ));
  paras.push(paraEsp(480));
  paras.push(para(
    pPr({ jc: 'left', spacing: 'w:after="120" w:line="360" w:lineRule="auto"' }),
    runHighlight('[Local]'), run(', ' + dataDoc)
  ));
  paras.push(paraEsp(240));
  paras.push(para(
    pPr({ jc: 'left', spacing: 'w:after="360" w:line="360" w:lineRule="auto"' }),
    run('O Advogado,')
  ));
  paras.push(para(
    pPr({ jc: 'left' }),
    runHighlight('[Nome do advogado]')
  ));

  /* ── Rodapé: só número de página, Verdana 8pt, preto, lado direito ── */
  const footerXml = `<w:ftr ${W_NS}>`
    + `<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="right"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="000000"/></w:rPr>`
    + `<w:fldChar w:fldCharType="begin"/></w:r>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="000000"/></w:rPr>`
    + `<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="000000"/></w:rPr>`
    + `<w:fldChar w:fldCharType="end"/></w:r>`
    + `</w:p></w:ftr>`;

  /* ── Montar footnotes.xml ── */
  const fnSeps = `<w:footnote w:type="separator" w:id="-1">`
    + `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>`
    + `<w:r><w:separator/></w:r></w:p></w:footnote>`
    + `<w:footnote w:type="continuationSeparator" w:id="0">`
    + `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>`
    + `<w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`;

  const fnCorpo = footnotes.map(fn => {
    return `<w:footnote w:id="${fn.id}">`
      + `<w:p><w:pPr><w:pStyle w:val="FootnoteText"/><w:jc w:val="both"/></w:pPr>`
      + `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>`
      + `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>`
      + `<w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>`
      + fn.xml
      + `</w:p></w:footnote>`;
  }).join('');

  const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:footnotes ${W_NS}>${fnSeps}${fnCorpo}</w:footnotes>`;

  /* ── Montar document.xml ── */
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document ${W_NS}><w:body>`
    + paras.join('')
    + `<w:sectPr>`
    + `<w:footerReference w:type="default" r:id="rId6"/>`
    + `<w:pgSz w:w="11906" w:h="16838"/>`
    + `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>`
    + `</w:sectPr>`
    + `</w:body></w:document>`;

  return { docXml, footnotesXml, footerXml };
}

/* ════════════════════════════════════════════════════════════
   MONTAGEM DO ZIP (.docx)
   Usa JSZip se disponível, senão implementação mínima com
   a API nativa de Blob + streams do browser.
════════════════════════════════════════════════════════════ */

/* Versão com JSZip (carregado via CDN) ou fallback manual */
async function montarDocx(docXml, footnotesXml, footerXml, numProcesso) {
  // Ficheiros estáticos minimais para um .docx válido
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    + `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
    + `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`
    + `<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>`
    + `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`
    + `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
    + `</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`
    + `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>`
    + `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`
    + `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`
    + `<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`
    + `</Relationships>`;

  const endnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:endnotes ${W_NS}>`
    + `<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>`
    + `<w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>`
    + `</w:endnotes>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:zoom w:percent="100"/>`
    + `<w:defaultTabStop w:val="709"/>`
    + `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>`
    + `</w:settings>`;

  // Styles e numbering vêm do template estático
  const stylesXml   = TMPL_STYLES;
  const numberingXml = TMPL_NUMBERING;

  // Montar o ZIP com JSZip
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  zip.file('word/footnotes.xml', footnotesXml);
  zip.file('word/endnotes.xml', endnotes);
  zip.file('word/footer1.xml', footerXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/numbering.xml', numberingXml);
  zip.file('word/settings.xml', settings);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ════════════════════════════════════════════════════════════
   EXPORT PRINCIPAL
════════════════════════════════════════════════════════════ */
async function exportarNotas() {
  if (typeof JSZip === 'undefined') {
    alert('Erro: a biblioteca JSZip não está carregada. Recarregue a página.');
    return;
  }
  const st = collectState();
  if (!st.cliente || st.valorAcao <= 0) {
    alert('Preencha o valor da ação e os dados das partes antes de exportar.');
    return;
  }
  const r = computeResult(st);
  if (!r || r.notasIndividuais.length === 0) {
    alert('Não existem partes vencidas — nenhuma nota a gerar.');
    return;
  }
  // Verificar se há pelo menos uma instância com TJ > 0
  const temTJ = r.instDetalhe?.some(inst =>
    inst.tjPartesCorrigidas?.some(tp => tp.tjPaga > 0)
  );
  if (!temTJ) {
    if (!confirm('Nenhuma taxa de justiça foi introduzida.\nA nota será gerada com tabelas vazias. Continuar?')) return;
  }
  // Aviso de não-enriquecimento
  if (!r.naoEnriquecimento) {
    if (!confirm('⚠ A soma das Rubricas A excede a TJ efetivamente paga.\nVerifique os dados antes de apresentar em juízo. Continuar na mesma?')) return;
  }

  const nNotas = r.notasIndividuais.length;
  if (nNotas > 1) {
    const ok = confirm(
      'Serão gerados ' + nNotas + ' ficheiros .docx (um por parte vencida).\n\n' +
      'O browser irá iniciar ' + nNotas + ' transferências seguidas — confirme os downloads se solicitado.'
    );
    if (!ok) return;
  }

  const btn = document.getElementById('btnExportar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4v12M4 10h12"/></svg> A gerar…';
  }
  try {
    for (let i = 0; i < r.notasIndividuais.length; i++) {
      const nota = r.notasIndividuais[i];
      const { docXml, footnotesXml, footerXml } = gerarDocumentXml(r, st, nota);
      const blob = await montarDocx(docXml, footnotesXml, footerXml, st.numProcesso);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      // Formato: [N.º processo]_NDJCP_[Nome da parte vencedora].docx
      // Se houver múltiplas notas (vários vencidos), acrescentar o nome do vencido
      // para evitar sobreposição de ficheiros.
      const safe = s => (s || '').replace(/[\/\\:*?"<>|]/g, '-').trim();
      const numProc      = safe(st.numProcesso) || safe(nomeParteDisplay(r.cliente)) || 'processo';
      const nomeVenc     = safe(nomeParteDisplay(r.cliente)) || 'vencedor';
      const parteVencidaFn = r.todasPartes?.find(p => p.id === nota.parteId);
      // Para coligação: usar o nome do membro individual (nota.nome), não o nome do grupo
      const nomeVencidoFn = safe(
        parteVencidaFn?.relacao === 'colig'
          ? (nota.nome || nomeParteDisplay(parteVencidaFn))
          : (parteVencidaFn ? nomeParteDisplay(parteVencidaFn) : (nota.nome || ''))
      );
      // Sufixo sempre presente quando há múltiplas notas (coligação, litis, etc.)
      const sufixo = r.notasIndividuais.length > 1
        ? '_c_' + (nomeVencidoFn || ('nota' + (i + 1)))
        : '';
      a.download = numProc + '_NDJCP_' + nomeVenc + sufixo + '.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (i < r.notasIndividuais.length - 1) await new Promise(res => setTimeout(res, 300));
    }
  } catch (err) {
    console.error('Erro ao gerar nota:', err);
    alert('Erro ao gerar o documento: ' + err.message + '\n\nConsulte a consola para mais detalhes.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13v4h12v-4M10 3v9M6 8l4 4 4-4"/></svg> Exportar nota (.docx)';
    }
  }
}
