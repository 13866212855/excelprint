import * as XLSX from 'xlsx';
import { ParsedSheet, SheetAnalysisResult } from '../types.js';

export function heuristicAnalyzeSheetClient(
  sheetName: string,
  rowCount: number,
  colCount: number,
  maxColLengths: number[],
  hasTitleBanner: boolean
): SheetAnalysisResult {
  const totalEstimatedWidth = maxColLengths.reduce((acc, len) => acc + Math.max(len, 6), 0);
  const isLandscape = colCount > 7 || totalEstimatedWidth > 85;

  let scale = 100;
  if (colCount >= 14 || totalEstimatedWidth > 150) {
    scale = 65;
  } else if (colCount >= 10 || totalEstimatedWidth > 115) {
    scale = 75;
  } else if (colCount >= 7 || totalEstimatedWidth > 90) {
    scale = 85;
  }

  const titleRows = hasTitleBanner ? 1 : 0;
  const headerRows = 1;
  const repeatHeaders = rowCount > 25;

  let reason = '';
  if (isLandscape) {
    reason = `检测到该工作表包含 ${colCount} 列（预估总宽度约 ${totalEstimatedWidth} 字符），列数较多且信息密集，自动匹配 A4 横向排版，以确保所有数据列完整展示无截断。`;
  } else {
    reason = `该工作表包含 ${colCount} 列，列数适中且纵向行数丰富（共 ${rowCount} 行），采用 A4 纵向排版视觉效果最佳，可容纳更多行内容。`;
  }

  return {
    sheetName,
    rowCount,
    colCount,
    orientation: isLandscape ? 'landscape' : 'portrait',
    scale,
    margins: isLandscape ? 'narrow' : 'normal',
    fontSize: scale < 80 ? 'small' : 'medium',
    headerRows,
    titleRows,
    repeatHeaders,
    reason,
    summary: `${isLandscape ? 'A4横向' : 'A4纵向'} · 缩放 ${scale}% · ${repeatHeaders ? '跨页保留表头' : '单页紧凑'}`,
  };
}

export async function parseExcelClientSide(file: File): Promise<ParsedSheet[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  if (sheetNames.length === 0) {
    throw new Error('未在 Excel 文件中发现有效工作表');
  }

  const result: ParsedSheet[] = [];

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    let rawRows: any[][] = [];
    try {
      rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    } catch (_) {
      rawRows = [];
    }

    // Trim trailing empty rows
    while (rawRows.length > 0) {
      const lastRow = rawRows[rawRows.length - 1];
      const hasData = lastRow && lastRow.some((c: any) => c !== undefined && c !== null && String(c).trim() !== '');
      if (hasData) break;
      rawRows.pop();
    }

    if (rawRows.length === 0) {
      const emptyAnalysis = heuristicAnalyzeSheetClient(name, 1, 3, [10, 6, 6], false);
      result.push({
        sheetName: name,
        headers: ['A', 'B', 'C'],
        rows: [['(该工作表暂无数据内容)', '', '']],
        rowCount: 1,
        colCount: 3,
        mergedCells: [],
        analysis: emptyAnalysis,
        userConfig: { ...emptyAnalysis },
      });
      continue;
    }

    const merges = sheet['!merges'] || [];
    const hasTitleBanner = merges.some(
      (m: any) => m.s.r === 0 && m.e.r === 0 && m.e.c - m.s.c >= 2
    );

    let maxCols = 0;
    for (const r of rawRows) {
      if (Array.isArray(r) && r.length > maxCols) maxCols = r.length;
    }
    maxCols = Math.max(maxCols, 1);

    let headerRowIndex = 0;
    if (hasTitleBanner && rawRows.length > 1) {
      let bestHeaderIdx = 1;
      let maxFilledCols = 0;
      for (let r = 1; r < Math.min(rawRows.length, 6); r++) {
        const row = rawRows[r] || [];
        const filled = row.filter((c: any) => c !== undefined && c !== null && String(c).trim() !== '').length;
        if (filled > maxFilledCols) {
          maxFilledCols = filled;
          bestHeaderIdx = r;
        }
      }
      if (maxFilledCols >= 2) {
        headerRowIndex = bestHeaderIdx;
      }
    }

    let headers: string[] = [];
    const candidateRow = rawRows[headerRowIndex] || [];
    const isGenericForm = headerRowIndex === 0 && hasTitleBanner;

    if (isGenericForm) {
      headers = Array.from({ length: maxCols }, (_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''));
    } else {
      headers = Array.from({ length: maxCols }, (_, i) => {
        const val = candidateRow[i];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
        return `列 ${i + 1}`;
      });
    }

    const dataRows = isGenericForm ? rawRows : rawRows.slice(headerRowIndex + 1);
    const rowCount = dataRows.length;
    const colCount = Math.max(headers.length, maxCols);

    const maxColLengths: number[] = [];
    for (let c = 0; c < colCount; c++) {
      let maxLen = (headers[c] || '').length;
      for (let r = 0; r < Math.min(dataRows.length, 40); r++) {
        const cell = dataRows[r]?.[c];
        if (cell !== undefined && cell !== null) {
          maxLen = Math.max(maxLen, String(cell).length);
        }
      }
      maxColLengths.push(maxLen);
    }

    const analysis = heuristicAnalyzeSheetClient(name, rowCount, colCount, maxColLengths, hasTitleBanner);

    result.push({
      sheetName: name,
      headers,
      rows: dataRows,
      rowCount,
      colCount,
      mergedCells: merges,
      analysis,
      userConfig: { ...analysis },
    });
  }

  return result;
}
