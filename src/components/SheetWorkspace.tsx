import React, { useState, useMemo } from 'react';
import {
  ParsedSheet,
  SheetOrientation,
  MarginType,
  FontSizeType,
} from '../types.js';
import {
  Printer,
  Download,
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Table,
  Check,
  FileText,
  Sliders,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface Props {
  fileName: string;
  sheets: ParsedSheet[];
  onReset: () => void;
  onExportMergedPDF: (updatedSheets: ParsedSheet[], includePageNumbers?: boolean) => void;
  onExportSinglePDF: (sheet: ParsedSheet) => void;
  isExporting: boolean;
}

export const SheetWorkspace: React.FC<Props> = ({
  fileName,
  sheets: initialSheets,
  onReset,
  onExportMergedPDF,
  onExportSinglePDF,
  isExporting,
}) => {
  const [sheets, setSheets] = useState<ParsedSheet[]>(initialSheets);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAllPages, setViewAllPages] = useState(false);
  const [showZebra, setShowZebra] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [sheetSearchKeyword, setSheetSearchKeyword] = useState('');

  const activeSheet = sheets[activeSheetIndex] || sheets[0];
  const userConfig = activeSheet.userConfig;

  // Filter sheets for search
  const filteredSheets = useMemo(() => {
    if (!sheetSearchKeyword.trim()) return sheets;
    const kw = sheetSearchKeyword.toLowerCase().trim();
    return sheets.filter((s) => s.sheetName.toLowerCase().includes(kw));
  }, [sheets, sheetSearchKeyword]);

  // Update config of current active sheet
  const updateActiveConfig = (updates: Partial<typeof userConfig>) => {
    setSheets((prev) => {
      const copy = [...prev];
      copy[activeSheetIndex] = {
        ...copy[activeSheetIndex],
        userConfig: {
          ...copy[activeSheetIndex].userConfig,
          ...updates,
        },
      };
      return copy;
    });
  };

  // Reset current sheet config to AI suggestion
  const resetToAIConfig = () => {
    updateActiveConfig({
      ...activeSheet.analysis,
    });
  };

  // Update specific custom margin (top, bottom, left, right)
  const updateCustomMargin = (side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    const current = userConfig.customMargins || { top: 15, bottom: 15, left: 15, right: 15 };
    const updated = { ...current, [side]: value };
    updateActiveConfig({
      margins: 'custom',
      customMargins: updated,
    });
  };

  // Sync custom margins & page settings across all sheets in the workbook
  const applyMarginsToAllSheets = () => {
    const current = userConfig.customMargins || { top: 15, bottom: 15, left: 15, right: 15 };
    setSheets((prev) =>
      prev.map((s) => ({
        ...s,
        userConfig: {
          ...s.userConfig,
          margins: userConfig.margins,
          customMargins: { ...current },
          includePageNumbers: userConfig.includePageNumbers !== false,
        },
      }))
    );
  };

  // Pagination calculation based on orientation, font size, scale, and vertical margins
  const rowsPerPage = useMemo(() => {
    const isLandscape = userConfig.orientation === 'landscape';
    let baseRows = isLandscape ? 18 : 28;

    if (userConfig.fontSize === 'small') baseRows += 5;
    if (userConfig.fontSize === 'large') baseRows -= 4;

    const scaleFactor = (userConfig.scale || 100) / 100;
    if (scaleFactor <= 0.75) baseRows = Math.round(baseRows * 1.35);
    else if (scaleFactor <= 0.85) baseRows = Math.round(baseRows * 1.18);
    else if (scaleFactor > 1.0) baseRows = Math.round(baseRows * 0.85);

    // Adjust for vertical margins if custom
    if (userConfig.customMargins) {
      const vMargin = (userConfig.customMargins.top || 15) + (userConfig.customMargins.bottom || 15);
      if (vMargin > 35) baseRows = Math.max(6, baseRows - 2);
      else if (vMargin < 22) baseRows += 2;
    }

    return Math.max(8, baseRows);
  }, [userConfig.orientation, userConfig.fontSize, userConfig.scale, userConfig.customMargins]);

  const totalPages = Math.ceil(activeSheet.rows.length / rowsPerPage) || 1;

  // Make sure currentPage is in range
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  // Rows to display
  const paginatedPages = useMemo(() => {
    const pages: any[][][] = [];
    for (let p = 0; p < totalPages; p++) {
      const start = p * rowsPerPage;
      pages.push(activeSheet.rows.slice(start, start + rowsPerPage));
    }
    return pages;
  }, [activeSheet.rows, rowsPerPage, totalPages]);

  // Handle native browser print
  const handleNativePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Top Header & Global Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 tracking-tight truncate max-w-sm">
                {fileName}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                共 {sheets.length} 个工作表
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              已由 AI 完成全表排版架构分析，支持按工作表独立优化与一键输出
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onReset}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重新上传</span>
          </button>

          <button
            type="button"
            onClick={handleNativePrint}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl border border-slate-300 shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>浏览器打印</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => onExportSinglePDF(activeSheet)}
            className="px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>导出当前Sheet PDF</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => onExportMergedPDF(sheets, userConfig.includePageNumbers !== false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? '生成中...' : '一键导出合并PDF (多工作表)'}</span>
          </button>
        </div>
      </div>

      {/* Sheets Navigation Bar with Quick Search & Switcher */}
      <div className="bg-slate-100/70 p-3 rounded-2xl border border-slate-200 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
              工作表列表 ({sheets.length} 个):
            </span>

            {/* Quick Dropdown Selector for Large Number of Sheets */}
            <select
              value={activeSheetIndex}
              onChange={(e) => {
                setActiveSheetIndex(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-white rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs max-w-xs truncate"
            >
              {sheets.map((s, idx) => (
                <option key={idx} value={idx}>
                  {idx + 1}. {s.sheetName} ({s.userConfig.orientation === 'landscape' ? '横向' : '纵向'} · {s.rows.length}行)
                </option>
              ))}
            </select>

            {/* Prev / Next Sheet shortcuts */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={activeSheetIndex <= 0}
                onClick={() => {
                  setActiveSheetIndex((i) => Math.max(0, i - 1));
                  setCurrentPage(1);
                }}
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none text-slate-600 transition-colors"
                title="上一工作表"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={activeSheetIndex >= sheets.length - 1}
                onClick={() => {
                  setActiveSheetIndex((i) => Math.min(sheets.length - 1, i + 1));
                  setCurrentPage(1);
                }}
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none text-slate-600 transition-colors"
                title="下一工作表"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Box if sheets > 4 */}
          {sheets.length > 4 && (
            <div className="relative max-w-xs w-full sm:w-60">
              <input
                type="text"
                value={sheetSearchKeyword}
                onChange={(e) => setSheetSearchKeyword(e.target.value)}
                placeholder="筛选工作表名称..."
                className="w-full px-3 py-1.5 text-xs bg-white rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 placeholder:text-slate-400"
              />
              {sheetSearchKeyword && (
                <button
                  type="button"
                  onClick={() => setSheetSearchKeyword('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Buttons Scrollbar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {filteredSheets.map((sheet) => {
            const index = sheets.findIndex((s) => s.sheetName === sheet.sheetName);
            const isActive = index === activeSheetIndex;
            const isLandscape = sheet.userConfig.orientation === 'landscape';

            return (
              <button
                key={sheet.sheetName}
                onClick={() => {
                  setActiveSheetIndex(index);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium text-xs transition-all shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span className="font-semibold truncate max-w-[150px]">{sheet.sheetName}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isActive
                      ? 'bg-blue-500/80 text-white'
                      : isLandscape
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-sky-50 text-sky-700 border border-sky-200'
                  }`}
                >
                  {isLandscape ? 'A4横向' : 'A4纵向'}
                </span>
                <span
                  className={`text-[10px] ${
                    isActive ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  {sheet.rows.length}行 · {sheet.colCount}列
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Recommendation Banner */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5 mb-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                AI智能排版诊断
              </span>
              <span className="text-xs font-semibold text-slate-700">
                推荐：{activeSheet.analysis.orientation === 'landscape' ? 'A4 横向' : 'A4 纵向'} 排版
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 mt-1 font-medium leading-relaxed">
              {activeSheet.analysis.reason}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0 self-end md:self-center">
          <div className="px-2.5 py-1.5 rounded-lg bg-white/80 border border-blue-200 text-slate-600 font-medium">
            AI建议缩放: <span className="font-bold text-blue-700">{activeSheet.analysis.scale}%</span>
          </div>
          {activeSheet.analysis.repeatHeaders && (
            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium flex items-center gap-1">
              <Check className="w-3 h-3" />
              <span>自动分页保留表头</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Control Panel (Left) & Live A4 Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tuning Toolbar (Left 4 cols) */}
        <div className="lg:col-span-4 space-y-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>排版微调参数</span>
            </div>
            <button
              type="button"
              onClick={resetToAIConfig}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复AI推荐</span>
            </button>
          </div>

          {/* Orientation Control */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              纸张方向 (A4 标准)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateActiveConfig({ orientation: 'portrait' })}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  userConfig.orientation === 'portrait'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="w-3 h-4 border-2 border-current rounded-xs" />
                <span>纵向 (Portrait)</span>
              </button>

              <button
                type="button"
                onClick={() => updateActiveConfig({ orientation: 'landscape' })}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  userConfig.orientation === 'landscape'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="w-4 h-3 border-2 border-current rounded-xs" />
                <span>横向 (Landscape)</span>
              </button>
            </div>
          </div>

          {/* Scale Control */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">
                打印缩放比例
              </label>
              <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {userConfig.scale}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="130"
              step="5"
              value={userConfig.scale}
              onChange={(e) => updateActiveConfig({ scale: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex items-center justify-between mt-2">
              {[65, 75, 85, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => updateActiveConfig({ scale: preset })}
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    userConfig.scale === preset
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          {/* PDF 打印页面配置区 */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>PDF 打印页面配置区</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">单位: mm</span>
            </div>

            {/* Margin Mode Selector: Preset vs Custom */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                预设 / 自定义页边距
              </label>
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    updateActiveConfig({
                      margins: 'narrow',
                      customMargins: { top: 10, bottom: 10, left: 10, right: 10 },
                    });
                  }}
                  className={`py-1 px-1 rounded-lg border text-[11px] font-medium text-center transition-all ${
                    userConfig.margins === 'narrow'
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  窄(10)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateActiveConfig({
                      margins: 'normal',
                      customMargins: { top: 15, bottom: 15, left: 15, right: 15 },
                    });
                  }}
                  className={`py-1 px-1 rounded-lg border text-[11px] font-medium text-center transition-all ${
                    userConfig.margins === 'normal'
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  标准(15)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateActiveConfig({
                      margins: 'wide',
                      customMargins: { top: 20, bottom: 20, left: 20, right: 20 },
                    });
                  }}
                  className={`py-1 px-1 rounded-lg border text-[11px] font-medium text-center transition-all ${
                    userConfig.margins === 'wide'
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  宽(20)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const current = userConfig.customMargins || { top: 15, bottom: 15, left: 15, right: 15 };
                    updateActiveConfig({
                      margins: 'custom',
                      customMargins: current,
                    });
                  }}
                  className={`py-1 px-1 rounded-lg border text-[11px] font-medium text-center transition-all ${
                    userConfig.margins === 'custom'
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  自定义
                </button>
              </div>
            </div>

            {/* Custom 4-directional Margins (Top, Bottom, Left, Right) */}
            <div className="space-y-2 pt-1 border-t border-slate-200/60">
              <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                <span>自定义页边距 (上下左右):</span>
                <span className="text-[10px] text-blue-600 font-mono font-bold">
                  {userConfig.customMargins?.top ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)} / {userConfig.customMargins?.bottom ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)} / {userConfig.customMargins?.left ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)} / {userConfig.customMargins?.right ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)} mm
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Top Margin */}
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-600">上边距 (Top)</span>
                    <span className="text-[10px] text-slate-400">mm</span>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={userConfig.customMargins?.top ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(60, parseInt(e.target.value) || 2));
                      updateCustomMargin('top', val);
                    }}
                    className="w-full px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Bottom Margin */}
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-600">下边距 (Bottom)</span>
                    <span className="text-[10px] text-slate-400">mm</span>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={userConfig.customMargins?.bottom ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(60, parseInt(e.target.value) || 2));
                      updateCustomMargin('bottom', val);
                    }}
                    className="w-full px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Left Margin */}
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-600">左边距 (Left)</span>
                    <span className="text-[10px] text-slate-400">mm</span>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={userConfig.customMargins?.left ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(60, parseInt(e.target.value) || 2));
                      updateCustomMargin('left', val);
                    }}
                    className="w-full px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Right Margin */}
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-600">右边距 (Right)</span>
                    <span className="text-[10px] text-slate-400">mm</span>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={userConfig.customMargins?.right ?? (userConfig.margins === 'narrow' ? 10 : userConfig.margins === 'wide' ? 20 : 15)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(60, parseInt(e.target.value) || 2));
                      updateCustomMargin('right', val);
                    }}
                    className="w-full px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Batch apply to all sheets button */}
              {sheets.length > 1 && (
                <button
                  type="button"
                  onClick={applyMarginsToAllSheets}
                  className="w-full mt-1.5 py-1.5 px-2 bg-white hover:bg-slate-100 text-blue-600 font-semibold text-[11px] rounded-lg border border-blue-200 shadow-2xs transition-colors flex items-center justify-center gap-1"
                >
                  <span>同步页边距与页面设置至全部 {sheets.length} 个工作表</span>
                </button>
              )}
            </div>

            {/* Page Number Toggle in PDF Configuration Section */}
            <div className="pt-2 border-t border-slate-200/70">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                      显示页码
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                      底部居中
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    在导出 PDF 每一页底部自动添加格式化页码
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={userConfig.includePageNumbers !== false}
                  onChange={(e) => updateActiveConfig({ includePageNumbers: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Font Size Control */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              表格字号自适应
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'small', label: '紧凑 (11px)' },
                  { id: 'medium', label: '标准 (13px)' },
                  { id: 'large', label: '放大 (15px)' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => updateActiveConfig({ fontSize: f.id })}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium text-center transition-all ${
                    userConfig.fontSize === f.id
                      ? 'bg-blue-50 border-blue-600 text-blue-700 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700">
                跨页自动重复表头
              </span>
              <input
                type="checkbox"
                checked={userConfig.repeatHeaders}
                onChange={(e) => updateActiveConfig({ repeatHeaders: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700">
                表格行交替斑马纹
              </span>
              <input
                type="checkbox"
                checked={showZebra}
                onChange={(e) => setShowZebra(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-slate-700">
                显示单元格网格线
              </span>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>
          </div>

          {/* Sheet Details Card */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">当前工作表:</span>
              <span className="font-semibold text-slate-800">{activeSheet.sheetName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">数据规模:</span>
              <span className="font-semibold text-slate-800">{activeSheet.rows.length} 行 × {activeSheet.colCount} 列</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">打印总页数:</span>
              <span className="font-semibold text-blue-600">共 {totalPages} 页 A4</span>
            </div>
          </div>
        </div>

        {/* Live A4 Paper Preview (Right 8 cols) */}
        <div className="lg:col-span-8 flex flex-col items-center">
          {/* Preview Navigation Bar */}
          <div className="w-full bg-white rounded-2xl border border-slate-200 p-3 mb-4 shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={viewAllPages || safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="上一页"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>

              <span className="text-xs font-bold text-slate-700 px-2">
                {viewAllPages ? `全部 ${totalPages} 页` : `第 ${safeCurrentPage} / ${totalPages} 页`}
              </span>

              <button
                type="button"
                disabled={viewAllPages || safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="下一页"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewAllPages(!viewAllPages)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{viewAllPages ? '单页切换模式' : '连续分页预览'}</span>
              </button>

              <div className="text-[11px] text-slate-400 hidden sm:block">
                按 A4 {userConfig.orientation === 'landscape' ? '横向 297×210mm' : '纵向 210×297mm'} 真实排版渲染
              </div>
            </div>
          </div>

          {/* A4 Paper Viewport Container */}
          <div className="w-full flex flex-col items-center gap-8 overflow-x-auto pb-8 print:p-0">
            {(viewAllPages ? paginatedPages : [paginatedPages[safeCurrentPage - 1] || []]).map(
              (pageRows, pageIdx) => {
                const actualPageNumber = viewAllPages ? pageIdx + 1 : safeCurrentPage;
                const isLandscape = userConfig.orientation === 'landscape';

                // Calculate directional padding based on customMargins or preset
                let padTop = 32;
                let padBottom = 32;
                let padLeft = 32;
                let padRight = 32;

                if (userConfig.customMargins) {
                  padTop = Math.round((userConfig.customMargins.top || 15) * 2.1);
                  padBottom = Math.round((userConfig.customMargins.bottom || 15) * 2.1);
                  padLeft = Math.round((userConfig.customMargins.left || 15) * 2.1);
                  padRight = Math.round((userConfig.customMargins.right || 15) * 2.1);
                } else if (userConfig.margins === 'narrow') {
                  padTop = padBottom = padLeft = padRight = 20;
                } else if (userConfig.margins === 'wide') {
                  padTop = padBottom = padLeft = padRight = 44;
                }

                // Font size class
                let fontClass = 'text-[11px]';
                if (userConfig.fontSize === 'small') fontClass = 'text-[10px]';
                if (userConfig.fontSize === 'large') fontClass = 'text-[13px]';

                return (
                  <div
                    key={pageIdx}
                    id={`print-paper-sheet-${pageIdx}`}
                    style={{
                      padding: `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`,
                      zoom: `${userConfig.scale / 100}`,
                    }}
                    className={`bg-white shadow-xl border border-slate-200/90 rounded-sm flex flex-col justify-between transition-all duration-200 print:shadow-none print:border-none print:m-0 ${
                      isLandscape
                        ? 'w-full max-w-[850px] min-h-[580px]'
                        : 'w-full max-w-[650px] min-h-[820px]'
                    }`}
                  >
                    <div>
                      {/* Paper Top Title */}
                      <div className="mb-4 pb-2 border-b-2 border-slate-800/80 flex items-end justify-between">
                        <div>
                          <h1 className="text-lg font-black text-slate-900 tracking-tight">
                            {activeSheet.sheetName}
                          </h1>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            AI 智能排版 · A4 {isLandscape ? '横向' : '纵向'} (缩放 {userConfig.scale}%) · 打印预览
                          </div>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400">
                          第 {actualPageNumber} 页 / 共 {totalPages} 页
                        </div>
                      </div>

                      {/* Data Table */}
                      <div className="overflow-x-auto">
                        <table
                          className={`w-full border-collapse ${fontClass} ${
                            showGrid ? 'border border-slate-300' : ''
                          }`}
                        >
                          {/* Repeat Headers */}
                          {(actualPageNumber === 1 || userConfig.repeatHeaders) && (
                            <thead>
                              <tr className="bg-blue-600 text-white font-bold text-center">
                                {activeSheet.headers.map((header, hIdx) => (
                                  <th
                                    key={hIdx}
                                    className={`py-2 px-2.5 whitespace-nowrap text-left ${
                                      showGrid ? 'border border-blue-500' : ''
                                    }`}
                                  >
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}

                          {/* Table Body */}
                          <tbody>
                            {pageRows.map((row, rIdx) => {
                              const isZebra = showZebra && rIdx % 2 === 1;
                              return (
                                <tr
                                  key={rIdx}
                                  className={`${
                                    isZebra ? 'bg-slate-50/70' : 'bg-white'
                                  } hover:bg-blue-50/30 transition-colors`}
                                >
                                  {activeSheet.headers.map((_, cIdx) => {
                                    const cellValue = row[cIdx];
                                    const formatted =
                                      cellValue === undefined || cellValue === null
                                        ? ''
                                        : String(cellValue);

                                    return (
                                      <td
                                        key={cIdx}
                                        className={`py-1.5 px-2.5 text-slate-700 break-words leading-tight ${
                                          showGrid ? 'border border-slate-200' : ''
                                        }`}
                                      >
                                        {formatted}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Paper Footer with page numbers and watermark */}
                    <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span>{fileName} · {activeSheet.sheetName}</span>
                      {userConfig.includePageNumbers !== false ? (
                        <span className="font-semibold text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded">
                          第 {actualPageNumber} 页 / 共 {totalPages} 页
                        </span>
                      ) : (
                        <span className="text-slate-300 italic text-[9px]">(页码已隐藏)</span>
                      )}
                      <span>Excel 智能打印系统输出</span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
