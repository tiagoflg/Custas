/* ═══════════════════════════════════════════════════════════════
   Custas — lógica de cálculo (RCP DL 34/2008 · CPC)

   Modelo de dados:

   state = {
     valorAcao: number,
     estimarRem: bool,          // true = incluir remanescente estimado no somatório da Rubrica C
     cliente: Parte,
     partes: [Parte],           // restantes partes (vencedoras e vencidas)
     insts: [Instancia],
     encargos: [{ desc, val }],
     limHon: bool, honReais: number,
   }

   Parte = {
     id: number,
     nome: string,
     relacao: 'autonoma' | 'litis' | 'colig',
     decaimento: number,        // % global (fallback quando não há por instância)
     decaimentoInst: { [instId]: number },  // decaimento específico por instância (opcional)
     membros: [Membro],
   }

   Membro = {
     id: number,
     nome: string,
     valorPedido: number,
     decaimento: number | null,
   }

   Instancia = {
     id: number,
     tipo: string,   // '1inst' | 'apelacao' | 'revista' | 'tc' | 'tab2'
     subtipo: string,
     dispensaRem: number,       // % de dispensa do remanescente nesta instância (0–100)
     tjPartes: [{ partId, coluna, tjPaga, tjTeorica }]
   }

   ─────────────────────────────────────────────────────────────
   LÓGICA DE CÁLCULO

   Decaimento por instância:
     decInst(parte, instId) = decaimentoInst[instId] ?? decaimento (global)

   TJ corrigida por instância (entra no somatório da Rubrica C):
     remEfectivo  = remanescente × (1 − dispensaRem/100)
     tjCorrigida  = (tjBase + remEfectivo) × (1 − decInst_cliente/100)
     → Aplica-se o decaimento do cliente nessa instância sobre a TJ corrigida.
     → Para o somatório global, soma-se a TJ de TODAS as partes corrigida
       pelo decaimento de CADA parte nessa instância.

   Rubrica C — rateio ponderado (art. 32.º/2 Portaria 419-A/2009):
     somaTJCorrigida = Σ_inst Σ_parte [ (tjBase_p_i + remEfectivo_p_i) × (1 − dec_p_i/100) ]
     limGlobal       = 50% × somaTJCorrigida
     factorVitoria_p = média ponderada dos factores por instância (ou factor global se não diferenciado)
     somaFactores    = Σ factorVitoria_j  (partes com algum vencimento)
     limIndiv_p      = limGlobal × factorVitoria_p / somaFactores

   Rubrica A (TJ do cliente):
     tjBasePagaCliente = Σ_inst tjBase do cliente (sem remanescente, sem correcção)
     → Rubrica A não é afectada pelo decaimento por instância directamente;
       o decaimento entra via coeficiente final da nota.

   Coeficiente de parte autónoma/litis:
     coef_parte = decaimento_parte / 100  (usando decaimento global)

   Coeficiente final de cada nota:
     coef_final = coef_parte × factorVitoriaCliente_medio
     onde factorVitoriaCliente_medio = média dos factores de vitória do cliente por instância,
     ponderada pelas TJ corrigidas de cada instância.
═══════════════════════════════════════════════════════════════ */

const UC = 102;

/* ── Tabela I do RCP — valores exatos (DL 34/2008, Anexo I) ──
   [limite superior, col.A UC, col.B UC, col.C UC]            */
const TABELA_I = [
  [   2000,  1,   0.5,  1.5],
  [   8000,  2,   1,    3  ],
  [  16000,  3,   1.5,  4.5],
  [  24000,  4,   2,    6  ],
  [  30000,  5,   2.5,  7.5],
  [  40000,  6,   3,    9  ],
  [  60000,  7,   3.5, 10.5],
  [  80000,  8,   4,   12  ],
  [ 100000,  9,   4.5, 13.5],
  [ 150000, 10,   5,   15  ],
  [ 200000, 12,   6,   18  ],
  [ 250000, 14,   7,   21  ],
  [ 275000, 16,   8,   24  ],
];

/* Remanescente: € fixos por fração de €25.000 acima de €275.000
   Col. A = 3 UC = €306 | Col. B = 1,5 UC = €153 | Col. C = 4,5 UC = €459 */
const REM_EUR = { A: 306, B: 153, C: 459 };

/* ── Tabela II do RCP (art. 7.º, n.os 1, 4, 5 e 7) ──
   Coluna A = TJ normal (UC) | Coluna B = TJ agravada (n.º 3 art. 13.º)
   Cada entrada: { key, label, ucA: [min,max] | number, ucB: [min,max] | number }
   Quando min===max, é valor fixo.                                          */
