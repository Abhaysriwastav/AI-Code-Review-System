"use client";

import React, { useState, useEffect } from 'react';
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
  const [showPicker, setShowPicker] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState(agents.map(a => ({ ...a, status: 'idle' })));
  const [reviews, setReviews] = useState<any[]>([]);

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

  const fetchFolders = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/github/list-folders/');
      const data = await response.json();
      setDesktopFolders(data.folders || []);
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
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFileSelect}
            />
            <button
              onClick={fetchFolders}
              disabled={isScanning}
              className={`px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg font-medium transition-all ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isScanning ? 'Scanning...' : 'Local Review'}
            </button>
              
              {showPicker && (
                <div className="absolute top-12 right-0 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-800 bg-slate-800/50">
                    <p className="text-xs font-bold text-slate-400 uppercase">Select Folder from Desktop</p>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {desktopFolders.length > 0 ? desktopFolders.map(folder => (
                      <button 
                        key={folder}
                        onClick={() => handleLocalReview(folder)}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-500/10 hover:text-indigo-400 transition-colors border-b border-slate-800/50 last:border-0"
                      >
                        {folder}
                      </button>
                    )) : (
                      <p className="p-4 text-sm text-slate-500">No folders found on Desktop.</p>
                    )}
                  </div>
                  <button 
                    onClick={() => setShowPicker(false)}
                    className="w-full p-2 text-xs text-slate-500 hover:text-white bg-slate-950/50"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
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
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Info className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">This section ({activeTab}) is under construction.</p>
            <p className="text-sm">Please return to the Dashboard for the latest AI insights.</p>
          </div>
        )}
      </main>
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
  const rawIssues: any[] = review?.raw_response?.issues || [];
  const severityOrder: any = { critical: 0, warning: 1, suggestion: 2 };
  const sorted = [...rawIssues].sort((a, b) =>
    (severityOrder[a.severity?.toLowerCase()] ?? 3) - (severityOrder[b.severity?.toLowerCase()] ?? 3)
  );

  const severityStyle: any = {
    critical:   { badge: 'bg-red-500/20 text-red-400 border border-red-500/30',   dot: 'bg-red-500',    label: 'CRITICAL' },
    warning:    { badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', dot: 'bg-amber-500', label: 'WARNING' },
    suggestion: { badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-500', label: 'SUGGESTION' },
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

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Issues Found ({sorted.length})</h3>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-600">
              <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-600" />
              <p className="text-sm font-medium text-slate-400">No issues detected</p>
              <p className="text-xs text-slate-500 mt-1">The AI agents found no problems in this codebase.</p>
            </div>
          ) : sorted.map((issue: any, idx: number) => {
            const sev = issue.severity?.toLowerCase() || 'suggestion';
            const style = severityStyle[sev] || severityStyle.suggestion;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                    <span className="text-slate-300 text-sm font-semibold">{issue.category}</span>
                  </div>
                  {issue.file_name && (
                    <span className="text-xs text-slate-500 font-mono shrink-0">
                      {issue.file_name}{issue.line_number ? `:${issue.line_number}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{issue.issue_description}</p>
                {issue.suggested_fix && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-700">
                    <p className="text-xs font-bold text-indigo-400 mb-1">💡 Suggested Fix</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{issue.suggested_fix}</p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <p className="text-xs text-slate-500 text-center">Scanned on {review.created_at ? new Date(review.created_at).toLocaleString() : 'Unknown'} · Powered by Mistral via Ollama</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
