"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  GitPullRequest, 
  ShieldAlert, 
  Zap, 
  Code2, 
  FileText, 
  BarChart3, 
  Settings,
  Search,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  X,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

const data = [
  { name: 'Mon', critical: 4, warning: 10, suggestion: 15 },
  { name: 'Tue', critical: 2, warning: 8, suggestion: 12 },
  { name: 'Wed', critical: 6, warning: 15, suggestion: 20 },
  { name: 'Thu', critical: 1, warning: 5, suggestion: 10 },
  { name: 'Fri', critical: 3, warning: 12, suggestion: 18 },
];

const agents = [
  { id: 'analyzer', name: 'PR Analyzer', status: 'idle', icon: GitPullRequest },
  { id: 'security', name: 'Security Review', status: 'idle', icon: ShieldAlert },
  { id: 'performance', name: 'Performance Review', status: 'idle', icon: Zap },
  { id: 'clean_code', name: 'Clean Code Agent', status: 'idle', icon: Code2 },
  { id: 'docs', name: 'Documentation Agent', status: 'idle', icon: FileText },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedReview, setSelectedReview] = useState<any | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [desktopFolders, setDesktopFolders] = useState<string[]>([]);
  const [desktopFiles, setDesktopFiles] = useState<string[]>([]);
  const [pickerPath, setPickerPath] = useState<string>('');
  const [pickerParent, setPickerParent] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState(agents.map(a => ({ ...a, status: 'idle' })));
  const [reviews, setReviews] = useState<any[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareIdA, setCompareIdA] = useState<string>('');
  const [compareIdB, setCompareIdB] = useState<string>('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Dynamic Severity Distribution Chart Data from actual reviews
  const chartData = [...reviews]
    .reverse() // Sort chronologically (oldest to newest) for line/area chart flow
    .slice(-7) // Take the last 7 reviews
    .map((r: any) => {
      const date = new Date(r.created_at);
      const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const label = r.pr_title || formattedDate;
      const shortLabel = label.length > 15 ? label.slice(0, 15) + '...' : label;
      return {
        name: shortLabel,
        critical: r.critical_issues || 0,
        warning: r.warning_issues || 0,
        suggestion: r.suggestion_issues || 0,
      };
    });

  const finalChartData = chartData.length > 0 ? chartData : [
    { name: 'Mon', critical: 4, warning: 10, suggestion: 15 },
    { name: 'Tue', critical: 2, warning: 8, suggestion: 12 },
    { name: 'Wed', critical: 6, warning: 15, suggestion: 20 },
    { name: 'Thu', critical: 1, warning: 5, suggestion: 10 },
    { name: 'Fri', critical: 3, warning: 12, suggestion: 18 },
  ];

  const fetchReviews = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/reviews/reviews/');
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.results || []);
      setReviews(list);
    } catch (error) {
      console.error('Failed to fetch reviews');
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstPath = (files[0] as any).webkitRelativePath as string;
    const folder = firstPath.split('/')[0];
    handleLocalReview(folder);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const fetchFolders = async (subpath: string = '') => {
    try {
      // Ensure subpath is always a plain string (guard against accidental object passing)
      const safePath = typeof subpath === 'string' ? subpath : '';
      const params = safePath ? `?path=${encodeURIComponent(safePath)}` : '';
      const url = `http://localhost:8000/api/github/list-folders/${params}`;
      const response = await fetch(url);
      const data = await response.json();
      setDesktopFolders(Array.isArray(data.folders) ? data.folders : []);
      setDesktopFiles(Array.isArray(data.files) ? data.files : []);
      setPickerPath(typeof data.current_path === 'string' ? data.current_path : '');
      // parent_path: null means we're at root; '' means go to root; string means go there
      setPickerParent(data.parent_path !== undefined ? String(data.parent_path ?? '') : null);
      setShowPicker(true);
    } catch (error) {
      alert("Could not fetch desktop folders. Make sure Docker is running.");
    }
  };

  const [scanMessage, setScanMessage] = useState('');

  const handleLocalReview = async (folderName: string) => {
    setShowPicker(false);
    setIsScanning(true);
    setScanMessage(`⚙️ AI agents started scanning "${folderName}"... Results appear in 2–5 min.`);

    const updateStatus = (id: string, status: string) => {
      setAgentStatuses(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    };

    // Reset all statuses and animate progress
    setAgentStatuses(agents.map(a => ({ ...a, status: 'idle' })));
    updateStatus('analyzer', 'working');

    const agentOrder = ['analyzer', 'security', 'performance', 'clean_code', 'docs'];
    const timers: ReturnType<typeof setTimeout>[] = [];
    agentOrder.forEach((id, i) => {
      timers.push(setTimeout(() => {
        if (i > 0) updateStatus(agentOrder[i - 1], 'completed');
        updateStatus(id, 'working');
      }, i * 40000));
    });

    try {
      // Fire scan — returns immediately with status: 'scanning'
      const response = await fetch('http://localhost:8000/api/github/scan-local/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderName }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server error');
      }

      // Poll every 15s for up to 10 minutes
      const initialCount = reviews.length;
      let attempts = 0;
      const maxAttempts = 40;

      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch('http://localhost:8000/api/reviews/reviews/');
          const list = await r.json();
          const items = Array.isArray(list) ? list : (list.results || []);
          setReviews(items);

          if (items.length > initialCount || attempts >= maxAttempts) {
            clearInterval(poll);
            timers.forEach(clearTimeout);
            agentOrder.forEach(id => updateStatus(id, 'completed'));
            setIsScanning(false);

            if (items.length > initialCount) {
              const latest = items[0];
              setScanMessage(`✅ Done! "${latest.pr_title}" — ${latest.total_issues} issue(s) found. Score: ${latest.overall_score}/100`);
            } else {
              setScanMessage('⚠️ Scan is taking longer than expected. Check back in a moment.');
            }
          }
        } catch (_) {}
      }, 15000);

    } catch (error: any) {
      timers.forEach(clearTimeout);
      setScanMessage(`❌ Failed to start scan: ${error?.message || 'Unknown error'}`);
      setIsScanning(false);
    }
  };

  const handleNewReview = () => {
    alert("New GitHub Review flow: Please connect your account first using the 'Connect GitHub' button on the landing page.");
  };

  const openReport = async (rev: any) => {
    // Fetch the full review detail (includes raw_response with all issues)
    try {
      const r = await fetch(`http://localhost:8000/api/reviews/reviews/${rev.id}/`);
      const detail = await r.json();
      setSelectedReview(detail);
    } catch {
      setSelectedReview(rev); // fallback to what we have
    }
  };

  // Analytics calculations
  const totalScans = reviews.length;
  const firstScan = reviews[reviews.length - 1];
  const latestScan = reviews[0];
  const initialScore = firstScan ? (firstScan.overall_score || 0) : 0;
  const currentScore = latestScan ? (latestScan.overall_score || 0) : 0;
  const scoreDiff = currentScore - initialScore;

  const scoreTrendData = [...reviews]
    .reverse()
    .slice(-10)
    .map((r) => ({
      name: `Scan #${r.id}`,
      Score: Math.round(r.overall_score || 0),
      Critical: r.critical_issues || 0,
      Warning: r.warning_issues || 0,
      Suggestion: r.suggestion_issues || 0,
    }));

  let totalCrits = 0;
  let totalWarns = 0;
  let totalSuggs = 0;
  reviews.forEach(r => {
    totalCrits += r.critical_issues || 0;
    totalWarns += r.warning_issues || 0;
    totalSuggs += r.suggestion_issues || 0;
  });

  const categoriesData = [
    { name: 'Critical', count: totalCrits, fill: '#ef4444' },
    { name: 'Warnings', count: totalWarns, fill: '#f59e0b' },
    { name: 'Suggestions', count: totalSuggs, fill: '#10b981' },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Report Detail Modal */}
      {selectedReview && (
        <ReportModal review={selectedReview} onClose={() => setSelectedReview(null)} />
      )}
      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 border-r border-slate-800 bg-slate-900 p-6 flex flex-col"
      >
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Antigravity</span>
        </div>

        <nav className="space-y-2 flex-1">
          <NavItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={GitPullRequest} label="Pull Requests" active={activeTab === 'prs'} onClick={() => setActiveTab('prs')} />
          <NavItem icon={BarChart3} label="Analytics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
          <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
            <div>
              <p className="text-sm font-medium">Abhay S.</p>
              <p className="text-xs text-slate-400">Pro Developer</p>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h1>
            <p className="text-slate-300">Automated AI code insights for your repositories.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search repos..." 
                className="bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
            </div>
            <button className="p-2 bg-slate-900 border border-slate-700 rounded-full text-slate-300 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
              onClick={openFilePicker}
              disabled={isScanning}
              className={`px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg font-medium transition-all ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Choose Folder/File
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              // @ts-ignore
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fetchFolders('')}
              disabled={isScanning}
              className={`px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg font-medium transition-all ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isScanning ? 'Scanning...' : 'Local Review'}
            </button>
              
              {showPicker && (
                <div className="absolute top-12 right-0 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* Header */}
                  <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {pickerParent !== null && (
                        <button onClick={() => fetchFolders(pickerParent!)} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white shrink-0">
                          ←
                        </button>
                      )}
                      <p className="text-xs font-bold text-slate-400 uppercase truncate">
                        {pickerPath ? `📂 ${pickerPath.split('/').pop()}` : '🖥️ Desktop'}
                      </p>
                    </div>
                    <button onClick={() => setShowPicker(false)} className="text-slate-500 hover:text-white text-xs shrink-0">✕</button>
                  </div>

                  {/* Scan current folder button */}
                  {pickerPath && (
                    <button
                      onClick={() => { handleLocalReview(pickerPath); setShowPicker(false); }}
                      className="w-full px-4 py-2.5 text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-b border-slate-800 transition-colors flex items-center gap-2"
                    >
                      <span>⚡</span> Scan this folder
                    </button>
                  )}

                  <div className="max-h-64 overflow-y-auto">
                    {/* Subfolders */}
                    {desktopFolders.map(folder => (
                      <button
                        key={folder}
                        onClick={() => fetchFolders(pickerPath ? `${pickerPath}/${folder}` : folder)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0 flex items-center gap-2"
                      >
                        <span className="text-base">📁</span>
                        <span className="truncate">{folder}</span>
                        <span className="ml-auto text-slate-600 text-xs">›</span>
                      </button>
                    ))}

                    {/* Code files in current folder */}
                    {desktopFiles.map(file => (
                      <button
                        key={file}
                        onClick={() => { handleLocalReview(pickerPath ? `${pickerPath}/${file}` : file); setShowPicker(false); }}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0 flex items-center gap-2 text-emerald-400"
                      >
                        <span className="text-base">📄</span>
                        <span className="truncate font-mono">{file}</span>
                      </button>
                    ))}

                    {desktopFolders.length === 0 && desktopFiles.length === 0 && (
                      <p className="p-4 text-sm text-slate-500 text-center">No folders or code files here.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={() => setShowCompareModal(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition-all"
            >
              Compare Scans
            </button>
            <button 
              onClick={handleNewReview}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20"
            >
              New Review
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          <>
            {/* Scan Status Banner */}
            {(isScanning || scanMessage) && (
              <div className={`mb-6 p-4 rounded-xl border text-sm font-medium ${
                isScanning 
                  ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300' 
                  : scanMessage.startsWith('✅') 
                    ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300'
                    : 'bg-red-900/30 border-red-500/50 text-red-300'
              }`}>
                {isScanning && <span className="inline-block animate-spin mr-2">⚙️</span>}
                {isScanning ? scanMessage : scanMessage}
              </div>
            )}
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-6 mb-10">
              <StatCard 
                label="Total Reviews" 
                value={String(reviews.length || 0)} 
                change={reviews.length > 0 ? `+${reviews.length}` : '0'} 
                icon={GitPullRequest} 
                color="indigo" 
              />
              <StatCard 
                label="Critical Issues" 
                value={String(reviews.reduce((sum: number, r: any) => sum + (r.critical_issues || 0), 0))} 
                change="live" 
                icon={ShieldAlert} 
                color="red" 
              />
              <StatCard 
                label="Average Score" 
                value={reviews.length > 0 
                  ? `${Math.round(reviews.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / reviews.length)}/100`
                  : '—/100'} 
                change="live" 
                icon={Zap} 
                color="amber" 
              />
              <StatCard 
                label="Reviews Today" 
                value={String(reviews.filter((r: any) => {
                  const d = new Date(r.created_at);
                  const today = new Date();
                  return d.toDateString() === today.toDateString();
                }).length)} 
                change="today" 
                icon={Clock} 
                color="emerald" 
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Charts */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm"
              >
                <h3 className="text-lg font-semibold mb-6">Severity Distribution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={finalChartData}>
                      <defs>
                        <linearGradient id="colorCrit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      />
                      <Area type="monotone" dataKey="critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCrit)" />
                      <Area type="monotone" dataKey="warning" stroke="#f59e0b" fill="transparent" />
                      <Area type="monotone" dataKey="suggestion" stroke="#10b981" fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Agents Status */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm"
              >
                <h3 className="text-lg font-semibold mb-6">AI Agents</h3>
                <div className="space-y-4">
                  {agentStatuses.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 rounded-lg">
                          <agent.icon className={`w-4 h-4 ${agent.status === 'completed' ? 'text-emerald-500' : 'text-slate-400'}`} />
                        </div>
                        <span className="text-sm font-medium text-slate-100">{agent.name}</span>
                      </div>
                      <span className={`flex h-2 w-2 rounded-full ${
                        agent.status === 'working' ? 'bg-indigo-500 animate-ping' : 
                        agent.status === 'completed' ? 'bg-emerald-500' : 
                        'bg-slate-600'
                      }`} />
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Recent Reviews */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-10 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-semibold">Recent Pull Requests</h3>
                <button className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">View All</button>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-semibold">Pull Request</th>
                    <th className="px-6 py-4 font-semibold">Repository</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Issues</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {reviews.length > 0 ? reviews.map((rev: any) => (
                    <ReviewRow 
                      key={rev.id}
                      title={rev.pr_title || 'Local Scan'} 
                      repo={rev.repo_name || 'local/scans'} 
                      status={rev.critical_issues > 0 ? 'critical' : 'completed'} 
                      issues={{ crit: rev.critical_issues || 0, warn: rev.warning_issues || 0, sugg: rev.suggestion_issues || 0 }} 
                      date={rev.created_at ? new Date(rev.created_at).toLocaleString() : 'Just now'}
                      onView={() => openReport(rev)}
                    />
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                        No reviews yet. Click "Choose Folder/File" to start your first scan!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </motion.div>
          </>
        ) : activeTab === 'analytics' ? (
          <div className="space-y-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <h2 className="text-xl font-black text-white">Vulnerability & Quality Analytics</h2>
              <p className="text-slate-400 text-xs mt-1">Deep analysis of scans, score progression, and compliance metrics.</p>
            </motion.div>

            {/* Metrics cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Score Development</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{Math.round(currentScore)}</span>
                  {scoreDiff !== 0 && (
                    <span className={`text-xs font-bold ${scoreDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {scoreDiff > 0 ? `+${Math.round(scoreDiff)}` : Math.round(scoreDiff)} since start
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Issues Scanned</p>
                <span className="text-2xl font-black text-white">{totalCrits + totalWarns + totalSuggs}</span>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Scans Completed</p>
                <span className="text-2xl font-black text-white">{totalScans}</span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Score Trend Card */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Vulnerability History (Score Trend)</h3>
                <div className="h-64">
                  {scoreTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scoreTrendData}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                        <YAxis domain={[0, 100]} stroke="#64748b" fontSize={9} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                        <Area type="monotone" dataKey="Score" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-600">No scan trend data yet.</div>
                  )}
                </div>
              </div>

              {/* Severity Breakdown Card */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Issues Severity breakdown</h3>
                <div className="h-64">
                  {totalScans > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoriesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-600">No category breakdown data.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Info className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">This section ({activeTab}) is under construction.</p>
            <p className="text-sm">Please return to the Dashboard for the latest AI insights.</p>
          </div>
        )}
      </main>
      {showCompareModal && (
        <CompareModal
          reviews={reviews}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon className={`w-5 h-5 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function StatCard({ label, value, change, icon: Icon, color }: any) {
  const colors: any = {
    indigo: 'text-indigo-500 bg-indigo-500/10',
    red: 'text-red-500 bg-red-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
  };

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm shadow-xl shadow-black/20"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
          {change}
        </span>
      </div>
      <p className="text-slate-400 text-sm font-medium mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
    </motion.div>
  );
}

function ReviewRow({ title, repo, status, issues, date, onView }: any) {
  const statusConfig: any = {
    completed: { color: 'text-emerald-500 bg-emerald-500/10', label: 'Healthy', icon: CheckCircle2 },
    critical: { color: 'text-red-500 bg-red-500/10', label: 'Action Required', icon: AlertTriangle },
    in_progress: { color: 'text-indigo-500 bg-indigo-500/10', label: 'Reviewing...', icon: Zap },
  };
  const config = statusConfig[status] || statusConfig.completed;

  return (
    <tr className="hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={onView}>
      <td className="px-6 py-5">
        <p className="font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors">{title}</p>
      </td>
      <td className="px-6 py-5">
        <span className="text-sm text-slate-400">{repo}</span>
      </td>
      <td className="px-6 py-5">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full w-fit ${config.color}`}>
          <config.icon className="w-3.5 h-3.5" />
          <span className="text-xs font-bold">{config.label}</span>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex gap-3">
          {issues.crit > 0 && <span className="flex items-center gap-1 text-red-500 font-bold text-xs"><ShieldAlert className="w-3 h-3" /> {issues.crit} critical</span>}
          {issues.warn > 0 && <span className="flex items-center gap-1 text-amber-500 font-bold text-xs"><AlertTriangle className="w-3 h-3" /> {issues.warn} warn</span>}
          {issues.sugg > 0 && <span className="flex items-center gap-1 text-emerald-500 font-bold text-xs"><Info className="w-3 h-3" /> {issues.sugg} sugg</span>}
          {issues.crit === 0 && issues.warn === 0 && issues.sugg === 0 && <span className="text-slate-500 text-xs">No issues</span>}
        </div>
      </td>
      <td className="px-6 py-5">
        <span className="text-xs text-slate-500">{date}</span>
      </td>
      <td className="px-6 py-5">
        <button className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          View Report <ChevronRight className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

function ReportModal({ review, onClose }: { review: any; onClose: () => void }) {
  const rawIssues: any[] = review?.issues || review?.raw_response?.issues || [];
  
  // Filter state for severity
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'warning' | 'suggestion'>('all');

  const severityOrder: any = { critical: 0, warning: 1, suggestion: 2 };
  
  const filteredIssues = rawIssues.filter((issue: any) => {
    const sev = (issue.severity || '').toLowerCase();
    if (activeFilter === 'all') return true;
    return sev === activeFilter;
  });

  const sorted = [...filteredIssues].sort((a, b) =>
    (severityOrder[a.severity?.toLowerCase()] ?? 3) - (severityOrder[b.severity?.toLowerCase()] ?? 3)
  );

  const severityStyle: any = {
    critical:   { badge: 'bg-red-500/20 text-red-400 border border-red-500/30',   dot: 'bg-red-500',    label: 'CRITICAL', text: 'text-red-400' },
    warning:    { badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', dot: 'bg-amber-500', label: 'WARNING', text: 'text-amber-400' },
    suggestion: { badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-500', label: 'SUGGESTION', text: 'text-emerald-400' },
  };

  const getCount = (sev: string) => {
    return rawIssues.filter((issue: any) => (issue.severity || '').toLowerCase() === sev).length;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex"
      style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="ml-auto w-full max-w-2xl h-full bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">{review.pr_title || 'Review Report'}</h2>
            <p className="text-slate-400 text-sm mt-1">{review.repo_name} · Score: <span className="text-indigo-400 font-bold">{review.overall_score}/100</span></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="p-6 border-b border-slate-800 bg-slate-800/30">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">AI Summary</h3>
          <p className="text-slate-200 text-sm leading-relaxed">{review.summary}</p>
          <div className="flex gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-red-400 text-xs font-semibold"><ShieldAlert className="w-3.5 h-3.5" /> {review.critical_issues || 0} Critical</span>
            <span className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> {review.warning_issues || 0} Warnings</span>
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold"><Info className="w-3.5 h-3.5" /> {review.suggestion_issues || 0} Suggestions</span>
          </div>
        </div>

        {/* Tabs for Filtering Severity */}
        <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex gap-2">
          <button 
            onClick={() => setActiveFilter('all')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            All ({rawIssues.length})
          </button>
          <button 
            onClick={() => setActiveFilter('critical')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === 'critical' ? 'bg-red-900/40 text-red-400 border border-red-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Critical ({getCount('critical')})
          </button>
          <button 
            onClick={() => setActiveFilter('warning')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === 'warning' ? 'bg-amber-900/40 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Warnings ({getCount('warning')})
          </button>
          <button 
            onClick={() => setActiveFilter('suggestion')} 
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === 'suggestion' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Suggestions ({getCount('suggestion')})
          </button>
        </div>

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Issues Found ({sorted.length})</h3>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-slate-600">
              <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-600" />
              <p className="text-sm font-medium text-slate-400">No issues detected</p>
              <p className="text-xs text-slate-500 mt-1">No issues match the selected severity filter.</p>
            </div>
          ) : sorted.map((issue: any, idx: number) => {
            const sev = (issue.severity || '').toLowerCase() || 'suggestion';
            const style = severityStyle[sev] || severityStyle.suggestion;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700 hover:bg-slate-800/60 transition-all shadow-md"
              >
                {/* Meta details header */}
                <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                    <span className="text-slate-300 text-sm font-semibold">{issue.category}</span>
                  </div>
                  {issue.file_name && (
                    <span className="text-xs text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                      {issue.file_name}{issue.line_number ? `:${issue.line_number}` : ''}
                    </span>
                  )}
                </div>
                
                {/* Issue Description */}
                <div className="mb-4">
                  <p className="text-slate-200 text-sm font-medium leading-relaxed">
                    {issue.description || issue.issue_description}
                  </p>
                </div>

                {/* Technical Explanation */}
                {issue.explanation && (
                  <div className="mb-4 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                    <p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">🔬 Tech Analysis</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{issue.explanation}</p>
                  </div>
                )}

                {/* Suggested Fix */}
                {issue.suggested_fix && (
                  <div className="mb-4 p-3 bg-indigo-950/20 rounded-lg border border-indigo-500/20">
                    <p className="text-xs font-bold text-indigo-400 mb-1 uppercase tracking-wider">💡 How to Fix</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{issue.suggested_fix}</p>
                  </div>
                )}

                {/* Improved Code Comparison Block */}
                {issue.improved_code && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <p className="text-xs font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">✨ Optimized Code</p>
                    <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto p-2 bg-slate-950/80 rounded max-h-48">
                      <code>{issue.improved_code}</code>
                    </pre>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <p className="text-xs text-slate-500">Scanned on {review.created_at ? new Date(review.created_at).toLocaleString() : 'Unknown'} · Powered by Mistral via Ollama</p>
          <a
            href={`/report/${review.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Full Report
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}


function CompareModal({ reviews, onClose }: { reviews: any[]; onClose: () => void }) {
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');
  const [comparison, setComparison] = useState<any | null>(null);

  const handleCompare = () => {
    const rA = reviews.find(r => String(r.id) === idA);
    const rB = reviews.find(r => String(r.id) === idB);
    if (!rA || !rB) return;

    const issuesA = rA.issues || rA.raw_response?.issues || [];
    const issuesB = rB.issues || rB.raw_response?.issues || [];

    const keysA = new Set(issuesA.map((i: any) => `${i.category}:${i.description || i.issue_description}`));
    const keysB = new Set(issuesB.map((i: any) => `${i.category}:${i.description || i.issue_description}`));

    const resolved = issuesA.filter((i: any) => !keysB.has(`${i.category}:${i.description || i.issue_description}`));
    const introduced = issuesB.filter((i: any) => !keysA.has(`${i.category}:${i.description || i.issue_description}`));

    const deltaScore = (rB.overall_score || 0) - (rA.overall_score || 0);

    setComparison({
      scoreA: rA.overall_score || 0,
      scoreB: rB.overall_score || 0,
      deltaScore,
      resolved,
      introduced,
      titleA: rA.pull_request?.title || rA.pr_title || `Scan #${rA.id}`,
      titleB: rB.pull_request?.title || rB.pr_title || `Scan #${rB.id}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl flex flex-col h-[600px] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Compare Scan History</h3>
            <p className="text-[10px] text-slate-400">Select two scans to analyze changes, improvements, and new issues.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Picker Row */}
        <div className="p-4 bg-slate-950/20 border-b border-slate-800/60 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Base Scan (Scan A)</label>
            <select
              value={idA}
              onChange={(e) => { setIdA(e.target.value); setComparison(null); }}
              className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">Select scan...</option>
              {reviews.map(r => (
                <option key={r.id} value={String(r.id)}>
                  #{r.id} - {r.pull_request?.title || r.pr_title || 'Scan'} ({new Date(r.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Target Scan (Scan B)</label>
            <select
              value={idB}
              onChange={(e) => { setIdB(e.target.value); setComparison(null); }}
              className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">Select scan...</option>
              {reviews.map(r => (
                <option key={r.id} value={String(r.id)}>
                  #{r.id} - {r.pull_request?.title || r.pr_title || 'Scan'} ({new Date(r.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCompare}
            disabled={!idA || !idB || idA === idB}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white rounded-lg transition-colors"
          >
            Compare Now
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {!comparison ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Zap className="w-12 h-12 mb-3 opacity-20 text-indigo-400" />
              <p className="text-sm font-semibold">Select two different scans above to run comparison.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Score ring delta row */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-around gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-slate-300">{Math.round(comparison.scoreA)}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Base Score</p>
                </div>
                <div className="text-4xl text-slate-700">→</div>
                <div>
                  <p className="text-2xl font-black text-indigo-400">{Math.round(comparison.scoreB)}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Target Score</p>
                </div>
                <div className="h-10 w-[1px] bg-slate-800 hidden sm:block" />
                <div>
                  <p className={`text-3xl font-black ${
                    comparison.deltaScore > 0 ? 'text-emerald-400' : comparison.deltaScore < 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {comparison.deltaScore > 0 ? `+${Math.round(comparison.deltaScore)}` : Math.round(comparison.deltaScore)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Score Delta</p>
                </div>
              </div>

              {/* Breakdown lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Resolved column */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-emerald-400 pb-2 border-b border-emerald-500/20 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Resolved Issues ({comparison.resolved.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {comparison.resolved.map((issue: any, idx: number) => (
                      <div key={idx} className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs">
                        <p className="font-semibold text-emerald-400 mb-0.5">{issue.category}</p>
                        <p className="text-slate-300 mb-1">{issue.description || issue.issue_description}</p>
                        {issue.file_name && <p className="text-[10px] text-slate-500 font-mono">{issue.file_name.split('/').pop()}</p>}
                      </div>
                    ))}
                    {comparison.resolved.length === 0 && (
                      <p className="text-xs text-slate-500 italic py-4">No issues resolved between these scans.</p>
                    )}
                  </div>
                </div>

                {/* Introduced column */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-red-400 pb-2 border-b border-red-500/20 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    New Issues Introduced ({comparison.introduced.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {comparison.introduced.map((issue: any, idx: number) => (
                      <div key={idx} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-xs">
                        <p className="font-semibold text-red-400 mb-0.5">{issue.category}</p>
                        <p className="text-slate-300 mb-1">{issue.description || issue.issue_description}</p>
                        {issue.file_name && <p className="text-[10px] text-slate-500 font-mono">{issue.file_name.split('/').pop()}</p>}
                      </div>
                    ))}
                    {comparison.introduced.length === 0 && (
                      <p className="text-xs text-slate-500 italic py-4">No new issues introduced.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

