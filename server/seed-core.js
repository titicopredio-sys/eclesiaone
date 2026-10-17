/**
 * Eclesia One - Dados demonstrativos: nucleo (pessoas, familias, celulas,
 * ministerios, eventos, EBD, infantil, pastoral, usuarios e perfis).
 * Todo registro recebe is_demo = 1 e pertence a uma igreja marcada como DEMONSTRACAO.
 */
import { insert, all, one, run, transaction } from './db.js';
import { hashPassword, isoNow, isoDate, addDays } from './lib.js';

/* ----------------------------------------------- gerador pseudoaleatorio */
let seedState = 20260929;
export function rnd() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const chance = (p) => rnd() < p;
export const today = () => isoDate(new Date());

const FIRST_M = ['João', 'Pedro', 'Lucas', 'Mateus', 'Marcos', 'Tiago', 'André', 'Felipe', 'Daniel', 'Gabriel', 'Rafael', 'Samuel', 'Davi', 'Josué', 'Elias', 'Isaque', 'Abraão', 'Moisés', 'Ezequiel', 'Neemias', 'Bruno', 'Carlos', 'Eduardo', 'Fernando', 'Gustavo', 'Henrique', 'Igor', 'Julio', 'Leandro', 'Marcelo', 'Nelson', 'Otávio', 'Paulo', 'Ricardo', 'Sérgio', 'Thiago', 'Vinícius', 'Wagner', 'Alexandre', 'Roberto'];
const FIRST_F = ['Maria', 'Ana', 'Beatriz', 'Carolina', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Karina', 'Larissa', 'Marta', 'Natália', 'Olívia', 'Patrícia', 'Queren', 'Renata', 'Sara', 'Tatiane', 'Úrsula', 'Vanessa', 'Wanessa', 'Yara', 'Zélia', 'Cláudia', 'Débora', 'Elaine', 'Fabiana', 'Giovana', 'Heloísa', 'Ingrid', 'Jéssica', 'Letícia', 'Michele', 'Noemi', 'Priscila', 'Raquel', 'Susana'];
const SURNAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Almeida', 'Costa', 'Gomes', 'Ribeiro', 'Martins', 'Carvalho', 'Alves', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Azevedo', 'Teixeira', 'Correia', 'Monteiro', 'Batista', 'Evangelista', 'Apóstolo', 'Miranda', 'Peixoto'];
const DISTRICTS = ['Centro', 'Jardim América', 'Vila Nova', 'São José', 'Boa Vista', 'Parque das Flores', 'Alto da Serra', 'Santa Mônica', 'Bela Vista', 'Morada do Sol'];
const CITIES = [['Campinas', 'SP', '13010-000'], ['São Paulo', 'SP', '01001-000'], ['Belo Horizonte', 'MG', '30110-000'], ['Curitiba', 'PR', '80010-000'], ['Goiânia', 'GO', '74010-000']];
const MARITAL = ['solteiro', 'casado', 'divorciado', 'viuvo'];
const HOW = ['convite de amigo', 'redes sociais', 'passou em frente', 'culto online', 'familiar', 'evangelismo'];

export const DEMO_CHURCH_NAME = 'Igreja Demonstração Eclesia One (DEMONSTRAÇÃO)';

const PERMISSIONS_CATALOG = [
  'pessoas', 'familias', 'visitantes', 'funcionarios', 'celulas', 'ministerios', 'voluntarios',
  'escalas', 'ebd', 'infantil', 'pastoral', 'eventos', 'agenda', 'financeiro', 'contas',
  'patrimonio', 'manutencao', 'fornecedores', 'contratos', 'documentos', 'tarefas',
  'comunicacao', 'relatorios', 'inteligencia', 'configuracoes', 'auditoria',
];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print'];