const TABELA_II = [
  /* Procedimentos cautelares */
  { key: 'caut_ate300',    label: 'Proc. cautelar até € 300 000',                    ucA: 3,        ucB: 3.5,      grupo: 'Procedimentos cautelares' },
  { key: 'caut_sup300',    label: 'Proc. cautelar igual ou superior a € 300 000,01', ucA: 8,        ucB: 9,        grupo: 'Procedimentos cautelares' },
  { key: 'caut_complex',   label: 'Proc. cautelar de especial complexidade',          ucA: [9, 20],  ucB: [10, 22], grupo: 'Procedimentos cautelares' },
  { key: 'caut_restit',    label: 'Restituição provisória / alimentos / reparação provisória / regulação quantias', ucA: 1, ucB: 1, grupo: 'Procedimentos cautelares' },
  /* Processos administrativos e tributários urgentes */
  { key: 'admin_eleit',    label: 'Contencioso eleitoral',                            ucA: 1,        ucB: 1,        grupo: 'Processos administrativos e tributários urgentes' },
  { key: 'admin_precon',   label: 'Contencioso pré-contratual',                       ucA: 2,        ucB: 2,        grupo: 'Processos administrativos e tributários urgentes' },
  { key: 'admin_caduc',    label: 'Caducidade decretamento provisório cautelar (art. 110.º-A CPTA)', ucA: 1, ucB: 1, grupo: 'Processos administrativos e tributários urgentes' },
  { key: 'admin_impugn',   label: 'Impugnação proc. cautelares administração tributária / sigilo bancário', ucA: 2, ucB: 2, grupo: 'Processos administrativos e tributários urgentes' },
  /* Intervenção de terceiros */
  { key: 'interv_ate30',   label: 'Intervenção de terceiros até € 30 000',            ucA: 2,        ucB: 2,        grupo: 'Incidente de intervenção de terceiros e oposição' },
  { key: 'interv_sup30',   label: 'Intervenção de terceiros igual ou superior a € 30 000,01', ucA: 4, ucB: 4,      grupo: 'Incidente de intervenção de terceiros e oposição' },
  /* Incidentes */
  { key: 'inc_anomalo',    label: 'Incidentes/procedimentos anómalos',                ucA: [1, 3],   ucB: [1, 3],   grupo: 'Incidentes' },
  { key: 'inc_verificval', label: 'Verificação do valor da causa / produção antecipada de prova', ucA: 1, ucB: 1,  grupo: 'Incidentes' },
  { key: 'inc_complex',    label: 'Incidentes de especial complexidade',               ucA: [7, 14],  ucB: [7, 14], grupo: 'Incidentes' },
  { key: 'inc_outro',      label: 'Outros incidentes',                                ucA: [0.5, 5], ucB: [0.5, 5],grupo: 'Incidentes' },
  /* Execução */
  { key: 'exec_ate30',     label: 'Execução até € 30 000',                            ucA: 2,        ucB: 3,        grupo: 'Execução' },
  { key: 'exec_sup30',     label: 'Execução igual ou superior a € 30 000,01',         ucA: 4,        ucB: 6,        grupo: 'Execução' },
  { key: 'exec_noficial_ate30', label: 'Execução sem oficial de justiça até € 30 000', ucA: 0.25,   ucB: 0.375,    grupo: 'Execução' },
  { key: 'exec_noficial_sup30', label: 'Execução sem oficial de justiça ≥ € 30 000,01', ucA: 0.5,  ucB: 0.75,     grupo: 'Execução' },
  { key: 'exec_custas_ate30',   label: 'Execução por custas/multas/coimas até € 30 000', ucA: 2,   ucB: 2,         grupo: 'Execução' },
  { key: 'exec_custas_sup30',   label: 'Execução por custas/multas/coimas ≥ € 30 000,01', ucA: 4, ucB: 4,         grupo: 'Execução' },
  /* Reclamação de créditos */
  { key: 'recred_ate30',   label: 'Reclamação de créditos até € 30 000',              ucA: 2,        ucB: 2,        grupo: 'Reclamação de créditos' },
  { key: 'recred_sup30',   label: 'Reclamação de créditos ≥ € 30 000,01',             ucA: 4,        ucB: 4,        grupo: 'Reclamação de créditos' },
  /* Embargos / oposição */
  { key: 'emb_ate30',      label: 'Oposição/embargos de terceiro até € 30 000',       ucA: 3,        ucB: 3,        grupo: 'Embargos e oposição à execução' },
  { key: 'emb_sup30',      label: 'Oposição/embargos de terceiro ≥ € 30 000,01',      ucA: 6,        ucB: 6,        grupo: 'Embargos e oposição à execução' },
  /* Injunção */
  { key: 'inj_ate5',       label: 'Requerimento de injunção até € 5 000',             ucA: 0.5,      ucB: 0.75,     grupo: 'Requerimento de injunção' },
  { key: 'inj_5a15',       label: 'Requerimento de injunção € 5 000,01–€ 15 000',     ucA: 1,        ucB: 1.5,      grupo: 'Requerimento de injunção' },
  { key: 'inj_sup15',      label: 'Requerimento de injunção a partir de € 15 000,01', ucA: 1.5,      ucB: 2.25,     grupo: 'Requerimento de injunção' },
  /* Injunção europeia */
  { key: 'injeu_ate5',     label: 'Injunção europeia até € 5 000',                    ucA: 1,        ucB: 1.5,      grupo: 'Requerimento de injunção europeia' },
  { key: 'injeu_5a15',     label: 'Injunção europeia € 5 000–€ 15 000',               ucA: 2,        ucB: 3,        grupo: 'Requerimento de injunção europeia' },
  { key: 'injeu_sup15',    label: 'Injunção europeia a partir de € 15 000,01',         ucA: 3,        ucB: 4.5,      grupo: 'Requerimento de injunção europeia' },
  /* Outros */
  { key: 'reclamacao',     label: 'Reclamações / retificação / esclarecimento / reforma da sentença', ucA: [0.25, 3], ucB: [0.25, 3], grupo: 'Outros' },
  { key: 'mp_dl272',       label: 'Processos competência MP (DL 272/2001)',            ucA: 0.75,     ucB: 0.75,     grupo: 'Outros' },
];

