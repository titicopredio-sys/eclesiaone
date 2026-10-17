/**
 * Eclesia One - Dados demonstrativos: financeiro, operacao e patrimonio.
 */
import { insert, all, run, transaction } from './db.js';
import { isoNow, isoDate, addDays, monthKey } from './lib.js';
import { rnd, rint, chance, pick, today } from './seed-core.js';

export function seedFinance(churchId) {
  return transaction(() => {
    const centers = ['Administração', 'Missões', 'Evangelismo', 'Infantil', 'Juventude', 'Louvor', 'Mídia', 'Células', 'Ação Social', 'Manutenção', 'Construção', 'Eventos', 'Educação', 'Outros'];
    const centerIds = centers.map((name) => insert('cost_centers', {
      church_id: churchId, name, annual_budget: [48000, 36000, 24000, 18000, 30000, 26000, 22000, 15000, 20000, 40000, 60000, 25000, 12000, 8000][centers.indexOf(name)],
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    const fundDefs = [['Geral', 0], ['Missões', 50000], ['Construção', 250000], ['Ação Social', 30000], ['Juventude', 15000], ['Infantil', 12000], ['Campanhas', 40000]];
    const fundIds = fundDefs.map(([name, goal]) => insert('funds', {
      church_id: churchId, name, goal, status: 'ativo',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    const incomeCats = [['Dízimos', 'receita'], ['Ofertas de Culto', 'receita'], ['Ofertas Especiais', 'receita'], ['Campanhas', 'receita'], ['Missões', 'receita'], ['Inscrições em Eventos', 'receita'], ['Doações', 'receita'], ['Aluguel de Espaço', 'receita'], ['Outras Receitas', 'receita']];
    const expenseCats = [['Folha de Pagamento', 'despesa'], ['Água e Energia', 'despesa'], ['Internet e Telefonia', 'despesa'], ['Materiais de Escritório', 'despesa'], ['Manutenção Predial', 'despesa'], ['Missões', 'despesa'], ['Ação Social', 'despesa'], ['Eventos', 'despesa'], ['Materiais Infantis', 'despesa'], ['Instrumentos e Som', 'despesa'], ['Aluguel', 'despesa'], ['Impostos e Taxas', 'despesa'], ['Outras Despesas', 'despesa']];
    const catIds = {};
    for (const [name, kind] of [...incomeCats, ...expenseCats]) {
      catIds[name] = insert('categories', {
        church_id: churchId, kind, name, status: 'ativa',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }

    const accounts = [
      ['Conta Corrente Principal', 'Banco do Brasil', 'corrente', 48500],
      ['Conta Poupança/Reserva', 'Caixa Econômica', 'poupanca', 12000],
      ['Conta de Missões', 'Sicredi', 'corrente', 8200],
      ['Caixa Físico (Tesouraria)', 'Caixa interno', 'caixa', 1500],
      ['Aplicação Financeira', 'Itaú', 'aplicacao', 25000],
    ];
    const accountIds = accounts.map(([name, bank, type, initial]) => insert('bank_accounts', {
      church_id: churchId, name, bank, account_type: type,
      agency: String(rint(1000, 9999)), account_number: `${rint(1000, 99999)}-${rint(0, 9)}`,
      pix_key: `${name.split(' ')[0].toLowerCase()}@igreja.org.br`,
      initial_balance: initial, status: 'ativa',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    const people = all('SELECT id FROM people WHERE church_id = ? AND is_demo = 1', [churchId]).map((r) => r.id);

    /* ---------------------------------------------- receitas (6 meses) */
    const monthsBack = 6;
    const baseDate = new Date();
    for (let m = monthsBack; m >= 0; m--) {
      const ref = new Date(baseDate.getFullYear(), baseDate.getMonth() - m, 1);
      const year = ref.getFullYear();
      const month = ref.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      const maxDay = m === 0 ? Math.min(new Date().getDate(), daysInMonth) : daysInMonth;

      // dizimos: varios lancamentos por mes
      const nTithe = rint(22, 34);
      for (let i = 0; i < nTithe; i++) {
        const day = rint(1, maxDay);
        const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        insert('transactions', {
          church_id: churchId, tx_type: 'entrada', category_id: catIds['Dízimos'],
          description: 'Dízimo', value: rint(50, 180) * 10,
          tx_date: d, account_id: accountIds[rint(0, 1)],
          person_id: chance(0.75) ? pick(people) : null,
          fund_id: fundIds[0], cost_center_id: centerIds[0],
          payment_method: pick(['Pix', 'Dinheiro', 'Transferência', 'Cartão']),
          status: 'confirmado', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      }
      // ofertas de culto (cultos dominicais)
      for (let i = 0; i < rint(4, 6); i++) {
        const day = Math.min(maxDay, 7 * i + 7);
        if (day < 1) continue;
        insert('transactions', {
          church_id: churchId, tx_type: 'entrada', category_id: catIds['Ofertas de Culto'],
          description: 'Oferta de culto', value: rint(300, 1400),
          tx_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          account_id: accountIds[0], fund_id: fundIds[0], cost_center_id: centerIds[0],
          payment_method: 'Dinheiro', status: 'confirmado', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      }
      // receitas variadas
      const extras = [['Campanhas', 3, 2500, 5], ['Missões', 2, 3000, 2], ['Inscrições em Eventos', 3, 1800, 11], ['Doações', 2, 1400, 13]];
      for (const [cat, qty, max, fundIdx] of extras) {
        for (let i = 0; i < qty; i++) {
          const day = rint(1, maxDay);
          insert('transactions', {
            church_id: churchId, tx_type: 'entrada', category_id: catIds[cat],
            description: cat, value: rint(Math.floor(max / 3), max),
            tx_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            account_id: accountIds[cat === 'Missões' ? 2 : 0], fund_id: fundIds[fundIdx % fundIds.length],
            cost_center_id: centerIds[1], payment_method: pick(['Pix', 'Transferência', 'Dinheiro']),
            status: 'confirmado', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
          });
        }
      }

      /* -------------------------------------------------- despesas pagas */
      const plan = [
        ['Folha de Pagamento', 8, 6200, 0, 3], ['Água e Energia', 2, 850, 9, 0], ['Internet e Telefonia', 1, 420, 0, 8],
        ['Materiais de Escritório', 1, 380, 0, 4], ['Manutenção Predial', 2, 1200, 9, 3], ['Missões', 2, 2500, 1, 9],
        ['Ação Social', 2, 900, 8, 10], ['Eventos', 1, 1500, 11, 11], ['Materiais Infantis', 1, 300, 3, 4],
        ['Impostos e Taxas', 1, 260, 0, 0],
      ];
      for (const [cat, qty, max, ccIdx, fundIdx] of plan) {
        for (let i = 0; i < qty; i++) {
          const day = rint(1, maxDay);
          insert('transactions', {
            church_id: churchId, tx_type: 'saida', category_id: catIds[cat],
            description: cat, value: rint(Math.floor(max / 2), max),
            tx_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            account_id: accountIds[0], fund_id: fundIds[fundIdx % fundIds.length],
            cost_center_id: centerIds[ccIdx % centerIds.length],
            payment_method: pick(['Transferência', 'Pix', 'Débito', 'Boleto']),
            status: 'confirmado', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
          });
        }
      }
    }

    /* ------------------------------------------------------ fornecedores */
    const suppliers = [
      ['Companhia de Energia Metropolitana', 'juridica', 'Energia'], ['Águas Municipais S.A.', 'juridica', 'Saneamento'],
      ['Conecta Telecom Ltda', 'juridica', 'Telecom'], ['Papelaria Central', 'juridica', 'Suprimentos'],
      ['Eletro Som Professional', 'juridica', 'Equipamentos'], ['Construtora Bertoni', 'juridica', 'Construção'],
      ['Distribuidora de Alimentos Bom Pão', 'juridica', 'Alimentação'], ['Livraria Teológica Vida', 'juridica', 'Livros'],
      ['Gráfica Rápida Impressos', 'juridica', 'Comunicação'],
    ];
    const supplierIds = suppliers.map(([name, type, cat]) => insert('suppliers', {
      church_id: churchId, name, person_type: type, category: cat,
      document: `${rint(10, 99)}.${rint(100, 999)}.${rint(100, 999)}/0001-${rint(10, 99)}`,
      phone: `(19) 3${rint(100, 999)}-${rint(1000, 9999)}`, email: `contato@${name.split(' ')[0].toLowerCase()}.com.br`,
      address: `Av. ${pick(['Brasil', 'Central', 'das Indústrias'])} ${rint(100, 2000)}`,
      status: 'ativo', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ------------------------------------------------ contas a pagar */
    for (let i = 0; i < 46; i++) {
      const offset = rint(-38, 34);
      const due = addDays(today(), offset);
      const status = offset < -2 ? (chance(0.72) ? 'paga' : 'vencida') : offset < 0 ? pick(['paga', 'vencida']) : pick(['pendente', 'aprovada', 'agendada']);
      const value = rint(120, 4800);
      insert('payables', {
        church_id: churchId, supplier_id: pick(supplierIds),
        description: pick(['Energia elétrica', 'Conta de água', 'Internet e telefonia', 'Material de limpeza', 'Manutenção do ar-condicionado', 'Compra de instrumentos', 'Serviço de gráfica', 'Material infantil', 'Aluguel de som', 'Honorários contábeis']),
        category_id: catIds[pick(['Água e Energia', 'Internet e Telefonia', 'Materiais de Escritório', 'Manutenção Predial', 'Eventos', 'Materiais Infantis', 'Instrumentos e Som', 'Impostos e Taxas'])],
        cost_center_id: pick(centerIds), fund_id: pick(fundIds),
        value, due_date: due, payment_date: status === 'paga' ? addDays(due, rint(-2, 3)) : null,
        account_id: status === 'paga' ? accountIds[0] : null,
        payment_method: pick(['Boleto', 'Pix', 'Transferência', 'Débito automático']),
        document: `NF-${rint(1000, 9999)}`,
        responsible_id: pick(people), notes: null, status,
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }

    /* --------------------------------------------- contas a receber */
    for (let i = 0; i < 24; i++) {
      const offset = rint(-20, 45);
      const due = addDays(today(), offset);
      const status = offset < 0 ? pick(['recebida', 'recebida', 'atrasada']) : 'pendente';
      insert('receivables', {
        church_id: churchId, origin: pick(['Evento', 'Aluguel de espaço', 'Reembolso', 'Campanha', 'Parceria']),
        description: pick(['Inscrição em conferência', 'Aluguel do salão social', 'Reembolso de viagem missionária', 'Campanha de missões', 'Venda de livros']),
        payer_name: pick(['Associação de Missões', 'Grupo de Jovens', 'Igreja Parceira', 'Empresa Solidária', 'Membro da igreja']),
        category_id: catIds[pick(['Aluguel de Espaço', 'Inscrições em Eventos', 'Campanhas', 'Doações'])],
        value: rint(200, 5200), due_date: due, received_date: status === 'recebida' ? addDays(due, rint(-3, 2)) : null,
        account_id: status === 'recebida' ? accountIds[0] : null, status, notes: null,
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }

    /* -------------------------------------------------------- orcamento */
    const year = new Date().getFullYear();
    const budgetPlan = { 'Folha de Pagamento': 7000, 'Água e Energia': 1200, 'Internet e Telefonia': 500, 'Materiais de Escritório': 600, 'Manutenção Predial': 1800, 'Missões': 3000, 'Ação Social': 1200, 'Eventos': 2000, 'Materiais Infantis': 450, 'Instrumentos e Som': 900, 'Impostos e Taxas': 400, 'Outras Despesas': 700 };
    for (let m = 1; m <= 12; m++) {
      for (const [cat, planned] of Object.entries(budgetPlan)) {
        insert('budgets', {
          church_id: churchId, year, month: m, category_id: catIds[cat],
          cost_center_id: pick(centerIds), fund_id: fundIds[0], planned_value: planned,
          is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      }
    }

    /* ------------------------------------------------------- contratos */
    const contractDefs = [['Energia elétrica', 12000, 'mensal'], ['Internet dedicada', 4800, 'mensal'], ['Seguro patrimonial', 9600, 'anual'], ['Aluguel do estacionamento', 18000, 'mensal'], ['Manutenção de som', 6000, 'semestral']];
    contractDefs.forEach(([desc, value, period], idx) => insert('contracts', {
      church_id: churchId, supplier_id: supplierIds[idx % supplierIds.length],
      contract_type: pick(['Serviço', 'Fornecimento', 'Locação', 'Seguro']), description: desc,
      start_date: addDays(today(), -rint(120, 600)), end_date: addDays(today(), rint(-5, 30 + idx * 25)),
      value, periodicity: period, responsible_id: pick(people),
      document: `CT-${year}-${String(idx + 1).padStart(3, '0')}`, status: 'vigente',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ----------------------------------------------------- patrimonio */
    const assetDefs = [
      ['Mesa de som digital 32 canais', 'Equipamento de áudio', 18500, 'Templo Principal', 'bom'],
      ['Projetor multimídia 5000 lumens', 'Equipamento de vídeo', 4200, 'Templo Principal', 'bom'],
      ['Notebook administrativo', 'Informática', 3900, 'Secretaria', 'bom'],
      ['Impressora multifuncional', 'Informática', 2100, 'Secretaria', 'regular'],
      ['Cadeiras plásticas (200 un.)', 'Mobiliário', 8000, 'Salão Social', 'bom'],
      ['Púlpito de madeira', 'Mobiliário', 3500, 'Templo Principal', 'bom'],
      ['Piano digital', 'Instrumento musical', 6500, 'Templo Principal', 'bom'],
      ['Bateria acústica completa', 'Instrumento musical', 9000, 'Templo Principal', 'regular'],
      ['Micro-ônibus (transporte)', 'Veículo', 165000, 'Garagem', 'regular'],
      ['Ar-condicionado 24.000 BTUs (4 un.)', 'Climatização', 12800, 'Templo Principal', 'bom'],
      ['Geladeira industrial', 'Eletrodoméstico', 3800, 'Cozinha', 'bom'],
      ['Kit som para células', 'Equipamento de áudio', 2400, 'Almoxarifado', 'bom'],
      ['Data show portátil', 'Equipamento de vídeo', 2900, 'Almoxarifado', 'regular'],
      ['Bebedouro industrial', 'Eletrodoméstico', 1600, 'Salão Social', 'bom'],
      ['Câmera DSLR para mídia', 'Equipamento de vídeo', 5700, 'Mídia', 'bom'],
    ];
    const assetIds = assetDefs.map(([name, cat, value, loc, cond], idx) => insert('assets', {
      church_id: churchId, code: `PAT-${String(idx + 1).padStart(4, '0')}`, name, category: cat,
      description: `${name} adquirido para uso ministerial.`,
      value, acquisition_date: addDays(today(), -rint(60, 2000)), location: loc,
      responsible_id: pick(people), condition_state: cond,
      warranty_until: chance(0.5) ? addDays(today(), rint(-30, 400)) : null,
      supplier_id: pick(supplierIds), document: `NF-${rint(1000, 9999)}`, status: 'ativo',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ------------------------------------------------------ manutencao */
    for (let i = 0; i < 14; i++) {
      const status = pick(['aberto', 'em_analise', 'orcamento', 'aprovado', 'em_manutencao', 'concluido']);
      insert('maintenance', {
        church_id: churchId, asset_id: pick(assetIds),
        problem: pick(['Ruído no canal 3 da mesa de som', 'Projetor com lâmpada fraca', 'Ar-condicionado sem gelar', 'Cadeiras com estrutura quebrada', 'Impressora atolando papel', 'Bateria com pele danificada', 'Micro-ônibus com revisão pendente']),
        request_date: addDays(today(), -rint(0, 70)), priority: pick(['baixa', 'media', 'alta', 'critica']),
        responsible_id: pick(people), supplier_id: pick(supplierIds),
        quote_value: rint(150, 2500), cost: status === 'concluido' ? rint(150, 2500) : 0,
        status, completion_date: status === 'concluido' ? addDays(today(), -rint(0, 20)) : null,
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }

    /* ------------------------------------------------------- documentos */
    const docDefs = [
      ['Estatuto Social da Igreja', 'estatuto', 400], ['Ata de Assembleia Extraordinária', 'atas', 0],
      ['Contrato de Locação do Salão', 'contratos', 120], ['Escritura do Imóvel Sede', 'imoveis', 0],
      ['Documento do Micro-ônibus (CRLV)', 'veiculos', 18], ['Certidão Negativa de Débitos', 'financeiro', 25],
      ['Contrato de Trabalho - Secretária', 'funcionarios', 300], ['Alvará de Funcionamento', 'licencas', 60],
      ['Apólice de Seguro Patrimonial', 'outros', 40], ['Manual de Conduta e LGPD', 'outros', 0],
    ];
    docDefs.forEach(([title, cat, valid], idx) => insert('documents', {
      church_id: churchId, title, category: cat,
      file_name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      file_url: null, valid_until: valid ? addDays(today(), valid) : null,
      responsible_id: pick(people), notes: 'Documento de demonstração — substituir pelo arquivo real.',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ---------------------------------------------------------- tarefas */
    const taskDefs = [
      ['Fechar caixa do mês', 'financeiro', 'alta', 3], ['Revisar escala do louvor', 'ministerios', 'media', 2],
      ['Contatar visitantes da semana', 'recepcao', 'alta', 1], ['Atualizar inventário do patrimônio', 'operacao', 'baixa', 20],
      ['Preparar relatório de células', 'celulas', 'media', 5], ['Renovar alvará de funcionamento', 'administrativo', 'critica', -3],
      ['Comprar materiais do infantil', 'infantil', 'media', 8], ['Planejar conferência de missões', 'missoes', 'alta', 15],
      ['Revisar contratos vencendo', 'administrativo', 'alta', -1], ['Organizar arquivo de atas', 'secretaria', 'baixa', 30],
    ];
    taskDefs.forEach(([title, sector, priority, delta]) => insert('tasks', {
      church_id: churchId, title, description: `${title} — atividade de demonstração.`,
      responsible_id: pick(people), sector, priority, due_date: addDays(today(), delta),
      status: delta < 0 ? pick(['atrasada', 'em_andamento']) : pick(['a_fazer', 'em_andamento', 'concluida']),
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ---------------------------------------------------- integrações */
    const integrations = [['WhatsApp Business API', 'nao_configurado'], ['E-mail SMTP', 'nao_configurado'], ['Google Calendar', 'nao_configurado'], ['Pix (cobrança automática)', 'nao_configurado'], ['Gateways de pagamento', 'nao_configurado'], ['Contabilidade externa', 'nao_configurado']];
    integrations.forEach(([provider, status]) => insert('integrations', {
      church_id: churchId, provider, status,
      config_json: JSON.stringify({ nota: 'Arquitetura preparada. Requer credenciais do provedor para ativação.' }),
      updated_at: isoNow(),
    }));

    return { centerIds, fundIds, catIds, accountIds, supplierIds, assetIds };
  });
}

export function purgeDemo(churchId) {
  const tables = all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, []);
  let removed = 0;
  run('PRAGMA foreign_keys = OFF', []);
  for (const { name } of tables) {
    const cols = all(`PRAGMA table_info(${name})`).map((c) => c.name);
    if (!cols.includes('is_demo')) continue;
    const where = cols.includes('church_id') ? 'is_demo = 1 AND church_id = ?' : 'is_demo = 1';
    const params = cols.includes('church_id') ? [churchId] : [];
    const r = run(`DELETE FROM ${name} WHERE ${where}`, params);
    removed += r.changes;
  }
  run('PRAGMA foreign_keys = ON', []);
  return removed;
}

export function countDemo(churchId) {
  const tables = ["people", "families", "cells", "cell_meetings", "ministries", "events", "transactions", "payables", "receivables", "assets", "documents", "tasks", "pastoral_care", "visitors", "users"];
  const out = {};
  let total = 0;
  for (const t of tables) {
    const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
    if (!cols.includes('is_demo')) continue;
    const q = cols.includes('church_id') ? `SELECT COUNT(*) c FROM ${t} WHERE is_demo = 1 AND church_id = ?` : `SELECT COUNT(*) c FROM ${t} WHERE is_demo = 1`;
    const c = all(q, cols.includes('church_id') ? [churchId] : [])[0].c;
    out[t] = c; total += c;
  }
  out.__total = total;
  return out;
}
