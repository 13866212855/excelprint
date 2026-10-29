import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, FileSpreadsheet, LayoutTemplate } from 'lucide-react';

interface Props {
  fileName: string;
}

const steps = [
  { label: '解析 Excel 文件工作表结构与数据矩阵', detail: '识别工作表数量、行列数、单元格数据类型及跨列合并标题' },
  { label: 'AI 大模型深度分析列宽密度与布局特征', detail: '评估字段信息密度、计算预估总字符宽度并评估纸张边界' },
  { label: '智能决策 A4 横向/纵向与自适应缩放方案', detail: '规划最适纸张方向、页边距、字号以及超长表格跨页表头保留策略' },
];

export const AnalysisLoading: React.FC<Props> = ({ fileName }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), 800);
    const timer2 = setTimeout(() => setCurrentStep(2), 2200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center animate-in fade-in duration-300">
      <div className="relative inline-flex items-center justify-center mb-6">
        <div className="w-20 h-20 rounded-3xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-md">
          <FileSpreadsheet className="w-10 h-10 animate-bounce" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg animate-pulse">
          <Sparkles className="w-4 h-4" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
        AI 智能排版分析中...
      </h2>
      <p className="text-sm text-slate-500 mb-8 max-w-sm mx-auto truncate font-medium">
        正在处理文件：<span className="text-slate-700">{fileName}</span>
      </p>

      {/* Stepper Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left space-y-4">
        {steps.map((step, idx) => {
          const isDone = currentStep > idx;
          const isCurrent = currentStep === idx;

          return (
            <div key={idx} className="flex items-start gap-3.5">
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-200 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                    {idx + 1}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div
                  className={`text-sm font-semibold ${
                    isDone
                      ? 'text-slate-800'
                      : isCurrent
                      ? 'text-blue-600'
                      : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {step.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
        <LayoutTemplate className="w-3.5 h-3.5" />
        <span>支持自动根据列宽自适应判断 横向/纵向 与分页表头</span>
      </div>
    </div>
  );
};
