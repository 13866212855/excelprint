import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { UploadDropzone } from './components/UploadDropzone.js';
import { AnalysisLoading } from './components/AnalysisLoading.js';
import { SheetWorkspace } from './components/SheetWorkspace.js';
import { AdminView } from './components/admin/AdminView.js';
import { ParsedSheet, UploadResponse } from './types.js';
import { parseExcelClientSide } from './utils/excelParser.js';

export default function App() {
  // Check if current route is /admin
  const [isAdminPath, setIsAdminPath] = useState(() => {
    return (
      window.location.pathname.startsWith('/admin') ||
      window.location.hash.startsWith('#/admin')
    );
  });

  // State for user application
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Listen to popstate or hashchange
  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminPath(
        window.location.pathname.startsWith('/admin') ||
        window.location.hash.startsWith('#/admin')
      );
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Safe response parser helper
  const safeParseResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    const rawText = await res.text();
    // Strip HTML tags for clean error message
    const cleanMsg = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(
      res.status === 504 || res.status === 502
        ? '服务端处理超时（工作表数据量庞大），已为您启用极速本地引擎'
        : cleanMsg.slice(0, 150) || `服务器异常 (HTTP ${res.status})`
    );
  };

  // Handle uploading and parsing an Excel file
  const handleFileUpload = async (file: File) => {
    setErrorMessage(null);
    setCurrentFile(file);
    setFileName(file.name);
    setIsAnalyzing(true);

    // Try server upload first
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
      });

      const data = await safeParseResponse(res);
      if (!res.ok) {
        throw new Error(data.error || '文件解析或分析失败');
      }

      const parsedSheets: ParsedSheet[] = data.sheets.map((s: any) => ({
        ...s,
        userConfig: { ...s.analysis },
      }));

      setSheets(parsedSheets);
    } catch (serverErr: any) {
      console.warn('Server upload or AI analysis encountered issue, falling back to local client parser:', serverErr.message);

      // Robust Fallback: Parse Excel directly in client browser using SheetJS
      try {
        const localSheets = await parseExcelClientSide(file);
        setSheets(localSheets);
        // If there was a minor server warning, show helpful non-blocking info
        console.log(`Successfully parsed ${localSheets.length} sheets using local engine.`);
      } catch (clientErr: any) {
        console.error('Client fallback parsing error:', clientErr);
        setErrorMessage(
          serverErr.message.includes('<!doctype') || serverErr.message.includes('Unexpected token')
            ? '文件格式或编码异常，请核对是否为有效的 Excel 工作簿文件'
            : serverErr.message || clientErr.message || '文件解析失败'
        );
        setSheets(null);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle quick sample demo
  const handleLoadSample = async () => {
    setErrorMessage(null);
    setIsAnalyzing(true);
    setFileName('示例多表企业经营报告.xlsx');

    try {
      const res = await fetch('/api/sample-excel');
      if (!res.ok) throw new Error('获取示例文件失败');

      const blob = await res.blob();
      const sampleFile = new File([blob], '示例多表企业经营报告.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await handleFileUpload(sampleFile);
    } catch (err: any) {
      setErrorMessage(err.message || '加载示例数据失败');
      setIsAnalyzing(false);
    }
  };

  // Export merged multi-sheet PDF
  const handleExportMergedPDF = async (
    updatedSheets: ParsedSheet[],
    customIncludePageNumbers?: boolean
  ) => {
    setIsExportingPDF(true);
    try {
      const includePageNumbers =
        customIncludePageNumbers !== undefined
          ? customIncludePageNumbers
          : updatedSheets.every((s) => s.userConfig.includePageNumbers !== false);

      const payload = {
        docTitle: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Excel智能排版输出',
        includePageNumbers,
        sheets: updatedSheets.map((s) => ({
          sheetName: s.sheetName,
          headers: s.headers,
          rows: s.rows,
          config: {
            ...s.userConfig,
            includePageNumbers: s.userConfig.includePageNumbers !== false,
          },
        })),
      };

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '生成 PDF 失败');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${payload.docTitle}_智能排版.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(`导出 PDF 失败: ${err.message}`);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Export single sheet PDF
  const handleExportSinglePDF = async (sheet: ParsedSheet) => {
    await handleExportMergedPDF([sheet]);
  };

  // Reset workspace
  const handleReset = () => {
    setSheets(null);
    setCurrentFile(null);
    setFileName('');
    setErrorMessage(null);
  };

  // ROUTE: /admin -> Render Admin View
  if (isAdminPath) {
    return <AdminView />;
  }

  // ROUTE: / -> User-facing Interface
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 font-sans selection:bg-blue-500 selection:text-white">
      <Navbar />

      <main className="flex-1 pb-16">
        {/* State 1: Upload Dropzone */}
        {!isAnalyzing && !sheets && (
          <UploadDropzone
            onFileSelected={handleFileUpload}
            onLoadSample={handleLoadSample}
            isLoading={isAnalyzing}
            error={errorMessage}
          />
        )}

        {/* State 2: Analysis Loading */}
        {isAnalyzing && <AnalysisLoading fileName={fileName} />}

        {/* State 3: Workspace & Layout Preview */}
        {!isAnalyzing && sheets && (
          <SheetWorkspace
            fileName={fileName}
            sheets={sheets}
            onReset={handleReset}
            onExportMergedPDF={handleExportMergedPDF}
            onExportSinglePDF={handleExportSinglePDF}
            isExporting={isExportingPDF}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200 text-center text-xs text-slate-400 bg-white print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>Excel 智能排版与一键打印应用 · 自动分析列宽 · 适配 A4 横向与纵向</div>
          <div>免配置直连大模型 · 超长表格跨页自动置顶表头</div>
        </div>
      </footer>
    </div>
  );
}
