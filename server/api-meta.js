/**
 * Eclesia One - Metadados de formularios/tabelas e opcoes de relacionamento.
 * O frontend monta automaticamente listas e formularios a partir desta
 * definicao (evita duplicacao entre camadas).
 */
import { all, one } from './db.js';
import { RESOURCES, FK_MAP } from './registry.js';
import { json } from './api-core.js';

const HIDDEN = ['id', 'church_id', 'is_demo', 'deleted_at', 'updated_at', 'created_at', 'created_by', 'password_hash'];

const LABELS = {
  full_name: 'Nome completo', social_name: 'Nome social', photo_url: 'Foto (URL)', birth_date: 'Data de nascimento',
  gender: 'Sexo', cpf: 'CPF', rg: 'RG', phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', address: 'Endereço',
  district: 'Bairro', city: 'Cidade', state: 'UF', zip: 'CEP', marital_status: 'Estado civil', wedding_date: 'Data de casamento',
  join_date: 'Data de ingresso na igreja', baptism_date: 'Data de batismo', status: 'Situação', leader_flag: 'Líder',
  how_knew: 'Como conheceu a igreja', notes: 'Observações', code: 'Código', leader_id: 'Líder', co_leader_id: 'Co-líder',
  supervisor_id: 'Supervisor', weekday: 'Dia da semana', meeting_time: 'Horário', capacity: 'Capacidade', role: 'Função',
  joined_at: 'Data de ingresso', person_id: 'Pessoa', family_id: 'Família', cell_id: 'Célula', ministry_id: 'Ministério',
  meeting_date: 'Data da reunião', present_count: 'Presentes', absent_count: 'Ausentes', visitors_count: 'Visitantes',
  new_visitors: 'Novos visitantes', theme: 'Tema', prayer_requests: 'Pedidos de oração', offering: 'Oferta',
  report_sent: 'Relatório enviado', type: 'Tipo', description: 'Descrição', meeting_day: 'Dia de reunião',
  function_name: 'Função na escala', availability: 'Disponibilidade', skills: 'Habilidades', event_date: 'Data do evento',
  start_time: 'Horário de início', end_time: 'Horário de término', location: 'Local', responsible_id: 'Responsável',
  registration_open: 'Inscrições abertas', price: 'Valor da inscrição', event_id: 'Evento', paid: 'Pago',
  amount: 'Valor', qr_code: 'Código de entrada', registered_at: 'Data da inscrição', schedule_date: 'Data',
  schedule_time: 'Horário', notes_schedule: 'Observações', responded_at: 'Respondido em', room: 'Sala',
  age_range: 'Faixa etária', schedule: 'Horário/Agenda', teacher_id: 'Professor(a)', co_teacher_id: 'Co-professor(a)',
  class_id: 'Classe', lesson_date: 'Data da aula', content: 'Conteúdo', child_id: 'Criança', guardian_id: 'Responsável legal',
  class_name: 'Turma', allergies: 'Alergias / restrições', authorized_pickup: 'Pessoas autorizadas a retirar',
  checkin_at: 'Entrada', checkout_at: 'Saída', checked_in_by: 'Recebido por', checked_out_by: 'Entregue por',
  released_to: 'Retirado por (autorizado)', care_type: 'Tipo de acompanhamento', care_date: 'Data do atendimento',
  next_action: 'Próxima ação', next_action_date: 'Data da próxima ação', confidential: 'Confidencial', request: 'Pedido',
  category: 'Categoria', is_public: 'Disponível publicamente', answered_notes: 'Observações do atendimento',
  bank: 'Banco', account_type: 'Tipo de conta', agency: 'Agência', account_number: 'Número da conta', pix_key: 'Chave Pix',
  initial_balance: 'Saldo inicial', tx_type: 'Tipo de lançamento', category_id: 'Categoria', value: 'Valor', tx_date: 'Data',
  account_id: 'Conta', dest_account_id: 'Conta de destino', fund_id: 'Fundo', cost_center_id: 'Centro de custo',
  payment_method: 'Forma de pagamento', document: 'Documento / NF', supplier_id: 'Fornecedor', due_date: 'Vencimento',
  payment_date: 'Data do pagamento', payer_name: 'Pagador / Origem', received_date: 'Data do recebimento',
  origin: 'Origem', year: 'Ano', month: 'Mês', planned_value: 'Valor orçado', kind: 'Tipo', parent_id: 'Categoria superior',
  annual_budget: 'Orçamento anual', goal: 'Meta', person_type: 'Tipo de pessoa', contract_type: 'Tipo de contrato',
  start_date: 'Início', end_date: 'Término', periodicity: 'Periodicidade', acquisition_date: 'Data de aquisição',
  condition_state: 'Estado de conservação', warranty_until: 'Garantia até', asset_id: 'Patrimônio', problem: 'Problema',
  request_date: 'Data da solicitação', priority: 'Prioridade', quote_value: 'Valor do orçamento', cost: 'Custo final',
  completion_date: 'Conclusão', title: 'Título', file_name: 'Nome do arquivo', file_url: 'Arquivo (URL)',
  valid_until: 'Válido até', sector: 'Setor', start_at: 'Início', end_at: 'Término', all_day: 'Dia inteiro',
  ref_type: 'Tipo de referência', ref_id: 'ID de referência', body: 'Conteúdo', audience: 'Público-alvo', channel: 'Canal',
  publish_at: 'Publicação', user_id: 'Usuário', link: 'Link', read_at: 'Lido em', provider: 'Provedor',
  password: 'Senha inicial', active: 'Ativo', require_reset: 'Exigir troca de senha', last_login: 'Último acesso',
  permissions: 'Permissões', slug: 'Identificador (slug)', is_system: 'Perfil de sistema', action: 'Ação', module: 'Módulo',
  resource: 'Recurso', record_id: 'Registro', user_name: 'Usuário', before_json: 'Valor anterior', after_json: 'Valor novo',
  ip: 'IP de origem', created_at: 'Criado em', updated_at: 'Atualizado em', legal_name: 'Razão social', cnpj: 'CNPJ',
  pastor_name: 'Pastor responsável', logo_url: 'Logotipo (URL)', primary_color: 'Cor primária',
  secondary_color: 'Cor secundária', onboarded: 'Configuração inicial concluída', stage: 'Etapa do processo',
  welcome_by: 'Acolhido por', follow_up_by: 'Responsável pelo acompanhamento', first_visit_date: 'Primeira visita',
  service: 'Culto', next_contact_date: 'Próximo contato', role_title: 'Cargo', department: 'Departamento',
  hire_date: 'Data de admissão', salary: 'Salário', attendance_percent: 'Frequência (%)', enrolled_at: 'Matrícula',
  name: 'Nome', division: 'Divisão', notes_fin: 'Observações', description_full: 'Descrição completa',
  responsible: 'Responsável', goals: 'Objetivos', content_json: 'Configuração', code_ref: 'Referência',
};

