/* ═══════════════════════════════════════════════════════════════
   Custas — app.js
═══════════════════════════════════════════════════════════════ */

const S = {
  step: 1,
  clienteId: null,
  parteIdx: 0,
  membroIdx: 0,
  instIdx: 0,
  encIdx: 0,
  partes: [],
  inst: [],
  enc: [],
};

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const num = (v, d = 0) => { const n = parseFloat(v); if (!Number.isFinite(n)) return d; return Math.round(n * 1e6) / 1e6; };

function getValorAcao() { return num($('#valorAcao')?.value); }
function getCliente()   { return S.partes.find(p => p.id === S.clienteId); }
function getRestantes() { return S.partes.filter(p => p.id !== S.clienteId); }
function getEstimarRem(){ return !!$('#estimarRem')?.checked; }

/* ══════════════════════════════════════════════════════════════
   PASSO 1 — Processo & Partes
══════════════════════════════════════════════════════════════ */

function addParte(isCliente = false) {
  const id = ++S.parteIdx;
  const membroId = ++S.membroIdx;
  const nRestantes = S.partes.filter(p => p.id !== S.clienteId).length;
  const parte = {
    id,
    nome: isCliente ? 'O meu cliente' : 'Parte ' + (nRestantes + 1),
    relacao: 'autonoma',
    decaimento: isCliente ? 0 : 100,
    decaimentoInst: {},       // decaimento específico por instância (instId → %)
    decPorInst: false,        // toggle: usa decaimento global ou por instância
    membros: [{ id: membroId, nome: isCliente ? 'Cliente' : 'Membro 1', valorPedido: 0, decaimento: null }],
  };
  S.partes.push(parte);
  if (isCliente) S.clienteId = id;
  renderParteRow(parte, isCliente);
  updateInstancias();
}