/* ── Tabela III do RCP (art. 8.º, n.os 7 e 9) — processo penal ── */
const TABELA_III = [
  { label: 'Acusação particular',                        uc: [1, 3]  },
  { label: 'Abertura de instrução pelo arguido',         uc: [1, 3]  },
  { label: 'Recurso do despacho de pronúncia',           uc: [1, 5]  },
  { label: 'Recurso do despacho de não pronúncia',       uc: [3, 6]  },
  { label: 'Contestação/oposição — processo comum',      uc: [2, 6]  },
  { label: 'Contestação/oposição — processos especiais', uc: [0.5, 3]},
  { label: 'Condenação s/ contestação — processo comum', uc: [2, 6]  },
  { label: 'Condenação s/ contestação — proc. especiais',uc: [0.5, 2]},
  { label: 'Habeas corpus',                              uc: [1, 5]  },
  { label: 'Processos tutelares educativos',             uc: [1, 5]  },
  { label: 'Recurso para o tribunal da relação',         uc: [3, 6]  },
  { label: 'Recurso para a relação (art. 430.º CPP)',    uc: [4, 8]  },
  { label: 'Recurso para o Supremo Tribunal de Justiça', uc: [5, 10] },
  { label: 'Reclamações e pedidos de rectificação',      uc: [1, 3]  },
  { label: 'Fixação de jurisprudência (arts. 437.º e 446.º CPP)', uc: [1, 5] },
  { label: 'Recurso de revisão',                         uc: [1, 5]  },
  { label: 'Impugnação judicial em proc. contra-ordenacional', uc: [1, 5] },
];

/* ── Tabela IV do RCP (art. 17.º, n.os 2, 4, 5 e 6) — encargos ── */
const TABELA_IV = [
  { categoria: 'Peritos e peritagens',
    servico: '1 UC a 10 UC (por serviço)',
    fraccao: '1/10 UC (por página)' },
  { categoria: 'Traduções',
    servico: '—',
    fraccao: '1/3777 UC (por palavra)' },
  { categoria: 'Intérpretes',
    servico: '1 UC a 2 UC (por serviço)',
    fraccao: '—' },
  { categoria: 'Testemunhas',
    servico: '1/500 UC (por quilómetro)',
    fraccao: '—' },
  { categoria: 'Consultores técnicos',
    servico: '1 UC a 10 UC (por serviço)',
    fraccao: '1/15 UC (por página)' },
  { categoria: 'Liquidatários, administradores e entidades encarregadas da venda extrajudicial',
    servico: '1/255 UC (por quilómetro) + até 5% do valor da causa ou dos bens vendidos/administrados, se inferior',
    fraccao: '—' },
];

/* ── Tribunal Constitucional (DL 303/98) ── */
const TC_ACTOS = [
  { key: 'recurso',    label: 'Recurso (art. 84.º/2 Lei 28/82)',         min: 10, max: 50 },
  { key: 'sumaria',    label: 'Decisão sumária (art. 78.º-A/1)',         min: 2,  max: 10 },
  { key: 'naoconhece', label: 'TC não toma conhecimento',                min: 2,  max: 20 },
  { key: 'reclama',    label: 'Reclamações, arguições, esclarecimentos', min: 5,  max: 50 },
];

/* ── Labels das colunas ── */
const COL_LABEL = {
  A: 'Coluna A — Regra Geral / Litisconsórcio (Tab. I-A)',
  B: 'Coluna B — Coligação / Recursos (Tab. I-B)',
  C: 'Coluna C — Grandes Litigantes (Tab. I-C)',
  /* compatibilidade com código antigo */
  litis:  'Coluna A — Regra Geral / Litisconsórcio (Tab. I-A)',
  colig:  'Coluna B — Coligação / Recursos (Tab. I-B)',
  grande: 'Coluna C — Grandes Litigantes (Tab. I-C)',
};

const TIPO_LABEL = {
  '1inst':    '1.ª Instância',
  'apelacao': 'Apelação (Relação)',
  'revista':  'Revista / STJ',
  'tc':       'Tribunal Constitucional',
  'tab2':     'Tab. II (incidentes/execução/cautelares)',
};

