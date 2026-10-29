import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Sparkles, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface Props {
  onFileSelected: (file: File) => void;
  onLoadSample: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const UploadDropzone: React.FC<Props> = ({
  onFileSelected,
  onLoadSample,
  isLoading,
  error,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndProceed = (file: File) => {
    setLocalError(null);
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!hasValidExt) {
      setLocalError('文件格式不支持，请上传 .xlsx 或 .xls 格式的 Excel 表格');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setLocalError('文件大小超过 10MB 限制，请精简数据后再试');
      return;
    }

    onFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProceed(e.dataTransfer.files[0]);
    }
  };

  const displayError = localError || error;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero Title */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium mb-4 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
          <span>AI 驱动的多工作表智能打印引擎</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Excel 多表一键智能排版与打印
        </h1>
        <p className="mt-3 text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          上传任意多工作表 Excel，AI 自动解析行列结构、数据密度与表头，智能推荐
          <span className="font-semibold text-slate-800"> A4 横向/纵向、最佳缩放比例及分页方案</span>，一键生成免截断的精美打印输出。
        </p>
      </div>

      {/* Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200 bg-white shadow-sm hover:shadow-md ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
            : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              validateAndProceed(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-200 shadow-inner">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-slate-800 mb-2">
            点击或将 Excel 文件拖拽至此区域
          </h3>
          <p className="text-sm text-slate-500 mb-4 max-w-md">
            支持标准 <span className="font-medium text-slate-700">.xlsx / .xls</span> 文件，自动识别并独立处理多个工作表（Sheet）
          </p>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 单文件 ≤ 10MB
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 多Sheet自动切分
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 本地安全解析
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {displayError && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3 text-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <div className="flex-1 font-medium">{displayError}</div>
        </div>
      )}

      {/* Quick Test Demo Section */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between p-5 bg-gradient-to-r from-slate-50 via-blue-50/30 to-indigo-50/40 rounded-2xl border border-slate-200/80 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              没有现成的 Excel 文件？
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                双Sheet示例
              </span>
            </div>
            <div className="text-xs text-slate-500">
              包含 13列财务年度宽表（自动横向）与 36行员工绩效长表（自动纵向跨页置顶）
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={isLoading}
          onClick={(e) => {
            e.stopPropagation();
            onLoadSample();
          }}
          className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-50 text-blue-600 font-semibold text-sm rounded-xl border border-blue-200 shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span>一键加载示例多表体验</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Feature Pillars */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm mb-3">
            01
          </div>
          <h4 className="font-bold text-slate-800 text-sm mb-1">智能横纵向判断</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            AI 深度考量列数、字符宽度总和与表格比例，自动匹配 A4 横向或纵向，彻底告别列被右侧截断的痛点。
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3">
            02
          </div>
          <h4 className="font-bold text-slate-800 text-sm mb-1">长表自动跨页重复表头</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            识别大标题与字段表头，超出一页的内容自动智能分页，并在每一页顶端精准保留表头行，阅览更专业。
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm mb-3">
            03
          </div>
          <h4 className="font-bold text-slate-800 text-sm mb-1">多表合并高保真 PDF 导出</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            支持多个工作表合并输出为单份 PDF，各 Sheet 保持各自最优排版方向，同时支持直接调起浏览器打印。
          </p>
        </div>
      </div>
    </div>
  );
};