/* Gera a lista de nomes para uma parte em litisconsórcio */
function renderLitisNomesHTML(parte, isCliente) {
  const rows = parte.membros.map((m, idx) => {
    const podeRemover = parte.membros.length > 1;
    const placeholder = isCliente
      ? (idx === 0 ? 'ex: A, S.A.' : 'ex: B, Lda.')
      : (idx === 0 ? 'ex: Réu A' : 'ex: Réu B');
    return `
      <div class="litis-nome-row" id="litis-m-${m.id}">
        <input type="text" class="l-nome${idx === 0 ? ' p-nome' : ''}" data-pid="${parte.id}" data-mid="${m.id}"
          value="${m.nome}" placeholder="${placeholder}" />
        ${podeRemover ? `<button class="btn-x btn-x-sm" onclick="rmLitisMembro(${parte.id}, ${m.id})"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="litis-nomes-list" id="litis-nomes-${parte.id}">${rows}</div>
    <button class="btn-add-sub" style="margin-top:.35rem;" onclick="addLitisMembro(${parte.id})">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4v12M4 10h12"/></svg>
      Membro
    </button>`;
}

function addLitisMembro(parteId) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte || parte.relacao !== 'litis') return;
  const id = ++S.membroIdx;
  parte.membros.push({ id, nome: '', valorPedido: 0, decaimento: null });
  rerenderLitisNomes(parte);
  onAnyInput();
}

function rmLitisMembro(parteId, membroId) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte || parte.membros.length <= 1) return;
  parte.membros = parte.membros.filter(m => m.id !== membroId);
  // sincronizar parte.nome com primeiro membro
  if (parte.membros[0]) parte.nome = parte.membros[0].nome;
  rerenderLitisNomes(parte);
  onAnyInput();
}

function rerenderLitisNomes(parte) {
  const isCliente = parte.id === S.clienteId;
  const wrap = $('#litis-nomes-' + parte.id);
  if (!wrap) return;
  const parent = wrap.parentElement;
  // remover botão antigo e lista antiga
  const oldBtn = parent.querySelector('.btn-add-litis');
  if (oldBtn) oldBtn.remove();
  wrap.outerHTML = renderLitisNomesHTML(parte, isCliente);
  // rebind: os eventos de input ficam no listener geral do card
  const card = $('#parte-' + parte.id);
  if (card) card.addEventListener('input', e => onParteInput(e, parte.id, isCliente));
}

function renderParteRow(parte, isCliente) {
  const container = isCliente ? $('#clienteWrap') : $('#partesWrap');
  $('#parte-' + parte.id)?.remove();

  const div = document.createElement('div');
  div.className = 'parte-card';
  div.id = 'parte-' + parte.id;

  const isColig = parte.relacao === 'colig';
  const isLitis = parte.relacao === 'litis';
  const podeRemover = !isCliente && S.partes.filter(p => p.id !== S.clienteId).length > 1;

  div.innerHTML = `
    <div class="parte-card-head">
      <div class="field" style="flex:1;">
        <div class="label"><span>${isCliente ? 'Nome / identificação do cliente' : 'Nome / identificação'}</span></div>
        ${isLitis ? renderLitisNomesHTML(parte, isCliente) : `<input type="text" class="p-nome" value="${parte.nome}" placeholder="${isCliente ? 'ex: A, S.A.' : 'ex: Réu B'}" />`}
      </div>

      <div class="field" style="width:200px;">
        <div class="label"><span>Relação material</span></div>
        <select class="p-relacao" data-pid="${parte.id}">
          <option value="autonoma"${parte.relacao === 'autonoma' ? ' selected' : ''}>Parte autónoma</option>
          <option value="litis"${parte.relacao === 'litis' ? ' selected' : ''}>Litisconsórcio</option>
          <option value="colig"${parte.relacao === 'colig'  ? ' selected' : ''}>Coligação</option>
        </select>
      </div>
      <div class="field" style="width:130px;">
        <div class="label">
          <span>Decaimento global</span>
          <span class="label-help" data-tip="Valor por defeito. Pode ser sobreposto por instância no Passo 2.">default</span>
        </div>
        <div class="affix">
          <input type="number" class="p-dec" min="0" max="100" step="any" value="${parte.decaimento}" />
          <span class="affix-post">%</span>
        </div>
      </div>
      ${podeRemover ? `<button class="btn-x" onclick="rmParte(${parte.id})"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>` : '<div></div>'}
    </div>
    ${isColig ? `
    <div class="parte-membros" id="membros-${parte.id}">
      ${parte.membros.map((m, idx) => renderMembroHTML(parte, m, idx)).join('')}
    </div>
    <button class="btn-add-sub" onclick="addMembro(${parte.id})">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4v12M4 10h12"/></svg>
      Adicionar membro
    </button>` : ''}
  `;

  container.appendChild(div);
  div.addEventListener('input', e => onParteInput(e, parte.id, isCliente));
  div.querySelector('.p-relacao').addEventListener('change', e => onRelacaoChange(e, parte.id, isCliente));
}

/* Gera os campos de decaimento por instância para uma parte */
function buildDecInstHTML(parte) {
  if (S.inst.length === 0) {
    return `<div class="hint" style="font-size:.77rem; margin-bottom:.5rem;">Adicione instâncias no Passo 2 para definir o decaimento por instância.</div>`;
  }
  return S.inst.map((inst, idx) => {
    // Ler tipo do estado S.inst (não do DOM, que pode não estar visível no Passo 1)
    const tipo = inst.tipo || '1inst';
    const lbl = TIPOS_PRINCIPAIS.find(t => t.v === tipo)?.l || ('Instância #' + (idx + 1));
    const val = parte.decaimentoInst?.[inst.id] != null ? parte.decaimentoInst[inst.id] : '';
    return `
      <div class="dec-inst-row">
        <div class="dec-inst-label">#${idx + 1} · ${lbl}</div>
        <div class="affix" style="width:130px;">
          <input type="number" class="p-dec-inst" data-pid="${parte.id}" data-instid="${inst.id}"
            min="0" max="100" step="any" value="${val}" placeholder="${parte.decaimento}" />
          <span class="affix-post">%</span>
        </div>
      </div>`;
  }).join('');
}

/* Reconstrói os campos de decaimento por instância de todas as partes */
function updateDecInstWrap() {
  S.partes.forEach(parte => {
    const wrap = $('#dec-inst-wrap-' + parte.id);
    if (wrap && parte.decPorInst) {
      wrap.innerHTML = buildDecInstHTML(parte);
      // rebind input events
      const card = $('#parte-' + parte.id);
      if (card) card.addEventListener('input', e => onParteInput(e, parte.id, parte.id === S.clienteId));
    }
  });
}

function renderMembroHTML(parte, membro, idx) {
  const podeRemover = parte.membros.length > 1;
  const valorAcao = getValorAcao();
  // Hint TJ teórica não tem coluna definida no passo 1 — omitir (depende da instância)

  return `
    <div class="membro-row" id="membro-${membro.id}" data-pid="${parte.id}" data-mid="${membro.id}">
      <div class="field" style="flex:1;">
        <div class="label"><span>Nome do membro</span></div>
        <input type="text" class="m-nome" data-mid="${membro.id}" value="${membro.nome}" placeholder="ex: Autor A" />
      </div>
      <div class="field" style="width:170px;">
        <div class="label"><span>Valor do pedido</span></div>
        <div class="affix">
          <span class="affix-pre">€</span>
          <input type="number" class="m-vpedido" data-mid="${membro.id}" min="0" step="0.01" value="${membro.valorPedido || ''}" placeholder="0,00" />
        </div>
      </div>
      ${parte.membros.length > 1 ? `
      <div class="field" style="width:150px;">
        <div class="label"><span>Decaimento individual</span></div>
        <div class="affix">
          <input type="number" class="m-dec" data-mid="${membro.id}" min="0" max="100" step="0.01"
            value="${membro.decaimento !== null && membro.decaimento !== undefined ? membro.decaimento : ''}"
            placeholder="do grupo" />
          <span class="affix-post">%</span>
        </div>
      </div>` : ''}
      ${podeRemover ? `<button class="btn-x" onclick="rmMembro(${parte.id}, ${membro.id})"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>` : '<div></div>'}
    </div>`;
}

function addMembro(parteId) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte || parte.relacao !== 'colig') return;
  const id = ++S.membroIdx;
  parte.membros.push({ id, nome: 'Membro ' + (parte.membros.length + 1), valorPedido: 0, decaimento: null });
  rerenderMembros(parte);
  updateInstancias();
  onAnyInput();
}

function rmMembro(parteId, membroId) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte || parte.membros.length <= 1) return;
  parte.membros = parte.membros.filter(m => m.id !== membroId);
  rerenderMembros(parte);
  updateInstancias();
  onAnyInput();
}

function rmParte(parteId) {
  if (S.partes.filter(p => p.id !== S.clienteId).length <= 1) return;
  S.partes = S.partes.filter(p => p.id !== parteId);
  $('#parte-' + parteId)?.remove();
  updateInstancias();
  onAnyInput();
}

function rerenderMembros(parte) {
  const isCliente = parte.id === S.clienteId;
  const wrap = $('#membros-' + parte.id);
  if (!wrap) return;
  wrap.innerHTML = parte.membros.map((m, idx) => renderMembroHTML(parte, m, idx)).join('');
  const card = $('#parte-' + parte.id);
  if (card) card.addEventListener('input', e => onParteInput(e, parte.id, isCliente));
}

function onRelacaoChange(e, parteId, isCliente) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte) return;
  const novaRelacao = e.target.value;
  const anteriorRelacao = parte.relacao;
  parte.relacao = novaRelacao;

  if (novaRelacao === 'litis') {
    // Ao entrar em litisconsórcio: manter só o primeiro membro (nome), sem pedido/decaimento
    parte.membros = [{ id: parte.membros[0]?.id || ++S.membroIdx, nome: parte.membros[0]?.nome || parte.nome || '', valorPedido: 0, decaimento: null }];
    parte.nome = parte.membros[0].nome;
  } else if (novaRelacao === 'colig') {
    // Ao entrar em coligação: garantir que há um membro com estrutura completa
    parte.membros = [{ id: parte.membros[0]?.id || ++S.membroIdx, nome: parte.membros[0]?.nome || parte.nome || '', valorPedido: 0, decaimento: null }];
  } else {
    // parte autónoma: um único membro
    parte.membros = [parte.membros[0] || { id: ++S.membroIdx, nome: parte.nome || '', valorPedido: 0, decaimento: null }];
  }

  renderParteRow(parte, isCliente);
  updateInstancias();
  onAnyInput();
}

function onParteInput(e, parteId, isCliente) {
  const parte = S.partes.find(p => p.id === parteId);
  if (!parte) return;
  const el = e.target;
  if (el.classList.contains('p-nome')) parte.nome = el.value;
  if (el.classList.contains('p-mandatario')) parte.mandatario = el.value;
  if (el.classList.contains('p-artigo')) parte.artigo = el.value;
  if (el.classList.contains('p-dec')) parte.decaimento = num(el.value);
  if (el.classList.contains('l-nome')) {
    // nome de membro do litisconsórcio
    const m = parte.membros.find(x => x.id === +el.dataset.mid);
    if (m) {
      m.nome = el.value;
      // sincronizar parte.nome com o primeiro membro
      if (parte.membros[0] && el.dataset.mid == parte.membros[0].id) parte.nome = el.value;
    }
  }
  if (el.classList.contains('m-nome')) {
    const m = parte.membros.find(x => x.id === +el.dataset.mid);
    if (m) m.nome = el.value;
  }
  if (el.classList.contains('m-vpedido')) {
    const m = parte.membros.find(x => x.id === +el.dataset.mid);
    if (m) m.valorPedido = num(el.value);
  }
  if (el.classList.contains('m-dec')) {
    const m = parte.membros.find(x => x.id === +el.dataset.mid);
    if (m) m.decaimento = el.value === '' ? null : num(el.value);
  }
  if (el.classList.contains('p-nome') || el.classList.contains('m-nome')) updateInstNomes();
  // Quando o decaimento global muda, actualizar os labels e placeholders dos campos
  // de decaimento por instância (i-dec-inst) nos blocos de Passo 2
  if (el.classList.contains('p-dec')) updateDecInstLabels(parte);
  onAnyInput();
}

/* Actualiza os labels "global: X%" e o placeholder dos inputs i-dec-inst quando
   o decaimento global de uma parte muda no Passo 1 */
function updateDecInstLabels(parte) {
  $$('.i-dec-inst[data-pid="' + parte.id + '"]').forEach(inp => {
    inp.placeholder = String(parte.decaimento);
    // Actualizar o label-help na célula pai
    const cell = inp.closest('.field');
    if (cell) {
      const help = cell.querySelector('.label-help');
      if (help) {
        help.dataset.tip = `Deixe em branco para usar o decaimento global definido no Passo 1 (${parte.decaimento}%).`;
        help.textContent = `global: ${parte.decaimento}%`;
      }
    }
    // Se o campo tiver o valor igual ao novo global, limpar (passa a usar global)
    if (inp.value !== '' && num(inp.value) === parte.decaimento) {
      inp.value = '';
      const instid = +inp.dataset.instid;
      if (parte.decaimentoInst) delete parte.decaimentoInst[instid];
    }
  });
}

function getParteNomeDisplay(parte) {
  if (parte.relacao === 'litis' && parte.membros.length > 1) {
    return parte.membros.map(m => m.nome || '?').join(' / ');
  }
  return parte.nome || 'Parte';
}

function updateInstNomes() {
  S.partes.forEach(parte => {
    $$('.inst-parte-block[data-pid="' + parte.id + '"] .inst-parte-titulo').forEach(el => {
      const isCliente = parte.id === S.clienteId;
      el.innerHTML = `${isCliente ? '<span class="tag-cliente">Cliente</span> ' : ''}${getParteNomeDisplay(parte)}`;
    });
    parte.membros.forEach(m => {
      $$('.colig-membro-row[data-mid="' + m.id + '"] .colig-membro-nome').forEach(el => {
        el.textContent = m.nome || 'Membro';
      });
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   PASSO 2 — Instâncias
   Coluna seleccionada manualmente por parte e por instância.
   TC → campo de valor livre. Tab. II → subtipo + valor.
══════════════════════════════════════════════════════════════ */

/* Tipos principais do dropdown */
const TIPOS_PRINCIPAIS = [
  { v: '1inst',    l: '1.ª Instância' },
  { v: 'apelacao', l: 'Apelação (Relação)' },
  { v: 'revista',  l: 'Revista / STJ' },
  { v: 'tc',       l: 'Tribunal Constitucional' },
  { v: 'caut',     l: 'Providência cautelar (Tab. II)' },
  { v: 'exec',     l: 'Acção executiva (Tab. II)' },
  { v: 'inj',      l: 'Requerimento de injunção (Tab. II)' },
  { v: 'recred',   l: 'Reclamação de créditos (Tab. II)' },
  { v: 'incidente',l: 'Incidente (Tab. II)' },
  { v: 'outro2',   l: 'Outro (Tab. II)' },
];

/* Grupos da Tab. II por tipo principal */
const TAB2_GRUPOS = {
  caut:     ['Procedimentos cautelares'],
  exec:     ['Execução'],
  inj:      ['Requerimento de injunção', 'Requerimento de injunção europeia'],
  recred:   ['Reclamação de créditos'],
  incidente:['Incidente de intervenção de terceiros e oposição', 'Incidentes', 'Embargos e oposição à execução'],
  outro2:   null, // todos os grupos
};

/* Modos de input por tipo */
function tipoModo(tipo) {
  if (tipo === 'tc') return 'tc';           // valor livre em UC
  if (TAB2_GRUPOS[tipo] !== undefined) return 'tab2'; // Tab. II: subtipo + valor
  return 'tabI';                             // Tab. I: coluna + TJ paga
}

const TIPOS_OPTS = TIPOS_PRINCIPAIS.map(t => `<option value="${t.v}">${t.l}</option>`).join('');

function addInst() {
  const id = ++S.instIdx;
  S.inst.push({ id, tipo: '1inst', dispensaRem: 0 });
  const div = document.createElement('div');
  div.className = 'instance';
  div.id = 'inst-' + id;
  div.innerHTML = buildInstHTML(id);
  $('#instList').appendChild(div);
  bindInstEvents(div, id);
}

function buildInstHTML(id) {
  const nInst = S.inst.length;
  const podeRemover = nInst > 1;
  const instData = S.inst.find(i => i.id === id) || {};
  const dispensaVal = instData.dispensaRem != null ? instData.dispensaRem : '';
  const tipoAtual = instData.tipo || '1inst';
  const tipoOptsAtual = TIPOS_PRINCIPAIS.map(t =>
    `<option value="${t.v}"${tipoAtual === t.v ? ' selected' : ''}>${t.l}</option>`
  ).join('');
  return `
    <div class="instance-head">
      <div class="instance-title">
        <span class="instance-tag">#${nInst}</span>
        <span>Instância / acto</span>
      </div>
      ${podeRemover ? `<button class="btn-x" onclick="rmInst(${id})"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>` : ''}
    </div>
    <div class="grid grid-2" style="margin-bottom:.75rem;">
      <div class="field">
        <div class="label"><span>Tipo</span></div>
        <select class="i-tipo">${tipoOptsAtual}</select>
      </div>
      <div class="field">
        <div class="label">
          <span>Dispensa do remanescente <span style="color:var(--muted);font-weight:400;">(art. 6.º/7 RCP)</span></span>
          <span class="label-help" data-tip="0% = sem dispensa (remanescente entra na totalidade). 100% = dispensa total (remanescente não entra). Valores intermédios para dispensa parcial.">%</span>
        </div>
        <div class="affix">
          <input type="number" class="i-dispensa-rem" data-instid="${id}" min="0" max="100" step="any"
            value="${dispensaVal}" placeholder="0" />
          <span class="affix-post">%</span>
        </div>
        <div class="field-hint">0% = sem dispensa · 100% = dispensa total</div>
      </div>
    </div>
    <div class="inst-modo-wrap" id="inst-modo-${id}">
      ${buildInstModoHTML(id, tipoAtual)}
    </div>
  `;
}

function buildInstModoHTML(instId, tipo) {
  const modo = tipoModo(tipo);
  if (modo === 'tc') return buildInstTCHTML(instId);
  if (modo === 'tab2') return buildInstTab2HTML(instId, tipo);
  return buildInstTabIHTML(instId, tipo);  // Tab. I
}

/* ── Tab. I: coluna por parte + TJ paga ── */
function buildInstTabIHTML(instId, tipo) {
  const valorAcao = getValorAcao();
  if (S.partes.length === 0) return '';
  return S.partes.map(parte => {
    const isCliente = parte.id === S.clienteId;
    return buildInstParteTabIHTML(instId, parte, valorAcao, isCliente, tipo);
  }).join('');
}

/* Campo de decaimento por instância — incluído em cada bloco de parte dentro da instância */
function buildDecInstFieldHTML(instId, parte) {
  const decVal = parte.decaimentoInst?.[instId] != null ? parte.decaimentoInst[instId] : '';
  return `
    <div class="field" style="width:160px;">
      <div class="label">
        <span>Decaimento nesta inst.</span>
        <span class="label-help" data-tip="Deixe em branco para usar o decaimento global definido no Passo 1 (${parte.decaimento}%).">global: ${parte.decaimento}%</span>
      </div>
      <div class="affix">
        <input type="number" class="i-dec-inst" data-pid="${parte.id}" data-instid="${instId}"
          min="0" max="100" step="any" value="${decVal}" placeholder="${parte.decaimento}" />
        <span class="affix-post">%</span>
      </div>
    </div>`;
}

/* tipos que usam Col. B por defeito */
const TIPOS_COL_B = new Set(['apelacao', 'revista']);

function buildInstParteTabIHTML(instId, parte, valorAcao, isCliente, instTipo) {
  const defaultColB = TIPOS_COL_B.has(instTipo);
  if (parte.relacao === 'colig') {
    return `
      <div class="inst-parte-block" data-pid="${parte.id}">
        <div class="inst-parte-titulo">${isCliente ? '<span class="tag-cliente">Cliente</span> ' : ''}${getParteNomeDisplay(parte)}</div>
        <div class="inst-parte-coluna-sel">
          <div class="label"><span>Coluna (Tab. I)</span></div>
          <select class="i-coluna-grupo" data-pid="${parte.id}">
            <option value="A">Col. A — Regra Geral</option>
            <option value="B" selected>Col. B — Coligação / Recursos</option>
            <option value="C">Col. C — Grandes Litigantes</option>
          </select>
        </div>
        <div class="colig-membros-inst" id="inst-colig-${instId}-${parte.id}">
          ${parte.membros.map(m => buildInstMembroHTML(instId, parte, m, valorAcao, 'B')).join('')}
        </div>
        ${buildDecInstFieldHTML(instId, parte)}
      </div>`;
  }
  // Parte autónoma
  const colDef = defaultColB ? 'B' : 'A';
  const tjTeo = calcTJTeorica(valorAcao, colDef);
  const tjStr = tjTeo.base > 0 ? fmtEuroLong(tjTeo.base) : '—';
  return `
    <div class="inst-parte-block" data-pid="${parte.id}">
      <div class="inst-parte-titulo">${isCliente ? '<span class="tag-cliente">Cliente</span> ' : ''}${getParteNomeDisplay(parte)}</div>
      <div class="grid grid-4">
        <div class="field">
          <div class="label"><span>Coluna (Tab. I)</span></div>
          <select class="i-coluna" data-pid="${parte.id}">
            <option value="A"${!defaultColB ? ' selected' : ''}>Col. A — Regra Geral</option>
            <option value="B"${defaultColB ? ' selected' : ''}>Col. B — Coligação / Recursos</option>
            <option value="C">Col. C — Grandes Litigantes</option>
          </select>
        </div>
        <div class="field">
          <div class="label"><span>TJ efetivamente paga</span></div>
          <div class="affix">
            <span class="affix-pre">€</span>
            <input type="number" class="i-tj" data-pid="${parte.id}" min="0" step="any" placeholder="0,00" />
          </div>
          <div class="field-hint tj-hint" data-pid="${parte.id}">TJ teórica (Col. ${colDef}): ${tjStr}</div>
        </div>
        ${buildDecInstFieldHTML(instId, parte)}
        <div class="field tj-alerta-field" style="display:none;" data-pid="${parte.id}">
          <div class="alerta-tj">⚠ Divergência face à TJ teórica</div>
        </div>
      </div>
    </div>`;
}

function buildInstMembroHTML(instId, parte, m, valorAcao, coluna) {
  const tjTeo = calcTJTeorica(m.valorPedido > 0 ? m.valorPedido : valorAcao, coluna || 'B');
  const tjStr = tjTeo.base > 0 ? fmtEuroLong(tjTeo.base) : '—';
  return `
    <div class="colig-membro-row" data-mid="${m.id}" data-pid="${parte.id}">
      <div class="colig-membro-nome">${m.nome || 'Membro'}</div>
      <div class="field">
        <div class="label"><span>TJ paga</span></div>
        <div class="affix">
          <span class="affix-pre">€</span>
          <input type="number" class="i-tj-m" data-pid="${parte.id}" data-mid="${m.id}" min="0" step="any" placeholder="0,00" />
        </div>
        <div class="field-hint tj-hint-m" data-mid="${m.id}">TJ teórica: ${tjStr}</div>
      </div>
      <div class="tj-alerta-m" data-mid="${m.id}" style="display:none;">⚠ Divergência (teórica: ${tjStr})</div>
    </div>`;
}

/* ── Tribunal Constitucional: valor livre ── */
function buildInstTCHTML(instId) {
  if (S.partes.length === 0) return '';
  return S.partes.map(parte => {
    const isCliente = parte.id === S.clienteId;
    return `
      <div class="inst-parte-block" data-pid="${parte.id}">
        <div class="inst-parte-titulo">${isCliente ? '<span class="tag-cliente">Cliente</span> ' : ''}${getParteNomeDisplay(parte)}</div>
        <div class="hint" style="margin-bottom:.5rem;">TJ fixada pelo tribunal (DL 303/98). Consulte a tabela TC no painel de referência.</div>
        <div class="grid grid-3">
          <div class="field">
            <div class="label"><span>TJ efetivamente paga (€)</span></div>
            <div class="affix">
              <span class="affix-pre">€</span>
              <input type="number" class="i-tj" data-pid="${parte.id}" min="0" step="any" placeholder="0,00" />
            </div>
          </div>
          ${buildDecInstFieldHTML(instId, parte)}
        </div>
      </div>`;
  }).join('');
}

/* ── Tab. II: subtipo + valor pago ── */
function buildInstTab2HTML(instId, tipo) {
  const grupos = TAB2_GRUPOS[tipo];
  const itens = grupos
    ? TABELA_II.filter(i => grupos.includes(i.grupo))
    : TABELA_II;
  const opts = itens.map(i => {
    const ucLabel = Array.isArray(i.ucA)
      ? `${i.ucA[0]}–${i.ucA[1]} UC`
      : `${i.ucA} UC`;
    return `<option value="${i.key}">${i.label} (${ucLabel})</option>`;
  }).join('');

  if (S.partes.length === 0) return '';
  return `
    <div class="field" style="max-width:480px; margin-bottom:.75rem;">
      <div class="label"><span>Acto / incidente (Tab. II)</span></div>
      <select class="i-tab2sub">${opts}</select>
    </div>
    ${S.partes.map(parte => {
      const isCliente = parte.id === S.clienteId;
      return `
        <div class="inst-parte-block" data-pid="${parte.id}">
          <div class="inst-parte-titulo">${isCliente ? '<span class="tag-cliente">Cliente</span> ' : ''}${getParteNomeDisplay(parte)}</div>
          <div class="grid grid-3">
            <div class="field">
              <div class="label"><span>TJ efetivamente paga (€)</span></div>
              <div class="affix">
                <span class="affix-pre">€</span>
                <input type="number" class="i-tj" data-pid="${parte.id}" min="0" step="any" placeholder="0,00" />
              </div>
              <div class="field-hint tj-hint" data-pid="${parte.id}"></div>
            </div>
            ${buildDecInstFieldHTML(instId, parte)}
          </div>
        </div>`;
    }).join('')}`;
}

function bindInstEvents(div, id) {
  const tipoSel = div.querySelector('.i-tipo');
  tipoSel.addEventListener('change', () => {
    const tipo = tipoSel.value;
    const instObj = S.inst.find(i => i.id === id);
    if (instObj) instObj.tipo = tipo;
    div.querySelector('.inst-modo-wrap').innerHTML = buildInstModoHTML(id, tipo);
    bindInstModoEvents(div, id, tipo);
    updateDecInstWrap(); // actualizar labels nas partes
    onAnyInput();
  });
  bindInstModoEvents(div, id, tipoSel.value);

  // Capturar dispensa do remanescente
  const dispensaInput = div.querySelector('.i-dispensa-rem');
  if (dispensaInput) {
    dispensaInput.addEventListener('input', () => {
      const inst = S.inst.find(i => i.id === id);
      if (inst) inst.dispensaRem = dispensaInput.value === '' ? 0 : num(dispensaInput.value);
      onAnyInput();
    });
  }

  div.addEventListener('input', onInstInput);
}

function bindInstModoEvents(div, instId, tipo) {
  // Quando muda a coluna de um grupo de coligação → reconstruir membros
  div.querySelectorAll('.i-coluna-grupo').forEach(sel => {
    sel.addEventListener('change', () => {
      const pid = +sel.dataset.pid;
      const parte = S.partes.find(p => p.id === pid);
      const col = sel.value;
      const wrap = div.querySelector(`#inst-colig-${instId}-${pid}`);
      if (wrap && parte) {
        wrap.innerHTML = parte.membros.map(m => buildInstMembroHTML(instId, parte, m, getValorAcao(), col)).join('');
      }
      onAnyInput();
    });
  });
  // Quando muda a coluna individual → actualizar hint
  div.querySelectorAll('.i-coluna').forEach(sel => {
    sel.addEventListener('change', () => {
      const pid = +sel.dataset.pid;
      const parte = S.partes.find(p => p.id === pid);
      if (!parte) return;
      const col = sel.value;
      const tj = calcTJTeorica(getValorAcao(), col);
      const hint = div.querySelector(`.tj-hint[data-pid="${pid}"]`);
      if (hint) hint.textContent = tj.base > 0 ? `TJ teórica (Col. ${col}): ${fmtEuroLong(tj.base)}` : '';
      onAnyInput();
    });
  });
  // Tab. II: subtipo muda → actualizar hints (sem TJ teórica fixa, mostrar intervalo)
  const tab2sub = div.querySelector('.i-tab2sub');
  if (tab2sub) {
    tab2sub.addEventListener('change', () => updateTab2Hints(div, tab2sub.value));
    updateTab2Hints(div, tab2sub.value);
  }
}

