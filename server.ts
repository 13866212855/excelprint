import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import multer from 'multer';
import * as XLSX from 'xlsx';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  initDB,
  getDB,
  saveDB,
  checkRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  maskApiKey,
  UploadRecord,
  SheetAnalysisResult,
} from './server/db.js';
import { analyzeSheetWithAI, heuristicAnalyzeSheet, testLLMConnection, SheetStructureSummary } from './server/aiService.js';
import { generateMultiSheetPDF } from './server/pdfService.js';
import { createSampleWorkbookBuffer } from './server/sampleData.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'excel_smart_print_jwt_secret_token_secure_key';

// Initialize embedded database
initDB();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer setup for Excel upload (max 30MB, all Excel extensions)
const upload = multer({
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExts = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.xltx', '.xltm'];
    if (validExts.includes(ext) || file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel')) {
      cb(null, true);
    } else {
      cb(new Error('文件格式不支持，仅支持 .xlsx、.xls、.xlsm 格式的 Excel 表格'));
    }
  },
});

// Safe multer middleware that guarantees JSON error response (never HTML!)
const safeUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      console.warn('Multer upload error:', err.message);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: '文件大小超过 30MB 限制，请精简数据或拆分文件后上传' });
        }
        return res.status(400).json({ error: `上传校验失败 (${err.code}): ${err.message}` });
      }
      return res.status(400).json({ error: err.message || '文件上传失败，请检查文件格式' });
    }
    next();
  });
};

// Helper: Extract client IP
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Authentication Middleware for /api/admin routes
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录或登录凭据已过期，请先登录后台' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    const db = getDB();
    const user = db.users.find((u) => u.id === decoded.id);
    if (!user) {
      res.status(401).json({ error: '用户不存在' });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: '登录会话已失效，请重新登录' });
  }
}

// ==========================================
// 1. PUBLIC API ROUTES
// ==========================================

// Sample Excel File download
app.get('/api/sample-excel', (req, res) => {
  try {
    const buffer = createSampleWorkbookBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="demo_smart_print_sheets.xlsx"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: '生成示例文件失败: ' + err.message });
  }
});

// Helper to sanitize and structure sheet data safely
function parseSheetStructure(name: string, sheet: XLSX.WorkSheet) {
  // Extract raw 2D array
  let rawRows: any[][] = [];
  try {
    rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  } catch (e) {
    rawRows = [];
  }

  // Filter out trailing empty rows
  while (rawRows.length > 0) {
    const lastRow = rawRows[rawRows.length - 1];
    const hasData = lastRow && lastRow.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== '');
    if (hasData) break;
    rawRows.pop();
  }

  // Fallback for completely empty sheet
  if (rawRows.length === 0) {
    return {
      sheetName: name,
      headers: ['A', 'B', 'C'],
      rows: [['(该工作表暂无数据内容)', '', '']],
      rowCount: 1,
      colCount: 3,
      mergedCells: [],
      hasTitleBanner: false,
      maxColLengths: [10, 6, 6],
    };
  }

  // Detect merged cells
  const merges = sheet['!merges'] || [];
  const hasTitleBanner = merges.some(
    (m: any) => m.s.r === 0 && m.e.r === 0 && m.e.c - m.s.c >= 2
  );

  // Find max columns across all rows
  let maxCols = 0;
  for (const r of rawRows) {
    if (Array.isArray(r) && r.length > maxCols) {
      maxCols = r.length;
    }
  }
  maxCols = Math.max(maxCols, 1);

  // Intelligently determine header row candidate
  let headerRowIndex = 0;
  if (hasTitleBanner && rawRows.length > 1) {
    // If row 0 is a title banner, check rows 1..5 for the best table header
    let bestHeaderIdx = 1;
    let maxFilledCols = 0;
    for (let r = 1; r < Math.min(rawRows.length, 6); r++) {
      const row = rawRows[r] || [];
      const filledCount = row.filter((c: any) => c !== undefined && c !== null && String(c).trim() !== '').length;
      if (filledCount > maxFilledCols) {
        maxFilledCols = filledCount;
        bestHeaderIdx = r;
      }
    }
    // If the best header candidate has reasonable filled columns, use it
    if (maxFilledCols >= 2) {
      headerRowIndex = bestHeaderIdx;
    } else {
      headerRowIndex = 0; // retain as form
    }
  }

  // Extract or generate headers
  let headers: string[] = [];
  const candidateHeaderRow = rawRows[headerRowIndex] || [];
  const isGenericForm = headerRowIndex === 0 && hasTitleBanner;

  if (isGenericForm) {
    // Form style sheet: generate column labels A, B, C... so row 1 title and form fields are all displayed
    headers = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''));
  } else {
    headers = Array.from({ length: maxCols }, (_, i) => {
      const val = candidateHeaderRow[i];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
      return `列 ${i + 1}`;
    });
  }

  const dataRows = isGenericForm ? rawRows : rawRows.slice(headerRowIndex + 1);
  const rowCount = dataRows.length;
  const colCount = Math.max(headers.length, maxCols);

  // Calculate max column length
  const maxColLengths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = (headers[c] || '').length;
    for (let r = 0; r < Math.min(dataRows.length, 40); r++) {
      const val = dataRows[r]?.[c];
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }
    maxColLengths.push(maxLen);
  }

  return {
    sheetName: name,
    headers,
    rows: dataRows,
    rowCount,
    colCount,
    mergedCells: merges,
    hasTitleBanner,
    maxColLengths,
  };
}