const TEXTAREA = new Set(['notes', 'description', 'content', 'request', 'body', 'problem', 'prayer_requests', 'answered_notes',
  'skills', 'next_action', 'authorized_pickup', 'allergies', 'availability', 'address', 'description_full', 'goals', 'permissions']);

const BOOLEAN = new Set(['paid', 'is_public', 'confidential', 'registration_open', 'all_day', 'active', 'report_sent',
  'leader_flag', 'is_system', 'onboarded', 'require_reset']);

const DATETIME = new Set(['checkin_at', 'checkout_at', 'start_at', 'end_at', 'publish_at', 'responded_at', 'read_at', 'last_login']);

const NUMBER = new Set(['capacity', 'present_count', 'absent_count', 'visitors_count', 'new_visitors', 'year', 'month',
  'attendance_percent', 'ref_id']);

const MONEY = new Set(['value', 'salary', 'price', 'cost', 'quote_value', 'planned_value', 'goal', 'annual_budget',
  'initial_balance', 'amount', 'offering']);

const READONLY_CREATE = new Set(['created_at', 'updated_at']);

export const ENUMS = {
  'people.status': { ativo: ['Ativo', 'ok'], inativo: ['Inativo', 'neutral'], visitante: ['Visitante', 'info'], em_acompanhamento: ['Em acompanhamento', 'warn'], transferido: ['Transferido', 'neutral'], outro: ['Outro', 'neutral'] },
  'visitors.stage': { primeiro_contato: ['Primeiro contato', 'info'], acompanhamento: ['Em acompanhamento', 'warn'], celula: ['Encaminhado à célula', 'brand'], nova_visita: ['Nova visita', 'info'], integracao: ['Em integração', 'ok'] },
  'visitors.status': { aguardando_contato: ['Aguardando contato', 'warn'], em_acompanhamento: ['Em acompanhamento', 'info'], integrado: ['Integrado', 'ok'], sem_interesse: ['Sem interesse', 'neutral'] },
  'cells.status': { ativa: ['Ativa', 'ok'], em_implantacao: ['Em implantação', 'warn'], inativa: ['Inativa', 'neutral'] },
  'ministries.status': { ativo: ['Ativo', 'ok'], inativo: ['Inativo', 'neutral'] },
  'cell_members.role': { lider: ['Líder', 'brand'], co_lider: ['Co-líder', 'brand'], membro: ['Membro', 'neutral'] },
  'ministry_members.role': { lider: ['Líder', 'brand'], co_lider: ['Co-líder', 'brand'], integrante: ['Integrante', 'neutral'] },
  'family_members.role': { responsavel: ['Responsável', 'brand'], conjuge: ['Cônjuge', 'neutral'], filho: ['Filho(a)', 'neutral'], outro: ['Outro integrante', 'neutral'] },
  'schedules.status': { pendente: ['Pendente', 'warn'], confirmado: ['Confirmado', 'ok'], recusado: ['Recusado', 'danger'], substituicao_solicitada: ['Substituição solicitada', 'info'], substituido: ['Substituído', 'neutral'] },
  'payables.status': { pendente: ['Pendente', 'warn'], aprovada: ['Aprovada', 'info'], agendada: ['Agendada', 'info'], paga: ['Paga', 'ok'], vencida: ['Vencida', 'danger'], cancelada: ['Cancelada', 'neutral'] },
  'receivables.status': { pendente: ['Pendente', 'warn'], recebida: ['Recebida', 'ok'], atrasada: ['Atrasada', 'danger'], cancelada: ['Cancelada', 'neutral'] },
  'transactions.tx_type': { entrada: ['Entrada', 'ok'], saida: ['Saída', 'danger'], transferencia: ['Transferência', 'info'] },
  'transactions.status': { confirmado: ['Confirmado', 'ok'], previsto: ['Previsto', 'info'], cancelado: ['Cancelado', 'neutral'] },
  'transactions.payment_method': { Pix: ['Pix', 'neutral'], Dinheiro: ['Dinheiro', 'neutral'], 'Transferência': ['Transferência', 'neutral'], Cartão: ['Cartão', 'neutral'], Debito: ['Débito', 'neutral'], Boleto: ['Boleto', 'neutral'], 'Débito': ['Débito', 'neutral'] },
  'maintenance.status': { aberto: ['Aberto', 'warn'], em_analise: ['Em análise', 'info'], orcamento: ['Em orçamento', 'info'], aprovado: ['Aprovado', 'brand'], em_manutencao: ['Em manutenção', 'warn'], concluido: ['Concluído', 'ok'], cancelado: ['Cancelado', 'neutral'] },
  'maintenance.priority': { baixa: ['Baixa', 'neutral'], media: ['Média', 'info'], alta: ['Alta', 'warn'], critica: ['Crítica', 'danger'] },
  'tasks.status': { a_fazer: ['A fazer', 'neutral'], em_andamento: ['Em andamento', 'info'], concluida: ['Concluída', 'ok'], atrasada: ['Atrasada', 'danger'], cancelada: ['Cancelada', 'neutral'] },
  'tasks.priority': { baixa: ['Baixa', 'neutral'], media: ['Média', 'info'], alta: ['Alta', 'warn'], critica: ['Crítica', 'danger'] },
  'events.status': { planejado: ['Planejado', 'info'], confirmado: ['Confirmado', 'brand'], realizado: ['Realizado', 'ok'], cancelado: ['Cancelado', 'danger'] },
  'event_registrations.status': { inscrito: ['Inscrito', 'info'], confirmado: ['Confirmado', 'brand'], presente: ['Presente', 'ok'], ausente: ['Ausente', 'neutral'], cancelado: ['Cancelado', 'danger'] },
  'contracts.status': { vigente: ['Vigente', 'ok'], a_vencer: ['A vencer', 'warn'], encerrado: ['Encerrado', 'neutral'], cancelado: ['Cancelado', 'danger'] },
  'assets.status': { ativo: ['Ativo', 'ok'], em_manutencao: ['Em manutenção', 'warn'], baixado: ['Baixado', 'neutral'] },
  'assets.condition_state': { otimo: ['Ótimo', 'ok'], bom: ['Bom', 'ok'], regular: ['Regular', 'warn'], ruim: ['Ruim', 'danger'] },
  'suppliers.status': { ativo: ['Ativo', 'ok'], inativo: ['Inativo', 'neutral'] },
  'courses.status': { aberto: ['Aberto', 'ok'], encerrado: ['Encerrado', 'neutral'], cancelado: ['Cancelado', 'danger'] },
  'course_enrollments.status': { inscrito: ['Inscrito', 'info'], concluido: ['Concluído', 'ok'], desistente: ['Desistente', 'neutral'] },
  'staff.status': { ativo: ['Ativo', 'ok'], afastado: ['Afastado', 'warn'], desligado: ['Desligado', 'neutral'] },
  'ebd_classes.status': { ativa: ['Ativa', 'ok'], inativa: ['Inativa', 'neutral'] },
  'ebd_students.status': { matriculado: ['Matriculado', 'ok'], transferido: ['Transferido', 'neutral'], desistente: ['Desistente', 'neutral'] },
  'pastoral_care.status': { pendente: ['Pendente', 'warn'], em_andamento: ['Em andamento', 'info'], concluido: ['Concluído', 'ok'], cancelado: ['Cancelado', 'neutral'] },
  'pastoral_care.care_type': { visita: ['Visita', 'brand'], atendimento: ['Atendimento', 'brand'], aconselhamento: ['Aconselhamento', 'brand'], oracao: ['Oração', 'brand'], acompanhamento: ['Acompanhamento', 'brand'], integracao: ['Integração', 'brand'], retorno: ['Retorno', 'brand'] },
  'prayer_requests.status': { aberto: ['Aberto', 'warn'], em_oracao: ['Em oração', 'info'], atendido: ['Atendido', 'ok'] },
  'prayer_requests.category': { saude: ['Saúde', 'neutral'], familia: ['Família', 'neutral'], financeiro: ['Financeiro', 'neutral'], espiritual: ['Espiritual', 'neutral'], trabalho: ['Trabalho', 'neutral'], geral: ['Geral', 'neutral'] },
  'announcements.status': { rascunho: ['Rascunho', 'neutral'], publicado: ['Publicado', 'ok'], arquivado: ['Arquivado', 'neutral'] },
  'announcements.audience': { toda_igreja: ['Toda a igreja', 'brand'], membros: ['Membros', 'info'], lideres: ['Líderes', 'info'], celulas: ['Células', 'info'], ministerios: ['Ministérios', 'info'], voluntarios: ['Voluntários', 'info'], pais: ['Pais / responsáveis', 'info'], grupos: ['Grupos específicos', 'info'], visitantes: ['Visitantes', 'info'] },
  'announcements.channel': { portal: ['Portal / aplicativo', 'neutral'], email: ['E-mail', 'neutral'], whatsapp: ['WhatsApp (requer integração)', 'warn'], sms: ['SMS (requer integração)', 'warn'], push: ['Notificação push (requer integração)', 'warn'] },
  'integrations.status': { nao_configurado: ['Não configurado', 'neutral'], pendente: ['Pendente de credenciais', 'warn'], configurado: ['Configurado', 'ok'] },
  'categories.kind': { receita: ['Receita', 'ok'], despesa: ['Despesa', 'danger'], transferencia: ['Transferência', 'info'] },
  'funds.status': { ativo: ['Ativo', 'ok'], encerrado: ['Encerrado', 'neutral'] },
  'bank_accounts.status': { ativa: ['Ativa', 'ok'], inativa: ['Inativa', 'neutral'] },
  'documents.category': { estatuto: ['Estatuto', 'neutral'], atas: ['Atas', 'neutral'], contratos: ['Contratos', 'neutral'], imoveis: ['Imóveis', 'neutral'], veiculos: ['Veículos', 'neutral'], financeiro: ['Financeiro', 'neutral'], funcionarios: ['Funcionários', 'neutral'], licencas: ['Licenças', 'neutral'], outros: ['Outros', 'neutral'] },
  'calendar_events.category': { culto: ['Culto', 'brand'], celula: ['Célula', 'info'], reuniao: ['Reunião', 'info'], evento: ['Evento', 'brand'], pastoral: ['Pastoral', 'brand'], administrativo: ['Administrativo', 'neutral'], financeiro: ['Financeiro', 'neutral'], ministerio: ['Ministério', 'info'] },
  'cell_attendance.status': { presente: ['Presente', 'ok'], ausente: ['Ausente', 'neutral'], justificado: ['Justificado', 'info'] },
  'ebd_attendance.status': { presente: ['Presente', 'ok'], ausente: ['Ausente', 'neutral'] },
  'children.class_name': { 'Berçário': ['Berçário', 'neutral'], 'Primários': ['Primários', 'neutral'], 'Juniores': ['Juniores', 'neutral'], 'Adolescentes': ['Adolescentes', 'neutral'], 'Adultos': ['Adultos', 'neutral'] },
  'users.role': { super_admin: ['Super Admin', 'brand'], pastor: ['Pastor', 'brand'], pastor_auxiliar: ['Pastor Auxiliar', 'brand'], financeiro: ['Financeiro', 'info'], secretaria: ['Secretaria', 'info'], lider_celula: ['Líder de Célula', 'info'], lider_ministerio: ['Líder de Ministério', 'info'], professor: ['Professor EBD', 'info'], recepcao: ['Recepção', 'info'], membro: ['Membro', 'neutral'] },
  'visitors.origin': { 'visitante espontâneo': ['Visitante espontâneo', 'neutral'], convite: ['Convite de membro', 'neutral'], redes: ['Redes sociais', 'neutral'], evento: ['Evento da igreja', 'neutral'] },
};