/* Tipos que usam a Tabela II (não Tabela I) */
const TIPOS_TAB2 = new Set(['tab2']);
/* Tipos sem coluna A/B/C (valor livre ou intervalo UC) */
const TIPOS_LIVRE = new Set(['tc', 'tab2']);

/* Tipos com remanescente (Tabela I — art. 6.º, n.º 7 RCP) */
const TIPOS_COM_REM = new Set(['1inst', 'apelacao', 'revista']);

/* ══════════════════════════════════════════════════════════════
   Funções de cálculo de TJ
══════════════════════════════════════════════════════════════ */

/**
 * TJ teórica pela Tabela I para um valor e coluna ('A'|'B'|'C').
 * Mantém compatibilidade com 'litis'|'colig'|'grande'.
 */
function calcTJTeorica(valor, coluna) {
  if (valor <= 0) return { base: 0, baseUC: 0, rem: 0, remUC: 0, fracoes: 0, total: 0 };
  const col = normColuna(coluna);
  const colIdx = col === 'B' ? 2 : col === 'C' ? 3 : 1;

  let baseUC = TABELA_I[TABELA_I.length - 1][colIdx];
  for (const row of TABELA_I) {
    if (valor <= row[0]) { baseUC = row[colIdx]; break; }
  }

  let fracoes = 0, rem = 0;
  if (valor > 275000) {
    fracoes = Math.ceil((valor - 275000) / 25000);
    rem = fracoes * (REM_EUR[col] || 306);
  }

  const base = baseUC * UC;
  const remUC = rem / UC;
  return { base, baseUC, rem, remUC, fracoes, total: base + rem };
}

/** Normaliza coluna: 'litis'→'A', 'colig'→'B', 'grande'→'C', já 'A'/'B'/'C' passam. */
function normColuna(col) {
  if (col === 'litis'  || col === 'A') return 'A';
  if (col === 'colig'  || col === 'B') return 'B';
  if (col === 'grande' || col === 'C') return 'C';
  return 'A';
}

/**
 * TJ teórica de uma parte numa instância com coluna explícita.
 * Para coligação: soma dos membros, cada um com o seu valorPedido.
 * Para autónoma/litis: sobre o valorAcao.
 */
function calcTJTeoricaParteInst(parte, valorAcao, coluna) {
  const col = normColuna(coluna);
  if (parte.relacao === 'colig') {
    return parte.membros.reduce((s, m) => {
      const v = m.valorPedido > 0 ? m.valorPedido : valorAcao;
      return s + calcTJTeorica(v, col).base;
    }, 0);
  }
  return calcTJTeorica(valorAcao, col).base;
}

/**
 * Remanescente estimado de uma parte para uma instância com coluna explícita.
 * Para coligação: soma dos membros.
 */
function calcRemParteInst(parte, valorAcao, coluna) {
  const col = normColuna(coluna);
  if (parte.relacao === 'colig') {
    return parte.membros.reduce((s, m) => {
      const v = m.valorPedido > 0 ? m.valorPedido : valorAcao;
      return s + calcTJTeorica(v, col).rem;
    }, 0);
  }
  return calcTJTeorica(valorAcao, col).rem;
}

/* Aliases para compatibilidade */
function calcTJBaseParte(parte, valorAcao) {
  const col = parte.relacao === 'colig' ? 'B' : 'A';
  return calcTJTeoricaParteInst(parte, valorAcao, col);
}
function calcRemParte(parte, valorAcao) {
  const col = parte.relacao === 'colig' ? 'B' : 'A';
  return calcRemParteInst(parte, valorAcao, col);
}
const calcTJTeoricaParte = calcTJBaseParte;
const calcRemTeoricoParte = calcRemParte;

function naturezaToColuna(relacao) {
  if (relacao === 'colig') return 'B';
  return 'A';
}

