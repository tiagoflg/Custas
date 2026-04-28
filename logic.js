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

  /* ── 1. TJ base efectivamente paga pelo cliente (Rubrica A) ──
     Soma simples das TJ pagas, sem correcção de decaimento.
     O decaimento entra via coeficiente final de cada nota. */
  const tjBasePagaCliente = insts.reduce((s, inst) => {
    const tp = inst.tjPartes?.find(p => p.partId === cliente.id);
    return s + (tp?.tjPaga || 0);
  }, 0);

  /* ── 2. Rubrica B ── */
  const rubrB = encargos.reduce((s, e) => s + (e.val || 0), 0);

  /* ── 3. Somatório de TJ para Rubrica C ──

     Por instância, para cada parte:
       dispensaFrac  = dispensaRem_inst / 100
       remEfectivo   = remanescente × (1 − dispensaFrac)

     A base do limite de 50% (art. 26.º/6 RCP) é a soma de TODAS as TJ
     efectivamente pagas + remanescente efectivo, SEM desconto de decaimento.
     O decaimento só entra nas notas individuais (coeficiente por parte).

     A "TJ corrigida" mostrada no detalhe tem valor informativo:
       tjCorrigida = (tjBase + remEfectivo) × (1 − dec_parte_inst/100)
     — representa o contributo líquido de cada parte para o rateio, mas
     NÃO é usada como base do limite global.
  */
  let somaTJBase = 0;
  let somaRemEstimado = 0;
  let somaTJCorrigida = 0; // base real para o limite: sem factor de vitória

  const instDetalhe = insts.map(inst => {
    const dispensaFrac = ((inst.dispensaRem || 0)) / 100;
    let tjBaseInst = 0;
    let remInstTotal = 0;
    let tjCorrigidaInst = 0;

    const tjPartesCorrigidas = (inst.tjPartes || []).map(tp => {
      const parte = partesUnicas.find(p => p.id === tp.partId);
      if (!parte) return { ...tp, remEfectivo: 0, tjCorrigida: tp.tjPaga || 0 };

      const tjBase = tp.tjPaga || 0;
      tjBaseInst += tjBase;
      somaTJBase += tjBase;

      let remEfectivo = 0;
      if (estimarRem && !TIPOS_LIVRE.has(inst.tipo)) {
        const col = normColuna(tp.coluna || 'A');
        const remTotal = calcRemParteInst(parte, valorAcao, col);
        remEfectivo = remTotal * (1 - dispensaFrac);
        remInstTotal += remEfectivo;
        if (parte.id === cliente.id) somaRemEstimado += remEfectivo;
      }

      // Base para o limite de 50%: TJ + rem efectivo, SEM factor de vitória
      const tjBruta = tjBase + remEfectivo;
      somaTJCorrigida += tjBruta;
      tjCorrigidaInst += tjBruta;

      // Factor de vitória: apenas para exibição informativa no detalhe
      const decParte = decEfectivo(parte, inst.id) / 100;
      const factorVitoriaParte = 1 - decParte;
      const tjCorr = tjBruta * factorVitoriaParte; // informativo

      return { ...tp, remEfectivo, tjCorrigida: tjCorr, decUsado: decParte * 100, factorVitoria: factorVitoriaParte };
    });

    return { ...inst, dispensaFrac, tjBaseInst, remInstTotal, tjCorrigidaInst, tjPartesCorrigidas };
  });

  const somaTJTotal = somaTJBase + somaRemEstimado; // mantém compatibilidade no display

  /* ── 3b. Remanescente total efectivo de todas as partes (para display) ── */
  const somaRemTotal = instDetalhe.reduce((s, inst) => {
    return s + (inst.tjPartesCorrigidas || []).reduce((ss, tp) => ss + (tp.remEfectivo || 0), 0);
  }, 0);

  /* ── 3c. Imputação do remanescente às partes vencidas ──
     Pool imputável = Σ_i (rem_i × fv_i)   [contributo de cada parte na proporção da sua vitória]
     Parte vencida j recebe: pool × (dec_j / Σ dec_k)   [k = todas as partes com dec > 0]

     Nota: uma parte com vitória parcial é simultaneamente emitente (pelo lado da vitória)
     e receptora (pelo lado do decaimento). */
  const poolRemImputavel = instDetalhe.reduce((s, inst) => {
    return s + (inst.tjPartesCorrigidas || []).reduce((ss, tp) => {
      const parte = partesUnicas.find(p => p.id === tp.partId);
      if (!parte) return ss;
      const fv = 1 - decEfectivo(parte, inst.id) / 100;
      return ss + (tp.remEfectivo || 0) * fv;
    }, 0);
  }, 0);

  const somaDecVencidas = partesUnicas.reduce((s, p) => s + (p.decaimento || 0), 0);

  const imputacaoRem = partesUnicas
    .filter(p => (p.decaimento || 0) > 0)
    .map(p => {
      const proporcao = somaDecVencidas > 0 ? (p.decaimento || 0) / somaDecVencidas : 0;
      return {
        parteId: p.id,
        nome: p.nome,
        decaimento: p.decaimento || 0,
        proporcao,
        montante: poolRemImputavel * proporcao,
      };
    });

  /* ── 4. Limite global Rubrica C ──
     50% do somatório real (TJ pagas + rem. efectivo, sem factor de vitória). */
  const limGlobal = somaTJCorrigida * 0.5;

  /* ── 5. Factor de vitória de cada parte para o rateio (art. 32.º/2) ──
     Quando há decaimento por instância, o factor de vitória de cada parte
     é ponderado pelas TJ corrigidas de cada instância em que participou.
     Se não houver decaimento por instância, usa o factor global. */
  const factoresVitoria = partesUnicas.map(parte => {
    // Verificar se esta parte tem decaimento diferenciado por instância
    const temDecPorInst = parte.decaimentoInst && Object.keys(parte.decaimentoInst).length > 0;
    let fv;
    if (temDecPorInst) {
      // Factor ponderado: média dos factores de vitória por instância,
      // ponderada pela TJ corrigida de cada instância
      let pesoTotal = 0;
      let fvPonderado = 0;
      instDetalhe.forEach(inst => {
        const tp = inst.tjPartesCorrigidas?.find(t => t.partId === parte.id);
        if (!tp) return;
        const tjCorr = tp.tjCorrigida || 0;
        const dec = decEfectivo(parte, inst.id) / 100;
        fvPonderado += (1 - dec) * tjCorr;
        pesoTotal += tjCorr;
      });
      fv = pesoTotal > 0 ? fvPonderado / pesoTotal : (1 - (parte.decaimento || 0) / 100);
    } else {
      fv = 1 - (parte.decaimento || 0) / 100;
    }
    return { id: parte.id, fv };
  });

  const somaFactoresVitoria = factoresVitoria.reduce((s, x) => x.fv > 0 ? s + x.fv : s, 0);
  const nVencedores = factoresVitoria.filter(x => x.fv > 0).length;

  const fvCliente = factoresVitoria.find(x => x.id === cliente.id)?.fv || factorClienteGlobal;
  const limIndivClienteBruto = somaFactoresVitoria > 0
    ? limGlobal * fvCliente / somaFactoresVitoria
    : 0;
  let limIndiv = limIndivClienteBruto;
  let rubrCLimitada = false;
  if (limHon && honReais > 0 && honReais < limIndivClienteBruto) {
    limIndiv = honReais;
    rubrCLimitada = true;
  }

  /* ── 6. Factor do cliente para coeficientes das notas ──
     Usa o factor global como proxy (decaimento médio do cliente).
     Para efeitos das rubricas A e B nas notas individuais, este é o comportamento esperado. */
  const factorCliente = fvCliente;

  /* ── 7. Total base ── */
  const totalBruto = tjBasePagaCliente + rubrB + limIndiv;

  /* ── 8. Notas autónomas ── */
  const partesVencidas = partes.filter(p => (p.decaimento || 0) > 0);
  const notasIndividuais = [];

  /* Rubrica A (e B) — rateio da TJ do cliente pelas partes vencidas
     (art. 527.º/528.º CPC):
     a vencedora pagou a TJ uma só vez — não pode imputá-la integralmente
     a cada vencido.

     Critério de distribuição — proporcional ao decaimento individual:
       pesoRubrA_X = decaimento_X / soma_de_todos_os_decaimentos_individuais

     Isto garante que:
       • quem perdeu mais paga mais da TJ (proporcionalidade);
       • a soma de todos os pesos = 1 → não-enriquecimento garantido;
       • membros de coligação entram no pool geral com o seu coeficiente individual.

     Fallback (todos os decaimentos = 0): divisão igualitária por cabeças.

     pesoRubrA_X = fracção da TJ imputada a esta nota (soma = 1)
     rubrA_X     = tjBasePagaCliente × pesoRubrA_X × factorCliente
     rubrB_X     = rubrB             × pesoRubrA_X × factorCliente  (mesmo critério)
     rubrC_X     = limIndiv × coefParte_X × factorCliente           (decaimento × vitória)
  */

  // Primeiro passo: calcular o coeficiente individual de cada vencido
  // para depois normalizar pelo total (denominador comum)
  const notasTemp = [];
  partesVencidas.forEach(parte => {
    const decGrupo = (parte.decaimento || 0) / 100;

    if (parte.relacao === 'colig' && parte.membros.length > 0) {
      const totalPedidos = parte.membros.reduce((s, m) => s + (m.valorPedido || 0), 0);
      const temDecIndividual = parte.membros.some(
        m => m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== ''
      );
      parte.membros.forEach(m => {
        // Coeficiente de decaimento deste membro
        let coefParte;
        if (temDecIndividual) {
          const decM = (m.decaimento !== null && m.decaimento !== undefined && m.decaimento !== '')
            ? (m.decaimento / 100) : decGrupo;
          coefParte = decM;
        } else {
          const prop = totalPedidos > 0 ? (m.valorPedido || 0) / totalPedidos : 1 / parte.membros.length;
          coefParte = decGrupo * prop;
        }
        const propPedido = totalPedidos > 0
          ? (m.valorPedido || 0) / totalPedidos
          : 1 / parte.membros.length;

        notasTemp.push({
          parteId: parte.id, membroId: m.id,
          nome: m.nome || parte.nome, grupo: parte.nome, relacao: parte.relacao,
          coefParte,           // decaimento individual (para Rubrica C e peso)
          pesoRubrA: coefParte, // provisório — normalizado abaixo
          proporcao: propPedido,
          valorPedido: m.valorPedido || 0,
          totalPedidosGrupo: totalPedidos,
        });
      });
    } else {
      // Autónoma / litisconsórcio
      notasTemp.push({
        parteId: parte.id, membroId: null,
        nome: parte.nome, grupo: null, relacao: parte.relacao,
        coefParte: decGrupo,
        pesoRubrA: decGrupo,  // provisório — normalizado abaixo
        proporcao: null, valorPedido: null,
        totalPedidosGrupo: null,
      });
    }
  });

  // Normalizar os pesos pela soma total dos decaimentos individuais
  const nVencidosTotal = notasTemp.length;
  const somaDecaimentos = notasTemp.reduce((s, n) => s + n.coefParte, 0);
  notasTemp.forEach(n => {
    n.pesoRubrA = somaDecaimentos > 0 ? n.coefParte / somaDecaimentos : 1 / nVencidosTotal;
    n.nVencidosTotal = nVencidosTotal;
  });

  notasTemp.forEach(n => {
    const coef = n.coefParte * factorCliente;
    notasIndividuais.push({
      parteId: n.parteId,
      membroId: n.membroId,
      nome: n.nome,
      grupo: n.grupo,
      relacao: n.relacao,
      coef, coefParte: n.coefParte, factorCliente,
      pesoRubrA: n.pesoRubrA,
      nVencidosTotal: n.nVencidosTotal,
      proporcao: n.proporcao,
      valorPedido: n.valorPedido,
      totalPedidosGrupo: n.totalPedidosGrupo,
      rubrA: tjBasePagaCliente * n.pesoRubrA * factorCliente,
      rubrB: rubrB           * n.pesoRubrA * factorCliente,
      rubrC: limIndiv * coef,
      total: tjBasePagaCliente * n.pesoRubrA * factorCliente
           + rubrB             * n.pesoRubrA * factorCliente
           + limIndiv * coef,
    });
  });

  const totalAReceber = notasIndividuais.reduce((s, n) => s + n.total, 0);
  const somaRubrA = notasIndividuais.reduce((s, n) => s + n.rubrA, 0);
  const somaRubrC = notasIndividuais.reduce((s, n) => s + n.rubrC, 0);
  const naoEnriquecimento = somaRubrA <= tjBasePagaCliente * factorCliente + 0.02
                         && somaRubrC <= limIndiv * factorCliente + 0.02;

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
