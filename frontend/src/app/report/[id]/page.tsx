"use client";
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Zap,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileCode2,
  Lightbulb,
  Code2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  MessageSquare,
  Send,
  X,
  FileText,
  Filter
} from 'lucide-react';

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="print:w-20 print:h-20">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
      <motion.circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="22" fontWeight="bold">{Math.round(score)}</text>
      <text x="60" y="74" textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10">/100</text>
    </svg>
  );
}

export default function FullReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtering states
  const [selectedFileFilter, setSelectedFileFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'warning' | 'suggestion'>('all');
  
  // Interactive Chat states
  const [chatIssue, setChatIssue] = useState<any | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`http://localhost:8000/api/reviews/reviews/${id}/`)
      .then((res) => {
        if (!res.ok) throw new Error('Review not found');
        return res.json();
      })
      .then((data) => {
        setReview(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading full report...</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-white font-bold text-lg mb-2">Report not found</p>
          <p className="text-slate-400 text-sm mb-6">{error || 'This review does not exist.'}</p>
          <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const rawIssues: any[] = review?.issues || review?.raw_response?.issues || [];

  // Extract unique files
  const uniqueFiles = ['all', ...Array.from(new Set(rawIssues.map((i: any) => i.file_name).filter(Boolean)))];

  // Filter Issues
  const filteredIssues = rawIssues.filter((issue: any) => {
    const sev = (issue.severity || '').toLowerCase();
    const severityMatches = activeFilter === 'all' || sev === activeFilter;
    const fileMatches = selectedFileFilter === 'all' || issue.file_name === selectedFileFilter;
    return severityMatches && fileMatches;
  });

  const criticals = filteredIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'critical');
  const warnings  = filteredIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'warning');
  const suggestions = filteredIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'suggestion');

  // Total counts before file filtering (for tabs)
  const totalCrits = rawIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'critical').length;
  const totalWarns = rawIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'warning').length;
  const totalSuggs = rawIssues.filter((i: any) => (i.severity || '').toLowerCase() === 'suggestion').length;

  // Collect refactored snippets from currently filtered list
  const refactoredSnippets = filteredIssues
    .filter((i: any) => i.improved_code)
    .map((i: any) => ({ category: i.category, code: i.improved_code, file_name: i.file_name }));

  // Export handlers
  const downloadMarkdown = () => {
    let md = `# Code Review Report: ${review.pr_title || 'Local Scan'}\n\n`;
    md += `- **Score**: ${Math.round(review.overall_score)}/100\n`;
    md += `- **Repository/Path**: ${review.repo_name || 'local/scans'}\n`;
    md += `- **Scanned On**: ${new Date(review.created_at).toLocaleString()}\n\n`;
    md += `## AI Executive Summary\n${review.summary}\n\n`;
    md += `## Issues Catalog\n\n`;
    
    rawIssues.forEach((issue, idx) => {
      md += `### ${idx + 1}. [${(issue.severity || 'SUGGESTION').toUpperCase()}] ${issue.category}\n`;
      md += `- **File**: ${issue.file_name}:${issue.line_number}\n`;
      md += `- **Description**: ${issue.description || issue.issue_description}\n`;
      if (issue.explanation) md += `- **Risk/Technical Analysis**: ${issue.explanation}\n`;
      if (issue.suggested_fix) md += `- **Solution**: ${issue.suggested_fix}\n`;
      if (issue.improved_code) {
        md += `\n\`\`\`python\n${issue.improved_code}\n\`\`\`\n`;
      }
      md += `\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Code_Review_Report_${review.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPatch = (issue: any) => {
    const patchContent = `diff --git a/${issue.file_name} b/${issue.file_name}
--- a/${issue.file_name}
+++ b/${issue.file_name}
@@ -${issue.line_number || 1},1 +${issue.line_number || 1},1 @@
+${issue.improved_code}
`;
    const blob = new Blob([patchContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${issue.file_name.split('/').pop()}_fix.patch`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !chatIssue) return;

    const userQuery = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { sender: 'user', text: userQuery }]);
    setChatLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/github/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_snippet: chatIssue.improved_code || chatIssue.description || '',
          issue_description: chatIssue.description || chatIssue.issue_description || '',
          user_message: userQuery,
          history: []
        })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { sender: 'ai', text: data.response || 'No response received' }]);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { sender: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const scoreColor = (review.overall_score || 0) >= 80 ? 'text-emerald-400' : (review.overall_score || 0) >= 60 ? 'text-amber-400' : 'text-red-400';

  const severityStyle: any = {
    critical: {
      badge: 'bg-red-500/20 text-red-400 border border-red-500/30',
      card: 'border-red-500/20 bg-red-500/5',
      label: 'CRITICAL',
      icon: ShieldAlert,
      iconColor: 'text-red-400',
    },
    warning: {
      badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      card: 'border-amber-500/20 bg-amber-500/5',
      label: 'WARNING',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
    },
    suggestion: {
      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      card: 'border-emerald-500/20 bg-emerald-500/5',
      label: 'SUGGESTION',
      icon: Info,
      iconColor: 'text-emerald-400',
    },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col print:bg-white print:text-black">
      {/* ── Sticky Top Nav ── */}
      <div className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between print:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={downloadMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Markdown
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">AI Code Review</span>
          </div>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="max-w-6xl mx-auto px-6 py-12 flex-1 w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* ── Left Sidebar Filter (Hidden on Print) ── */}
        <div className="lg:col-span-1 print:hidden">
          <div className="sticky top-20 bg-slate-900/50 border border-slate-850 p-5 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 text-slate-300">
              <Filter className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-black uppercase tracking-wider">File Filter</h3>
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-2">
              {uniqueFiles.map((fileName) => (
                <button
                  key={fileName}
                  onClick={() => setSelectedFileFilter(fileName)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium truncate block transition-all ${
                    selectedFileFilter === fileName
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {fileName === 'all' ? 'All Scanned Files' : fileName.split('/').pop()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main Catalog / Issues list ── */}
        <div className="lg:col-span-3 space-y-10 print:col-span-4">
          {/* Title Block */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2 print:text-indigo-600">Code Review Report</p>
            <h1 className="text-4xl font-black text-white print:text-black mb-2">{review.pr_title || 'Local Scan'}</h1>
            <p className="text-slate-400 text-sm print:text-slate-600">
              Detailed security, performance, and code quality breakdown for{' '}
              <span className="text-slate-300 print:text-slate-900 font-mono">{review.repo_name || 'the codebase'}</span>.
            </p>
            <p className="text-slate-600 text-xs mt-2 print:text-slate-500">
              Scanned on {new Date(review.created_at).toLocaleString()} · ID #{review.id}
            </p>
          </motion.div>

          <hr className="border-slate-800 print:border-slate-300" />

          {/* Stats & Score */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 items-center">
            <div className="flex flex-col items-center">
              <ScoreRing score={review.overall_score || 0} />
              <p className="text-xs text-slate-500 mt-2 font-medium print:text-slate-700">Overall Score</p>
            </div>
            <div className="sm:col-span-3 grid grid-cols-3 gap-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
                <ShieldAlert className="w-5 h-5 text-red-400 mx-auto mb-2" />
                <p className="text-2xl font-black text-red-400">{totalCrits}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Critical</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
                <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-black text-amber-400">{totalWarns}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Warnings</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                <Info className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-black text-emerald-400">{totalSuggs}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Suggestions</p>
              </div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6 print:border-slate-350 print:bg-slate-50">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-indigo-400 print:text-indigo-600" />
              <h2 className="text-sm font-bold text-indigo-400 print:text-indigo-700 uppercase tracking-wider">Executive Summary</h2>
            </div>
            <p className="text-slate-200 print:text-slate-800 text-sm leading-relaxed">{review.summary}</p>
          </div>

          {/* Filtering tabs */}
          <div className="flex gap-2 flex-wrap print:hidden">
            {[
              { key: 'all', label: `All Issues`, count: rawIssues.length, color: 'bg-indigo-600 text-white' },
              { key: 'critical', label: 'Critical', count: totalCrits, color: 'bg-red-900/40 text-red-400 border border-red-500/30' },
              { key: 'warning', label: 'Warning', count: totalWarns, color: 'bg-amber-900/40 text-amber-400 border border-amber-500/30' },
              { key: 'suggestion', label: 'Suggestion', count: totalSuggs, color: 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/30' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeFilter === tab.key ? tab.color : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Catalog Listing */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-900 print:border-slate-200">
              <h2 className="text-lg font-black text-white print:text-black">Issues Catalog</h2>
              <span className="text-xs text-slate-500">
                Filtered: {filteredIssues.length} of {rawIssues.length}
              </span>
            </div>

            {filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-slate-850 rounded-2xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-slate-400">No issues match the selected filters</p>
              </div>
            ) : (
              filteredIssues.map((issue, idx) => {
                const sev = (issue.severity || '').toLowerCase() || 'suggestion';
                const style = severityStyle[sev] || severityStyle.suggestion;
                const IssueIcon = style.icon;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`border rounded-2xl p-6 ${style.card} print:bg-white print:border-slate-300 print:text-black`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-900 print:bg-slate-100 shrink-0">
                          <IssueIcon className={`w-5 h-5 ${style.iconColor}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                            <span className="text-white print:text-black font-semibold text-sm">{issue.category}</span>
                            {issue.compliance_tag && (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-950/40 border border-indigo-500/30 text-indigo-400">
                                🛡️ {issue.compliance_tag}
                              </span>
                            )}
                          </div>
                          {issue.file_name && (
                            <span className="text-xs text-slate-500 font-mono">
                              {issue.file_name}{issue.line_number ? `:${issue.line_number}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 print:hidden">
                        <button
                          onClick={() => setChatIssue(issue)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition-all"
                        >
                          <MessageSquare className="w-3 h-3 text-indigo-400" />
                          Ask AI
                        </button>
                      </div>
                    </div>

                    {/* Desc / Explanation / Suggested Fix */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400 print:text-slate-600 uppercase tracking-widest mb-1">Description</p>
                        <p className="text-sm text-slate-200 print:text-black leading-relaxed">{issue.description || issue.issue_description}</p>
                      </div>

                      {issue.explanation && (
                        <div className="p-4 bg-red-950/15 border border-red-500/10 rounded-xl print:bg-slate-50 print:border-slate-200">
                          <p className="text-[10px] font-black text-red-400 print:text-red-600 uppercase tracking-wider mb-1">Risk Analysis</p>
                          <p className="text-xs text-slate-300 print:text-slate-700 leading-relaxed">{issue.explanation}</p>
                        </div>
                      )}

                      {issue.suggested_fix && (
                        <div className="p-4 bg-indigo-950/15 border border-indigo-500/10 rounded-xl print:bg-slate-50 print:border-slate-200">
                          <p className="text-[10px] font-black text-indigo-400 print:text-indigo-600 uppercase tracking-wider mb-1">Solution</p>
                          <p className="text-xs text-slate-300 print:text-slate-700 leading-relaxed">{issue.suggested_fix}</p>
                        </div>
                      )}

                      {issue.improved_code && (
                        <div className="p-4 bg-slate-950 border border-emerald-500/10 rounded-xl print:bg-slate-50 print:border-slate-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Optimized Code</span>
                            <button
                              onClick={() => downloadPatch(issue)}
                              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white border border-slate-800 px-2 py-0.5 rounded hover:bg-slate-900 print:hidden transition-all"
                            >
                              <Download className="w-2.5 h-2.5" />
                              Download Patch
                            </button>
                          </div>
                          <pre className="text-[11px] font-mono text-emerald-300 print:text-emerald-800 overflow-x-auto p-2">
                            <code>{issue.improved_code}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Secure Refactored Implementation section */}
          {refactoredSnippets.length > 0 && (
            <div className="mt-16 print:break-before-page">
              <hr className="border-slate-800 print:border-slate-300 mb-8" />
              <h2 className="text-xl font-black text-white print:text-black mb-2">Consolidated Refactored Code</h2>
              <p className="text-slate-400 print:text-slate-600 text-sm mb-6">
                Below are all optimized replacements generated for this file/scan.
              </p>
              <div className="space-y-6">
                {refactoredSnippets.map((snippet, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden print:border-slate-200">
                    <div className="flex items-center justify-between px-5 py-3 bg-slate-900 print:bg-slate-50 border-b border-slate-800 print:border-slate-200">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{snippet.category}</span>
                      {snippet.file_name && <span className="text-[10px] text-slate-500 font-mono">{snippet.file_name.split('/').pop()}</span>}
                    </div>
                    <pre className="p-5 text-[11px] font-mono text-emerald-300 print:text-emerald-800 overflow-x-auto leading-relaxed">
                      <code>{snippet.code}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-8 border-t border-slate-900 print:border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>Powered by Mistral via Ollama · AI Code Review Platform</span>
            <button onClick={() => router.back()} className="text-slate-500 hover:text-white print:hidden">
              Back to Dashboard
            </button>
          </div>
        </div>

      </div>

      {/* ── "Ask AI" Modal Overlay ── */}
      <AnimatePresence>
        {chatIssue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl flex flex-col h-[500px] overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-850 bg-slate-950/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Chat with AI Code Reviewer</h3>
                  <p className="text-[10px] text-slate-400 truncate w-80">{chatIssue.category} : {chatIssue.file_name}</p>
                </div>
                <button onClick={() => { setChatIssue(null); setChatHistory([]); }} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-indigo-950/20 border border-indigo-500/10 p-3 rounded-xl text-xs text-slate-300 leading-relaxed">
                  Hi! I'm your AI Review assistant. Ask me questions about this finding, such as:
                  <ul className="list-disc pl-4 mt-1.5 space-y-1">
                    <li>"Why is this issue critical?"</li>
                    <li>"Can you show a different way to refactor this?"</li>
                    <li>"How do I apply this change in Python?"</li>
                  </ul>
                </div>

                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-750'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-750 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleChatSubmit} className="p-4 border-t border-slate-850 bg-slate-950/30 flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatMessage.trim()}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