export const ROLE_PRESETS = {
  super_admin: { label: 'Super Admin', all: true },
  pastor: { label: 'Pastor', modules: PERMISSIONS_CATALOG.filter((m) => !['configuracoes', 'auditoria'].includes(m)), actions: ['view', 'create', 'edit', 'approve', 'export', 'print'] },
  pastor_auxiliar: { label: 'Pastor Auxiliar', modules: ['pessoas', 'familias', 'visitantes', 'celulas', 'ministerios', 'voluntarios', 'escalas', 'ebd', 'infantil', 'pastoral', 'eventos', 'agenda', 'relatorios', 'comunicacao', 'inteligencia'], actions: ['view', 'create', 'edit', 'export', 'print'] },
  financeiro: { label: 'Financeiro', modules: ['financeiro', 'contas', 'fornecedores', 'contratos', 'relatorios', 'inteligencia', 'documentos'], actions: ['view', 'create', 'edit', 'approve', 'export', 'print'] },
  secretaria: { label: 'Secretaria', modules: ['pessoas', 'familias', 'visitantes', 'funcionarios', 'documentos', 'agenda', 'eventos', 'relatorios', 'comunicacao', 'escalas'], actions: ['view', 'create', 'edit', 'export', 'print'] },
  lider_celula: { label: 'Líder de Célula', modules: ['celulas', 'pessoas', 'agenda', 'relatorios', 'pastoral', 'escalas', 'comunicacao'], actions: ['view', 'create', 'edit'] },
  lider_ministerio: { label: 'Líder de Ministério', modules: ['ministerios', 'voluntarios', 'escalas', 'eventos', 'agenda', 'pessoas', 'tarefas', 'relatorios'], actions: ['view', 'create', 'edit'] },
  professor: { label: 'Professor EBD', modules: ['ebd', 'infantil', 'escalas', 'agenda'], actions: ['view', 'create', 'edit'] },
  recepcao: { label: 'Recepção', modules: ['visitantes', 'pessoas', 'infantil', 'agenda'], actions: ['view', 'create', 'edit'] },
  membro: { label: 'Membro', modules: ['agenda', 'eventos', 'escalas', 'comunicacao'], actions: ['view'] },
};

export function buildPermissions(preset) {
  const out = {};
  for (const m of PERMISSIONS_CATALOG) out[m] = [];
  if (preset.all) {
    for (const m of PERMISSIONS_CATALOG) out[m] = [...ACTIONS];
    return out;
  }
  for (const m of preset.modules) out[m] = [...(preset.actions || ['view'])];
  return out;
}

/* ------------------------------------------------------------------ pessoas */
export function createPerson(churchId, opts = {}) {
  const gender = opts.gender || (chance(0.5) ? 'M' : 'F');
  const first = gender === 'M' ? pick(FIRST_M) : pick(FIRST_F);
  const name = opts.full_name || `${first} ${pick(SURNAMES)}${chance(0.35) ? ' ' + pick(SURNAMES) : ''}`;
  const age = opts.age ?? rint(1, 82);
  const birth = opts.birth_date || `${new Date().getFullYear() - age}-${String(rint(1, 12)).padStart(2, '0')}-${String(rint(1, 28)).padStart(2, '0')}`;
  const [city, state, zip] = pick(CITIES);
  const status = opts.status || (age < 12 ? 'ativo' : chance(0.86) ? 'ativo' : chance(0.5) ? 'inativo' : 'em_acompanhamento');
  const id = insert('people', {
    church_id: churchId,
    full_name: name,
    social_name: null,
    birth_date: birth,
    gender,
    cpf: String(rint(100, 999)) + String(rint(100, 999)) + String(rint(100, 999)) + '-' + String(rint(10, 99)),
    rg: null,
    phone: `(19) 9${rint(1000, 9999)}-${rint(1000, 9999)}`,
    whatsapp: `(19) 9${rint(1000, 9999)}-${rint(1000, 9999)}`,
    email: chance(0.55) ? `${name.split(' ')[0].toLowerCase()}.${rint(1, 999)}@email.com` : null,
    address: `Rua ${pick(['das Acácias', 'dos Ipês', 'Sabino Vieira', 'Sete de Setembro', 'XV de Novembro', 'das Palmeiras'])} ${rint(10, 990)}`,
    district: pick(DISTRICTS), city, state, zip,
    marital_status: age < 18 ? 'solteiro' : pick(MARITAL),
    join_date: addDays(today(), -rint(30, 3200)),
    baptism_date: chance(0.7) ? addDays(today(), -rint(20, 2800)) : null,
    status,
    leader_flag: opts.leader_flag ?? 0,
    how_knew: pick(HOW),
    notes: null,
    is_demo: 1,
    created_at: isoNow(), updated_at: isoNow(),
  });
  return id;
}