// Upload and Parse Excel File
app.post('/api/upload-excel', safeUploadMiddleware, async (req: Request, res: Response) => {
  const clientIp = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!req.file) {
    res.status(400).json({ error: '请选择要上传的 Excel 文件' });
    return;
  }

  try {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    } catch (readErr: any) {
      console.warn('XLSX binary read failed, retrying with raw base64:', readErr.message);
      workbook = XLSX.read(req.file.buffer.toString('base64'), { type: 'base64', cellDates: true });
    }

    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      res.status(400).json({ error: 'Excel 文件中未检测到有效的工作表' });
      return;
    }

    // 1. First Pass: Parse all sheets structure safely & compute instant heuristic analysis
    const parsedSheets = sheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return parseSheetStructure(name, sheet);
    });

    // 2. High-speed AI Layout Analysis (Parallel with strict timeout, never blocks or exceeds gateway limits)
    // For small workbooks (≤ 5 sheets), run AI in parallel.
    // For large multi-sheet workbooks (e.g. 20-50 sheets like government statistical yearbooks),
    // run AI on the first 5 representative sheets, and use instant heuristic rules for the rest.
    const sheetsPayload: Array<{
      sheetName: string;
      headers: string[];
      rows: any[][];
      rowCount: number;
      colCount: number;
      analysis: SheetAnalysisResult;
      mergedCells: any[];
    }> = [];

    const aiBatchLimit = Math.min(parsedSheets.length, 5);
    const aiPromises = parsedSheets.slice(0, aiBatchLimit).map((s) => {
      const summary: SheetStructureSummary = {
        sheetName: s.sheetName,
        rowCount: s.rowCount,
        colCount: s.colCount,
        headers: s.headers,
        sampleRows: s.rows.slice(0, 5),
        maxColLengths: s.maxColLengths,
        mergedCellCount: s.mergedCells.length,
        hasTitleBanner: s.hasTitleBanner,
      };
      return analyzeSheetWithAI(summary);
    });

    const aiResults = await Promise.allSettled(aiPromises);

    parsedSheets.forEach((s, idx) => {
      let analysis: SheetAnalysisResult;
      if (idx < aiBatchLimit && aiResults[idx].status === 'fulfilled') {
        analysis = (aiResults[idx] as PromiseFulfilledResult<SheetAnalysisResult>).value;
      } else {
        // High-precision heuristic fallback
        analysis = heuristicAnalyzeSheet({
          sheetName: s.sheetName,
          rowCount: s.rowCount,
          colCount: s.colCount,
          headers: s.headers,
          sampleRows: s.rows.slice(0, 5),
          maxColLengths: s.maxColLengths,
          mergedCellCount: s.mergedCells.length,
          hasTitleBanner: s.hasTitleBanner,
        });
      }

      sheetsPayload.push({
        sheetName: s.sheetName,
        headers: s.headers,
        rows: s.rows,
        rowCount: s.rowCount,
        colCount: s.colCount,
        analysis,
        mergedCells: s.mergedCells,
      });
    });

    if (sheetsPayload.length === 0) {
      res.status(400).json({ error: '未能从工作表中解析出有效数据，请检查文件内容' });
      return;
    }

    // Persist to audit records
    const recordId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const db = getDB();
    const newRecord: UploadRecord = {
      id: recordId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      sheetCount: sheetsPayload.length,
      sheetsAnalysis: sheetsPayload.map((s) => s.analysis),
      sheetsData: sheetsPayload.map((s) => ({
        sheetName: s.sheetName,
        headers: s.headers,
        rows: s.rows.slice(0, 500), // retain sample rows for history preview
      })),
      status: 'success',
      ip: clientIp,
      userAgent,
      createdAt: new Date().toISOString(),
    };

    db.records.unshift(newRecord);
    // Keep max 500 history records
    if (db.records.length > 500) {
      db.records = db.records.slice(0, 500);
    }
    saveDB();

    res.json({
      recordId,
      fileName: req.file.originalname,
      sheetCount: sheetsPayload.length,
      sheets: sheetsPayload,
    });
  } catch (err: any) {
    console.error('Upload & analysis error:', err);
    // Record failed upload
    try {
      const db = getDB();
      db.records.unshift({
        id: 'rec_err_' + Date.now(),
        fileName: req.file?.originalname || 'unknown',
        fileSize: req.file?.size || 0,
        sheetCount: 0,
        sheetsAnalysis: [],
        status: 'failed',
        error: err.message || '文件解析异常',
        ip: clientIp,
        userAgent,
        createdAt: new Date().toISOString(),
      });
      saveDB();
    } catch (_) {}

    res.status(500).json({ error: '解析或分析 Excel 文件失败: ' + err.message });
  }
});