function updateTab2Hints(div, subKey) {
  const item = TABELA_II.find(i => i.key === subKey);
  if (!item) return;
  div.querySelectorAll('.tj-hint').forEach(h => {
    const ucA = Array.isArray(item.ucA) ? `${item.ucA[0]}–${item.ucA[1]}` : item.ucA;
    const eurMin = (Array.isArray(item.ucA) ? item.ucA[0] : item.ucA) * UC;
    const eurMax = (Array.isArray(item.ucA) ? item.ucA[1] : item.ucA) * UC;
    h.textContent = Array.isArray(item.ucA)
      ? `Tab. II: ${ucA} UC (${fmtEuroLong(eurMin)}–${fmtEuroLong(eurMax)})`
      : `Tab. II: ${ucA} UC = ${fmtEuroLong(eurMin)}`;
  });
}

function updateInstancias() {
  $$('.instance').forEach(div => {
    const instId = +div.id.replace('inst-', '');
    const tipo = div.querySelector('.i-tipo')?.value || '1inst';
    const wrap = div.querySelector('.inst-modo-wrap');
    if (wrap) {
      wrap.innerHTML = buildInstModoHTML(instId, tipo);
      bindInstModoEvents(div, instId, tipo);
    }
  });
  // Actualizar também os campos de decaimento por instância nas partes
  updateDecInstWrap();
}

