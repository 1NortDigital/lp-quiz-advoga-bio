// LP-Quiz para Google Sheets (ROTEADOR multi-segmento)
// Recebe o POST das LPs e grava na aba certa conforme o campo "pagina".
// Mesma planilha, mesmo script, mesma URL /exec pras LPs (Solar, Advoga, Móveis e Food).
//
// PUBLICAR/ATUALIZAR: script.google.com (conta dona da planilha) > cola este arquivo,
//   confere o SHEET_ID, Ctrl+S > Implantar > Gerenciar implantacoes > editar (lapis)
//   > Nova versao > Implantar. A URL /exec continua a mesma.
//
// ATENCAO: a planilha tem DUAS implantacoes /exec ativas, em versoes diferentes:
//   AKfycbzYM6CdDzk5...  -> lp-quiz-1nort (Solar) e lp-quiz-advoga
//   AKfycbydV26wxGU4...  -> lp-quiz-food e lp-quiz-heleva
//   Repita o 'Nova versao' nas DUAS, senao metade das LPs fica na versao antiga.

var SHEET_ID = '1NABMLnzCLeAOM6TOrmNTpmOHl96cJrogWcSLxkrqU24';

// um schema por segmento: aba destino + colunas (chaves) + titulos (cabecalho)
var SCHEMAS = {
  solar: {
    aba: 'Leads',
    colunas: [
      'data_hora','tier','qualificado','top_tier','score',
      'nome','telefone','email','cidade',
      'papel','projetos','desafio','foco_vendedor','nao_atuo','trafego','instagram',
      'pagina','utm_source','utm_medium','utm_campaign','utm_content',
      'fbc','fbp','origem','event_id','parcial','respostas_json','ref'
    ],
    titulos: [
      'Data/Hora','Tier','Qualificado','Top Tier','Score',
      'Nome','Telefone','Email','Cidade',
      'Papel','Projetos','Desafio','Foco Vendedor','Nao Atua','Trafego','Instagram',
      'Pagina','UTM Source','UTM Medium','UTM Campaign','UTM Content',
      'FBC','FBP','Origem','Event ID','Parcial','Respostas (JSON)','Ref'
    ]
  },
  advoga: {
    aba: 'Advoga',
    // 2026-09-15 — quiz reestruturado: area_atuacao > faturamento > desafio > investimento > [reframe] > contato.
    // 'advogados' e 'contratos' SAIRAM do quiz mas FICAM aqui (chegam vazias daqui pra frente) pra nao
    // desalinhar as linhas antigas da aba. Coluna nova entra SEMPRE no FIM (depois de 'ref'):
    // 'area_atuacao' vem no topo do payload (e tambem em respostas{}), valueFor_ resolve nos dois.
    colunas: [
      'data_hora','tier','qualificado','top_tier','score',
      'nome','telefone','email','cidade',
      'advogados','faturamento','investimento','instagram',
      'pagina','utm_source','utm_medium','utm_campaign','utm_content',
      'fbc','fbp','origem','event_id','parcial',
      'desafio','contratos',
      'respostas_json','ref',
      'area_atuacao'
    ],
    titulos: [
      'Data/Hora','Tier','Qualificado','Top Tier','Score',
      'Nome','Telefone','Email','Cidade',
      'Advogados','Faturamento','Investimento','Instagram',
      'Pagina','UTM Source','UTM Medium','UTM Campaign','UTM Content',
      'FBC','FBP','Origem','Event ID','Parcial',
      'Desafio','Contratos',
      'Respostas (JSON)','Ref',
      'Area de Atuacao'
    ]
  },
  food: {
    aba: 'Food',
    colunas: [
      'data_hora','tier','qualificado','top_tier','score',
      'nome','telefone','email','cidade',
      'desafio','operacao','faturamento',
      'pagina','utm_source','utm_medium','utm_campaign','utm_content',
      'fbc','fbp','origem','event_id','parcial','respostas_json','ref'
    ],
    titulos: [
      'Data/Hora','Tier','Qualificado','Top Tier','Score',
      'Nome','Telefone','Email','Cidade',
      'Desafio','Operacao','Faturamento',
      'Pagina','UTM Source','UTM Medium','UTM Campaign','UTM Content',
      'FBC','FBP','Origem','Event ID','Parcial','Respostas (JSON)','Ref'
    ]
  },
  moveis: {
    aba: 'Moveis',
    colunas: [
      'data_hora','tier','qualificado','top_tier','score',
      'nome','telefone','email','cidade',
      'desafio','segmento','vendedores','faturamento','investimento',
      'pagina','utm_source','utm_medium','utm_campaign','utm_content',
      'fbc','fbp','origem','event_id','parcial','respostas_json','ref'
    ],
    titulos: [
      'Data/Hora','Tier','Qualificado','Top Tier','Score',
      'Nome','Telefone','Email','Cidade',
      'Desafio','Segmento','Vendedores','Faturamento','Investimento',
      'Pagina','UTM Source','UTM Medium','UTM Campaign','UTM Content',
      'FBC','FBP','Origem','Event ID','Parcial','Respostas (JSON)','Ref'
    ]
  }
};

