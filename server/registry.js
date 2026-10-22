/**
 * Eclesia One - Registro declarativo de recursos (modulos -> tabelas).
 * Cada recurso informa permissao, campos pesquisaveis, obrigatorios e escopo.
 */

/* Mapa global de chaves estrangeiras -> tabela/rotulo (para exibicao e joins) */
export const FK_MAP = {
  leader_id: ['people', 'full_name'], co_leader_id: ['people', 'full_name'], supervisor_id: ['people', 'full_name'],
  person_id: ['people', 'full_name'], responsible_id: ['people', 'full_name'], welcome_by: ['people', 'full_name'],
  follow_up_by: ['people', 'full_name'], teacher_id: ['people', 'full_name'], co_teacher_id: ['people', 'full_name'],
  guardian_id: ['people', 'full_name'], payer_id: ['people', 'full_name'],
  cell_id: ['cells', 'name'], ministry_id: ['ministries', 'name'], event_id: ['events', 'name'],
  category_id: ['categories', 'name'], fund_id: ['funds', 'name'], cost_center_id: ['cost_centers', 'name'],
  account_id: ['bank_accounts', 'name'], dest_account_id: ['bank_accounts', 'name'],
  supplier_id: ['suppliers', 'name'], asset_id: ['assets', 'name'], class_id: ['ebd_classes', 'name'],
  course_id: ['courses', 'name'], family_id: ['families', 'name'], user_id: ['users', 'name'],
  created_by: ['users', 'name'], meeting_id: ['cell_meetings', 'meeting_date'], lesson_id: ['ebd_lessons', 'theme'],
  child_id: ['children', 'class_name'],
};

/** Normaliza um nome de coluna para uma chave de relacionamento exibivel. */
export const labelKey = (col) => col.replace(/_id$/, '_nome');