// Export Merged PDF with Unicode Chinese font (NotoSansCJK)
app.post('/api/export-pdf', (req: Request, res: Response) => {
  try {
    const { sheets, docTitle, includePageNumbers } = req.body;
    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      res.status(400).json({ error: '缺少要导出的工作表排版数据' });
      return;
    }

    const showPageNumbers = includePageNumbers !== false;
    console.log(
      `[Export PDF] Generating PDF with ${sheets.length} sheets, title: ${docTitle || 'Excel智能排版输出'}, includePageNumbers: ${showPageNumbers}`
    );
    const pdfBuffer = generateMultiSheetPDF(sheets, docTitle || 'Excel智能排版输出', showPageNumbers);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(docTitle || 'print_layout')}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: '生成 PDF 文件失败: ' + err.message });
  }
});

// ==========================================
// 2. ADMIN AUTHENTICATION & SECURITY
// ==========================================

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const clientIp = getClientIP(req);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    res.status(429).json({ error: rateLimit.message });
    return;
  }

  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: '请输入管理员账号和密码' });
    return;
  }

  const db = getDB();
  const user = db.users.find((u) => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    recordLoginFailure(clientIp);
    res.status(401).json({ error: '账号或密码不正确' });
    return;
  }

  recordLoginSuccess(clientIp);

  // Generate JWT token (expires in 12 hours)
  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  // Log audit
  db.auditLogs.unshift({
    id: 'log_' + Date.now(),
    action: 'ADMIN_LOGIN',
    details: `管理员 ${user.username} 登录成功`,
    ip: clientIp,
    createdAt: new Date().toISOString(),
  });
  saveDB();

  res.json({
    token,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
  });
});

// Get current admin user info
app.get('/api/admin/me', requireAdminAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
  });
});

// Change admin password
app.post('/api/admin/change-password', requireAdminAuth, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: '新密码长度至少需要 6 个字符' });
    return;
  }

  const user = (req as any).user;
  const db = getDB();
  const dbUser = db.users.find((u) => u.id === user.id);

  if (!dbUser) {
    res.status(404).json({ error: '用户未找到' });
    return;
  }

  if (currentPassword && !bcrypt.compareSync(currentPassword, dbUser.passwordHash)) {
    res.status(400).json({ error: '当前密码验证失败' });
    return;
  }

  dbUser.passwordHash = bcrypt.hashSync(newPassword, 10);
  dbUser.mustChangePassword = false;
  dbUser.updatedAt = new Date().toISOString();

  db.auditLogs.unshift({
    id: 'log_' + Date.now(),
    action: 'CHANGE_PASSWORD',
    details: `管理员 ${dbUser.username} 修改了登录密码`,
    ip: getClientIP(req),
    createdAt: new Date().toISOString(),
  });

  saveDB();
  res.json({ success: true, message: '密码修改成功' });
});

// ==========================================
// 3. ADMIN MODEL CONFIG & TESTING
// ==========================================

// Get model configuration (apiKey is masked)
app.get('/api/admin/config', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  const cfg = db.config;
  res.json({
    baseUrl: cfg.baseUrl,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    textModel: cfg.textModel,
    imageModel: cfg.imageModel,
    updatedAt: cfg.updatedAt,
    updatedBy: cfg.updatedBy,
  });
});

// Update model configuration
app.put('/api/admin/config', requireAdminAuth, (req: Request, res: Response) => {
  const { baseUrl, apiKey, textModel, imageModel } = req.body;
  const db = getDB();
  const user = (req as any).user;

  if (!baseUrl || !textModel) {
    res.status(400).json({ error: 'baseUrl 和 文本模型名称 为必填项' });
    return;
  }

  const oldConfig = { ...db.config };

  db.config.baseUrl = baseUrl.trim();
  db.config.textModel = textModel.trim();
  if (imageModel) {
    db.config.imageModel = imageModel.trim();
  }

  // Only update apiKey if user provided a new real key (not the masked placeholder)
  if (apiKey && !apiKey.includes('****') && apiKey.trim() !== '') {
    db.config.apiKey = apiKey.trim();
  }

  db.config.updatedAt = new Date().toISOString();
  db.config.updatedBy = user.username;

  db.auditLogs.unshift({
    id: 'log_' + Date.now(),
    action: 'UPDATE_CONFIG',
    details: `更新大模型配置: Model=${db.config.textModel}, BaseUrl=${db.config.baseUrl}`,
    ip: getClientIP(req),
    createdAt: new Date().toISOString(),
  });

  saveDB();

  res.json({
    success: true,
    message: '模型配置保存成功',
    config: {
      baseUrl: db.config.baseUrl,
      apiKeyMasked: maskApiKey(db.config.apiKey),
      textModel: db.config.textModel,
      imageModel: db.config.imageModel,
      updatedAt: db.config.updatedAt,
    },
  });
});

