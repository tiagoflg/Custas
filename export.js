/* ═══════════════════════════════════════════════════════════════
   Custas — export.js  (v5 — geração de XML puro, sem biblioteca)
   O .docx é construído directamente como ZIP com XML válido,
   usando os ficheiros estáticos do template como base.
═══════════════════════════════════════════════════════════════ */

/* ── Formatação ── */
function fmtEuroDoc(v) {
  const rounded = Math.round((v || 0) * 100) / 100;
  const [intPart, decPart] = rounded.toFixed(2).split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'EUR ' + intFormatted + ',' + decPart;
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
function tRowSubtotal(label, valor, topSz = 4, fnXml = '', fase = '') {
  const rXml = run(label, { italic: true, color: '808080' }) + fnXml;
  const c2Xml = fase ? run(fase, { italic: true, color: '808080' }) : '';
  const vXml = run(valor, { italic: true, color: '808080' });
  return `<w:tr>`
    + tCell(rXml,  TC1, 'center', brdC1(topSz, 4))
    + tCell(c2Xml, TC2, 'center', brdC2(topSz, 4))
    + tCell(vXml,  TC3, 'center', brdC3(topSz, 4))
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

/* ── Designação da fase / peça processual (segue o modelo PLMJ) ──
   - designação livre da instância (Passo 2), se preenchida
   - 1.ª instância: peça da parte (Petição Inicial / Contestação), conforme a posição processual
   - incidente de intervenção de terceiros: "Intervenção de Terceiros"
   - restantes: nome do tipo de instância                                   */
function faseBase(inst) {
  if (inst.designacao) return inst.designacao;
  if (/^interv_/.test(inst.subtipo || '')) return 'Intervenção de Terceiros';
  const l = TIPOS_PRINCIPAIS.find(t => t.v === inst.tipo)?.l || inst.tipo;
  return l.replace(/\s*\(Tab\. II\)$/, '');
}
function pecaDe(inst, parte) {
  if (inst.designacao) return inst.designacao;
  if (inst.tipo === '1inst') {
    if (parte?.posicao === 'autor') return 'Petição Inicial';
    if (parte?.posicao === 'reu' || parte?.posicao === 'interv') return 'Contestação';
    return '1.ª Instância';
  }
  return faseBase(inst);
}
function faseIncidente(inst) {
  const b = faseBase(inst);
  return (inst.tipo === 'incidente' || /^interv_/.test(inst.subtipo || '')) && !/^incidente/i.test(b)
    ? 'Incidente de ' + b : b;
}
function faseGrupoIII(insts) {
  return insts.map(i => i.tipo === '1inst' ? '1.ª Instância' : faseIncidente(i)).join(' / ');
}
function faseGrupoIV(insts, parteVencida, cliente) {
  return insts.map(i => {
    if (i.tipo !== '1inst') return faseIncidente(i);
    const a = pecaDe(i, parteVencida), b = pecaDe(i, cliente);
    return a === b ? a : a + ' / ' + b;
  }).join(' / ');
}

function gerarDocumentXml(r, st, nota) {
  const cliente = r.cliente;

  // Parte vencedora: cliente (pode estar em litisconsórcio)
  const nomeVencedor = nomeParteDisplay(cliente) || 'Parte vencedora';

  // Parte vencida: identificar a parte pelo parteId da nota e expandir litis se necessário
  const parteVencida = r.todasPartes?.find(p => p.id === nota.parteId);
  // Coligação: cada membro tem nota própria — identificar o membro, não o grupo
  const nomeVencido  = (nota.membroId != null && nota.nome)
    ? nota.nome
    : ((parteVencida ? nomeParteDisplay(parteVencida) : '') || nota.nome || nota.grupo || 'Parte vencida');
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
  if (st.valorAcao > 0) {
    const coligs = (r.todasPartes || []).filter(p => p.relacao === 'colig' && p.membros?.some(m => m.valorPedido > 0));
    const pedidos = coligs.flatMap(p => p.membros.filter(m => m.valorPedido > 0));
    const somaPed = pedidos.reduce((s2, m) => s2 + m.valorPedido, 0);
    let fnValor = '';
    const valorBaseColig = r.reconvencao ? r.reconvencao.valorPedidoAutor : st.valorAcao;
    if (r.reconvencao) {
      fnValor = addFnTexto('Correspondente à soma do valor do pedido do autor (' + fmtEuroDoc(r.reconvencao.valorPedidoAutor)
        + ') com o valor do pedido reconvencional (' + fmtEuroDoc(r.reconvencao.valorReconv)
        + '), nos termos do artigo 299.º, n.º 2, do CPC.');
    } else if (pedidos.length > 1 && Math.abs(somaPed - valorBaseColig) < 0.01) {
      const lista = pedidos.map(m => (m.nome || 'Membro') + ' (' + fmtEuroDoc(m.valorPedido) + ')');
      const txt = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1] : lista[0];
      fnValor = addFn(run('Correspondente à soma dos pedidos de ' + txt + ', conforme ', { size: 14 })
        + runHighlightFn('[indicar]') + run('.', { size: 14 }));
    }
    paras.push(paraItem('Valor da ação', fmtEuroDoc(st.valorAcao)).replace('</w:p>', fnValor + '</w:p>'));
  }
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
  // Só as instâncias/incidentes em que esta parte vencida interveio (fases desta nota)
  const instIdsNota = new Set((nota.gruposDetalhe || []).filter(g => g.rubrA > 0 || g.rubrC > 0).flatMap(g => g.instIds || []));
  const instsNota   = instIdsNota.size ? r.instDetalhe.filter(i => instIdsNota.has(i.id)) : r.instDetalhe;
  instsNota.forEach(inst => {
    const lbl    = pecaDe(inst, cliente);
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
  const fnProporcaoTxt = 'Valor que apenas será imputado a título de compensação na proporção respetiva.';
  rowsVenc.push(tRowSubtotal('Total Taxas', fmtEuroDoc(totalTJVenc), nextTopVenc, addFnTexto(fnProporcaoTxt)));
  if (totalEncVenc > 0) rowsVenc.push(tRowSubtotal('Total Encargos', fmtEuroDoc(totalEncVenc), 4));

  paras.push(paraAlinea('Pelas partes vencedoras', true));
  paras.push(paraEsp(80));
  paras.push(mkTable(rowsVenc));
  paras.push(paraEsp(160));

  // Tabela b) — vencida
  const rowsVd = [tRowHead()];
  let totalTJVd = 0;
  let nextTopVd = 4;
  instsNota.forEach(inst => {
    const lbl = pecaDe(inst, parteVencida);
    const tpV = inst.tjPartesCorrigidas?.find(tp => tp.partId === nota.parteId);
    // Para coligação: usar TJ individual do membro; para litisconsórcio/autónomo: usar o grupo
    let tjPaga, remEf;
    if (nota.membroId != null && tpV?.membrosTJ) {
      const mtj = tpV.membrosTJ.find(m => m.membroId === nota.membroId);
      tjPaga = mtj?.tjPaga || 0;
      remEf  = mtj?.remEfectivo || 0;
    } else {
      tjPaga = tpV?.tjPaga || 0;
      remEf  = tpV?.remEfectivo || 0;
    }
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
  rowsVd.push(tRowSubtotal('Total Taxas', fmtEuroDoc(totalTJVd), nextTopVd, addFnTexto(fnProporcaoTxt)));

  paras.push(paraAlinea('Pela parte vencida'));
  paras.push(paraEsp(80));
  paras.push(mkTable(rowsVd));
  paras.push(paraEsp(160));

  /* ── SECÇÃO III ── */
  paras.push(paraTituloSec('Identificação da compensação da parte vencedora face às despesas com honorários do mandatário judicial'));
  paras.push(paraRefLegal('Artigos 25.º, n.º 2, al. d), e 26.º, n.º 3, al. c), do RCP'));

  const fnPortariaTxt = 'Nos termos e para os efeitos do disposto no artigo 32.º, n.º 2, da Portaria n.º 419-A/2009, de 17 de abril.';
  const pctDecNota = fmtPctDoc(nota.coefParte * 100);
  const fnDecIIITxt = 'Considerando o coeficiente de decaimento de ' + pctDecNota + '.';

  // Somatório TJ de todas as partes = limGlobal × 2 (limGlobal já é 50% do total)
  const somaTodasTJ   = r.limGlobal * 2;
  const limGlobal50   = r.limGlobal;  // 50% do somatório
  // Número efectivo de partes vencedoras (soma dos factores de vitória)
  const nEfectivo     = r.somaFactoresVitoria;
  const nEfectivoInt  = Math.abs(nEfectivo - Math.round(nEfectivo)) < 0.001;
  const limPorParte   = nEfectivo > 0 ? limGlobal50 / nEfectivo : limGlobal50;
  // Fase a mostrar na linha do somatório e na Secção IV
  const faseRubrC = r.instDetalhe?.length === 1
    ? (TIPOS_PRINCIPAIS.find(t => t.v === r.instDetalhe[0].tipo)?.l || r.instDetalhe[0].tipo)
    : 'Todas as instâncias';

  const rowsRubrC = [tRowHead()];
  // Uma tabela por fase autónoma (grupo de instâncias com as mesmas partes), como no
  // modelo: somatório das TJ de todas as partes → 50% → rateio pelos vencedores → total.
  // A TJ das restantes partes só entra aqui, e apenas na proporção respetiva (rodapé na Secção II).
  const gruposNota = (nota.gruposDetalhe || []).filter(g => g.rubrA > 0 || g.rubrC > 0);
  const somaCGr    = gruposNota.reduce((s2, g) => s2 + (g.rubrC || 0), 0);
  const escalaC    = somaCGr > 0 ? nota.rubrC / somaCGr : 1; // limite art. 26.º/5 RCP
  const coefTxt = g => {
    const coef = g.coefParte != null ? g.coefParte : nota.coefParte;
    if (nota.membroId != null && nota.proporcao) {
      return 'Considerando o coeficiente de decaimento concreto (' + fmtPctDoc(coef * 100) + ': decaimento de '
        + fmtPctDoc(coef / nota.proporcao * 100) + ' × proporção do pedido desta parte no total dos pedidos dos coligados, de '
        + fmtPctDoc(nota.proporcao * 100) + ' — art. 528.º, n.º 4, do CPC).';
    }
    return 'Considerando o coeficiente de decaimento concreto (' + fmtPctDoc(coef * 100) + ').';
  };
  const instsDe = g => (g.instIds || []).map(id => r.instDetalhe.find(i => i.id === id)).filter(Boolean);
  gruposNota.forEach((g, gi) => {
    const instsG = instsDe(g);
    const fase   = instsG.length ? faseGrupoIII(instsG) : (g.label || faseRubrC);
    const rows   = [tRowHead()];
    const fnRem  = g.temRem
      ? addFnTexto('Inclui o remanescente estimado da taxa de justiça (art. 6.º, n.º 7, do RCP), imputado a final à parte vencida (art. 14.º, n.º 9, do RCP), sujeito a retificação após notificação da conta de custas (art. 25.º, n.º 1, in fine, do RCP).')
      : '';
    rows.push(tRowData(run('Somatório da taxa de justiça de todas as partes') + fnRem, fase, fmtEuroDoc(g.limGlobal * 2), { topSz: 4, botSz: 4 }));
    rows.push(tRowSubtotal('Subtotal (50%)', fmtEuroDoc(g.limGlobal), 4, addFnTexto('Nos termos e para os efeitos do disposto no artigo 26.º, n.º 3, al. c), do RCP.')));
    const sfv = g.somaFV || 1, fvc = g.fvClienteGrupo != null ? g.fvClienteGrupo : 1;
    if (Math.abs(sfv - 1) > 1e-9 || fvc < 1 - 1e-9) {
      const nInt = Math.round(sfv);
      const lbl  = (Math.abs(sfv - nInt) < 1e-9 && fvc > 1 - 1e-9) ? 'Subtotal (50%/' + nInt + ')' : 'Limite individual';
      rows.push(tRowSubtotal(lbl, fmtEuroDoc(g.limIndivCliente), 4, addFnTexto(fnPortariaTxt)));
    }
    // Quando a parte vencedora também decaiu, o seu grau de vencimento já está refletido no
    // limite individual: a parte vencida responde por "peso" desse limite (não pelo coeficiente outra vez)
    const coefG = g.coefParte != null ? g.coefParte : nota.coefParte;
    const pesoG = g.peso != null ? g.peso : coefG;
    const fnTotIII = Math.abs(pesoG - coefG) > 1e-6
      ? addFnTexto('Considerando o coeficiente de decaimento concreto da parte vencida (' + fmtPctDoc(coefG * 100)
          + '), já refletido no limite individual da parte vencedora, correspondendo a parte vencida a '
          + fmtPctDoc(pesoG * 100) + ' desse limite.')
      : addFnTexto(coefTxt(g));
    rows.push(tRowData(run('Total', { bold: true }) + fnTotIII, '', fmtEuroDoc((g.rubrC || 0) * escalaC), { topSz: 4, botSz: 0, isTotal: true }));
    paras.push(paraEsp(80));
    paras.push(mkTable(rows));
    paras.push(paraEsp(gi === gruposNota.length - 1 ? 160 : 120));
  });

  /* ── SECÇÃO IV ── */
  paras.push(paraTituloSec('Identificação do valor a receber a título de custas de parte'));
  paras.push(paraRefLegal('Artigos 25.º, n.º 2, al. e), e 26.º do RCP'));

  const decLabel = nota.coefParte * 100 === 100 ? 'Total' : fmtPctDoc(nota.coefParte * 100);

  // Reconvenção: explicitar a derivação do coeficiente (ponderação pelo valor dos pedidos)
  if (r.reconvencao && parteVencida && parteVencida.decReconv != null) {
    const rc = r.reconvencao, VT = rc.valorPedidoAutor + rc.valorReconv;
    const fnStj = addFnTexto('Critério de ponderação pelo valor de cada pedido seguido, designadamente, no Acórdão do Supremo Tribunal de Justiça de 31.10.2023, proc. 3966/21.3T8GDM.P1.S1.');
    const linhaParte = (p, papel) => papel + ' — ação (' + fmtEuroDoc(rc.valorPedidoAutor) + '): ' + fmtPctDoc(p.decAcao)
      + '; reconvenção (' + fmtEuroDoc(rc.valorReconv) + '): ' + fmtPctDoc(p.decReconv)
      + '; decaimento global: ' + fmtPctDoc(p.decaimento) + '.';
    paras.push(para(
      pPr({ jc: 'both', spacing: 'w:after="120" w:line="360" w:lineRule="auto"' }),
      run('Havendo ação e reconvenção, o decaimento de cada parte corresponde à média dos decaimentos em cada pedido, ponderada pelo respetivo valor (' + fmtEuroDoc(VT) + ' no total):'),
      fnStj
    ));
    paras.push(paraItem('Parte vencida', linhaParte(parteVencida, nomeVencido).replace(nomeVencido + ' — ', '')));
    if (cliente.decReconv != null) paras.push(paraItem('Parte vencedora', linhaParte(cliente, nomeVencedor).replace(nomeVencedor + ' — ', '')));
  }

  paras.push(paraEsp(80));
  const rowsIV = [tRowHead()];
  gruposNota.forEach(g => {
    const instsG = instsDe(g);
    const fase   = instsG.length ? faseGrupoIV(instsG, parteVencida, cliente) : (g.label || faseRubrC);
    rowsIV.push(tRowData(run('Reembolso das taxas de justiça') + addFnTexto(coefTxt(g)), fase, fmtEuroDoc(g.rubrA || 0), { topSz: 4, botSz: 4 }));
    rowsIV.push(tRowData('Compensação de honorários', '', fmtEuroDoc((g.rubrC || 0) * escalaC), { topSz: 4, botSz: 4 }));
  });
  if (nota.rubrB > 0) rowsIV.push(tRowData('Encargos', '', fmtEuroDoc(nota.rubrB), { topSz: 4, botSz: 4 }));
  rowsIV.push(tRowData(run('Total', { bold: true }), '', fmtEuroDoc(nota.total), { topSz: 4, botSz: 0, isTotal: true }));
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
    run(', deverá a ' + nomeVencido + ' proceder à liquidação à minha Constituinte ' + nomeVencedor + ' da quantia total de '),
    run(fmtEuroDoc(nota.total), { bold: true, underline: true }),
    run(', mediante transferência para a conta titulada pela ' + nomeVencedor + ' junto do Banco '),
    runHighlight('[indicar]'),
    run(', com o IBAN '),
    runHighlight('[indicar]'),
    run(', sendo remetido o respetivo comprovativo para o e-mail: '),
    runHighlight('[indicar]'),
    run('.'),
    fnRes
  ));
  paras.push(paraEsp(480));
  paras.push(para(
    pPr({ jc: 'left', spacing: 'w:after="120" w:line="360" w:lineRule="auto"' }),
    run('Lisboa, ' + dataDoc)
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
    + `<w:headerReference w:type="default" r:id="rId7"/>`
    + `<w:footerReference w:type="default" r:id="rId6"/>`
    + `<w:headerReference w:type="first" r:id="rId8"/>`
    + `<w:footerReference w:type="first" r:id="rId6"/>`
    + `<w:pgSz w:w="11906" w:h="16838"/>`
    + `<w:pgMar w:top="2268" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="675" w:gutter="0"/>`
    + `<w:titlePg/>`
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
    + `<Default Extension="png" ContentType="image/png"/>`
    + `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
    + `<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
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
    + `<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`
    + `<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>`
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
  // Logótipo PLMJ: header2 = 1.ª página (bloco PL/MJ); header1 = páginas seguintes (faixa P L M J)
  zip.file('word/header1.xml', headerLogoXml(101, 'Logo PLMJ seguintes'));
  zip.file('word/header2.xml', headerLogoXml(102, 'Logo PLMJ primeira'));
  zip.file('word/_rels/header1.xml.rels', headerRelsXml('media/logo_seguintes.png'));
  zip.file('word/_rels/header2.xml.rels', headerRelsXml('media/logo_primeira.png'));
  zip.file('word/media/logo_seguintes.png', LOGO_SEGUINTES_PNG_B64, { base64: true });
  zip.file('word/media/logo_primeira.png', LOGO_PRIMEIRA_PNG_B64, { base64: true });
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/numbering.xml', numberingXml);
  zip.file('word/settings.xml', settings);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ════════════════════════════════════════════════════════════
   MODAL DE SELECÇÃO DE NOTAS
════════════════════════════════════════════════════════════ */

/**
 * Mostra o modal de seleção e devolve uma Promise que resolve com
 * um array dos índices selecionados, ou rejeita se o utilizador cancelar.
 */
function mostrarSelectorNotas(notas) {
  return new Promise((resolve, reject) => {
    const scrim  = document.getElementById('modalNotasScrim');
    const dialog = document.getElementById('modalNotas');
    const body   = document.getElementById('modalNotasBody');
    const btnOk  = document.getElementById('modalNotasGerar');
    const btnCan = document.getElementById('modalNotasCancelar');

    // Preencher lista
    body.innerHTML = '';
    notas.forEach((nota, i) => {
      const nome = nota.nome || nota.grupo || ('Nota ' + (i + 1));
      const sub  = nota.grupo && nota.nome ? nota.grupo : '';
      const row  = document.createElement('label');
      row.className = 'modal-nota-row';
      row.innerHTML =
        `<input type="checkbox" checked data-idx="${i}">` +
        `<div>` +
          `<div class="modal-nota-nome">${nome}</div>` +
          (sub ? `<div class="modal-nota-sub">${sub}</div>` : '') +
        `</div>`;
      body.appendChild(row);
    });

    // Abrir
    scrim.classList.add('open');
    dialog.classList.add('open');

    function fechar() {
      scrim.classList.remove('open');
      dialog.classList.remove('open');
      btnOk.removeEventListener('click', onOk);
      btnCan.removeEventListener('click', onCan);
      scrim.removeEventListener('click', onCan);
    }
    function onOk() {
      const indices = [...body.querySelectorAll('input[type="checkbox"]:checked')]
        .map(cb => parseInt(cb.dataset.idx, 10));
      fechar();
      if (indices.length === 0) { reject(new Error('nenhuma')); return; }
      resolve(indices);
    }
    function onCan() { fechar(); reject(new Error('cancelado')); }

    btnOk.addEventListener('click', onOk);
    btnCan.addEventListener('click', onCan);
    scrim.addEventListener('click', onCan);
  });
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

  // Selecção de notas: modal quando há mais de uma, directo quando há só uma
  let indicesSel;
  if (r.notasIndividuais.length > 1) {
    try {
      indicesSel = await mostrarSelectorNotas(r.notasIndividuais);
    } catch {
      return; // cancelado ou nenhuma selecionada
    }
  } else {
    indicesSel = [0];
  }

  const btn = document.getElementById('btnExportar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4v12M4 10h12"/></svg> A gerar…';
  }
  try {
    for (let ii = 0; ii < indicesSel.length; ii++) {
      const i    = indicesSel[ii];
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
      if (ii < indicesSel.length - 1) await new Promise(res => setTimeout(res, 300));
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