function updateInstHints() {
  const valorAcao = getValorAcao();
  $$('.instance').forEach(div => {
    const tipo = div.querySelector('.i-tipo')?.value || '1inst';
    if (tipoModo(tipo) !== 'tabI') return;
    S.partes.forEach(parte => {
      if (parte.relacao === 'colig') {
        const colSel = div.querySelector(`.i-coluna-grupo[data-pid="${parte.id}"]`);
        const col = colSel?.value || 'B';
        parte.membros.forEach(m => {
          const v = m.valorPedido > 0 ? m.valorPedido : valorAcao;
          const tj = calcTJTeorica(v, col).base;
          const hint = div.querySelector(`.tj-hint-m[data-mid="${m.id}"]`);
          if (hint) hint.textContent = tj > 0 ? `TJ teórica: ${fmtEuroLong(tj)}` : '';
        });
      } else {
        const colSel = div.querySelector(`.i-coluna[data-pid="${parte.id}"]`);
        const col = colSel?.value || 'A';
        const tj = calcTJTeorica(valorAcao, col).base;
        const hint = div.querySelector(`.tj-hint[data-pid="${parte.id}"]`);
        if (hint) hint.textContent = tj > 0 ? `TJ teórica (Col. ${col}): ${fmtEuroLong(tj)}` : '';
      }
    });
  });
}

function onInstInput(e) {
  const el = e.target;
  if (el.classList.contains('i-tj')) {
    const pid = +el.dataset.pid;
    const parte = S.partes.find(p => p.id === pid);
    const div = el.closest('.instance');
    if (parte && div) {
      const colSel = div.querySelector(`.i-coluna[data-pid="${pid}"]`);
      const col = colSel?.value || 'A';
      const tjTeo = calcTJTeorica(getValorAcao(), col).base;
      const tjPaga = num(el.value);
      const diverge = tjTeo > 0 && Math.abs(tjPaga - tjTeo) > 0.02;
      const alertaEl = el.closest('.inst-parte-block')?.querySelector(`.tj-alerta-field[data-pid="${pid}"]`);
      if (alertaEl) alertaEl.style.display = diverge ? '' : 'none';
    }
  }
  if (el.classList.contains('i-tj-m')) {
    const pid = +el.dataset.pid;
    const mid = +el.dataset.mid;
    const parte = S.partes.find(p => p.id === pid);
    const div = el.closest('.instance');
    if (parte && div) {
      const m = parte.membros.find(x => x.id === mid);
      if (m) {
        const colSel = div.querySelector(`.i-coluna-grupo[data-pid="${pid}"]`);
        const col = colSel?.value || 'B';
        const v = m.valorPedido > 0 ? m.valorPedido : getValorAcao();
        const tjTeo = calcTJTeorica(v, col).base;
        const tjPaga = num(el.value);
        const diverge = tjTeo > 0 && Math.abs(tjPaga - tjTeo) > 0.02;
        const alertaEl = el.closest('.colig-membro-row')?.querySelector(`.tj-alerta-m[data-mid="${mid}"]`);
        if (alertaEl) alertaEl.style.display = diverge ? '' : 'none';
      }
    }
  }
  onAnyInput();
}

function rmInst(id) {
  if (S.inst.length <= 1) return;
  S.inst = S.inst.filter(i => i.id !== id);
  $('#inst-' + id)?.remove();
  $$('.instance').forEach((el, i) => { el.querySelector('.instance-tag').textContent = '#' + (i + 1); });
  onAnyInput();
}

/* ══════════════════════════════════════════════════════════════
   PASSO 3 — Encargos & Honorários
══════════════════════════════════════════════════════════════ */

function addEnc() {
  const id = ++S.encIdx;
  S.enc.push({ id });
  const div = document.createElement('div');
  div.className = 'enc-row';
  div.id = 'enc-' + id;
  div.innerHTML = `
    <div class="field">
      <div class="label"><span>Descrição</span></div>
      <input type="text" class="enc-desc" placeholder="ex: Honorários de perito" />
    </div>
    <div class="field">
      <div class="label"><span>Valor</span></div>
      <div class="affix"><span class="affix-pre">€</span><input type="number" class="enc-val" min="0" step="0.01" placeholder="0,00" /></div>
    </div>
    <button class="btn-x" onclick="rmEnc(${id})"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
  `;
  $('#encList').appendChild(div);
  div.addEventListener('input', onAnyInput);
}

function rmEnc(id) {
  S.enc = S.enc.filter(e => e.id !== id);
  $('#enc-' + id)?.remove();
  onAnyInput();
}

/* ══════════════════════════════════════════════════════════════
   Recolha de estado
══════════════════════════════════════════════════════════════ */

