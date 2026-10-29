import React, { useState, useEffect } from 'react';
import {
  AdminConfig,
  HistoryRecord,
  AuditLog,
  SheetAnalysisResult,
} from '../../types.js';
import {
  ShieldCheck,
  Cpu,
  Database,
  History,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  KeyRound,
  Zap,
  Clock,
  ArrowLeft,
  Settings,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  // Authentication states
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassError, setChangePassError] = useState<string | null>(null);
  const [changePassSuccess, setChangePassSuccess] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'config' | 'records' | 'logs'>('config');

  // Config states
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [textModelInput, setTextModelInput] = useState('');
  const [imageModelInput, setImageModelInput] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test LLM states
  const [isTestingLLM, setIsTestingLLM] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    statusCode?: number;
    model: string;
    responsePreview?: string;
    error?: string;
  } | null>(null);

  // Records states
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize] = useState(10);
  const [recordKeyword, setRecordKeyword] = useState('');
  const [recordStatusFilter, setRecordStatusFilter] = useState('all');
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  // Record detail modal
  const [viewRecordDetail, setViewRecordDetail] = useState<HistoryRecord | null>(null);

  // Audit Logs states
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Check login on mount
  useEffect(() => {
    if (token) {
      verifyAdminSession();
    }
  }, [token]);

  const verifyAdminSession = async () => {
    try {
      const res = await fetch('/api/admin/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMustChangePassword(data.mustChangePassword);
        if (data.mustChangePassword) {
          setShowPasswordModal(true);
        }
        loadConfig();
      } else {
        handleLogout();
      }
    } catch (_) {
      handleLogout();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || '登录失败，请核对账号与密码');
        setIsLoggingIn(false);
        return;
      }

      setToken(data.token);
      localStorage.setItem('admin_token', data.token);
      setMustChangePassword(data.mustChangePassword);
      if (data.mustChangePassword) {
        setShowPasswordModal(true);
      }
      setIsLoggingIn(false);
      loadConfig();
    } catch (err: any) {
      setLoginError(err.message || '网络异常，登录服务不可用');
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  // Load Model Config
  const loadConfig = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: AdminConfig = await res.json();
        setConfig(data);
        setBaseUrlInput(data.baseUrl);
        setApiKeyInput(data.apiKeyMasked);
        setTextModelInput(data.textModel);
        setImageModelInput(data.imageModel || '');
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  // Save Model Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingConfig(true);
    setConfigMsg(null);

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: baseUrlInput,
          apiKey: apiKeyInput,
          textModel: textModelInput,
          imageModel: imageModelInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setConfigMsg({ type: 'error', text: data.error || '保存失败' });
      } else {
        setConfigMsg({ type: 'success', text: '大模型配置已持久化保存并立即生效' });
        loadConfig();
      }
    } catch (err: any) {
      setConfigMsg({ type: 'error', text: err.message || '保存异常' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Test LLM Connection
  const handleTestLLM = async () => {
    if (!token) return;
    setIsTestingLLM(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/test-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: baseUrlInput,
          apiKey: apiKeyInput,
          textModel: textModelInput,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        model: textModelInput,
        error: err.message || '网络请求失败',
      });
    } finally {
      setIsTestingLLM(false);
    }
  };

  // Change Admin Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError(null);
    setChangePassSuccess(null);

    if (newPassword.length < 6) {
      setChangePassError('新密码长度不能少于 6 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePassError('两次输入的密码不一致');
      return;
    }

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setChangePassError(data.error || '修改失败');
      } else {
        setChangePassSuccess('密码已成功修改！');
        setMustChangePassword(false);
        setTimeout(() => {
          setShowPasswordModal(false);
          setNewPassword('');
          setConfirmPassword('');
          setChangePassSuccess(null);
        }, 1500);
      }
    } catch (err: any) {
      setChangePassError(err.message || '修改请求异常');
    }
  };

  // Load Records
  const loadRecords = async (page = recordPage) => {
    if (!token) return;
    setIsLoadingRecords(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: recordPageSize.toString(),
        status: recordStatusFilter,
        keyword: recordKeyword,
      });

      const res = await fetch(`/api/admin/records?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRecords(data.records);
        setRecordTotal(data.total);
        setRecordPage(data.page);
      }
    } catch (err) {
      console.error('Failed to load records:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  // Load Audit Logs
  const loadAuditLogs = async () => {
    if (!token) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (token) {
      if (activeTab === 'records') {
        loadRecords(1);
      } else if (activeTab === 'logs') {
        loadAuditLogs();
      }
    }
  }, [activeTab, recordStatusFilter]);

  // Delete single record
  const handleDeleteRecord = async (id: string) => {
    if (!confirm('确定要删除这条提交记录吗？')) return;
    try {
      const res = await fetch(`/api/admin/records/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadRecords(recordPage);
      }
    } catch (err) {
      alert('删除失败');
    }
  };

  // Batch delete records
  const handleBatchDelete = async () => {
    if (selectedRecordIds.length === 0) return;
    if (!confirm(`确定要批量删除选中的 ${selectedRecordIds.length} 条记录吗？`)) return;

    try {
      const res = await fetch('/api/admin/records/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedRecordIds }),
      });
      if (res.ok) {
        setSelectedRecordIds([]);
        loadRecords(1);
      }
    } catch (err) {
      alert('批量删除失败');
    }
  };

  // Export records to CSV
  const handleExportCSV = () => {
    window.location.href = `/api/admin/records-export`;
  };

  // View full record detail
  const handleViewDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/records/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViewRecordDetail(data);
      }
    } catch (err) {
      alert('获取详情失败');
    }
  };

  // 1. RENDER LOGIN SCREEN IF NOT AUTHENTICATED
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700/80 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              管理后台安全登录
            </h1>
            <p className="text-xs text-slate-400 mt-2">
              Excel 智能打印系统 · 模型参数与审计中心
            </p>
          </div>

          {loginError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                管理员账号
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理账号"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                登录密码
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入登录密码"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-6"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>安全鉴权中...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>立即安全登录</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-700/60 text-center">
            <a
              href="/"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回前台主页</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 2. RENDER ADMIN DASHBOARD
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Admin Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">系统管理后台</div>
              <div className="text-[10px] text-slate-400">Excel 智能排版模型与审计中台</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {mustChangePassword && (
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1 animate-pulse"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>建议修改初始密码</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="修改登录密码"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>退出登录</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-6 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>大模型参数配置</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('records')}
            className={`py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'records'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>前台提交记录管理</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>系统操作审计</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* ==================================================== */}
        {/* TAB 1: MODEL CONFIGURATION */}
        {/* ==================================================== */}
        {activeTab === 'config' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    AI 大模型参数配置
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    支持自定义 OpenAI 兼容接口，配置持久化保存至数据库
                  </p>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                  持久化存储
                </div>
              </div>

              {configMsg && (
                <div
                  className={`mb-6 p-4 rounded-xl text-xs flex items-center gap-2.5 ${
                    configMsg.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {configMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{configMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    API Base URL (接口基地址)
                  </label>
                  <input
                    type="url"
                    required
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder="https://apihub.agnes-ai.com/v1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500 font-mono text-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    标准 OpenAI 兼容服务地址，默认：https://apihub.agnes-ai.com/v1
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      API Key (服务端加密脱敏)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      页面脱敏展示，后端加密持久化
                    </span>
                  </div>
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="输入新的 API Key（如保持 sk-vWM7****IGm4BiM9 则不修改）"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500 font-mono text-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    调用时由服务端代理发起，前端绝不持有明文 Key
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      文本排版分析模型 (Text Model)
                    </label>
                    <input
                      type="text"
                      required
                      value={textModelInput}
                      onChange={(e) => setTextModelInput(e.target.value)}
                      placeholder="Agnes-2.5-flash"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500 font-mono text-slate-800"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      默认：Agnes-2.5-flash
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      图片辅助模型 (Image Model)
                    </label>
                    <input
                      type="text"
                      value={imageModelInput}
                      onChange={(e) => setImageModelInput(e.target.value)}
                      placeholder="Agnes-Image-2.1-flash"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500 font-mono text-slate-800"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      默认：Agnes-Image-2.1-flash
                    </p>
                  </div>
                </div>

                {config?.updatedAt && (
                  <div className="text-[11px] text-slate-400 pt-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>最近更新时间：{new Date(config.updatedAt).toLocaleString()} ({config.updatedBy})</span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={isTestingLLM}
                    onClick={handleTestLLM}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isTestingLLM ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span>测试连通性</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingConfig}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingConfig ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>保存配置</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Test Connection Output Box */}
            {testResult && (
              <div
                className={`p-5 rounded-2xl border text-xs animate-in fade-in duration-200 ${
                  testResult.success
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50/70 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center justify-between font-bold mb-2">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>
                      {testResult.success ? '大模型连通测试成功！' : '大模型连通测试失败'}
                    </span>
                  </div>
                  <span className="font-mono bg-white/80 px-2 py-0.5 rounded border">
                    耗时: {testResult.latencyMs} ms
                  </span>
                </div>

                {testResult.statusCode && (
                  <div className="text-[11px] mb-1">
                    HTTP 状态码: <span className="font-mono font-bold">{testResult.statusCode}</span>
                  </div>
                )}

                {testResult.responsePreview && (
                  <div className="mt-2 bg-white/90 p-3 rounded-lg border border-emerald-200/60 font-mono text-[11px] text-slate-700">
                    模型应答片段: {testResult.responsePreview}
                  </div>
                )}

                {testResult.error && (
                  <div className="mt-2 bg-white/90 p-3 rounded-lg border border-rose-200/60 font-mono text-[11px] text-rose-700">
                    错误详情: {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: UPLOAD & PRINT RECORDS */}
        {/* ==================================================== */}
        {activeTab === 'records' && (
          <div className="space-y-5">
            {/* Filter & Action Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={recordKeyword}
                    onChange={(e) => setRecordKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadRecords(1)}
                    placeholder="按文件名或IP搜索..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <select
                  value={recordStatusFilter}
                  onChange={(e) => setRecordStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-700"
                >
                  <option value="all">全部状态</option>
                  <option value="success">处理成功</option>
                  <option value="failed">处理失败</option>
                </select>

                <button
                  type="button"
                  onClick={() => loadRecords(1)}
                  className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  title="刷新列表"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecords ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {selectedRecordIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>批量删除 ({selectedRecordIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-xl border border-slate-300 shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出CSV</span>
                </button>
              </div>
            </div>

            {/* Records Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={
                            records.length > 0 &&
                            selectedRecordIds.length === records.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRecordIds(records.map((r) => r.id));
                            } else {
                              setSelectedRecordIds([]);
                            }
                          }}
                          className="rounded text-blue-600"
                        />
                      </th>
                      <th className="py-3 px-4">文件名</th>
                      <th className="py-3 px-4">大小</th>
                      <th className="py-3 px-4">工作表数</th>
                      <th className="py-3 px-4">AI排版决策概要</th>
                      <th className="py-3 px-4">上传时间</th>
                      <th className="py-3 px-4">客户端IP</th>
                      <th className="py-3 px-4">状态</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          {isLoadingRecords ? '正在加载数据...' : '暂无上传排版记录'}
                        </td>
                      </tr>
                    ) : (
                      records.map((rec) => {
                        const isSelected = selectedRecordIds.includes(rec.id);
                        return (
                          <tr
                            key={rec.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRecordIds([...selectedRecordIds, rec.id]);
                                  } else {
                                    setSelectedRecordIds(
                                      selectedRecordIds.filter((id) => id !== rec.id)
                                    );
                                  }
                                }}
                                className="rounded text-blue-600"
                              />
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900 max-w-xs truncate">
                              {rec.fileName}
                            </td>
                            <td className="py-3 px-4 text-slate-500 font-mono">
                              {(rec.fileSize / 1024).toFixed(1)} KB
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {rec.sheetCount} 个
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {rec.sheetsAnalysis?.slice(0, 3).map((sa, i) => (
                                  <span
                                    key={i}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      sa.orientation === 'landscape'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-sky-50 text-sky-700 border border-sky-200'
                                    }`}
                                  >
                                    {sa.sheetName}: {sa.orientation === 'landscape' ? '横' : '纵'}
                                  </span>
                                ))}
                                {rec.sheetsAnalysis?.length > 3 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{rec.sheetsAnalysis.length - 3}表
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                              {new Date(rec.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                              {rec.ip}
                            </td>
                            <td className="py-3 px-4">
                              {rec.status === 'success' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  成功
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold text-[11px]"
                                  title={rec.error}
                                >
                                  <XCircle className="w-3 h-3 text-rose-500" />
                                  失败
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleViewDetail(rec.id)}
                                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="查看详情与排版分析"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(rec.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="删除记录"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>共 {recordTotal} 条历史记录</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={recordPage <= 1}
                    onClick={() => loadRecords(recordPage - 1)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                  >
                    上一页
                  </button>
                  <span className="font-semibold text-slate-700">第 {recordPage} 页</span>
                  <button
                    type="button"
                    disabled={recordPage * recordPageSize >= recordTotal}
                    onClick={() => loadRecords(recordPage + 1)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: AUDIT LOGS */}
        {/* ==================================================== */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">系统审计与安全操作日志</h2>
                <p className="text-xs text-slate-500 mt-0.5">记录配置变更、管理员鉴权与敏感数据删除操作</p>
              </div>
              <button
                type="button"
                onClick={loadAuditLogs}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">暂无日志记录</div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{log.action}</span>
                        <span className="text-[10px] text-slate-400 font-mono">IP: {log.ip}</span>
                      </div>
                      <div className="text-slate-600">{log.details}</div>
                    </div>
                    <div className="text-[11px] text-slate-400 shrink-0 font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Record Detail Modal */}
      {viewRecordDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  提交记录详情与排版分析结果
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{viewRecordDetail.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewRecordDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="text-slate-400">文件大小</div>
                  <div className="font-semibold text-slate-800">
                    {(viewRecordDetail.fileSize / 1024).toFixed(1)} KB
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">工作表数量</div>
                  <div className="font-semibold text-slate-800">
                    {viewRecordDetail.sheetCount} 个 Sheet
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">提交客户端 IP</div>
                  <div className="font-semibold text-slate-800 font-mono">
                    {viewRecordDetail.ip}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">提交时间</div>
                  <div className="font-semibold text-slate-800">
                    {new Date(viewRecordDetail.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">各工作表 AI 分析详情</h4>
                <div className="space-y-3">
                  {viewRecordDetail.sheetsAnalysis?.map((sa, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{sa.sheetName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sa.orientation === 'landscape'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {sa.orientation === 'landscape' ? 'A4 横向' : 'A4 纵向'}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          缩放: {sa.scale}% | {sa.repeatHeaders ? '跨页保留表头' : '单页'}
                        </div>
                      </div>
                      <p className="text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {sa.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => setViewRecordDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                关闭详情
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  修改管理员登录密码
                </h3>
                <p className="text-xs text-slate-500">
                  {mustChangePassword
                    ? '检测到当前仍为初始密码，为保障系统安全，建议立即修改'
                    : '设置新的管理后台密码'}
                </p>
              </div>
            </div>

            {changePassError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {changePassError}
              </div>
            )}

            {changePassSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{changePassSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  新密码 (至少 6 位字符)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  确认新密码
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                {!mustChangePassword && (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    取消
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  确认修改密码
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