export const RESOURCES = {
  /* --------------------------------------------------------------- PESSOAS */
  people: {
    table: 'people', label: 'Pessoa', plural: 'Pessoas', module: 'pessoas', icon: 'users',
    search: ['full_name', 'cpf', 'phone', 'email', 'district', 'city'],
    required: ['full_name'],
    dates: ['birth_date', 'join_date', 'baptism_date', 'wedding_date'],
    numbers: [],
    dateField: 'join_date',
    sort: { default: 'full_name', allowed: ['full_name', 'birth_date', 'join_date', 'status', 'created_at'] },
    badge: 'status',
    listColumns: ['full_name', 'phone', 'email', 'district', 'city', 'status'],
    hidden: [],
  },
  families: {
    table: 'families', label: 'Família', plural: 'Famílias', module: 'familias',
    search: ['name', 'phone', 'district', 'city'], required: ['name'],
    dates: [], numbers: [], dateField: 'created_at',
    sort: { default: 'name', allowed: ['name', 'created_at'] },
    listColumns: ['name', 'district', 'city', 'phone'],
  },
  family_members: {
    table: 'family_members', label: 'Integrante de família', plural: 'Integrantes', module: 'familias',
    search: [], required: ['family_id', 'person_id'], dates: [], numbers: [], dateField: 'created_at',
    sort: { default: 'id', allowed: ['id'] }, listColumns: ['family_id', 'person_id', 'role'],
  },
  visitors: {
    table: 'visitors', label: 'Visitante', plural: 'Visitantes', module: 'visitantes',
    search: ['service', 'origin', 'how_knew', 'stage', 'status'], required: ['person_id', 'first_visit_date'],
    dates: ['first_visit_date', 'next_contact_date'], numbers: [], dateField: 'first_visit_date',
    sort: { default: 'first_visit_date', allowed: ['first_visit_date', 'stage', 'status'] },
    badge: 'status', listColumns: ['person_id', 'first_visit_date', 'service', 'stage', 'status'],
  },
  staff: {
    table: 'staff', label: 'Funcionário', plural: 'Funcionários', module: 'funcionarios',
    search: ['role_title', 'department', 'contract_type', 'status'], required: ['person_id', 'role_title'],
    dates: ['hire_date'], numbers: ['salary'], dateField: 'hire_date',
    sort: { default: 'hire_date', allowed: ['hire_date', 'role_title', 'salary'] },
    listColumns: ['person_id', 'role_title', 'department', 'hire_date', 'status'],
  },
  courses: {
    table: 'courses', label: 'Curso', plural: 'Cursos', module: 'ebd',
    search: ['name', 'schedule', 'status'], required: ['name'], dates: ['start_date', 'end_date'],
    numbers: ['capacity', 'price'], dateField: 'start_date',
    sort: { default: 'name', allowed: ['name', 'start_date'] },
    listColumns: ['name', 'teacher_id', 'start_date', 'schedule', 'status'],
  },
  course_enrollments: {
    table: 'course_enrollments', label: 'Matrícula em curso', plural: 'Matrículas', module: 'ebd',
    search: ['status'], required: ['course_id', 'person_id'], dates: ['enrolled_at'], numbers: ['attendance_percent'],
    dateField: 'enrolled_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['course_id', 'person_id', 'enrolled_at', 'attendance_percent', 'status'],
  },

  /* --------------------------------------------------------------- CELULAS */
  cells: {
    table: 'cells', label: 'Célula', plural: 'Células', module: 'celulas',
    search: ['name', 'code', 'district', 'city', 'weekday'], required: ['name'],
    dates: [], numbers: ['capacity'], dateField: 'created_at',
    sort: { default: 'name', allowed: ['name', 'code', 'created_at'] },
    badge: 'status', listColumns: ['name', 'code', 'leader_id', 'weekday', 'meeting_time', 'status'],
    scope: 'cell',
  },
  cell_members: {
    table: 'cell_members', label: 'Membro de célula', plural: 'Membros de célula', module: 'celulas',
    search: ['role', 'status'], required: ['cell_id', 'person_id'], dates: ['joined_at'], numbers: [],
    dateField: 'joined_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['cell_id', 'person_id', 'role', 'joined_at', 'status'], scope: 'cell',
  },
  cell_meetings: {
    table: 'cell_meetings', label: 'Reunião de célula', plural: 'Reuniões de célula', module: 'celulas',
    search: ['theme', 'notes'], required: ['cell_id', 'meeting_date'],
    dates: ['meeting_date'], numbers: ['present_count', 'absent_count', 'visitors_count', 'new_visitors', 'offering'],
    dateField: 'meeting_date', sort: { default: 'meeting_date', allowed: ['meeting_date', 'present_count'] },
    listColumns: ['cell_id', 'meeting_date', 'present_count', 'visitors_count', 'report_sent'], scope: 'cell',
  },
  cell_attendance: {
    table: 'cell_attendance', label: 'Presença em célula', plural: 'Presenças', module: 'celulas',
    search: ['status'], required: ['meeting_id', 'person_id'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['meeting_id', 'person_id', 'status'], scope: 'cell',
  },

  /* ----------------------------------------------------------- MINISTERIOS */
  ministries: {
    table: 'ministries', label: 'Ministério', plural: 'Ministérios', module: 'ministerios',
    search: ['name', 'type', 'description', 'meeting_day'], required: ['name'],
    dates: [], numbers: [], dateField: 'created_at',
    sort: { default: 'name', allowed: ['name', 'type', 'created_at'] },
    badge: 'status', listColumns: ['name', 'type', 'leader_id', 'meeting_day', 'status'], scope: 'ministry',
  },
  ministry_members: {
    table: 'ministry_members', label: 'Integrante de ministério', plural: 'Integrantes de ministério', module: 'ministerios',
    search: ['role', 'status'], required: ['ministry_id', 'person_id'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['ministry_id', 'person_id', 'role', 'status'], scope: 'ministry',
  },
  volunteers: {
    table: 'volunteers', label: 'Voluntário', plural: 'Voluntários', module: 'voluntarios',
    search: ['function_name', 'availability', 'skills', 'status'], required: ['person_id', 'function_name'],
    dates: [], numbers: [], dateField: 'created_at',
    sort: { default: 'id', allowed: ['id', 'function_name'] },
    badge: 'status', listColumns: ['person_id', 'ministry_id', 'function_name', 'availability', 'status'],
    scope: 'ministry',
  },

  /* --------------------------------------------------------------- EVENTOS */
  events: {
    table: 'events', label: 'Evento', plural: 'Eventos', module: 'eventos',
    search: ['name', 'description', 'location'], required: ['name', 'event_date'],
    dates: ['event_date'], numbers: ['capacity', 'price'], dateField: 'event_date',
    sort: { default: 'event_date', allowed: ['event_date', 'name'] },
    badge: 'status', listColumns: ['name', 'event_date', 'start_time', 'location', 'capacity', 'status'],
  },
  event_registrations: {
    table: 'event_registrations', label: 'Inscrição', plural: 'Inscrições', module: 'eventos',
    search: ['status', 'notes'], required: ['event_id', 'person_id'], dates: ['registered_at'],
    numbers: ['amount'], dateField: 'registered_at', sort: { default: 'id', allowed: ['id'] },
    badge: 'status', listColumns: ['event_id', 'person_id', 'registered_at', 'paid', 'status'],
  },
  schedules: {
    table: 'schedules', label: 'Escala', plural: 'Escalas', module: 'escalas',
    search: ['function_name', 'notes'], required: ['schedule_date', 'function_name', 'person_id'],
    dates: ['schedule_date'], numbers: [], dateField: 'schedule_date',
    sort: { default: 'schedule_date', allowed: ['schedule_date', 'function_name', 'status'] },
    badge: 'status', listColumns: ['schedule_date', 'schedule_time', 'function_name', 'person_id', 'event_id', 'status'],
  },

  /* ------------------------------------------------------------- EBD/INFANTIL */
  ebd_classes: {
    table: 'ebd_classes', label: 'Classe EBD', plural: 'Classes EBD', module: 'ebd',
    search: ['name', 'room', 'age_range', 'schedule'], required: ['name'],
    dates: [], numbers: [], dateField: 'created_at', sort: { default: 'name', allowed: ['name'] },
    badge: 'status', listColumns: ['name', 'teacher_id', 'room', 'age_range', 'schedule', 'status'],
    scope: 'ebd',
  },
  ebd_students: {
    table: 'ebd_students', label: 'Aluno EBD', plural: 'Alunos EBD', module: 'ebd',
    search: ['status'], required: ['class_id', 'person_id'], dates: ['enrolled_at'], numbers: [],
    dateField: 'enrolled_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['class_id', 'person_id', 'enrolled_at', 'status'], scope: 'ebd',
  },
  ebd_lessons: {
    table: 'ebd_lessons', label: 'Lição EBD', plural: 'Lições EBD', module: 'ebd',
    search: ['theme', 'content'], required: ['class_id', 'lesson_date'], dates: ['lesson_date'], numbers: [],
    dateField: 'lesson_date', sort: { default: 'lesson_date', allowed: ['lesson_date'] },
    listColumns: ['class_id', 'lesson_date', 'theme', 'teacher_id'], scope: 'ebd',
  },
  ebd_attendance: {
    table: 'ebd_attendance', label: 'Presença EBD', plural: 'Presenças EBD', module: 'ebd',
    search: ['status'], required: ['lesson_id', 'person_id'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['lesson_id', 'person_id', 'status'], scope: 'ebd',
  },
  children: {
    table: 'children', label: 'Criança', plural: 'Crianças', module: 'infantil',
    search: ['class_name', 'notes'], required: ['person_id'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'id', allowed: ['id'] },
    listColumns: ['person_id', 'guardian_id', 'class_name', 'allergies'],
  },
  child_checkins: {
    table: 'child_checkins', label: 'Check-in infantil', plural: 'Check-ins', module: 'infantil',
    search: ['code', 'checked_in_by', 'released_to'], required: ['child_id'], dates: ['checkin_at', 'checkout_at'],
    numbers: [], dateField: 'checkin_at', sort: { default: 'checkin_at', allowed: ['checkin_at', 'checkout_at'] },
    listColumns: ['code', 'child_id', 'checkin_at', 'checkout_at', 'released_to'],
  },

  /* -------------------------------------------------------------- PASTORAL */
  pastoral_care: {
    table: 'pastoral_care', label: 'Acompanhamento pastoral', plural: 'Acompanhamentos', module: 'pastoral',
    search: ['care_type', 'next_action', 'status', 'notes'], required: ['person_id', 'care_date'],
    dates: ['care_date', 'next_action_date'], numbers: [], dateField: 'care_date',
    sort: { default: 'care_date', allowed: ['care_date', 'status'] },
    badge: 'status', listColumns: ['person_id', 'care_type', 'care_date', 'responsible_id', 'status'],
    sensitive: true,
  },
  prayer_requests: {
    table: 'prayer_requests', label: 'Pedido de oração', plural: 'Pedidos de oração', module: 'pastoral',
    search: ['request', 'category', 'status'], required: ['request'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'created_at', allowed: ['created_at'] },
    badge: 'status', listColumns: ['person_id', 'category', 'status', 'request'], sensitive: true,
  },

  /* ------------------------------------------------------------- FINANCEIRO */
  bank_accounts: {
    table: 'bank_accounts', label: 'Conta bancária', plural: 'Contas', module: 'financeiro',
    search: ['name', 'bank', 'account_type', 'pix_key'], required: ['name'],
    dates: [], numbers: ['initial_balance'], dateField: 'created_at',
    sort: { default: 'name', allowed: ['name', 'initial_balance'] },
    badge: 'status', listColumns: ['name', 'bank', 'account_type', 'initial_balance', 'status'],
  },
  transactions: {
    table: 'transactions', label: 'Lançamento', plural: 'Lançamentos', module: 'financeiro',
    search: ['description', 'document', 'notes', 'tx_type', 'payment_method'], required: ['tx_type', 'value', 'tx_date'],
    dates: ['tx_date'], numbers: ['value'], dateField: 'tx_date',
    sort: { default: 'tx_date', allowed: ['tx_date', 'value', 'created_at'] },
    badge: 'tx_type', financial: true,
    listColumns: ['tx_date', 'tx_type', 'description', 'category_id', 'value', 'account_id', 'fund_id'],
  },
  payables: {
    table: 'payables', label: 'Conta a pagar', plural: 'Contas a pagar', module: 'contas',
    search: ['description', 'document', 'notes'], required: ['description', 'value', 'due_date'],
    dates: ['due_date', 'payment_date'], numbers: ['value'], dateField: 'due_date',
    sort: { default: 'due_date', allowed: ['due_date', 'value', 'status'] },
    badge: 'status', financial: true,
    listColumns: ['description', 'supplier_id', 'due_date', 'value', 'cost_center_id', 'status'],
  },
  receivables: {
    table: 'receivables', label: 'Conta a receber', plural: 'Contas a receber', module: 'contas',
    search: ['description', 'origin', 'payer_name', 'notes'], required: ['description', 'value', 'due_date'],
    dates: ['due_date', 'received_date'], numbers: ['value'], dateField: 'due_date',
    sort: { default: 'due_date', allowed: ['due_date', 'value', 'status'] },
    badge: 'status', financial: true,
    listColumns: ['description', 'origin', 'payer_name', 'due_date', 'value', 'status'],
  },
  budgets: {
    table: 'budgets', label: 'Orçamento', plural: 'Orçamentos', module: 'financeiro',
    search: ['notes'], required: ['year', 'planned_value'], dates: [], numbers: ['year', 'month', 'planned_value'],
    dateField: 'created_at', sort: { default: 'year', allowed: ['year', 'month', 'planned_value'] },
    listColumns: ['year', 'month', 'category_id', 'cost_center_id', 'planned_value'],
  },
  categories: {
    table: 'categories', label: 'Categoria', plural: 'Categorias', module: 'configuracoes',
    search: ['name', 'kind'], required: ['name', 'kind'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'name', allowed: ['name', 'kind'] },
    badge: 'kind', listColumns: ['name', 'kind', 'status'],
  },
  cost_centers: {
    table: 'cost_centers', label: 'Centro de custo', plural: 'Centros de custo', module: 'financeiro',
    search: ['name', 'notes'], required: ['name'], dates: [], numbers: ['annual_budget'],
    dateField: 'created_at', sort: { default: 'name', allowed: ['name', 'annual_budget'] },
    listColumns: ['name', 'annual_budget'],
  },
  funds: {
    table: 'funds', label: 'Fundo', plural: 'Fundos', module: 'financeiro',
    search: ['name', 'notes'], required: ['name'], dates: [], numbers: ['goal'],
    dateField: 'created_at', sort: { default: 'name', allowed: ['name', 'goal'] },
    badge: 'status', listColumns: ['name', 'goal', 'status'],
  },

  /* -------------------------------------------------------------- OPERACAO */
  suppliers: {
    table: 'suppliers', label: 'Fornecedor', plural: 'Fornecedores', module: 'fornecedores',
    search: ['name', 'document', 'phone', 'email', 'category'], required: ['name'],
    dates: [], numbers: [], dateField: 'created_at', sort: { default: 'name', allowed: ['name', 'category'] },
    badge: 'status', listColumns: ['name', 'person_type', 'document', 'phone', 'category', 'status'],
  },
  contracts: {
    table: 'contracts', label: 'Contrato', plural: 'Contratos', module: 'contratos',
    search: ['description', 'contract_type', 'document'], required: ['description', 'start_date', 'end_date'],
    dates: ['start_date', 'end_date'], numbers: ['value'], dateField: 'end_date',
    sort: { default: 'end_date', allowed: ['end_date', 'value'] },
    badge: 'status', listColumns: ['description', 'supplier_id', 'start_date', 'end_date', 'value', 'status'],
  },
  assets: {
    table: 'assets', label: 'Patrimônio', plural: 'Patrimônio', module: 'patrimonio',
    search: ['name', 'code', 'category', 'location', 'description'], required: ['name'],
    dates: ['acquisition_date', 'warranty_until'], numbers: ['value'], dateField: 'acquisition_date',
    sort: { default: 'name', allowed: ['name', 'code', 'value', 'acquisition_date'] },
    badge: 'status', listColumns: ['code', 'name', 'category', 'location', 'value', 'condition_state', 'status'],
  },
  maintenance: {
    table: 'maintenance', label: 'Manutenção', plural: 'Manutenções', module: 'manutencao',
    search: ['problem', 'notes'], required: ['problem', 'request_date'],
    dates: ['request_date', 'completion_date'], numbers: ['quote_value', 'cost'], dateField: 'request_date',
    sort: { default: 'request_date', allowed: ['request_date', 'priority', 'status'] },
    badge: 'status', listColumns: ['asset_id', 'problem', 'priority', 'request_date', 'cost', 'status'],
  },
  documents: {
    table: 'documents', label: 'Documento', plural: 'Documentos', module: 'documentos',
    search: ['title', 'category', 'file_name', 'notes'], required: ['title'],
    dates: ['valid_until'], numbers: [], dateField: 'valid_until',
    sort: { default: 'created_at', allowed: ['title', 'valid_until', 'created_at'] },
    listColumns: ['title', 'category', 'file_name', 'valid_until', 'responsible_id'],
  },
  tasks: {
    table: 'tasks', label: 'Tarefa', plural: 'Tarefas', module: 'tarefas',
    search: ['title', 'description', 'sector'], required: ['title'],
    dates: ['due_date'], numbers: [], dateField: 'due_date',
    sort: { default: 'due_date', allowed: ['due_date', 'priority', 'status'] },
    badge: 'status', listColumns: ['title', 'sector', 'responsible_id', 'due_date', 'priority', 'status'],
  },
  calendar_events: {
    table: 'calendar_events', label: 'Compromisso', plural: 'Agenda', module: 'agenda',
    search: ['title', 'location', 'category'], required: ['title', 'start_at'],
    dates: ['start_at'], numbers: [], dateField: 'start_at',
    sort: { default: 'start_at', allowed: ['start_at', 'title'] },
    badge: 'category', listColumns: ['title', 'category', 'start_at', 'end_at', 'location'],
  },

  /* ----------------------------------------------------------- COMUNICACAO */
  announcements: {
    table: 'announcements', label: 'Comunicado', plural: 'Comunicados', module: 'comunicacao',
    search: ['title', 'body', 'audience'], required: ['title', 'body'],
    dates: ['publish_at'], numbers: [], dateField: 'publish_at',
    sort: { default: 'publish_at', allowed: ['publish_at', 'title'] },
    badge: 'status', listColumns: ['title', 'audience', 'channel', 'publish_at', 'status'],
  },
  notifications: {
    table: 'notifications', label: 'Notificação', plural: 'Notificações', module: 'comunicacao',
    search: ['title', 'body', 'kind'], required: ['title'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'created_at', allowed: ['created_at'] },
    listColumns: ['title', 'kind', 'read_at', 'created_at'],
  },

  /* ---------------------------------------------------------- CONFIGURACOES */
  users: {
    table: 'users', label: 'Usuário', plural: 'Usuários', module: 'configuracoes',
    search: ['name', 'email', 'role'], required: ['name', 'email', 'role'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'name', allowed: ['name', 'email', 'role', 'created_at'] },
    hidden: ['password_hash'], badge: 'role',
    listColumns: ['name', 'email', 'role', 'active', 'last_login'],
  },
  roles: {
    table: 'roles', label: 'Perfil de acesso', plural: 'Perfis e permissões', module: 'configuracoes',
    search: ['name', 'slug', 'description'], required: ['name', 'slug'], dates: [], numbers: [],
    dateField: 'created_at', sort: { default: 'name', allowed: ['name'] },
    listColumns: ['name', 'slug', 'description'],
  },
  integrations: {
    table: 'integrations', label: 'Integração', plural: 'Integrações', module: 'configuracoes',
    search: ['provider', 'status'], required: ['provider'], dates: [], numbers: [],
    dateField: 'updated_at', sort: { default: 'provider', allowed: ['provider'] },
    badge: 'status', listColumns: ['provider', 'status', 'updated_at'],
  },
  audit_logs: {
    table: 'audit_logs', label: 'Log de auditoria', plural: 'Auditoria', module: 'auditoria',
    search: ['user_name', 'action', 'module', 'resource'], required: [], dates: ['created_at'], numbers: [],
    dateField: 'created_at', sort: { default: 'created_at', allowed: ['created_at'] },
    readOnly: true, listColumns: ['created_at', 'user_name', 'action', 'module', 'resource', 'record_id'],
  },
  prayer_wall: {
    table: 'prayer_requests', label: 'Mural de oração', plural: 'Mural de oração', module: 'pastoral',
    search: [], required: [], dates: [], numbers: [], dateField: 'created_at',
    sort: { default: 'created_at', allowed: ['created_at'] }, readOnly: true,
    listColumns: ['request', 'category', 'created_at'],
  },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

export function resourceOf(key) {
  return RESOURCES[key] || null;
}