function collectState() {
  const valorAcao = getValorAcao();

  const insts = S.inst.map(i => {
    const el = $('#inst-' + i.id);
    if (!el) return null;
    const tipo = el.querySelector('.i-tipo')?.value || '1inst';
    const modo = tipoModo(tipo);
    const subtipo = el.querySelector('.i-tab2sub')?.value || '';

    // Recolher decaimento por instância de cada parte dentro deste bloco
    // Apenas actualiza — não apaga valores de instâncias não renderizadas
    el.querySelectorAll('.i-dec-inst').forEach(inp => {
      const pid = +inp.dataset.pid;
      const instid = +inp.dataset.instid;
      const parte = S.partes.find(p => p.id === pid);
      if (!parte) return;
      if (!parte.decaimentoInst) parte.decaimentoInst = {};
      if (inp.value !== '') {
        const v = num(inp.value);
        // Só guardar override se for diferente do decaimento global
        if (v !== parte.decaimento) {
          parte.decaimentoInst[instid] = v;
        } else {
          delete parte.decaimentoInst[instid];
        }
      } else {
        // Campo vazio = usa global → remover override se existia
        delete parte.decaimentoInst[instid];
      }
    });

    const tjPartes = S.partes.map(parte => {
      let tjPaga = 0, coluna = 'A';
      if (modo === 'tabI') {
        if (parte.relacao === 'colig') {
          const colSel = el.querySelector(`.i-coluna-grupo[data-pid="${parte.id}"]`);
          coluna = colSel?.value || 'B';
          tjPaga = parte.membros.reduce((s, m) => {
            return s + num(el.querySelector(`.i-tj-m[data-pid="${parte.id}"][data-mid="${m.id}"]`)?.value);
          }, 0);
        } else {
          const colSel = el.querySelector(`.i-coluna[data-pid="${parte.id}"]`);
          coluna = colSel?.value || 'A';
          tjPaga = num(el.querySelector(`.i-tj[data-pid="${parte.id}"]`)?.value);
        }
      } else {
        // TC ou Tab. II: sem coluna Tab. I
        coluna = modo === 'tc' ? 'tc' : 'tab2';
        tjPaga = num(el.querySelector(`.i-tj[data-pid="${parte.id}"]`)?.value);
      }
      const tjTeorica = modo === 'tabI'
        ? calcTJTeoricaParteInst(parte, valorAcao, coluna)
        : 0;
      return { partId: parte.id, coluna, tjPaga, tjTeorica };
    });

    const dispensaRem = num(el.querySelector('.i-dispensa-rem')?.value, 0);
    // sincronizar tipo e dispensa no estado
    const sInst = S.inst.find(x => x.id === i.id);
    if (sInst) { sInst.tipo = tipo; sInst.dispensaRem = dispensaRem; }

    return { id: i.id, tipo, subtipo, dispensaRem, tjPartes };
  }).filter(Boolean);

  const encargos = S.enc.map(e => ({
    desc: ($('#enc-' + e.id + ' .enc-desc')?.value || '').trim() || '(encargo)',
    val: num($('#enc-' + e.id + ' .enc-val')?.value),
  })).filter(e => e.val > 0);

  return {
    valorAcao,
    numProcesso: ($('#numProcesso')?.value || '').trim(),
    tribunal: ($('#tribunal')?.value || '').trim(),
    estimarRem: getEstimarRem(),
    cliente: getCliente(),
    partes: getRestantes(),
    insts,
    encargos,
    limHon: $('#limHon')?.checked || false,
    honReais: num($('#honReais')?.value),
  };
}

/* ══════════════════════════════════════════════════════════════
   Wizard
══════════════════════════════════════════════════════════════ */

