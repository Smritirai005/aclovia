import fs from 'fs';
import path from 'path';
import { StudentState, Subject } from './types';

const DB_PATH = path.join(__dirname, '../../data/db.json');

// Seed data
const SEED_SUBJECTS: Subject[] = [
  {
    id: 'sub-math',
    title: 'Mathematics',
    chapters: [
      {
        id: 'ch-algebra',
        title: 'Algebra',
        tasks: [
          { id: 'task-1', title: 'Linear equations', status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-2', title: 'Quadratic formula', status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-3', title: 'Systems of equations', status: 'not_started', lamport: 0, updatedAt: 0 },
        ]
      },
      {
        id: 'ch-geometry',
        title: 'Geometry',
        tasks: [
          { id: 'task-4', title: 'Area formulas', status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-5', title: 'Pythagorean theorem', status: 'not_started', lamport: 0, updatedAt: 0 },
        ]
      }
    ]
  },
  {
    id: 'sub-science',
    title: 'Science',
    chapters: [
      {
        id: 'ch-physics',
        title: 'Physics',
        tasks: [
          { id: 'task-6', title: 'Newton\'s laws', status: 'not_started', lamport: 0, updatedAt: 0 },
          { id: 'task-7', title: 'Energy conservation', status: 'not_started', lamport: 0, updatedAt: 0 },
        ]
      }
    ]
  }
];

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getStudentState(studentId: string): StudentState {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const seed: StudentState = {
      studentId,
      coins: 0,
      streak: 0,
      subjects: SEED_SUBJECTS,
      sessions: [],
      lamportClock: 0,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify({ [studentId]: seed }, null, 2));
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!db[studentId]) {
    db[studentId] = {
      studentId,
      coins: 0,
      streak: 0,
      subjects: SEED_SUBJECTS,
      sessions: [],
      lamportClock: 0,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }
  return db[studentId];
}

export function saveStudentState(state: StudentState): void {
  ensureDir();
  const db = fs.existsSync(DB_PATH)
    ? JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    : {};
  db[state.studentId] = state;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}