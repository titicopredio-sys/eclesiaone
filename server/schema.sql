-- ============================================================================
-- ECLESIA ONE - Esquema relacional (SQLite 3 / compativel PostgreSQL)
-- Regras estruturais:
--   * TODA tabela de dados possui: id, church_id (multi-tenant), is_demo,
--     created_at, updated_at, deleted_at (soft delete).
--   * Integridade referencial ativa (FOREIGN KEY).
--   * Nenhum dado e apagado fisicamente em operacao normal (soft delete).
-- ============================================================================

CREATE TABLE IF NOT EXISTS churches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  legal_name TEXT,
  cnpj TEXT,
  email TEXT, phone TEXT, whatsapp TEXT,
  address TEXT, district TEXT, city TEXT, state TEXT, zip TEXT,
  pastor_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4F46E5',
  secondary_color TEXT DEFAULT '#D97706',
  onboarded INTEGER DEFAULT 0,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------------------------------------------------------------------------
-- SEGURANCA / RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER REFERENCES churches(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '{}',
  is_system INTEGER DEFAULT 0,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_roles_church ON roles(church_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER REFERENCES churches(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'membro',
  person_id INTEGER,
  phone TEXT,
  active INTEGER DEFAULT 1,
  require_reset INTEGER DEFAULT 0,
  is_demo INTEGER DEFAULT 0,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_users_church ON users(church_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  user_id INTEGER,
  email TEXT,
  token TEXT,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT,
  resource TEXT,
  record_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_church ON audit_logs(church_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_settings ON settings(church_id, key);

-- ---------------------------------------------------------------------------
-- PESSOAS / FAMILIAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  full_name TEXT NOT NULL,
  social_name TEXT,
  photo_url TEXT,
  birth_date TEXT,
  gender TEXT,
  cpf TEXT, rg TEXT,
  phone TEXT, whatsapp TEXT, email TEXT,
  address TEXT, district TEXT, city TEXT, state TEXT, zip TEXT,
  marital_status TEXT,
  wedding_date TEXT,
  join_date TEXT,
  baptism_date TEXT,
  status TEXT DEFAULT 'ativo',
  leader_flag INTEGER DEFAULT 0,
  how_knew TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_people_church ON people(church_id, status);
CREATE INDEX IF NOT EXISTS ix_people_name ON people(church_id, full_name);

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  name TEXT NOT NULL,
  address TEXT, district TEXT, city TEXT, state TEXT, zip TEXT, phone TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_families_church ON families(church_id);

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT DEFAULT 'outro',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_fammem ON family_members(church_id, family_id);

CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  first_visit_date TEXT,
  service TEXT,
  welcome_by INTEGER REFERENCES people(id),
  origin TEXT,
  how_knew TEXT,
  cell_id INTEGER,
  follow_up_by INTEGER REFERENCES people(id),
  stage TEXT DEFAULT 'primeiro_contato',
  status TEXT DEFAULT 'em_acompanhamento',
  next_contact_date TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_visitors_church ON visitors(church_id, status);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL REFERENCES people(id),
  role_title TEXT,
  department TEXT,
  hire_date TEXT,
  contract_type TEXT,
  salary REAL DEFAULT 0,
  status TEXT DEFAULT 'ativo',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  teacher_id INTEGER REFERENCES people(id),
  start_date TEXT, end_date TEXT,
  schedule TEXT, capacity INTEGER, price REAL DEFAULT 0,
  status TEXT DEFAULT 'aberto',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  enrolled_at TEXT,
  status TEXT DEFAULT 'inscrito',
  attendance_percent INTEGER DEFAULT 0,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------------------------------------------------------------------------
-- CELULAS / MINISTERIOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  name TEXT NOT NULL,
  code TEXT,
  leader_id INTEGER REFERENCES people(id),
  co_leader_id INTEGER REFERENCES people(id),
  supervisor_id INTEGER REFERENCES people(id),
  address TEXT, district TEXT, city TEXT,
  weekday TEXT, meeting_time TEXT,
  capacity INTEGER DEFAULT 20,
  status TEXT DEFAULT 'ativa',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_cells_church ON cells(church_id, status);

CREATE TABLE IF NOT EXISTS cell_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  cell_id INTEGER NOT NULL REFERENCES cells(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT DEFAULT 'membro',
  joined_at TEXT,
  status TEXT DEFAULT 'ativo',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_cellmem ON cell_members(church_id, cell_id);

CREATE TABLE IF NOT EXISTS cell_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  cell_id INTEGER NOT NULL REFERENCES cells(id),
  meeting_date TEXT NOT NULL,
  present_count INTEGER DEFAULT 0,
  absent_count INTEGER DEFAULT 0,
  visitors_count INTEGER DEFAULT 0,
  new_visitors INTEGER DEFAULT 0,
  theme TEXT,
  prayer_requests TEXT,
  offering REAL DEFAULT 0,
  report_sent INTEGER DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_cellmeet ON cell_meetings(church_id, cell_id, meeting_date);

CREATE TABLE IF NOT EXISTS cell_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  meeting_id INTEGER NOT NULL REFERENCES cell_meetings(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT DEFAULT 'presente',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_cellatt ON cell_attendance(church_id, meeting_id);

CREATE TABLE IF NOT EXISTS ministries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'outro',
  leader_id INTEGER REFERENCES people(id),
  co_leader_id INTEGER REFERENCES people(id),
  description TEXT,
  meeting_day TEXT,
  status TEXT DEFAULT 'ativo',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_ministries_church ON ministries(church_id, type);

CREATE TABLE IF NOT EXISTS ministry_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  ministry_id INTEGER NOT NULL REFERENCES ministries(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT DEFAULT 'integrante',
  status TEXT DEFAULT 'ativo',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL REFERENCES people(id),
  ministry_id INTEGER REFERENCES ministries(id),
  function_name TEXT,
  availability TEXT,
  skills TEXT,
  status TEXT DEFAULT 'ativo',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------------------------------------------------------------------------
-- EVENTOS / ESCALAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  name TEXT NOT NULL,
  description TEXT,
  event_date TEXT,
  start_time TEXT, end_time TEXT,
  location TEXT,
  capacity INTEGER,
  responsible_id INTEGER REFERENCES people(id),
  registration_open INTEGER DEFAULT 0,
  price REAL DEFAULT 0,
  fund_id INTEGER, cost_center_id INTEGER,
  status TEXT DEFAULT 'planejado',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_events_church ON events(church_id, event_date);

CREATE TABLE IF NOT EXISTS event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT DEFAULT 'inscrito',
  paid INTEGER DEFAULT 0,
  amount REAL DEFAULT 0,
  qr_code TEXT,
  registered_at TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  event_id INTEGER REFERENCES events(id),
  ministry_id INTEGER REFERENCES ministries(id),
  schedule_date TEXT,
  schedule_time TEXT,
  function_name TEXT,
  person_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT DEFAULT 'pendente',
  notes TEXT,
  responded_at TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_schedules_church ON schedules(church_id, schedule_date);

-- ---------------------------------------------------------------------------
-- EBD / INFANTIL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ebd_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  teacher_id INTEGER REFERENCES people(id),
  co_teacher_id INTEGER REFERENCES people(id),
  room TEXT,
  age_range TEXT,
  schedule TEXT,
  status TEXT DEFAULT 'ativa',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS ebd_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL REFERENCES ebd_classes(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT DEFAULT 'matriculado',
  enrolled_at TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS ebd_lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL REFERENCES ebd_classes(id),
  lesson_date TEXT,
  theme TEXT,
  content TEXT,
  teacher_id INTEGER REFERENCES people(id),
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS ebd_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL REFERENCES ebd_lessons(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT DEFAULT 'presente',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL REFERENCES people(id),
  guardian_id INTEGER REFERENCES people(id),
  class_name TEXT,
  allergies TEXT,
  authorized_pickup TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS child_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL REFERENCES children(id),
  code TEXT NOT NULL,
  checkin_at TEXT,
  checkout_at TEXT,
  checked_in_by TEXT,
  checked_out_by TEXT,
  released_to TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_checkins ON child_checkins(church_id, checkout_at);

-- ---------------------------------------------------------------------------
-- PASTORAL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pastoral_care (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  person_id INTEGER REFERENCES people(id),
  responsible_id INTEGER REFERENCES people(id),
  care_type TEXT DEFAULT 'acompanhamento',
  care_date TEXT,
  next_action TEXT,
  next_action_date TEXT,
  status TEXT DEFAULT 'em_andamento',
  confidential INTEGER DEFAULT 1,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_pastoral ON pastoral_care(church_id, status);

CREATE TABLE IF NOT EXISTS prayer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  person_id INTEGER REFERENCES people(id),
  requester_name TEXT,
  request TEXT NOT NULL,
  category TEXT,
  is_public INTEGER DEFAULT 0,
  confidential INTEGER DEFAULT 1,
  status TEXT DEFAULT 'aberto',
  answered_notes TEXT,
  created_by INTEGER,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------------------------------------------------------------------------
-- FINANCEIRO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  name TEXT NOT NULL,
  bank TEXT,
  account_type TEXT DEFAULT 'corrente',
  agency TEXT, account_number TEXT, pix_key TEXT,
  initial_balance REAL DEFAULT 0,
  status TEXT DEFAULT 'ativa',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id INTEGER,
  status TEXT DEFAULT 'ativa',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cost_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  annual_budget REAL DEFAULT 0,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  goal REAL DEFAULT 0,
  status TEXT DEFAULT 'ativo',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  tx_type TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  description TEXT,
  value REAL NOT NULL DEFAULT 0,
  tx_date TEXT NOT NULL,
  account_id INTEGER REFERENCES bank_accounts(id),
  dest_account_id INTEGER,
  person_id INTEGER REFERENCES people(id),
  fund_id INTEGER REFERENCES funds(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  payment_method TEXT,
  document TEXT,
  notes TEXT,
  status TEXT DEFAULT 'confirmado',
  created_by INTEGER,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_tx_church ON transactions(church_id, tx_date);
CREATE INDEX IF NOT EXISTS ix_tx_cat ON transactions(church_id, category_id);

CREATE TABLE IF NOT EXISTS payables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  description TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  fund_id INTEGER REFERENCES funds(id),
  value REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  payment_date TEXT,
  account_id INTEGER REFERENCES bank_accounts(id),
  payment_method TEXT,
  document TEXT,
  responsible_id INTEGER REFERENCES people(id),
  notes TEXT,
  status TEXT DEFAULT 'pendente',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_payables ON payables(church_id, due_date);

CREATE TABLE IF NOT EXISTS receivables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  origin TEXT,
  description TEXT NOT NULL,
  payer_name TEXT,
  category_id INTEGER REFERENCES categories(id),
  value REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  received_date TEXT,
  account_id INTEGER REFERENCES bank_accounts(id),
  status TEXT DEFAULT 'pendente',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER,
  category_id INTEGER REFERENCES categories(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  fund_id INTEGER REFERENCES funds(id),
  planned_value REAL DEFAULT 0,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ---------------------------------------------------------------------------
-- OPERACAO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  person_type TEXT DEFAULT 'juridica',
  document TEXT,
  phone TEXT, email TEXT, address TEXT,
  category TEXT,
  status TEXT DEFAULT 'ativo',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  contract_type TEXT,
  description TEXT,
  start_date TEXT, end_date TEXT,
  value REAL DEFAULT 0,
  periodicity TEXT,
  responsible_id INTEGER REFERENCES people(id),
  document TEXT,
  status TEXT DEFAULT 'vigente',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  value REAL DEFAULT 0,
  acquisition_date TEXT,
  location TEXT,
  responsible_id INTEGER REFERENCES people(id),
  condition_state TEXT DEFAULT 'bom',
  warranty_until TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  document TEXT,
  notes TEXT,
  status TEXT DEFAULT 'ativo',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  asset_id INTEGER REFERENCES assets(id),
  problem TEXT NOT NULL,
  request_date TEXT,
  priority TEXT DEFAULT 'media',
  responsible_id INTEGER REFERENCES people(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  quote_value REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  status TEXT DEFAULT 'aberto',
  completion_date TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  file_name TEXT,
  file_url TEXT,
  valid_until TEXT,
  responsible_id INTEGER REFERENCES people(id),
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  responsible_id INTEGER REFERENCES people(id),
  sector TEXT,
  priority TEXT DEFAULT 'media',
  due_date TEXT,
  status TEXT DEFAULT 'a_fazer',
  notes TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'culto',
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  notes TEXT,
  ref_type TEXT,
  ref_id INTEGER,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_cal ON calendar_events(church_id, start_at);

-- ---------------------------------------------------------------------------
-- COMUNICACAO / NOTIFICACOES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  audience TEXT DEFAULT 'toda_igreja',
  channel TEXT DEFAULT 'portal',
  publish_at TEXT,
  status TEXT DEFAULT 'publicado',
  created_by INTEGER,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  user_id INTEGER,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT DEFAULT 'info',
  link TEXT,
  read_at TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'nao_configurado',
  config_json TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