function goStep(n) {
  S.step = n;
  $$('.step').forEach(s => {
    const i = +s.dataset.step;
    s.classList.toggle('active', i === n);
    s.classList.toggle('done', i < n);
  });
  $$('.panel').forEach(p => p.classList.toggle('active', +p.dataset.panel === n));
  $$('#checklist .check').forEach((c, i) => {
    c.classList.toggle('current', i + 1 === n);
    c.classList.toggle('done', i + 1 < n);
  });
  if (n === 4) renderResult();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════════
   UI dinâmica
══════════════════════════════════════════════════════════════ */

function onValorAcaoChange() {
  const v = getValorAcao();
  const hint = $('#valorHint');
  if (v <= 0) {
    hint.textContent = 'Introduza o valor da ação para ver o escalão aplicável.';
  } else {
    const teo = calcTJTeorica(v, 'A');
    const parts = [`<span class="hint-strong">Escalão · ${teo.baseUC} UC (${fmtEuroLong(teo.base)}) — Col. A</span>`];
    if (teo.remUC > 0) parts.push(`<span class="hint-strong">Remanescente (Col. A) · ${teo.fracoes} frações × 3 UC = ${fmtEuroLong(teo.rem)}</span>`);
    hint.innerHTML = parts.join(' · ');
  }
  updateInstHints();
}

function toggleHon() {
  const el = $('#honField');
  if (el) el.style.display = $('#limHon')?.checked ? 'block' : 'none';
}

function updateSummary() {
  const st = collectState();
  if (!st.cliente) return;
  const r = computeResult(st);
  if (!r) return;

  const t = r.totalBruto;
  const show = t > 0;
  const bigT = $('#bigTotal');
  bigT.classList.toggle('empty', !show);
  bigT.innerHTML = `<span class="currency">€</span>${fmtEuro(show ? r.totalAReceber : 0)}`;

  const decLabel = r.decCliente > 0 ? ` (cliente decaiu ${fmtPct(r.decCliente * 100)})` : '';
  $('#bigLabel').textContent = show
    ? (r.notasIndividuais.length > 0
        ? `${r.notasIndividuais.length} nota${r.notasIndividuais.length > 1 ? 's' : ''} autónoma${r.notasIndividuais.length > 1 ? 's' : ''}${decLabel}`
        : 'Sem partes vencidas ainda')
    : 'Preencha os dados para ver o total';

  const sub = $('#bigSub');
  if (show && r.totalBruto > 0) {
    sub.style.display = 'block';
    const remLabel = r.estimarRem && r.somaRemEstimado > 0
      ? ` (inclui rem. estimado ${fmtEuroLong(r.somaRemEstimado)})`
      : '';
    sub.textContent = `Base: ${fmtEuroLong(r.tjBasePagaCliente)} + ${fmtEuroLong(r.rubrB)} + ${fmtEuroLong(r.limIndiv)}${remLabel}`;
  } else {
    sub.style.display = 'none';
  }

  if (show) {
    $('#miniBars').style.display = 'grid';
    $('#summaryBar').style.display = 'flex';
    $('#mbA').textContent = fmtEuroLong(r.tjBasePagaCliente);
    $('#mbB').textContent = fmtEuroLong(r.rubrB);
    $('#mbC').textContent = fmtEuroLong(r.limIndiv);
    const bar = $('#summaryBar');
    bar.querySelector('.a').style.width = (r.tjBasePagaCliente / t * 100) + '%';
    bar.querySelector('.b').style.width = (r.rubrB / t * 100) + '%';
    bar.querySelector('.c').style.width = (r.limIndiv / t * 100) + '%';
  } else {
    $('#miniBars').style.display = 'none';
    $('#summaryBar').style.display = 'none';
  }
}

function onAnyInput() {
  saveState();
  onValorAcaoChange();
  toggleHon();
  updateSummary();
}

/* ══════════════════════════════════════════════════════════════
   PASSO 4 — Nota final
══════════════════════════════════════════════════════════════ */

function renderResult() {
  const st = collectState();
  const body = $('#resultBody');

  if (!st.cliente || st.valorAcao <= 0) {
    body.innerHTML = `<div class="result-section"><div class="result-section-body" style="padding:1.5rem;text-align:center;color:var(--muted);">Introduza o valor da ação e os dados das partes nos passos anteriores.</div></div>`;
    return;
  }

  const r = computeResult(st);
  if (!r) return;

  let html = '';

  // ── Configuração ──
  const decClienteInfo = r.decCliente > 0
    ? ` <span class="tag-limitado">decaimento ${fmtPct(r.decCliente * 100)}</span>` : '';
  html += `
    <div class="result-section">
      <div class="result-section-head">Configuração</div>
      <div class="result-section-body">
        ${st.numProcesso ? `<div class="rrow"><span class="d">Processo</span><span class="v">${st.numProcesso}</span></div>` : ''}
        ${st.tribunal ? `<div class="rrow"><span class="d">Tribunal</span><span class="v">${st.tribunal}</span></div>` : ''}
        <div class="rrow"><span class="d">Valor da ação</span><span class="v">${fmtEuroLong(r.valorAcao)}</span></div>
        <div class="rrow"><span class="d">Cliente</span><span class="v">${r.cliente.nome}${decClienteInfo}</span></div>
        ${r.partes.map(p => {
          const relLabel = p.relacao === 'colig' ? 'Coligação' : p.relacao === 'litis' ? 'Litisconsórcio' : 'Autónoma';
          const membrosLitis = p.relacao === 'litis' && p.membros.length > 1
            ? p.membros.map(m => `<div class="rrow" style="padding-left:1.5rem;"><span class="d">${m.nome || '—'}</span><span class="v">membro</span></div>`).join('')
            : '';
          const membrosColig = p.relacao === 'colig' && p.membros.length > 1
            ? p.membros.map(m => `<div class="rrow" style="padding-left:1.5rem;"><span class="d">${m.nome}</span><span class="v">Pedido: ${fmtEuroLong(m.valorPedido)}${m.decaimento !== null && m.decaimento !== undefined ? ' · Dec.: ' + fmtPct(m.decaimento) : ''}</span></div>`).join('')
            : '';
          return `
          <div class="rrow">
            <span class="d">${getParteNomeDisplay(p)}</span>
            <span class="v">${relLabel} · Decaimento: ${fmtPct(p.decaimento)}</span>
          </div>
          ${membrosLitis}${membrosColig}`;
        }).join('')}
        <div class="rrow"><span class="d">Partes com algum vencimento (entram no rateio Rubrica C)</span><span class="v">${r.nVencedores}</span></div>
      </div>
    </div>`;

  // ── Detalhe por instância ──
  if (r.instDetalhe && r.instDetalhe.length) {
    html += `<div class="result-section"><div class="result-section-head">Detalhe por instância</div><div class="result-section-body">`;
    r.instDetalhe.forEach((inst, idx) => {
      const lbl = TIPOS_PRINCIPAIS.find(t => t.v === inst.tipo)?.l || inst.tipo;
      const sub = inst.subtipo ? (TABELA_II.find(x => x.key === inst.subtipo)?.label || '') : '';
      const dispensaInfo = inst.dispensaRem > 0
        ? ` <span class="tag-limitado">dispensa ${fmtPct(inst.dispensaRem)} rem.</span>` : '';
      html += `<div style="margin-bottom:.8rem;"><div class="rrow"><span class="d"><span class="rubric-badge">#${idx+1}</span>${lbl}${sub ? ' · ' + sub : ''}${dispensaInfo}</span></div>`;
      (inst.tjPartesCorrigidas || inst.tjPartes || []).forEach(tp => {
        const parte = r.todasPartes.find(p => p.id === tp.partId);
        if (!parte) return;
        const isCliente = parte.id === r.cliente.id;
        const colLabel = tp.coluna && tp.coluna !== 'tc' && tp.coluna !== 'tab2'
          ? ` · Col. ${tp.coluna}` : '';
        const diverge = tp.tjTeorica > 0 && Math.abs(tp.tjPaga - tp.tjTeorica) > 0.02;
        const decInfo = tp.decUsado != null && tp.decUsado !== (parte.decaimento || 0)
          ? ` <span class="muted-small">dec. ${fmtPct(tp.decUsado)}</span>` : '';
        const remInfo = tp.remEfectivo > 0
          ? ` <span class="muted-small">+ rem. ${fmtEuroLong(tp.remEfectivo)}</span>` : '';
        html += `<div class="rrow">
          <span class="d">&nbsp;&nbsp;${parte.nome}${isCliente ? ' <span class="tag-cliente">cliente</span>' : ''}${colLabel} · TJ paga${remInfo}${decInfo}</span>
          <span class="v">${fmtEuroLong(tp.tjPaga)}${diverge ? ' <span class="alerta-inline">⚠ teórica: ' + fmtEuroLong(tp.tjTeorica) + '</span>' : ''}</span>
        </div>`;
        if (tp.remEfectivo > 0 || (tp.decUsado != null && tp.decUsado > 0)) {
          html += `<div class="rrow" style="padding-left:2rem; color:var(--muted); font-size:.78rem;">
            <span class="d">TJ corrigida (TJ + rem. efetivo) × factor vitória</span>
            <span class="v">${fmtEuroLong(tp.tjCorrigida)}</span>
          </div>`;
        }
      });
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  // ── Somatório ──
  // Determinar se o art. 32.º/2 é aplicável (pluralidade de vencedores)
  const art32aplicavel = r.nVencedores > 1;
  // Linhas do rateio por parte (só quando art. 32.º/2 se aplica)
  const linhasRateio = art32aplicavel ? r.partesUnicas
    .filter(p => {
      const fvObj = r.factoresVitoria?.find(x => x.id === p.id);
      return fvObj ? fvObj.fv > 0 : (p.decaimento || 0) < 100;
    })
    .map(p => {
      const fvObj = r.factoresVitoria?.find(x => x.id === p.id);
      const fv = fvObj ? fvObj.fv : (1 - (p.decaimento || 0) / 100);
      const limP = r.somaFactoresVitoria > 0 ? r.limGlobal * fv / r.somaFactoresVitoria : 0;
      const isCliente = p.id === r.cliente.id;
      const etiqueta = isCliente ? `${p.nome} <span class="tag-cliente">cliente</span>` : p.nome;
      const fvPct = fmtPct(fv * 100);
      const somaPct = fmtPct(r.somaFactoresVitoria * 100);
      return `<div class="rrow" style="padding-left:1.25rem;">
        <span class="d">${etiqueta} · ${fvPct} / ${somaPct}</span>
        <span class="v">${fmtEuroLong(limP)}${isCliente && r.rubrCLimitada ? ' <span class="tag-limitado">limitada</span>' : ''}</span>
      </div>`;
    }).join('') : '';

  const temCorrecoes = r.instDetalhe?.some(i => i.dispensaRem > 0 || i.tjPartesCorrigidas?.some(tp => tp.decUsado > 0));

  // Linhas de imputação do remanescente por parte vencida
  const linhasImputacaoRem = (r.estimarRem && r.imputacaoRem?.length > 0 && r.poolRemImputavel > 0)
    ? r.imputacaoRem.map(imp => {
        const pct = fmtPct(imp.proporcao * 100);
        const somaDec = fmtPct(r.imputacaoRem.reduce((s, x) => s + x.decaimento, 0));
        return `<div class="rrow" style="padding-left:1.25rem;">
          <span class="d">${imp.nome} · ${fmtPct(imp.decaimento)}% / ${somaDec} <span class="muted-small">(proporção do decaimento)</span></span>
          <span class="v">${fmtEuroLong(imp.montante)}</span>
        </div>`;
      }).join('')
    : '';

  html += `
    <div class="result-section">
      <div class="result-section-head">Somatório de TJ — base para Rubrica C</div>
      <div class="result-section-body">
        <div class="rrow"><span class="d">TJ base efetivamente pagas por todas as partes</span><span class="v">${fmtEuroLong(r.somaTJBase)}</span></div>
        ${r.estimarRem && r.somaRemTotal > 0 ? `
        <div class="rrow"><span class="d">Remanescente efetivo de todas as partes (deduzida dispensa por instância)</span><span class="v">${fmtEuroLong(r.somaRemTotal)}</span></div>
        ${r.poolRemImputavel > 0 ? `
        <div class="rrow" style="margin-top:.35rem;">
          <span class="d" style="color:var(--muted); font-size:.78rem;">Pool de remanescente imputável às partes vencidas — Σ (rem. de cada parte × factor de vitória)</span>
          <span class="v" style="color:var(--muted);">${fmtEuroLong(r.poolRemImputavel)}</span>
        </div>
        ${linhasImputacaoRem}
        ` : ''}
        ` : ''}
        ${temCorrecoes ? `
        <div class="rrow rrow-total"><span class="d">Somatório total (TJ + rem. efetivo de todas as partes)</span><span class="v">${fmtEuroLong(r.somaTJCorrigida)}</span></div>
        ` : `
        <div class="rrow rrow-total"><span class="d">Somatório total</span><span class="v">${fmtEuroLong(r.somaTJCorrigida)}</span></div>
        `}
        <div class="rrow"><span class="d">50% = limite global Rubrica C</span><span class="v">${fmtEuroLong(r.limGlobal)}</span></div>
        ${art32aplicavel ? `
        <div class="rrow" style="margin-top:.5rem;">
          <span class="d" style="color:var(--muted);font-size:.78rem;">Pluralidade de vencedores — rateio proporcional ao vencimento de cada parte (art. 32.º, n.º 2, Portaria 419-A/2009)</span>
        </div>
        ${linhasRateio}
        ` : `
        <div class="rrow"><span class="d">Limite Rubrica C</span><span class="v">${fmtEuroLong(r.limIndiv)}${r.rubrCLimitada ? ' <span class="tag-limitado">limitada</span>' : ''}</span></div>
        `}
      </div>
    </div>`;

  // ── Nota base ──
  const factorInfo = r.decCliente > 0
    ? ` <span class="muted-small">× ${fmtPct(r.factorCliente * 100)} (decaimento cliente)</span>` : '';
  html += `
    <div class="result-section">
      <div class="result-section-head">Nota base (antes de aplicar coeficientes por parte)</div>
      <div class="result-section-body">
        <div class="rrow"><span class="d"><span class="rubric-badge">A</span>TJ paga pelo cliente em todas as instâncias</span><span class="v">${fmtEuroLong(r.tjBasePagaCliente)}</span></div>
        <div class="rrow"><span class="d"><span class="rubric-badge">B</span>Encargos${r.encargos.length === 0 ? ' (nenhum)' : ''}</span><span class="v">${fmtEuroLong(r.rubrB)}</span></div>
        ${r.encargos.map(e => `<div class="rrow" style="padding-left:1.5rem;"><span class="d">${e.desc}</span><span class="v">${fmtEuroLong(e.val)}</span></div>`).join('')}
        <div class="rrow"><span class="d"><span class="rubric-badge">C</span>Limite individual (Rubrica C)</span><span class="v">${fmtEuroLong(r.limIndiv)}</span></div>
        <div class="rrow rrow-total"><span class="d">Total base (A + B + C)${factorInfo}</span><span class="v">${fmtEuroLong(r.totalBruto)}</span></div>
      </div>
    </div>`;

  // ── Notas autónomas ──
  if (r.notasIndividuais.length > 0) {
    html += `
      <div class="result-section">
        <div class="result-section-head">Notas autónomas por parte/membro — arts. 25.º e 26.º RCP</div>
        <div class="result-section-body">`;

    r.notasIndividuais.forEach((nota, idx) => {
      const coefPct = fmtPct(nota.coef * 100);
      const grupoInfo = nota.grupo ? ` <span class="muted-small">(${nota.grupo})</span>` : '';
      const propInfo = nota.proporcao !== null
        ? ` · Proporção no grupo: ${fmtPct(nota.proporcao * 100)} (pedido ${fmtEuroLong(nota.valorPedido)})` : '';
      const factorLine = r.decCliente > 0
        ? ` · Factor cliente: ${fmtPct(nota.factorCliente * 100)}` : '';

      html += `
        <div class="nota-card">
          <div class="nota-card-head">
            <span class="nota-num">#${idx + 1}</span>
            <span class="nota-nome">${nota.nome}${grupoInfo}</span>
            <span class="nota-coef">Coeficiente: ${coefPct}${propInfo}${factorLine}</span>
          </div>
          <div class="nota-card-body">
            <div class="rrow"><span class="d"><span class="rubric-badge">A</span>TJ do cliente × coeficiente</span><span class="v">${fmtEuroLong(nota.rubrA)}</span></div>
            ${nota.rubrB > 0 ? `<div class="rrow"><span class="d"><span class="rubric-badge">B</span>Encargos × coeficiente</span><span class="v">${fmtEuroLong(nota.rubrB)}</span></div>` : ''}
            <div class="rrow"><span class="d"><span class="rubric-badge">C</span>Compensação honorários × coeficiente</span><span class="v">${fmtEuroLong(nota.rubrC)}</span></div>
            <div class="rrow rrow-total"><span class="d">Total desta nota</span><span class="v">${fmtEuroLong(nota.total)}</span></div>
          </div>
        </div>`;
    });

    html += `
          <div class="rrow rrow-total" style="margin-top:1rem;">
            <span class="d">Total a receber (soma de todas as notas)</span>
            <span class="v">${fmtEuroLong(r.totalAReceber)}</span>
          </div>
          ${!r.naoEnriquecimento ? '<div class="alerta-enriquecimento">⚠ A soma das Rubricas A excede o máximo recuperável — verifique os dados.</div>' : ''}
        </div>
      </div>`;
  } else {
    html += `<div class="result-section"><div class="result-section-body" style="padding:1.5rem;text-align:center;color:var(--muted);">Nenhuma parte com decaimento &gt; 0% — sem notas a emitir.</div></div>`;
  }

  body.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   Drawer — tabelas de referência
══════════════════════════════════════════════════════════════ */

const DRAWER_SECTIONS = [
  { key: 'ia',   label: 'Tabela I-A' },
  { key: 'ib',   label: 'Tabela I-B' },
  { key: 'ic',   label: 'Tabela I-C' },
  { key: 'rem',  label: 'Remanescente' },
  { key: 'tii',  label: 'Tabela II' },
  { key: 'tiii', label: 'Tabela III' },
  { key: 'tiv',  label: 'Tabela IV' },
  { key: 'tc',   label: 'Trib. Constitucional' },
];
let drawerActive = 'ia';

function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawerScrim').classList.add('open');
  renderDrawer();
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawerScrim').classList.remove('open');
}
function setDrawerTab(k) { drawerActive = k; renderDrawer(); }

function drawerTabIRows(colIdx, remUCpFracao) {
  const labels = [
    'Até € 2 000', 'De € 2 000,01 a € 8 000', 'De € 8 000,01 a € 16 000',
    'De € 16 000,01 a € 24 000', 'De € 24 000,01 a € 30 000', 'De € 30 000,01 a € 40 000',
    'De € 40 000,01 a € 60 000', 'De € 60 000,01 a € 80 000', 'De € 80 000,01 a € 100 000',
    'De € 100 000,01 a € 150 000', 'De € 150 000,01 a € 200 000', 'De € 200 000,01 a € 250 000',
    'De € 250 000,01 a € 275 000',
  ];
  const rows = TABELA_I.map((row, i) => {
    const uc = row[colIdx];
    return `<tr><td>${labels[i]}</td><td>${uc} UC</td><td>${fmtEuroLong(uc * UC)}</td></tr>`;
  });
  rows.push(`<tr style="color:var(--muted)"><td>Acima de € 275 000</td><td>+ ${remUCpFracao} UC / fração</td><td>+ ${fmtEuroLong(remUCpFracao * UC)} / fração</td></tr>`);
  return rows.join('');
}

function renderDrawer() {
  const tabs = DRAWER_SECTIONS.map(s =>
    `<button class="drawer-tab ${drawerActive === s.key ? 'active' : ''}" onclick="setDrawerTab('${s.key}')">${s.label}</button>`
  ).join('');

  let content = '';

  if (drawerActive === 'ia') {
    content = `<div class="card-ref"><div class="card-ref-head">Tabela I · Coluna A — Regra geral / Litisconsórcio (arts. 6.º/1 e 7.º/3 RCP)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Valor da ação</th><th>TJ</th><th>€</th></tr></thead><tbody>${drawerTabIRows(1, 3)}</tbody></table><p class="ref-note">UC = € ${UC}. Máximo 16 UC (base). Remanescente: + 3 UC (= € 306) por cada € 25 000 ou fração acima de € 275 000.</p></div></div>`;
  } else if (drawerActive === 'ib') {
    content = `<div class="card-ref"><div class="card-ref-head">Tabela I · Coluna B — Coligação / Recursos (arts. 6.º/2 e 7.º/2 RCP)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Valor</th><th>TJ</th><th>€</th></tr></thead><tbody>${drawerTabIRows(2, 1.5)}</tbody></table><p class="ref-note">Coligação em 1.ª instância (valor do pedido individual) e todos os recursos. Máximo 8 UC. Remanescente: + 1,5 UC (= € 153) / fração.</p></div></div>`;
  } else if (drawerActive === 'ic') {
    content = `<div class="card-ref"><div class="card-ref-head">Tabela I · Coluna C — Grandes litigantes (arts. 6.º/5 e 13.º/3 RCP; art. 530.º/7 CPC)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Valor</th><th>TJ</th><th>€</th></tr></thead><tbody>${drawerTabIRows(3, 4.5)}</tbody></table><p class="ref-note">Portaria 419-A/2009. Máximo 24 UC. Remanescente: + 4,5 UC (= € 459) / fração.</p></div></div>`;
  } else if (drawerActive === 'rem') {
    content = `<div class="card-ref"><div class="card-ref-head">Remanescente · art. 6.º/7 RCP (valor &gt; € 275 000)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Col.</th><th>Situação</th><th>UC / fração</th><th>€ / fração</th></tr></thead><tbody>
      <tr><td>A</td><td>Regra geral / Litisconsórcio</td><td>3 UC</td><td>€ 306,00</td></tr>
      <tr><td>B</td><td>Coligação / Recursos</td><td>1,5 UC</td><td>€ 153,00</td></tr>
      <tr><td>C</td><td>Grandes litigantes</td><td>4,5 UC</td><td>€ 459,00</td></tr>
    </tbody></table><p class="ref-note">Frações = ⌈(valor − € 275 000) ÷ 25 000⌉. Pago a final, com a nota de custas. Calculado automaticamente pela calculadora quando activado o toggle.</p></div></div>`;
  } else if (drawerActive === 'tii') {
    // Agrupar por grupo
    const grupos = [...new Set(TABELA_II.map(i => i.grupo))];
    const tbody = grupos.map(g => {
      const itens = TABELA_II.filter(i => i.grupo === g);
      const rows = itens.map(i => {
        const ucA = Array.isArray(i.ucA) ? `${i.ucA[0]}–${i.ucA[1]}` : i.ucA;
        const ucB = Array.isArray(i.ucB) ? `${i.ucB[0]}–${i.ucB[1]}` : i.ucB;
        return `<tr><td>${i.label}</td><td>${ucA} UC</td><td>${ucB} UC</td></tr>`;
      }).join('');
      return `<tr class="ref-group-head"><td colspan="3">${g}</td></tr>${rows}`;
    }).join('');
    content = `<div class="card-ref"><div class="card-ref-head">Tabela II — art. 7.º, n.os 1, 4, 5 e 7 RCP</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Acto / incidente</th><th>Col. A (normal)</th><th>Col. B (agravada)</th></tr></thead><tbody>${tbody}</tbody></table><p class="ref-note">Col. B aplicável nos termos do art. 13.º, n.º 3 RCP (grandes litigantes em processo especial).</p></div></div>`;
  } else if (drawerActive === 'tiii') {
    const rows = TABELA_III.map(i => `<tr><td>${i.label}</td><td>${i.uc[0]}–${i.uc[1]} UC</td><td>${fmtEuroLong(i.uc[0]*UC)} – ${fmtEuroLong(i.uc[1]*UC)}</td></tr>`).join('');
    content = `<div class="card-ref"><div class="card-ref-head">Tabela III — art. 8.º, n.os 7 e 9 RCP (processo penal)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Acto processual</th><th>TJ (UC)</th><th>€</th></tr></thead><tbody>${rows}</tbody></table><p class="ref-note">Processo penal. Listada apenas para referência — esta calculadora cobre processos cíveis.</p></div></div>`;
  } else if (drawerActive === 'tiv') {
    const rows = TABELA_IV.map(i => `<tr><td>${i.categoria}</td><td>${i.servico}</td><td>${i.fraccao}</td></tr>`).join('');
    content = `<div class="card-ref"><div class="card-ref-head">Tabela IV — art. 17.º, n.os 2, 4, 5 e 6 RCP (encargos)</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Categoria</th><th>Remuneração por serviço/deslocação</th><th>Remuneração por fracção/página/palavra</th></tr></thead><tbody>${rows}</tbody></table><p class="ref-note">UC = € ${UC}. Valores a converter em € à data do serviço. Encargos documentados com comprovativos (art. 16.º RCP).</p></div></div>`;
  } else if (drawerActive === 'tc') {
    const rows = TC_ACTOS.map(a => `<tr><td>${a.label}</td><td>${a.min}–${a.max} UC</td><td>${fmtEuroLong(a.min*UC)} – ${fmtEuroLong(a.max*UC)}</td></tr>`).join('');
    content = `<div class="card-ref"><div class="card-ref-head">Tribunal Constitucional · DL 303/98</div><div class="card-ref-body"><table class="ref"><thead><tr><th>Tipo de acto</th><th>TJ (UC)</th><th>€</th></tr></thead><tbody>${rows}</tbody></table><p class="ref-note">TJ fixada pelo tribunal dentro do intervalo. RCP aplica-se supletivamente (art. 3.º DL 303/98). Sem colunas A/B/C — introduza o valor fixado.</p></div></div>`;
  }

  $('#drawerBody').innerHTML = `<div class="drawer-tabs">${tabs}</div>${content}`;
}

/* ══════════════════════════════════════════════════════════════
   Reset & mobile
══════════════════════════════════════════════════════════════ */

function resetAll() {
  if (!confirm('Limpar todos os dados?')) return;
  S.parteIdx = 0; S.membroIdx = 0; S.instIdx = 0; S.encIdx = 0;
  S.partes = []; S.inst = []; S.enc = []; S.clienteId = null;
  $('#clienteWrap').innerHTML = '';
  $('#partesWrap').innerHTML = '';
  $('#instList').innerHTML = '';
  $('#encList').innerHTML = '';
  $('#valorAcao').value = '';
  if ($('#numProcesso')) $('#numProcesso').value = '';
  if ($('#tribunal')) $('#tribunal').value = '';
  $('#limHon').checked = false;
  $('#honReais').value = '';
  if ($('#estimarRem')) $('#estimarRem').checked = false;
  addParte(true);
  addParte(false);
  addInst();
  addEnc();
  goStep(1);
  onAnyInput();
  localStorage.removeItem('custas_state');
}

function toggleSummaryMobile() {
  if (window.innerWidth < 980) $('#summary').classList.toggle('collapsed');
}

/* ══════════════════════════════════════════════════════════════
   Persistência — localStorage
══════════════════════════════════════════════════════════════ */

const LS_KEY = 'custas_state_v2';

function saveState() {
  try {
    const snap = {
      valorAcao: $('#valorAcao')?.value || '',
      numProcesso: $('#numProcesso')?.value || '',
      tribunal: $('#tribunal')?.value || '',
      estimarRem: $('#estimarRem')?.checked || false,
      limHon: $('#limHon')?.checked || false,
      honReais: $('#honReais')?.value || '',
      partes: S.partes.map(p => ({
        id: p.id, nome: p.nome, relacao: p.relacao,
        decaimento: p.decaimento, decaimentoInst: p.decaimentoInst || {},
        membros: p.membros.map(m => ({
          id: m.id, nome: m.nome, valorPedido: m.valorPedido, decaimento: m.decaimento
        })),
      })),
      clienteId: S.clienteId,
      inst: S.inst.map(i => {
        const el = $('#inst-' + i.id);
        const tjPartes = {};
        if (el) {
          el.querySelectorAll('.i-tj, .i-tj-m').forEach(inp => {
            // Guardar a string exacta do campo — arredondamento só no restore
            tjPartes[inp.dataset.pid + '_' + (inp.dataset.mid || '')] = inp.value;
          });
          el.querySelectorAll('.i-coluna, .i-coluna-grupo').forEach(sel => {
            tjPartes['col_' + sel.dataset.pid] = sel.value;
          });
        }
        return {
          id: i.id, tipo: i.tipo || '1inst', dispensaRem: i.dispensaRem || 0, tjPartes
        };
      }),
      enc: S.enc.map(e => ({
        id: e.id,
        desc: $('#enc-' + e.id + ' .enc-desc')?.value || '',
        val: $('#enc-' + e.id + ' .enc-val')?.value || '',
      })),
      parteIdx: S.parteIdx, membroIdx: S.membroIdx,
      instIdx: S.instIdx, encIdx: S.encIdx,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch(e) { /* silenciar erros de quota */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);

    // Restaurar contadores
    S.parteIdx = snap.parteIdx || 0;
    S.membroIdx = snap.membroIdx || 0;
    S.instIdx = snap.instIdx || 0;
    S.encIdx = snap.encIdx || 0;
    S.clienteId = snap.clienteId;

    // Restaurar partes
    S.partes = snap.partes || [];
    $('#clienteWrap').innerHTML = '';
    $('#partesWrap').innerHTML = '';
    S.partes.forEach(p => {
      const isCliente = p.id === S.clienteId;
      renderParteRow(p, isCliente);
    });

    // Restaurar campos do processo
    if (snap.valorAcao) $('#valorAcao').value = snap.valorAcao;
    if (snap.numProcesso) $('#numProcesso').value = snap.numProcesso;
    if (snap.tribunal) $('#tribunal').value = snap.tribunal;
    if (snap.estimarRem) $('#estimarRem').checked = snap.estimarRem;
    if (snap.limHon) { $('#limHon').checked = snap.limHon; toggleHon(); }
    if (snap.honReais) $('#honReais').value = snap.honReais;

    // Restaurar instâncias
    $('#instList').innerHTML = '';
    S.inst = [];
    (snap.inst || []).forEach(si => {
      S.inst.push({ id: si.id, tipo: si.tipo, dispensaRem: si.dispensaRem || 0 });
      S.instIdx = Math.max(S.instIdx, si.id);
      // Renderizar a instância (inline, sem chamar addInst que incrementaria S.instIdx)
      const instDiv = document.createElement('div');
      instDiv.className = 'instance';
      instDiv.id = 'inst-' + si.id;
      instDiv.innerHTML = buildInstHTML(si.id);
      $('#instList').appendChild(instDiv);
      bindInstEvents(instDiv, si.id);
      // Restaurar valores de TJ
      const el = $('#inst-' + si.id);
      if (el && si.tjPartes) {
        Object.entries(si.tjPartes).forEach(([k, v]) => {
          if (k.startsWith('col_')) {
            const pid = k.replace('col_', '');
            const sel = el.querySelector(`.i-coluna[data-pid="${pid}"], .i-coluna-grupo[data-pid="${pid}"]`);
            if (sel) sel.value = v;
          } else {
            const [pid, mid] = k.split('_');
            const inp = mid
              ? el.querySelector(`.i-tj-m[data-pid="${pid}"][data-mid="${mid}"]`)
              : el.querySelector(`.i-tj[data-pid="${pid}"]`);
            if (inp) {
              // Restaurar valor exacto; se tiver mais de 2 casas decimais (lixo de fp), arredondar
              const n = parseFloat(v);
              if (Number.isFinite(n)) {
                const rounded = Math.round(n * 100) / 100;
                // Só corrigir se a diferença for inferior a 0.01 (lixo fp, não valor intencional)
                inp.value = Math.abs(n - rounded) < 0.01 ? String(rounded) : v;
              } else {
                inp.value = v;
              }
            }
          }
        });
      }
    });
    updateInstHints();

    // Restaurar encargos
    $('#encList').innerHTML = '';
    S.enc = [];
    (snap.enc || []).forEach(se => {
      S.enc.push({ id: se.id });
      const encDiv = document.createElement('div');
      encDiv.className = 'enc-row';
      encDiv.id = 'enc-' + se.id;
      encDiv.innerHTML = `
        <div class="field">
          <div class="label"><span>Descrição</span></div>
          <input type="text" class="enc-desc" placeholder="ex: Honorários de perito" value="${se.desc || ''}" />
        </div>
        <div class="field">
          <div class="label"><span>Valor</span></div>
          <div class="affix"><span class="affix-pre">€</span><input type="number" class="enc-val" min="0" step="0.01" placeholder="0,00" value="${se.val || ''}" /></div>
        </div>
        <button class="btn-x" onclick="rmEnc(${se.id})"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
      `;
      $('#encList').appendChild(encDiv);
      encDiv.addEventListener('input', onAnyInput);
    });

    return true;
  } catch(e) {
    console.warn('Erro ao restaurar estado:', e);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════
   Init
══════════════════════════════════════════════════════════════ */

window.addEventListener('DOMContentLoaded', () => {
  const restored = loadState();
  if (!restored) {
    addParte(true);
    addParte(false);
    addInst();
    addEnc();
  }

  $('#valorAcao').addEventListener('input', onAnyInput);
  $('#limHon').addEventListener('change', onAnyInput);
  $('#honReais').addEventListener('input', onAnyInput);
  if ($('#estimarRem')) $('#estimarRem').addEventListener('change', onAnyInput);
  $('#btnAddParte').addEventListener('click', () => addParte(false));
  $('#btnAddInst').addEventListener('click', addInst);
  $$('.step').forEach(s => s.addEventListener('click', () => goStep(+s.dataset.step)));

  onAnyInput();
});
