import fs from 'fs';
import path from 'path';
import { StudentState, Subject } from './types';

const DB_PATH = path.join(__dirname, '../../data/db.json');

const SEED_SUBJECTS: Subject[] = [
  {
    id: 'sub-math',
    title: 'Mathematics',
    chapters: [
      {
        id: 'ch-algebra',
        title: 'Algebra',
        tasks: [
          { id: 'task-1', title: 'Linear equations',      status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-2', title: 'Quadratic formula',     status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-3', title: 'Systems of equations',  status: 'not_started', lamport: 0, updatedAt: 0 },
        ],
      },
      {
        id: 'ch-geometry',
        title: 'Geometry',
        tasks: [
          { id: 'task-4', title: 'Area formulas',          status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-5', title: 'Pythagorean theorem',    status: 'not_started', lamport: 0, updatedAt: 0 },
        ],
      },
    ],
  },
  {
    id: 'sub-science',
    title: 'Science',
    chapters: [
      {
        id: 'ch-physics',
        title: 'Physics',
        tasks: [
          { id: 'task-6', title: "Newton's laws",       status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-7', title: 'Energy conservation', status: 'not_started', lamport: 0, updatedAt: 0 },
        ],
      },
    ],
  },
];

interface DB {
  students: Record<string, StudentState>;
  firedWebhooks: Record<string, { sessionId: string; firedAt: string; streak: number; coins: number }>;
}

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDB(): DB {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const empty: DB = { students: {}, firedWebhooks: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    // migrate old format (flat studentId keys) to new format
    if (!raw.students) {
      const migrated: DB = { students: {}, firedWebhooks: {} };
      for (const [k, v] of Object.entries(raw)) {
        if (k !== 'firedWebhooks') migrated.students[k] = v as StudentState;
      }
      return migrated;
    }
    return raw as DB;
  } catch {
    return { students: {}, firedWebhooks: {} };
  }
}

function writeDB(db: DB) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function getStudentState(studentId: string): StudentState {
  const db = readDB();
  if (!db.students[studentId]) {
    db.students[studentId] = {
      studentId,
      coins: 0,
      streak: 0,
      subjects: SEED_SUBJECTS,
      sessions: [],
      lamportClock: 0,
    };
    writeDB(db);
  }
  return db.students[studentId];
}

export function saveStudentState(state: StudentState): void {
  const db = readDB();
  db.students[state.studentId] = state;
  writeDB(db);
}

// ── Webhook dedup table ──────────────────────────────────────────────────────
// Persisted to disk so even a server restart won't fire a duplicate webhook.
// This is what makes n8n idempotency bulletproof end-to-end.

export function hasWebhookFired(sessionId: string): boolean {
  const db = readDB();
  return !!db.firedWebhooks[sessionId];
}

export function markWebhookFired(
  sessionId: string,
  streak: number,
  coins: number,
): void {
  const db = readDB();
  db.firedWebhooks[sessionId] = {
    sessionId,
    firedAt: new Date().toISOString(),
    streak,
    coins,
  };
  writeDB(db);
}

export function getAllFiredWebhooks() {
  const db = readDB();
  return db.firedWebhooks;
}

export function resetAll(): void {
  writeDB({ students: {}, firedWebhooks: {} });
}