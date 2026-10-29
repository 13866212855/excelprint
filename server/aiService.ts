import { getDB, SheetAnalysisResult } from './db.js';

export interface SheetStructureSummary {
  sheetName: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  sampleRows: any[][];
  maxColLengths: number[];
  mergedCellCount: number;
  hasTitleBanner: boolean;
}

export interface AITestResult {
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  model: string;
  responsePreview?: string;
  error?: string;
}

// Rule-based heuristic fallback if LLM is unavailable
export function heuristicAnalyzeSheet(summary: SheetStructureSummary): SheetAnalysisResult {
  const { sheetName, rowCount, colCount, maxColLengths, hasTitleBanner } = summary;
  
  // Estimate total content width
  const totalEstimatedWidth = maxColLengths.reduce((acc, len) => acc + Math.max(len, 6), 0);
  
  // Heuristic rule:
  // Standard A4 portrait fits about 6-8 moderate columns (approx 75-85 character units).
  // If cols > 7 or totalEstimatedWidth > 80, landscape is much better to prevent column clipping.
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
  const repeatHeaders = rowCount > 25; // Repeat headers on subsequent pages if more than 1 page

  let reason = '';
  if (isLandscape) {
    reason = `检测到该工作表包含 ${colCount} 列（预估总宽度约 ${totalEstimatedWidth} 字符），列数较多且信息密集，自动匹配 A4 横向排版，以确保所有数据列完整展示无截断。`;
  } else {
    reason = `该工作表包含 ${colCount} 列，列数适中且纵向行数丰富（共 ${rowCount} 行），采用 A4 纵向排版视觉效果最佳，可容纳更多行内容。`;
  }

  const summaryText = `${isLandscape ? 'A4横向' : 'A4纵向'} · 缩放 ${scale}% · ${repeatHeaders ? '跨页保留表头' : '单页紧凑'}`;

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
    summary: summaryText,
  };
}

// Call AI Model to analyze sheet
export async function analyzeSheetWithAI(summary: SheetStructureSummary): Promise<SheetAnalysisResult> {
  const config = getDB().config;
  const startTime = Date.now();

  const prompt = `你是一位高阶Excel排版与打印优化智能专家。
请根据以下工作表的数据结构信息，综合分析并给出最适合该工作表的 A4 打印排版方案：

工作表名称: "${summary.sheetName}"
总行数: ${summary.rowCount}
总列数: ${summary.colCount}
合并单元格数量: ${summary.mergedCellCount}
是否包含顶部标题横幅: ${summary.hasTitleBanner ? '是' : '否'}
表头字段: ${JSON.stringify(summary.headers.slice(0, 20))}
每列最大字符长度预估: ${JSON.stringify(summary.maxColLengths.slice(0, 20))}
前3行数据样本: ${JSON.stringify(summary.sampleRows.slice(0, 3))}

【判断规则要求】：
1. orientation: 必须输出 "landscape"（横向）或 "portrait"（纵向）。
   - 如果列数 > 7，或字符总宽度较大（>85），请坚决推荐 "landscape"，避免列挤压或截断；
   - 如果列数 ≤ 7 且行数较多，推荐 "portrait"。
2. scale: 缩放比例（数值 50 ~ 100，如 100, 85, 75, 65 等）。
3. margins: 页边距，"narrow"（窄边距10mm，推荐列多时）、"normal"（标准15mm）或 "wide"（宽边距20mm）。
4. fontSize: 字号建议，"small"（小号/紧凑）、"medium"（标准）、"large"（放大）。
5. headerRows: 表头行数（通常为1）。
6. titleRows: 顶部大标题行数（如有合并标题横幅则为1，否则为0）。
7. repeatHeaders: 布尔值，当表格超过一页（行数>25）时必须为 true，以保证每一页顶部都有表头。
8. reason: 详细且令人信服的中文分析理由（说明为什么选该方向、列宽特征、如何防止表格被截断等）。
9. summary: 简短摘要（如 "A4横向 · 缩放85% · 跨页自动保留表头"）。

请严格只返回如下格式的 JSON 对象，不得包含任何 Markdown 代码块标记（如 \`\`\`json 等）：
{
  "orientation": "landscape" | "portrait",
  "scale": 85,
  "margins": "narrow" | "normal" | "wide",
  "fontSize": "small" | "medium" | "large",
  "headerRows": 1,
  "titleRows": 1,
  "repeatHeaders": true,
  "reason": "原因说明...",
  "summary": "简短摘要"
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout for fast response

    const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.textModel || 'Agnes-2.5-flash',
        messages: [
          {
            role: 'system',
            content: '你是一个严格输出纯JSON的Excel打印排版分析引擎，不要输出任何非JSON文字。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`LLM HTTP ${response.status} ${response.statusText}, falling back to heuristic.`);
      return heuristicAnalyzeSheet(summary);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

    // Clean JSON content if wrapped in markdown blocks
    const jsonStr = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      sheetName: summary.sheetName,
      rowCount: summary.rowCount,
      colCount: summary.colCount,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      scale: typeof parsed.scale === 'number' ? Math.min(Math.max(parsed.scale, 50), 120) : 85,
      margins: ['narrow', 'normal', 'wide'].includes(parsed.margins) ? parsed.margins : 'normal',
      fontSize: ['small', 'medium', 'large'].includes(parsed.fontSize) ? parsed.fontSize : 'medium',
      headerRows: typeof parsed.headerRows === 'number' ? parsed.headerRows : 1,
      titleRows: typeof parsed.titleRows === 'number' ? parsed.titleRows : (summary.hasTitleBanner ? 1 : 0),
      repeatHeaders: typeof parsed.repeatHeaders === 'boolean' ? parsed.repeatHeaders : summary.rowCount > 25,
      reason: parsed.reason || `AI分析完成：根据表格字段宽度及 ${summary.colCount} 列特征推荐最佳排版方案。`,
      summary: parsed.summary || `${parsed.orientation === 'landscape' ? 'A4横向' : 'A4纵向'} · 智能排版`,
    };
  } catch (err: any) {
    console.warn(`LLM call failed (${err.message}), falling back to smart heuristic rule.`);
    return heuristicAnalyzeSheet(summary);
  }
}

// Test LLM Connection
export async function testLLMConnection(customConfig?: {
  baseUrl: string;
  apiKey: string;
  textModel: string;
}): Promise<AITestResult> {
  const config = customConfig || getDB().config;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.textModel || 'Agnes-2.5-flash',
        messages: [
          { role: 'user', content: '请输出一个字测试连通性：通' },
        ],
        max_tokens: 10,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        latencyMs,
        statusCode: response.status,
        model: config.textModel,
        error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 100);

    return {
      success: true,
      latencyMs,
      statusCode: response.status,
      model: config.textModel,
      responsePreview: content.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      model: config.textModel,
      error: err.name === 'AbortError' ? '请求超时 (8s)' : (err.message || '连接失败'),
    };
  }
}
