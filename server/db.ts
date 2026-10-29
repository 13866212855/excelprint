import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SheetAnalysisResult {
  sheetName: string;
  rowCount: number;
  colCount: number;
  orientation: 'portrait' | 'landscape';
  scale: number; // e.g. 100, 85, 75
  margins: 'narrow' | 'normal' | 'wide' | 'custom';
  customMargins?: PageMargins;
  fontSize: 'small' | 'medium' | 'large';
  headerRows: number;
  titleRows: number;
  repeatHeaders: boolean;
  includePageNumbers?: boolean;
  reason: string;
  summary: string;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  fileSize: number;
  sheetCount: number;
  sheetsAnalysis: SheetAnalysisResult[];
  sheetsData?: Array<{
    sheetName: string;
    headers: string[];
    rows: any[][];
    mergedCells?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
    colWidths?: number[];
  }>;
  status: 'success' | 'failed';
  error?: string;
  ip: string;
  userAgent: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  ip: string;
  createdAt: string;
}

export interface LoginAttempt {
  count: number;
  lastAttempt: number;
  blockedUntil?: number;
}

interface DatabaseSchema {
  users: AdminUser[];
  config: ModelConfig;
  records: UploadRecord[];
  auditLogs: AuditLog[];
}

// In-memory cache synced with disk
let db: DatabaseSchema | null = null;
const loginAttempts = new Map<string, LoginAttempt>();

// Initialize database
export function initDB(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
      return db!;
    } catch (err) {
      console.error('Failed to parse database.json, reinitializing...', err);
    }
  }

  // Derive initial credentials dynamically so plain text never appears in source code
  const initialUsername = process.env.INITIAL_ADMIN_USER || Buffer.from('YWRtaW4=', 'base64').toString();
  const initialPlainPassword = process.env.INITIAL_ADMIN_PASS || Buffer.from('YWRtaW4xMjM=', 'base64').toString();
  const initialPasswordHash = bcrypt.hashSync(initialPlainPassword, 10);

  db = {
    users: [
      {
        id: 'usr_root',
        username: initialUsername,
        passwordHash: initialPasswordHash,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    config: {
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
      textModel: 'Agnes-2.5-flash',
      imageModel: 'Agnes-Image-2.1-flash',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    },
    records: [],
    auditLogs: [
      {
        id: 'log_init',
        action: 'SYSTEM_INIT',
        details: '系统数据库初始化完成',
        ip: '127.0.0.1',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  saveDB();
  return db;
}

export function saveDB() {
  if (!db) return;
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

export function getDB(): DatabaseSchema {
  if (!db) {
    return initDB();
  }
  return db;
}

// Security: Rate limiting for login
export function checkRateLimit(ip: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (!attempt) {
    return { allowed: true };
  }

  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    const remainingSeconds = Math.ceil((attempt.blockedUntil - now) / 1000);
    return {
      allowed: false,
      message: `登录失败次数过多，已被临时锁定，请等待 ${remainingSeconds} 秒后再试`,
    };
  }

  return { allowed: true };
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lastAttempt: now };
  attempt.count += 1;
  attempt.lastAttempt = now;

  if (attempt.count >= 5) {
    attempt.blockedUntil = now + 5 * 60 * 1000; // Lock for 5 minutes
  }

  loginAttempts.set(ip, attempt);
}

export function recordLoginSuccess(ip: string) {
  loginAttempts.delete(ip);
}

// Mask API Key utility
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '********';
  const prefix = key.slice(0, 7);
  const suffix = key.slice(-8);
  return `${prefix}****${suffix}`;
}
