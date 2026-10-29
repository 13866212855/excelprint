import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SheetAnalysisResult } from './db.js';

export interface PDFExportSheet {
  sheetName: string;
  headers: string[];
  rows: any[][];
  config: SheetAnalysisResult;
}

let cachedFontBase64: string | null = null;

/**
 * Load Unicode Chinese Font (NotoSansCJK / Chinese TrueType font)
 * Resolves font binary, converts to Base64, and caches in memory
 */
function getUnicodeChineseFontBase64(): string | null {
  if (cachedFontBase64) return cachedFontBase64;
  const fontCandidates = [
    path.resolve(process.cwd(), 'server/fonts/NotoSansCJK.ttf'),
    path.resolve(process.cwd(), 'server/fonts/ChineseFont.ttf'),
    '/usr/share/fonts/truetype/arphic-gbsn00lp/gbsn00lp.ttf',
  ];

  for (const fp of fontCandidates) {
    if (fs.existsSync(fp)) {
      try {
        const buffer = fs.readFileSync(fp);
        cachedFontBase64 = buffer.toString('base64');
        console.log(`[PDF Engine] Successfully loaded Unicode font file from: ${fp} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
        return cachedFontBase64;
      } catch (err) {
        console.warn(`[PDF Engine] Failed to load font from ${fp}:`, err);
      }
    }
  }

  console.warn('[PDF Engine] Warning: No Unicode font file found, falling back to standard Helvetica (non-Latin characters may not render correctly).');
  return null;
}

/**
 * Generate Multi-sheet PDF with Unicode Font Registration (NotoSansCJK)
 * Ensures zero garbled Chinese characters across sheet titles, tables, and footers
 */
export function generateMultiSheetPDF(
  sheets: PDFExportSheet[],
  docTitle: string = 'Excel打印输出',
  includePageNumbers: boolean = true
): Buffer {
  const firstSheet = sheets[0];
  const initialOrientation = firstSheet?.config.orientation || 'portrait';

  // Initialize jsPDF instance
  const doc = new jsPDF({
    orientation: initialOrientation,
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
    compress: true,
  });

  // Inject and register Unicode font (NotoSansCJK)
  const fontBase64 = getUnicodeChineseFontBase64();
  const fontName = fontBase64 ? 'NotoSansCJK' : 'helvetica';

  if (fontBase64) {
    // 1. Mount Unicode font binary into jsPDF Virtual File System (VFS)
    doc.addFileToVFS('NotoSansCJK.ttf', fontBase64);
    // 2. Register font family 'NotoSansCJK' with normal and bold styles
    doc.addFont('NotoSansCJK.ttf', 'NotoSansCJK', 'normal');
    doc.addFont('NotoSansCJK.ttf', 'NotoSansCJK', 'bold');
    // 3. Set default font to NotoSansCJK
    doc.setFont('NotoSansCJK', 'normal');
  }

  // Metadata per page for accurate page number and footer placement
  interface PageFooterInfo {
    sheetName: string;
    marginBottom: number;
    showPageNumber: boolean;
  }
  const pageFooterMap = new Map<number, PageFooterInfo>();

  sheets.forEach((sheet, sheetIndex) => {
    const orientation = sheet.config.orientation || 'portrait';
    
    // For subsequent sheets, add a new page with the sheet's specific orientation
    if (sheetIndex > 0) {
      doc.addPage('a4', orientation);
    }

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;

    // Determine margins based on customMargins or preset
    let marginTop = 15;
    let marginBottom = 15;
    let marginLeft = 15;
    let marginRight = 15;

    if (sheet.config.customMargins) {
      marginTop = Math.max(2, Number(sheet.config.customMargins.top) || 15);
      marginBottom = Math.max(2, Number(sheet.config.customMargins.bottom) || 15);
      marginLeft = Math.max(2, Number(sheet.config.customMargins.left) || 15);
      marginRight = Math.max(2, Number(sheet.config.customMargins.right) || 15);
    } else {
      let defaultM = 15;
      if (sheet.config.margins === 'narrow') defaultM = 10;
      if (sheet.config.margins === 'wide') defaultM = 20;
      marginTop = defaultM;
      marginBottom = defaultM;
      marginLeft = defaultM;
      marginRight = defaultM;
    }

    // Determine font size
    let baseFontSize = 9;
    if (sheet.config.fontSize === 'small') baseFontSize = 7.5;
    if (sheet.config.fontSize === 'large') baseFontSize = 10.5;

    // Apply scale factor
    const scaleFactor = (sheet.config.scale || 100) / 100;
    const tableFontSize = Math.max(6, baseFontSize * scaleFactor);
    const cellPadding = Math.max(1.5, 2.5 * scaleFactor);

    // Title / Sheet Header
    doc.setFont(fontName, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(sheet.sheetName, marginLeft, marginTop + 2);

    // Subtitle / Layout details
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    const metaStr = `排版: ${orientation === 'landscape' ? 'A4 横向' : 'A4 纵向'} | 缩放: ${sheet.config.scale}% | 列数: ${sheet.headers.length} | 行数: ${sheet.rows.length} | 页边距: 上${marginTop} 下${marginBottom} 左${marginLeft} 右${marginRight}mm`;
    doc.text(metaStr, marginLeft, marginTop + 7);

    // Filter and prepare table rows
    const tableHeaders = sheet.headers.map((h, i) => (h && h.trim() !== '' ? String(h) : `列 ${i + 1}`));
    const tableData = sheet.rows.map((row) =>
      tableHeaders.map((_, colIdx) => {
        const val = row[colIdx];
        if (val === undefined || val === null) return '';
        return String(val);
      })
    );

    const sheetIncludePageNumber =
      includePageNumbers && (sheet.config.includePageNumbers !== false);

    // Record the starting page for this sheet
    const startPage = doc.getNumberOfPages();
    pageFooterMap.set(startPage, {
      sheetName: sheet.sheetName,
      marginBottom,
      showPageNumber: sheetIncludePageNumber,
    });

    // Call autoTable with NotoSansCJK Unicode font configuration and custom margins
    autoTable(doc, {
      startY: marginTop + 11,
      head: [tableHeaders],
      body: tableData,
      theme: 'grid',
      showHead: sheet.config.repeatHeaders ? 'everyPage' : 'firstPage',
      margin: {
        top: marginTop + 10,
        bottom: marginBottom + 6,
        left: marginLeft,
        right: marginRight,
      },
      styles: {
        font: fontName,
        fontStyle: 'normal',
        fontSize: tableFontSize,
        cellPadding: cellPadding,
        overflow: 'linebreak',
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        font: fontName,
        fontStyle: 'bold',
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      didDrawPage: () => {
        const pageNum = doc.getNumberOfPages();
        pageFooterMap.set(pageNum, {
          sheetName: sheet.sheetName,
          marginBottom,
          showPageNumber: sheetIncludePageNumber,
        });
      },
    });
  });

  // Automatic formatted page number generation on every page bottom
  const totalPages = doc.getNumberOfPages();
  if (includePageNumbers) {
    for (let p = 1; p <= totalPages; p++) {
      const pageInfo = pageFooterMap.get(p);
      if (pageInfo && pageInfo.showPageNumber === false) {
        continue;
      }

      doc.setPage(p);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const mb = pageInfo?.marginBottom || 15;
      const sheetName = pageInfo?.sheetName || '';

      doc.setFont(fontName, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400

      // Format: "工作表名 · 第 X 页 / 共 Y 页"
      const footerText = sheetName
        ? `${sheetName} · 第 ${p} 页 / 共 ${totalPages} 页`
        : `第 ${p} 页 / 共 ${totalPages} 页`;

      // Position in the bottom margin area cleanly
      const yPos = pageHeight - Math.max(5, mb * 0.45);
      doc.text(footerText, pageWidth / 2, yPos, { align: 'center' });
    }
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