const REF_LABELS = {
  people: 'full_name', cells: 'name', ministries: 'name', families: 'name', users: 'name', roles: 'name',
  events: 'name', suppliers: 'name', assets: 'name', bank_accounts: 'name', categories: 'name', funds: 'name',
  cost_centers: 'name', courses: 'name', ebd_classes: 'name', cell_meetings: 'meeting_date', ebd_lessons: 'theme',
  children: 'class_name',
};
const REF_TABLES = new Set(Object.keys(REF_LABELS));

function fieldType(table, col, sqlType) {
  if (BOOLEAN.has(col)) return 'boolean';
  if (ENUMS[`${table}.${col}`]) return 'enum';
  if (FK_MAP[col]) return 'ref';
  if (col === 'password') return 'password';
  if (DATETIME.has(col)) return 'datetime';
  if (/(_date|date|until)$/.test(col)) return 'date';
  if (MONEY.has(col)) return 'money';
  if (NUMBER.has(col) || /INT|REAL|NUMERIC|DECIMAL/i.test(sqlType || '')) return 'number';
  if (TEXTAREA.has(col)) return 'textarea';
  if (/email/.test(col)) return 'email';
  return 'text';
}

export function buildMeta() {
  const out = {};
  for (const [key, def] of Object.entries(RESOURCES)) {
    const pragma = all(`PRAGMA table_info(${def.table})`);
    const cols = pragma.map((c) => c.name).filter((c) => !HIDDEN.includes(c) && !(def.hidden || []).includes(c));
    const order = [];
    const push = (c) => { if (cols.includes(c) && !order.includes(c)) order.push(c); };
    (def.required || []).forEach(push);
    (def.listColumns || []).forEach(push);
    cols.forEach(push);
    const fields = order.map((col) => {
      const p = pragma.find((x) => x.name === col) || {};
      const type = fieldType(def.table, col, p.type);
      const enumDef = ENUMS[`${def.table}.${col}`];
      const ref = FK_MAP[col];
      return {
        name: col,
        label: LABELS[col] || col.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase()),
        type,
        sql_type: p.type,
        required: (def.required || []).includes(col),
        ref: ref ? ref[0] : null,
        ref_label: ref ? ref[1] : null,
        options: type === 'enum' ? Object.entries(enumDef).map(([v, [label, tone]]) => ({ value: v, label, tone }))
          : (col === 'role' && def.table === 'family_members' ? Object.entries(ENUMS['family_members.role']).map(([v, [l]]) => ({ value: v, label: l })) : null),
        read_only_create: READONLY_CREATE.has(col),
        width: (def.listColumns || []).includes(col) ? 1 : 0,
        list: (def.listColumns || []).includes(col) || col === 'title' || col === 'name' || col === 'full_name',
        description: col === 'password' ? 'Mínimo de 6 caracteres. O usuário poderá alterá-la depois.'
          : col === 'permissions' ? 'JSON de permissões por módulo.' : null,
      };
    });
    out[key] = {
      key, label: def.label, plural: def.plural, module: def.module, table: def.table,
      read_only: !!def.readOnly, sensitive: !!def.sensitive, financial: !!def.financial,
      searchable: def.search || [], required: def.required || [], list_columns: def.listColumns || [],
      date_field: def.dateField || 'created_at', sort: def.sort || { default: 'id', allowed: ['id'] },
      badge: def.badge || null, fields,
    };
  }
  return out;
}