// Test LLM Connection
app.post('/api/admin/test-llm', requireAdminAuth, async (req: Request, res: Response) => {
  const { baseUrl, apiKey, textModel } = req.body;
  const db = getDB();

  // If apiKey contains asterisks or not provided, use current stored apiKey
  const effectiveApiKey =
    apiKey && !apiKey.includes('****') && apiKey.trim() !== ''
      ? apiKey.trim()
      : db.config.apiKey;

  const testConfig = {
    baseUrl: baseUrl ? baseUrl.trim() : db.config.baseUrl,
    apiKey: effectiveApiKey,
    textModel: textModel ? textModel.trim() : db.config.textModel,
  };

  const result = await testLLMConnection(testConfig);
  res.json(result);
});

// ==========================================
// 4. ADMIN RECORDS MANAGEMENT
// ==========================================

// Get upload records with filtering & pagination
app.get('/api/admin/records', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const status = req.query.status as string;
  const keyword = (req.query.keyword as string || '').toLowerCase().trim();

  let filtered = [...db.records];

  if (status && status !== 'all') {
    filtered = filtered.filter((r) => r.status === status);
  }

  if (keyword) {
    filtered = filtered.filter(
      (r) =>
        r.fileName.toLowerCase().includes(keyword) ||
        r.ip.includes(keyword) ||
        r.id.toLowerCase().includes(keyword)
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pagedRecords = filtered.slice(start, start + pageSize).map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    sheetCount: r.sheetCount,
    sheetsAnalysis: r.sheetsAnalysis,
    status: r.status,
    error: r.error,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    hasPreviewData: !!(r.sheetsData && r.sheetsData.length > 0),
  }));

  res.json({
    total,
    page,
    pageSize,
    totalPages,
    records: pagedRecords,
  });
});

// Get single record detail (including sheet preview data)
app.get('/api/admin/records/:id', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  const record = db.records.find((r) => r.id === req.params.id);
  if (!record) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  res.json(record);
});

// Delete single record
app.delete('/api/admin/records/:id', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  const index = db.records.findIndex((r) => r.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }

  const deleted = db.records.splice(index, 1)[0];
  db.auditLogs.unshift({
    id: 'log_' + Date.now(),
    action: 'DELETE_RECORD',
    details: `删除记录: ${deleted.fileName} (${deleted.id})`,
    ip: getClientIP(req),
    createdAt: new Date().toISOString(),
  });
  saveDB();

  res.json({ success: true, message: '记录已删除' });
});

// Batch delete records
app.post('/api/admin/records/batch-delete', requireAdminAuth, (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请选择要删除的记录' });
    return;
  }

  const db = getDB();
  const initialCount = db.records.length;
  db.records = db.records.filter((r) => !ids.includes(r.id));
  const removedCount = initialCount - db.records.length;

  db.auditLogs.unshift({
    id: 'log_' + Date.now(),
    action: 'BATCH_DELETE_RECORDS',
    details: `批量删除 ${removedCount} 条历史上传记录`,
    ip: getClientIP(req),
    createdAt: new Date().toISOString(),
  });
  saveDB();

  res.json({ success: true, removedCount });
});

// Export records to CSV
app.get('/api/admin/records-export', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  const rows = [
    ['记录ID', '文件名', '文件大小(KB)', '工作表数', '排版状态', '上传时间', '客户端IP'],
    ...db.records.map((r) => [
      r.id,
      r.fileName,
      (r.fileSize / 1024).toFixed(1),
      r.sheetCount,
      r.status === 'success' ? '成功' : '失败',
      r.createdAt,
      r.ip,
    ]),
  ];

  const csvContent = '\uFEFF' + rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="smart_print_records.csv"');
  res.send(csvContent);
});

// Get audit logs
app.get('/api/admin/audit-logs', requireAdminAuth, (req: Request, res: Response) => {
  const db = getDB();
  res.json({ logs: db.auditLogs.slice(0, 100) });
});

// Global Error Handler for API routes to ensure JSON response is ALWAYS returned
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || '服务器处理发生内部异常，请稍后重试',
  });
});

// ==========================================
// 5. VITE INTEGRATION & STATIC ASSETS
// ==========================================
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Excel Smart Print Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
