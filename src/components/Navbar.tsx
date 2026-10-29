import React, { useState } from 'react';
import { Printer, Sparkles, HelpCircle, FileCheck2, X } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                Excel 智能打印系统
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200/60">
                <Sparkles className="w-2.5 h-2.5" />
                AI 排版引擎
              </span>
            </div>
            <div className="text-[11px] text-slate-500 hidden sm:block">
              多工作表自动识别 · 智能 A4 横纵向判断 · 跨页自动保留表头
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>使用指南</span>
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
                <FileCheck2 className="w-5 h-5 text-blue-600" />
                <span>Excel 智能打印使用指南</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-100">
                <div className="font-bold text-blue-900 mb-1">1. 支持的文件格式</div>
                <div>标准 .xlsx 与 .xls 文件，大小建议 ≤10MB。系统会自动识别工作簿中的每一个 Sheet。</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">2. AI 智能排版原理</div>
                <div>系统深度提取每个 Sheet 的列宽总和、行数及字段特征。宽表（列数多）自动匹配 A4 横向排版；长表自动分页并在后续页面顶端保留表头，防止内容被截断。</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">3. 一键合并导出 PDF</div>
                <div>点击“一键导出合并PDF”，即可将所有工作表汇总输出为单个 PDF，各工作表独立采用最优横纵方向。</div>
              </div>
            </div>

            <div className="mt-6 text-right">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-xs"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
