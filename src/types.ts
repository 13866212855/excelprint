export type SheetOrientation = 'portrait' | 'landscape';
export type MarginType = 'narrow' | 'normal' | 'wide' | 'custom';
export type FontSizeType = 'small' | 'medium' | 'large';

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
  orientation: SheetOrientation;
  scale: number; // 50 - 130
  margins: MarginType;
  customMargins?: PageMargins;
  fontSize: FontSizeType;
  headerRows: number;
  titleRows: number;
  repeatHeaders: boolean;
  includePageNumbers?: boolean;
  reason: string;
  summary: string;
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: any[][];
  rowCount: number;
  colCount: number;
  analysis: SheetAnalysisResult;
  mergedCells?: any[];
  userConfig: SheetAnalysisResult; // user manual adjustments
}

export interface UploadResponse {
  recordId: string;
  fileName: string;
  sheetCount: number;
  sheets: Array<{
    sheetName: string;
    headers: string[];
    rows: any[][];
    rowCount: number;
    colCount: number;
    analysis: SheetAnalysisResult;
    mergedCells?: any[];
  }>;
}

export interface AdminConfig {
  baseUrl: string;
  apiKeyMasked: string;
  textModel: string;
  imageModel: string;
  updatedAt: string;
  updatedBy: string;
}

export interface HistoryRecord {
  id: string;
  fileName: string;
  fileSize: number;
  sheetCount: number;
  sheetsAnalysis: SheetAnalysisResult[];
  status: 'success' | 'failed';
  error?: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  hasPreviewData?: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  ip: string;
  createdAt: string;
}