/* ══════════════════════════════════════════════════════════════
   Formatação
══════════════════════════════════════════════════════════════ */
function fmtEuro(v) {
  return (v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtEuroLong(v) { return '€\u00a0' + fmtEuro(v); }
function fmtPct(v) { return (v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) + '%'; }

/* ══════════════════════════════════════════════════════════════
   Helper — decaimento efectivo de uma parte numa instância
   Usa decaimentoInst[instId] se existir; caso contrário, usa decaimento global.
══════════════════════════════════════════════════════════════ */
function decEfectivo(parte, instId) {
  if (parte.decaimentoInst && instId != null && parte.decaimentoInst[instId] != null) {
    return parte.decaimentoInst[instId];
  }
  return parte.decaimento || 0;
}

/* ══════════════════════════════════════════════════════════════
   Cálculo principal — computeResult
══════════════════════════════════════════════════════════════ */
function computeResult(state) {
  const {
    valorAcao = 0,
    estimarRem = false,
    cliente,
    partes = [],
    insts = [],
    encargos = [],
    limHon = false,
    honReais = 0,
  } = state;

  if (!cliente) return null;

  // Decaimento global do cliente (usado como fallback e para coeficientes das notas)
  const decClienteGlobal = (cliente.decaimento || 0) / 100;
  const factorClienteGlobal = 1 - decClienteGlobal;

  const todasPartes = [cliente, ...partes];
  const partesUnicas = [cliente, ...partes].filter(
    (p, i, arr) => arr.findIndex(x => x.id === p.id) === i
  );

  /* ══════════════════════════════════════════════════════════════
     AGRUPAMENTO DE INSTÂNCIAS POR CONJUNTO DE PARTES ACTIVAS
     ══════════════════════════════════════════════════════════════
     Duas instâncias pertencem ao mesmo grupo se e só se o conjunto
     de partes com tjPaga > 0 (ou explicitamente incluídas) for
     exactamente igual. Cada grupo é calculado de forma independente:
     o seu próprio somaTJCorrigida, limGlobal, factoresVitoria e
     limIndiv. As notas finais somam as contribuições de todos os
     grupos em que cada parte participou.

     Caso degenerado: todas as instâncias com o mesmo conjunto de
     partes → um único grupo → resultado idêntico ao cálculo anterior.
  */

  /* ── Chave de agrupamento: IDs das partes com tjPaga > 0, ordenados ── */
  function chaveGrupo(inst) {
    const ids = (inst.tjPartes || [])
      .filter(tp => (tp.tjPaga || 0) > 0)
      .map(tp => tp.partId)
      .sort((a, b) => a - b);
    return ids.join(',');
  }

  /* ── Construir grupos ── */
  const gruposMap = new Map(); // chave → { instâncias[] }
  insts.forEach(inst => {
    const k = chaveGrupo(inst);
    if (!gruposMap.has(k)) gruposMap.set(k, []);
    gruposMap.get(k).push(inst);
  });
  const grupos = Array.from(gruposMap.values());

  /* ── Processar cada grupo ── */

  // Acumuladores globais para display
  let somaTJBase      = 0;
  let somaRemEstimado = 0;
  let somaTJCorrigida = 0; // soma bruta TJ + rem efectivo, SEM factor de vitória (base do limGlobal)
  const instDetalheAll = []; // instDetalhe de todos os grupos (para display)

  // Contribuições por nota: Map<"parteId[-membroId]" → { rubrA, rubrC, factorCliente }>
  const contrib = new Map();

  // Para display: limGlobal e limIndiv do cliente — soma sobre grupos
  let limGlobalTotal  = 0;
  let limIndivTotal   = 0;
  let rubrCLimitada   = false;

  // Para display: factoresVitoria agregados (ponderados pela TJ de cada grupo)
  const fvAgregado = new Map(); // parteId → { fvPeso, pesoTotal }
  partesUnicas.forEach(p => fvAgregado.set(p.id, { fvPeso: 0, pesoTotal: 0 }));

  grupos.forEach(instsGrupo => {

    /* ── IDs das partes activas neste grupo ── */
    const idsActivos = new Set(
      instsGrupo.flatMap(inst =>
        (inst.tjPartes || [])
          .filter(tp => (tp.tjPaga || 0) > 0)
          .map(tp => tp.partId)
      )
    );
    const partesGrupo = partesUnicas.filter(p => idsActivos.has(p.id));

    /* ── 1g. TJ base do cliente neste grupo ── */
    const tjClienteGrupo = instsGrupo.reduce((s, inst) => {
      const tp = inst.tjPartes?.find(p => p.partId === cliente.id);
      return s + (tp?.tjPaga || 0);
    }, 0);

    /* ── 2g. somaTJCorrigida do grupo ── */
    let somaTJGrupo        = 0;
    let somaRemGrupo       = 0; // remanescente efectivo do cliente neste grupo

    const instDetalheGrupo = instsGrupo.map(inst => {
      const dispensaFrac = (inst.dispensaRem || 0) / 100;
      let tjBaseInst = 0, remInstTotal = 0, tjCorrigidaInst = 0;

      const tjPartesCorrigidas = (inst.tjPartes || []).map(tp => {
        const parte = partesUnicas.find(p => p.id === tp.partId);
        if (!parte) return { ...tp, remEfectivo: 0, tjCorrigida: tp.tjPaga || 0 };

        const tjBase = tp.tjPaga || 0;
        tjBaseInst   += tjBase;
        somaTJBase   += tjBase; // acumulador global

        let remEfectivo = 0;
        if (estimarRem && TIPOS_COM_REM.has(inst.tipo) && tjBase > 0) {
          const col      = normColuna(tp.coluna || 'A');
          const remTotal = calcRemParteInst(parte, valorAcao, col);
          remEfectivo    = remTotal * (1 - dispensaFrac);
          remInstTotal  += remEfectivo;
          if (parte.id === cliente.id) {
            somaRemEstimado += remEfectivo; // global
            somaRemGrupo    += remEfectivo;
          }
        }

        const tjBruta       = tjBase + remEfectivo;
        somaTJCorrigida    += tjBruta; // global
        somaTJGrupo        += tjBruta;
        tjCorrigidaInst    += tjBruta;

        const decParte         = decEfectivo(parte, inst.id) / 100;
        const factorVitoriaParte = 1 - decParte;
        const tjCorr           = tjBruta * factorVitoriaParte;

        return { ...tp, remEfectivo, tjCorrigida: tjCorr, decUsado: decParte * 100, factorVitoria: factorVitoriaParte };
      });

      const detalhe = { ...inst, dispensaFrac, tjBaseInst, remInstTotal, tjCorrigidaInst, tjPartesCorrigidas };
      instDetalheAll.push(detalhe);
      return detalhe;
    });

    /* ── 3g. limGlobal do grupo ── */
    const limGlobalGrupo = somaTJGrupo * 0.5;
    limGlobalTotal += limGlobalGrupo;

    /* ── 4g. factoresVitoria do grupo (só sobre partesGrupo) ── */
    const factoresVitoriaGrupo = partesGrupo.map(parte => {
      const temDecPorInst = parte.decaimentoInst && Object.keys(parte.decaimentoInst).length > 0;
      let fv;
      if (temDecPorInst) {
        // Ponderar pelo tjPaga (não pelo tjCorrigida): evita fallback errado quando
        // uma parte tem dec=100% numa instância (tjCorrigida=0 mas tjPaga>0).
        let pesoTotal = 0, fvPonderado = 0;
        instDetalheGrupo.forEach(inst => {
          const tp = inst.tjPartesCorrigidas?.find(t => t.partId === parte.id);
          if (!tp) return;
          const tjBase = tp.tjPaga || 0; // peso = TJ paga, independente do factor de vitória
          const dec    = decEfectivo(parte, inst.id) / 100;
          fvPonderado += (1 - dec) * tjBase;
          pesoTotal   += tjBase;
        });
        fv = pesoTotal > 0 ? fvPonderado / pesoTotal : (1 - (parte.decaimento || 0) / 100);
      } else {
        fv = 1 - (parte.decaimento || 0) / 100;
      }
      // Acumular para display agregado
      const agg = fvAgregado.get(parte.id);
      if (agg) { agg.fvPeso += fv * somaTJGrupo; agg.pesoTotal += somaTJGrupo; }
      return { id: parte.id, fv };
    });

    const somaFVGrupo  = factoresVitoriaGrupo.reduce((s, x) => x.fv > 0 ? s + x.fv : s, 0);
    const fvClienteGrupo = factoresVitoriaGrupo.find(x => x.id === cliente.id)?.fv || factorClienteGlobal;

    /* ── 5g. limIndiv do cliente neste grupo ── */
    const limIndivClienteGrupoBruto = somaFVGrupo > 0
      ? limGlobalGrupo * fvClienteGrupo / somaFVGrupo
      : 0;
    let limIndivClienteGrupo = limIndivClienteGrupoBruto;
    // Limite de honorários: aplica proporcionalmente ao peso do grupo no total
    if (limHon && honReais > 0) {
      // Será aplicado globalmente no final; aqui guarda-se o valor bruto
    }
    limIndivTotal += limIndivClienteGrupo;

    /* ── 6g. Contribuições das notas neste grupo ── */
    // Partes vencidas activas neste grupo
    const partesVencidasGrupo = partesGrupo.filter(p =>
      p.id !== cliente.id && (p.decaimento || 0) > 0
    );

    // Construir notasTemp do grupo
    // decEfectivoGrupo: usa o factor de vitória calculado para este grupo (já ponderado
    // pelo decaimento por instância quando aplicável), em vez do decaimento global.
    const notasTempGrupo = [];
    partesVencidasGrupo.forEach(parte => {
      const fvParteGrupo  = factoresVitoriaGrupo.find(x => x.id === parte.id)?.fv ?? (1 - (parte.decaimento || 0) / 100);
      const decGrupoP     = 1 - fvParteGrupo; // decaimento efectivo neste grupo
      if (parte.relacao === 'colig' && parte.membros.length > 0) {
        const totalPedidos    = parte.membros.reduce((s, m) => s + (m.valorPedido || 0), 0);
        const temDecIndividual = parte.membros.some(
          m => m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== ''
        );
        parte.membros.forEach(m => {
          let coefParte;
          if (temDecIndividual) {
            const decM = (m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== '')
              ? (m.decaimento / 100) : decGrupoP;
            coefParte = decM;
          } else {
            const prop = totalPedidos > 0 ? (m.valorPedido || 0) / totalPedidos : 1 / parte.membros.length;
            coefParte  = decGrupoP * prop;
          }
          const propPedido = totalPedidos > 0
            ? (m.valorPedido || 0) / totalPedidos
            : 1 / parte.membros.length;
          notasTempGrupo.push({
            parteId: parte.id, membroId: m.id,
            nome: m.nome || parte.nome, grupo: parte.nome, relacao: parte.relacao,
            coefParte, pesoRubrA: coefParte,
            proporcao: propPedido, valorPedido: m.valorPedido || 0,
            totalPedidosGrupo: totalPedidos,
          });
        });
      } else {
        notasTempGrupo.push({
          parteId: parte.id, membroId: null,
          nome: parte.nome, grupo: null, relacao: parte.relacao,
          coefParte: decGrupoP, pesoRubrA: decGrupoP,
          proporcao: null, valorPedido: null, totalPedidosGrupo: null,
        });
      }
    });

    // Rubrica A: não normalizar — o coefParte já é o coeficiente final correcto.
    // rubrA = tjCliente × coefParte × fvCliente (sem divisão pelo somaCoef)
    // Exemplo: T com dec=43% → rubrA = 1632 × 0,43 × 1,0 = 701,76 ✓
    const nVencidosGrupo = notasTempGrupo.length;
    notasTempGrupo.forEach(n => { n.nVencidosTotal = nVencidosGrupo; });

    // Calcular fvCliente neste grupo para rubrC
    const fvCli = fvClienteGrupo;

    // Acumular contribuições
    notasTempGrupo.forEach(n => {
      const chaveNota = n.parteId + (n.membroId != null ? '-' + n.membroId : '');
      const rubrAContrib = tjClienteGrupo * n.coefParte * fvCli;
      const coefRubrC    = n.coefParte * fvCli;
      // Rubrica C: usa o limIndiv do CLIENTE neste grupo (não da parte vencida)
      // Semântica: o cliente recupera até ao seu limite, rateado pelo decaimento de cada parte
      const rubrCContrib = limIndivClienteGrupo * coefRubrC;

      if (!contrib.has(chaveNota)) {
        contrib.set(chaveNota, {
          parteId: n.parteId, membroId: n.membroId,
          nome: n.nome, grupo: n.grupo, relacao: n.relacao,
          proporcao: n.proporcao, valorPedido: n.valorPedido,
          totalPedidosGrupo: n.totalPedidosGrupo,
          coefParte: n.coefParte, // decaimento global da parte
          rubrA: 0, rubrC: 0,
          factorCliente: fvCli,
          nVencidosTotal: nVencidosGrupo,
        });
      }
      const c = contrib.get(chaveNota);
      c.rubrA += rubrAContrib;
      c.rubrC += rubrCContrib;
      // factorCliente e nVencidosTotal do maior grupo (informativo)
    });
  }); // fim forEach grupos

  /* ── Remanescente total e imputação (global, para display) ── */
  const somaRemTotal = instDetalheAll.reduce((s, inst) =>
    s + (inst.tjPartesCorrigidas || []).reduce((ss, tp) => ss + (tp.remEfectivo || 0), 0), 0);

  const poolRemImputavel = instDetalheAll.reduce((s, inst) =>
    s + (inst.tjPartesCorrigidas || []).reduce((ss, tp) => {
      const parte = partesUnicas.find(p => p.id === tp.partId);
      if (!parte) return ss;
      const fv = 1 - decEfectivo(parte, inst.id) / 100;
      return ss + (tp.remEfectivo || 0) * fv;
    }, 0), 0);

  const somaDecVencidas = partesUnicas.reduce((s, p) => s + (p.decaimento || 0), 0);
  const imputacaoRem = partesUnicas
    .filter(p => (p.decaimento || 0) > 0)
    .map(p => {
      const proporcao = somaDecVencidas > 0 ? (p.decaimento || 0) / somaDecVencidas : 0;
      return { parteId: p.id, nome: p.nome, decaimento: p.decaimento || 0, proporcao, montante: poolRemImputavel * proporcao };
    });

  /* ── Limite de honorários: aplicar ao limIndivTotal ── */
  const limIndivClienteBruto = limIndivTotal;
  let limIndiv = limIndivClienteBruto;
  if (limHon && honReais > 0 && honReais < limIndivClienteBruto) {
    limIndiv    = honReais;
    rubrCLimitada = true;
    // Reescalar rubrC de cada contribuição proporcionalmente
    const escala = honReais / limIndivClienteBruto;
    contrib.forEach(c => { c.rubrC *= escala; });
  }

  /* ── factoresVitoria agregados para display ── */
  const factoresVitoria = partesUnicas.map(p => {
    const agg = fvAgregado.get(p.id);
    const fv  = agg && agg.pesoTotal > 0 ? agg.fvPeso / agg.pesoTotal : (1 - (p.decaimento || 0) / 100);
    return { id: p.id, fv };
  });
  const somaFactoresVitoria = factoresVitoria.reduce((s, x) => x.fv > 0 ? s + x.fv : s, 0);
  const nVencedores         = factoresVitoria.filter(x => x.fv > 0).length;
  const fvCliente           = factoresVitoria.find(x => x.id === cliente.id)?.fv || factorClienteGlobal;
  const factorCliente       = fvCliente;

  /* ── TJ base paga pelo cliente (global, para Rubrica A display) ── */
  const tjBasePagaCliente = insts.reduce((s, inst) => {
    const tp = inst.tjPartes?.find(p => p.partId === cliente.id);
    return s + (tp?.tjPaga || 0);
  }, 0);

  /* ── Rubrica B (global) ── */
  const rubrB = encargos.reduce((s, e) => s + (e.val || 0), 0);

  /* ── Construir notasIndividuais a partir das contribuições ── */
  const partesVencidas  = partes.filter(p => (p.decaimento || 0) > 0);
  const notasIndividuais = [];

  /* Rubrica B: rateada globalmente por todas as partes vencidas (mantém comportamento actual) */
  // Calcular coeficientes globais para rubrB (proporcional ao decaimento global)
  const notasBTemp = [];
  partesVencidas.forEach(parte => {
    const decGrupoP = (parte.decaimento || 0) / 100;
    if (parte.relacao === 'colig' && parte.membros.length > 0) {
      const totalPedidos     = parte.membros.reduce((s, m) => s + (m.valorPedido || 0), 0);
      const temDecIndividual = parte.membros.some(
        m => m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== ''
      );
      parte.membros.forEach(m => {
        let coefParte;
        if (temDecIndividual) {
          const decM = (m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== '')
            ? (m.decaimento / 100) : decGrupoP;
          coefParte = decM;
        } else {
          const prop = totalPedidos > 0 ? (m.valorPedido || 0) / totalPedidos : 1 / parte.membros.length;
          coefParte  = decGrupoP * prop;
        }
        notasBTemp.push({ parteId: parte.id, membroId: m.id, coefParte });
      });
    } else {
      notasBTemp.push({ parteId: parte.id, membroId: null, coefParte: decGrupoP });
    }
  });
  const somaDecB   = notasBTemp.reduce((s, n) => s + n.coefParte, 0);
  const nNotasB    = notasBTemp.length;
  notasBTemp.forEach(n => {
    n.pesoRubrB = somaDecB > 0 ? n.coefParte / somaDecB : 1 / nNotasB;
  });

  contrib.forEach((c, chaveNota) => {
    const bEntry = notasBTemp.find(n =>
      n.parteId === c.parteId && n.membroId === c.membroId
    );
    const pesoB  = bEntry ? bEntry.pesoRubrB : 0;
    const rubrBNota = rubrB * pesoB * factorCliente;
    notasIndividuais.push({
      parteId: c.parteId, membroId: c.membroId,
      nome: c.nome, grupo: c.grupo, relacao: c.relacao,
      coef: c.coefParte * factorCliente,
      coefParte: c.coefParte, factorCliente,
      pesoRubrA: null, // já incorporado em rubrA (multi-grupo)
      nVencidosTotal: c.nVencidosTotal,
      proporcao: c.proporcao, valorPedido: c.valorPedido,
      totalPedidosGrupo: c.totalPedidosGrupo,
      rubrA: c.rubrA,
      rubrB: rubrBNota,
      rubrC: c.rubrC,
      total: c.rubrA + rubrBNota + c.rubrC,
    });
  });

  const totalAReceber   = notasIndividuais.reduce((s, n) => s + n.total, 0);
  const somaRubrA       = notasIndividuais.reduce((s, n) => s + n.rubrA, 0);
  const somaRubrC       = notasIndividuais.reduce((s, n) => s + n.rubrC, 0);
  // limIndiv já incorpora fvCliente — não multiplicar novamente por factorCliente
  const naoEnriquecimento = somaRubrA <= tjBasePagaCliente * factorCliente + 0.02
                          && somaRubrC <= limIndiv + 0.02;

  const somaTJTotal  = somaTJBase + somaRemEstimado;
  const limGlobal    = limGlobalTotal; // soma dos limGlobal de cada grupo (para display)
  // Reordenar pela ordem original de insts (os grupos podem ter alterado a ordem)
  const instDetalheMap = new Map(instDetalheAll.map(d => [d.id, d]));
  const instDetalhe    = insts.map(inst => instDetalheMap.get(inst.id)).filter(Boolean);
  const totalBruto   = tjBasePagaCliente + rubrB + limIndiv;

  return {
    valorAcao, estimarRem, cliente, partes, todasPartes, partesUnicas,
    decCliente: decClienteGlobal, factorCliente,
    tjBasePagaCliente,
    somaRemEstimado, somaRemTotal, poolRemImputavel, imputacaoRem, rubrB,
    somaTJBase, somaTJTotal, somaTJCorrigida,
    nVencedores, somaFactoresVitoria, factoresVitoria, limGlobal, limIndiv, rubrCLimitada,
    totalBruto,
    partesVencidas, notasIndividuais,
    totalAReceber, somaRubrA, somaRubrC, naoEnriquecimento,
    encargos, insts, instDetalhe, limHon, honReais,
    colLabel: COL_LABEL,
    tipoLabel: TIPO_LABEL,
  };
}