/* ------------------------------------------------------------ seed principal */
export function seedCore(churchId, opts = {}) {
  return transaction(() => {
    const out = { people: [], families: [], cells: [], ministries: [], events: [], ebd: [], users: [] };

    /* ------------------------------------------------------------- perfis */
    for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
      insert('roles', {
        church_id: churchId, name: preset.label, slug, description: `Perfil padrao: ${preset.label}`,
        permissions: JSON.stringify(buildPermissions(preset)), is_system: 1, is_demo: 1,
        created_at: isoNow(), updated_at: isoNow(),
      });
    }

    /* ------------------------------------------------------------ pessoas */
    const total = opts.people ?? 180;
    for (let i = 0; i < total; i++) {
      const ageGuess = i < 40 ? rint(1, 79) : rint(1, 82);
      out.people.push(createPerson(churchId, { age: ageGuess }));
    }
    // lideres marcados
    const leaders = out.people.slice(0, 26);
    for (const id of leaders) run('UPDATE people SET leader_flag = 1 WHERE id = ?', [id]);

    /* ----------------------------------------------------------- familias */
    const surnames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Almeida', 'Costa'];
    for (let f = 0; f < 34; f++) {
      const fam = `${pick(surnames)} ${pick(surnames)}`;
      const [city, state, zip] = pick(CITIES);
      const familyId = insert('families', {
        church_id: churchId, name: `Família ${fam}`,
        address: `Rua ${pick(['das Acácias', 'dos Ipês', 'das Oliveiras'])} ${rint(10, 800)}`,
        district: pick(DISTRICTS), city, state, zip,
        phone: `(19) 3${rint(100, 999)}-${rint(1000, 9999)}`,
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      const adults = out.people.filter((p, idx) => idx % 5 === f % 5).slice(0, 2);
      const kids = out.people.filter((p, idx) => idx % 11 === f % 11).slice(0, 2);
      const members = [...adults, ...kids];
      members.forEach((pid, idx) => {
        insert('family_members', {
          church_id: churchId, family_id: familyId, person_id: pid,
          role: idx === 0 ? 'responsavel' : idx === 1 ? 'conjuge' : 'filho',
          is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      });
    }

    /* ------------------------------------------------------------ celulas */
    const cellDefs = [
      ['Célula Betel', 'CEL-001', 'terca', '20:00'], ['Célula Ebenézer', 'CEL-002', 'quarta', '19:30'],
      ['Célula Getsêmani', 'CEL-003', 'quinta', '20:00'], ['Célula Sião', 'CEL-004', 'sexta', '19:30'],
      ['Célula Monte Sião', 'CEL-005', 'terca', '19:00'], ['Célula Nova Vida', 'CEL-006', 'quarta', '20:00'],
      ['Célula Filadélfia', 'CEL-007', 'quinta', '19:00'], ['Célula Casa de Deus', 'CEL-008', 'sexta', '20:00'],
    ];
    cellDefs.forEach(([name, code, weekday, time], idx) => {
      const [city] = pick(CITIES);
      const cellId = insert('cells', {
        church_id: churchId, name, code,
        leader_id: leaders[idx], co_leader_id: leaders[idx + 8] || null, supervisor_id: leaders[idx + 16] || leaders[0],
        address: `Rua ${pick(['das Flores', 'São João', 'Boa Esperança'])} ${rint(10, 500)}`,
        district: pick(DISTRICTS), city,
        weekday, meeting_time: time, capacity: rint(15, 30),
        status: chance(0.92) ? 'ativa' : 'em_implantacao',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      out.cells.push(cellId);
      const members = out.people.filter((_, i) => i % 9 === idx % 9).slice(0, rint(9, 16));
      members.forEach((pid, mi) => insert('cell_members', {
        church_id: churchId, cell_id: cellId, person_id: pid,
        role: mi === 0 ? 'lider' : mi === 1 ? 'co_lider' : 'membro',
        joined_at: addDays(today(), -rint(30, 900)), status: 'ativo',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
      // reunioes das ultimas 14 semanas
      for (let w = 0; w < 14; w++) {
        const mdate = addDays(today(), -(w * 7) - (idx % 3));
        const present = rint(Math.max(5, members.length - 6), members.length + 3);
        const meetId = insert('cell_meetings', {
          church_id: churchId, cell_id: cellId, meeting_date: mdate,
          present_count: present, absent_count: Math.max(0, members.length - present),
          visitors_count: rint(0, 4), new_visitors: rint(0, 2),
          theme: pick(['Fé que move montanhas', 'O poder da oração', 'Comunhão verdadeira', 'Serviço e humildade', 'A graça que transforma', 'Vida no Espírito']),
          prayer_requests: pick(['Saúde da família', 'Providência financeira', 'Restauração de um casamento', 'Direção profissional', null]),
          offering: rint(0, 6) * 10 + 5,
          report_sent: w === 0 && idx % 4 === 0 ? 0 : 1,
          notes: null, is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
        members.slice(0, 8).forEach((pid, ai) => insert('cell_attendance', {
          church_id: churchId, meeting_id: meetId, person_id: pid,
          status: ai < present - 8 ? 'presente' : chance(0.85) ? 'presente' : 'ausente',
          is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        }));
      }
    });

    /* -------------------------------------------------------- ministerios */
    const ministryDefs = [
      ['Ministério de Louvor', 'louvor'], ['Ministério Infantil', 'infantil'], ['Ministério de Jovens', 'juventude'],
      ['Ministério de Mídia', 'midia'], ['Ministério de Recepção', 'recepcao'], ['Ministério de Missões', 'missoes'],
      ['Ação Social', 'acao_social'], ['Ministério de Intercessão', 'intercessao'], ['Escola Bíblica Dominical', 'ebd'],
      ['Ministério de Mulheres', 'mulheres'], ['Ministério de Homens', 'homens'],
    ];
    ministryDefs.forEach(([name, type], idx) => {
      const mid = insert('ministries', {
        church_id: churchId, name, type, leader_id: leaders[idx], co_leader_id: leaders[idx + 10] || null,
        description: `Área responsável por ${name.replace('Ministério de ', '').toLowerCase()}.`,
        meeting_day: pick(['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sabado']),
        status: 'ativo', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      out.ministries.push(mid);
      const members = out.people.filter((_, i) => i % 12 === idx % 12).slice(0, rint(6, 14));
      members.forEach((pid, mi) => insert('ministry_members', {
        church_id: churchId, ministry_id: mid, person_id: pid,
        role: mi === 0 ? 'lider' : 'integrante', status: 'ativo',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
      // voluntarios
      members.slice(0, 6).forEach((pid) => insert('volunteers', {
        church_id: churchId, person_id: pid, ministry_id: mid,
        function_name: pick(['Instrumentista', 'Vocal', 'Projeção', 'Som', 'Professor', 'Recepção', 'Câmera', 'Intercessor']),
        availability: pick(['Domingo manhã', 'Domingo noite', 'Quarta à noite', 'Sábado à tarde', 'Flexível']),
        skills: pick(['Música', 'Comunicação', 'Ensino', 'Organização', 'Técnica', null]),
        status: 'ativo', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
    });

    /* ------------------------------------------------------------- eventos */
    const eventDefs = [
      ['Culto de Celebração', 0, 'Culto'], ['Vigília de Oração', 3, 'Vigília'], ['Conferência de Missões', 12, 'Conferência'],
      ['Encontro de Casais', 20, 'Encontro'], ['Retiro de Jovens', 34, 'Retiro'], ['Batismo nas Águas', 45, 'Culto'],
      ['Treinamento de Líderes', -6, 'Treinamento'], ['Culto de Ações de Graças', -14, 'Culto'],
    ];
    eventDefs.forEach(([name, delta, tag], idx) => {
      const d = addDays(today(), delta);
      const evId = insert('events', {
        church_id: churchId, name, description: `${tag} - ${name} da comunidade Eclesia One.`,
        event_date: d, start_time: pick(['19:00', '09:00', '20:00', '18:30']), end_time: pick(['21:00', '11:30', '22:00']),
        location: pick(['Templo Principal', 'Salão Social', 'Chácara Eclesia', 'Auditório']),
        capacity: rint(60, 400), responsible_id: leaders[idx % leaders.length],
        registration_open: delta > 0 ? 1 : 0, price: chance(0.4) ? rint(1, 8) * 15 : 0,
        status: delta < 0 ? 'realizado' : 'planejado',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      out.events.push(evId);
      const regs = out.people.filter((_, i) => i % 7 === idx % 7).slice(0, rint(8, 26));
      regs.forEach((pid) => insert('event_registrations', {
        church_id: churchId, event_id: evId, person_id: pid,
        status: delta < 0 ? 'presente' : pick(['inscrito', 'inscrito', 'confirmado']),
        paid: chance(0.6) ? 1 : 0, amount: 0,
        registered_at: addDays(d, -rint(1, 25)),
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
      // escalas do evento
      const fn = ['Louvor', 'Som', 'Projeção', 'Recepção', 'Diácono', 'Professor'];
      for (let s = 0; s < 6; s++) {
        insert('schedules', {
          church_id: churchId, event_id: evId, ministry_id: out.ministries[s % out.ministries.length],
          schedule_date: d, schedule_time: '18:30', function_name: fn[s], person_id: out.people[rint(0, out.people.length - 1)],
          status: delta < 0 ? 'confirmado' : pick(['pendente', 'confirmado', 'confirmado', 'recusado']),
          is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      }
      insert('calendar_events', {
        church_id: churchId, title: name, category: delta < 0 ? 'culto' : pick(['culto', 'evento', 'ministerio']),
        start_at: `${d} 19:00`, end_at: `${d} 21:00`, location: 'Templo Principal',
        ref_type: 'event', ref_id: evId, is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    });

    /* ---------------------------------------------------------------- EBD */
    const ebdDefs = [['Berçário', '0-3 anos'], ['Primários', '4-7 anos'], ['Juniores', '8-11 anos'], ['Adolescentes', '12-17 anos'], ['Adultos', '18+ anos']];
    ebdDefs.forEach(([name, range], idx) => {
      const classId = insert('ebd_classes', {
        church_id: churchId, name: `Classe ${name}`, teacher_id: leaders[idx], co_teacher_id: leaders[idx + 4] || null,
        room: `Sala ${idx + 1}`, age_range: range, schedule: 'Domingo 09:00', status: 'ativa',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      out.ebd.push(classId);
      const students = out.people.filter((_, i) => i % 10 === idx % 10).slice(0, rint(6, 14));
      students.forEach((pid) => insert('ebd_students', {
        church_id: churchId, class_id: classId, person_id: pid, status: 'matriculado',
        enrolled_at: addDays(today(), -rint(30, 700)), is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
      for (let w = 0; w < 8; w++) {
        const ld = addDays(today(), -(w * 7) - 2);
        const lessonId = insert('ebd_lessons', {
          church_id: churchId, class_id: classId, lesson_date: ld,
          theme: pick(['A criação', 'O chamado de Abraão', 'Os Salmos', 'A vida de Jesus', 'O Sermão do Monte', 'Frutos do Espírito']),
          content: 'Estudo dirigido com leitura bíblica e aplicação prática.',
          teacher_id: leaders[idx], is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
        students.slice(0, 10).forEach((pid) => insert('ebd_attendance', {
          church_id: churchId, lesson_id: lessonId, person_id: pid,
          status: chance(0.82) ? 'presente' : 'ausente', is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        }));
      }
    });

    /* ------------------------------------------------------------ infantil */
    const kids = all('SELECT id, full_name, birth_date FROM people WHERE church_id = ? AND is_demo = 1 ORDER BY birth_date DESC LIMIT 28', [churchId]);
    kids.forEach((k, idx) => {
      const childId = insert('children', {
        church_id: churchId, person_id: k.id, guardian_id: leaders[idx % leaders.length],
        class_name: pick(['Berçário', 'Primários', 'Juniores']),
        allergies: chance(0.2) ? pick(['Amendoim', 'Lactose', 'Poeira']) : null,
        authorized_pickup: 'Somente responsável cadastrado (documento obrigatório)',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      if (idx < 12) {
        insert('child_checkins', {
          church_id: churchId, child_id: childId, code: `INF-${addDays(today(), -1).replace(/-/g, '')}-${String(idx + 1).padStart(4, '0')}`,
          checkin_at: `${addDays(today(), -1)} 09:${String(rint(10, 55)).padStart(2, '0')}:00`,
          checkout_at: idx % 4 === 0 ? null : `${addDays(today(), -1)} 11:${String(rint(10, 55)).padStart(2, '0')}:00`,
          checked_in_by: 'Recepção Infantil', checked_out_by: idx % 4 === 0 ? null : 'Responsável',
          released_to: idx % 4 === 0 ? null : 'Mãe (autorizada)',
          is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
        });
      }
    });

    /* ------------------------------------------------------------ pastoral */
    const careTypes = ['visita', 'atendimento', 'aconselhamento', 'oracao', 'acompanhamento', 'integracao', 'retorno'];
    for (let i = 0; i < 48; i++) {
      const d = addDays(today(), -rint(0, 120));
      insert('pastoral_care', {
        church_id: churchId, person_id: pick(out.people), responsible_id: pick(leaders),
        care_type: pick(careTypes), care_date: d,
        next_action: pick(['Nova visita em 15 dias', 'Enviar devocional semanal', 'Encaminhar para célula', 'Oração contínua', 'Retorno telefônico']),
        next_action_date: addDays(d, rint(3, 30)),
        status: chance(0.6) ? 'em_andamento' : chance(0.5) ? 'concluido' : 'pendente',
        confidential: 1, notes: 'Registro pastoral confidencial (dados de demonstração).',
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }
    for (let i = 0; i < 22; i++) {
      insert('prayer_requests', {
        church_id: churchId, person_id: pick(out.people), requester_name: null,
        request: pick(['Oração pela saúde da minha mãe.', 'Restauração do meu casamento.', 'Emprego para meu filho.', 'Paz no lar.', 'Direção nos estudos.', 'Cura de enfermidade.']),
        category: pick(['saude', 'familia', 'financeiro', 'espiritual', 'trabalho']),
        is_public: chance(0.5) ? 1 : 0, confidential: 1, status: pick(['aberto', 'em_oracao', 'atendido']),
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
    }

    /* ----------------------------------------------------------- visitantes */
    const visitorPeople = out.people.slice(60, 78);
    visitorPeople.forEach((pid, idx) => {
      const stages = ['primeiro_contato', 'acompanhamento', 'celula', 'nova_visita', 'integracao'];
      insert('visitors', {
        church_id: churchId, person_id: pid,
        first_visit_date: addDays(today(), -rint(1, 90)),
        service: pick(['Culto de Domingo Manhã', 'Culto de Domingo Noite', 'Culto de Ensino']),
        welcome_by: leaders[idx % leaders.length], origin: 'visitante espontâneo', how_knew: pick(HOW),
        cell_id: out.cells[idx % out.cells.length], follow_up_by: leaders[(idx + 5) % leaders.length],
        stage: stages[idx % stages.length], status: pick(['em_acompanhamento', 'integrado', 'aguardando_contato']),
        is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      run('UPDATE people SET status = ? WHERE id = ?', ['visitante', pid]);
    });

    /* ---------------------------------------------------------- funcionarios */
    out.people.slice(30, 35).forEach((pid, idx) => insert('staff', {
      church_id: churchId, person_id: pid,
      role_title: pick(['Secretária Executiva', 'Zelador', 'Auxiliar Administrativo', 'Coordenador de Mídia', 'Tesoureiro']),
      department: pick(['Secretaria', 'Administração', 'Comunicação']),
      hire_date: addDays(today(), -rint(180, 2000)),
      contract_type: pick(['CLT', 'PJ', 'Voluntário remunerado']),
      salary: rint(15, 60) * 100, status: 'ativo',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* -------------------------------------------------------------- cursos */
    const courseDefs = [['Discipulado Básico', 'aberto'], ['Teologia Sistemática', 'aberto'], ['Batismo - Preparação', 'encerrado'], ['Liderança Cristã', 'aberto']];
    courseDefs.forEach(([name, status], idx) => {
      const courseId = insert('courses', {
        church_id: churchId, name, teacher_id: leaders[idx + 3],
        start_date: addDays(today(), -rint(10, 120)), end_date: addDays(today(), rint(10, 80)),
        schedule: pick(['Terças 20:00', 'Sábados 16:00', 'Domingos 09:00']),
        capacity: 40, price: 0, status, is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      });
      out.people.filter((_, i) => i % 17 === idx % 17).slice(0, 12).forEach((pid) => insert('course_enrollments', {
        church_id: churchId, course_id: courseId, person_id: pid,
        enrolled_at: addDays(today(), -rint(10, 100)), status: 'inscrito',
        attendance_percent: rint(50, 100), is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
      }));
    });

    /* ------------------------------------------------------- usuarios/app */
    const userDefs = [
      ['Administrador do Sistema', 'admin@eclesiaone.app', 'super_admin', 'Eclesia@2026'],
      ['Pr. Josué Batista', 'pastor@eclesiaone.app', 'pastor', 'Eclesia@2026'],
      ['Pastor Auxiliar André Lima', 'pastor.auxiliar@eclesiaone.app', 'pastor_auxiliar', 'Eclesia@2026'],
      ['Fernanda Costa (Financeiro)', 'financeiro@eclesiaone.app', 'financeiro', 'Eclesia@2026'],
      ['Marta Ribeiro (Secretaria)', 'secretaria@eclesiaone.app', 'secretaria', 'Eclesia@2026'],
      ['Líder de Célula Betel', 'lider.celula@eclesiaone.app', 'lider_celula', 'Eclesia@2026'],
      ['Líder Ministério de Louvor', 'lider.ministerio@eclesiaone.app', 'lider_ministerio', 'Eclesia@2026'],
      ['Professor EBD Primários', 'professor@eclesiaone.app', 'professor', 'Eclesia@2026'],
      ['Recepção de Visitantes', 'recepcao@eclesiaone.app', 'recepcao', 'Eclesia@2026'],
      ['Membro Demo', 'membro@eclesiaone.app', 'membro', 'Eclesia@2026'],
    ];
    userDefs.forEach(([name, email, role, password], idx) => {
      const uid = insert('users', {
        church_id: churchId, name, email, password_hash: hashPassword(password), role,
        person_id: out.people[idx] || null, active: 1, is_demo: 1,
        created_at: isoNow(), updated_at: isoNow(),
      });
      out.users.push(uid);
      insert('notifications', {
        church_id: churchId, user_id: uid,
        title: idx === 0 ? 'Bem-vindo ao Eclesia One' : 'Escala pendente de confirmação',
        body: idx === 0 ? 'Este ambiente contém dados de DEMONSTRAÇÃO que podem ser removidos nas configurações.' : 'Você possui itens de escala aguardando confirmação.',
        kind: idx === 0 ? 'info' : 'warning', link: idx === 0 ? '/configuracoes' : '/escalas',
        is_demo: 1, created_at: isoNow(),
      });
    });

    /* -------------------------------------------------------- comunicacao */
    const annDefs = [
      ['Culto de Celebração domingo 19h', 'Todos estão convidados para o culto de celebração no Templo Principal.', 'toda_igreja'],
      ['Reunião de líderes de célula', 'Encontro obrigatório de líderes e co-líderes, sábado às 16h no Salão Social.', 'lideres'],
      ['Escala de louvor do mês', 'A escala de louvor do mês já está disponível no módulo Escalas. Confirme sua participação.', 'ministerios'],
      ['Campanha de missões', 'Iniciamos a campanha anual de missões; contribua pelo fundo Missões.', 'toda_igreja'],
    ];
    annDefs.forEach(([title, body, audience], idx) => insert('announcements', {
      church_id: churchId, title, body, audience, channel: 'portal',
      publish_at: addDays(today(), -idx), status: 'publicado', created_by: out.users[0],
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    /* ------------------------------------------------------------ agenda */
    const agendaDefs = [
      ['Culto de Ensino', 'culto', -2], ['Reunião de Obreiros', 'reuniao', -1], ['Culto de Celebração', 'culto', 0],
      ['Reunião Administrativa', 'administrativo', 1], ['Célula Betel', 'celula', 2], ['Ensaio do Louvor', 'ministerio', 3],
      ['Fechamento Financeiro', 'financeiro', 4], ['Visita Pastoral - Família Silva', 'pastoral', 5], ['Culto de Celebração', 'culto', 7],
    ];
    agendaDefs.forEach(([title, category, delta]) => insert('calendar_events', {
      church_id: churchId, title, category, start_at: `${addDays(today(), delta)} ${pick(['09:00', '16:00', '19:30', '20:00'])}`,
      end_at: `${addDays(today(), delta)} 21:00`, location: 'Templo Principal',
      is_demo: 1, created_at: isoNow(), updated_at: isoNow(),
    }));

    return out;
  });
}