function schemaFor_(pagina) {
  var p = pagina || '';
  if (p.indexOf('advoga') > -1) return SCHEMAS.advoga;
  if (p.indexOf('food') > -1 || p.indexOf('acai') > -1) return SCHEMAS.food;
  if (p.indexOf('heleva') > -1 || p.indexOf('moveis') > -1) return SCHEMAS.moveis;
  return SCHEMAS.solar;
}

// resolve o valor de cada coluna: campos do topo do payload OU de respostas{}
function valueFor_(key, d, r) {
  if (key === 'data_hora')      return new Date();
  if (key === 'qualificado')    return d.qualificado === true ? 'SIM' : 'NAO';
  if (key === 'top_tier')       return d.top_tier === true ? 'SIM' : '';
  if (key === 'parcial')        return d.parcial === true ? 'SIM' : '';
  if (key === 'respostas_json') return JSON.stringify(r);
  if (d[key] != null && typeof d[key] !== 'object') return d[key];
  if (r[key] != null) return r[key];
  return '';
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var r = d.respostas || {};
    var schema = schemaFor_(d.pagina);

    // Só grava lead qualificado. Parciais e desqualificados são ignorados
    // pra não poluir a planilha (comercial só trabalha lead que fechou o quiz).
    if (d.qualificado !== true) {
      return resposta_({ ok: true, ignorado: 'nao_qualificado' });
    }

    var sheet = pegarAba_(schema.aba);
    garantirCabecalho_(sheet, schema.titulos);

    var valores = schema.colunas.map(function(c){ return valueFor_(c, d, r); });

    // UPSERT por event_id: atualiza a linha do envio parcial em vez de duplicar.
    var idCol = schema.colunas.indexOf('event_id') + 1;
    var lastRow = sheet.getLastRow();
    var alvo = 0;
    if (d.event_id && lastRow > 1) {
      var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] === d.event_id) { alvo = i + 2; break; }
      }
    }
    if (alvo) sheet.getRange(alvo, 1, 1, valores.length).setValues([valores]);
    else      sheet.appendRow(valores);

    return resposta_({ ok: true, aba: schema.aba, atualizado: alvo > 0 });
  } catch (err) {
    return resposta_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // ?abas=1 -> diagnostico: lista as abas e quantas linhas cada uma tem
  if (e && e.parameter && e.parameter.abas) {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var info = ss.getSheets().map(function (s) {
      return { aba: s.getName(), linhas: Math.max(0, s.getLastRow() - 1) };
    });
    return resposta_({ ok: true, abas: info });
  }
  return resposta_({ ok: true, msg: 'LP-Quiz endpoint no ar (Solar + Advoga + Moveis + Food)' });
}

// Garante a linha 1 com os titulos do schema. Compara CELULA A CELULA: quando o schema ganha
// coluna nova no fim (ex.: 'Area de Atuacao'), so a celula nova esta diferente (vazia) e a linha
// inteira e reescrita com os titulos certos — sem mexer nas linhas de dados.
// Se a aba tiver menos colunas FISICAS que o schema (appendRow so expande ate onde gravou),
// getRange() estoura com "out of bounds" — por isso insere as colunas que faltam antes de ler/escrever.
// Isso tambem cobre o setValues() do UPSERT em doPost, que usa a mesma largura.
function garantirCabecalho_(sheet, titulos) {
  var faltam = titulos.length - sheet.getMaxColumns();
  if (faltam > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), faltam);
  var faixa = sheet.getRange(1, 1, 1, titulos.length);
  var atual = faixa.getValues()[0];
  var precisa = false;
  for (var i = 0; i < titulos.length; i++) {
    if (atual[i] !== titulos[i]) { precisa = true; break; }
  }
  if (precisa) {
    faixa.setValues([titulos]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function pegarAba_(nome) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  return sheet;
}

function resposta_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