export function registerMetaRoutes(router) {
  const authed = (handler) => async (req, res, ctx) => (ctx.user ? handler(req, res, ctx) : json(res, 401, { error: 'Sessão expirada.' }));

  router.add('GET', '/api/meta', authed(async (req, res, ctx) => {
    return json(res, 200, { resources: buildMeta(), enums: ENUMS, server_time: new Date().toISOString() });
  }));

  /** Opções para campos de relacionamento: /api/meta/options/people?q=jo */
  router.add('GET', '/api/meta/options/:ref', authed(async (req, res, ctx) => {
    const ref = String(req.params.ref);
    if (!REF_TABLES.has(ref)) return json(res, 400, { error: 'Tabela de referência não suportada.' });
    const label = REF_LABELS[ref];
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(60, Number(req.query.limit) || 30);
    const hasChurch = all(`PRAGMA table_info(${ref})`).some((c) => c.name === 'church_id');
    const hasDeleted = all(`PRAGMA table_info(${ref})`).some((c) => c.name === 'deleted_at');
    const where = [];
    const args = [];
    if (hasChurch) { where.push('church_id = ?'); args.push(ctx.user.church_id); }
    if (hasDeleted) where.push('deleted_at IS NULL');
    if (q) { where.push(`lower(COALESCE(${label}, '')) LIKE ?`); args.push(`%${q}%`); }
    const sql = `SELECT id, ${label} AS label FROM ${ref} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${label} LIMIT ?`;
    let rows = all(sql, [...args, limit]);
    if (ref === 'children') {
      rows = rows.map((r) => ({ ...r, label: (one('SELECT full_name FROM people WHERE id = (SELECT person_id FROM children WHERE id = ?)', [r.id]) || {}).full_name || r.label }));
    }
    return json(res, 200, { data: rows.map((r) => ({ id: r.id, label: r.label ?? `#${r.id}` })) });
  }));

  /** Valores distintos de uma coluna (para filtros dinamicos). */
  router.add('GET', '/api/meta/values/:resource/:field', authed(async (req, res, ctx) => {
    const key = String(req.params.resource);
    const def = RESOURCES[key];
    if (!def) return json(res, 404, { error: 'Recurso não encontrado.' });
    const field = String(req.params.field);
    const cols = all(`PRAGMA table_info(${def.table})`).map((c) => c.name);
    if (!cols.includes(field)) return json(res, 400, { error: 'Campo inválido para este recurso.' });
    if (ENUMS[`${def.table}.${field}`]) {
      return json(res, 200, { data: Object.entries(ENUMS[`${def.table}.${field}`]).map(([value, [label]]) => ({ value, label })) });
    }
    const rows = all(`SELECT DISTINCT ${field} AS value FROM ${def.table} WHERE church_id = ? AND deleted_at IS NULL AND ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field} LIMIT 80`, [ctx.user.church_id]);
    return json(res, 200, { data: rows.map((r) => ({ value: r.value, label: String(r.value) })) });
  }));
}
