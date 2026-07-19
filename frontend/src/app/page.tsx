import Link from 'next/link';
import { Zap, Github, ArrowRight, Shield, Code, Cpu } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="z-10 text-center max-w-4xl">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-sm font-semibold mb-8">
          <Zap className="w-4 h-4" />
          <span>v1.0 Production-Ready</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-tight">
          AI Code Review <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            For Professionals
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          The autonomous AI reviewer that understands your codebase. 
          Powered by LangGraph, Mistral, and Repository-Aware RAG.
        </p>

        <div className="flex flex-col md:flex-row gap-6 justify-center">
          <Link 
            href="/dashboard"
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-2xl shadow-indigo-500/20 group"
          >
            Launch Dashboard
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a 
            href="http://localhost:8000/api/github/login/"
            className="px-8 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3"
          >
            <Github className="w-5 h-5" />
            Connect GitHub
          </a>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <FeatureCard 
            icon={Shield} 
            title="Security First" 
            description="Multi-agent security analysis detects vulnerabilities and secret leaks before they reach production." 
          />
          <FeatureCard 
            icon={Cpu} 
            title="Context-Aware" 
            description="Semantic code search using Qdrant ensures the AI knows your internal patterns and guidelines." 
          />
          <FeatureCard 
            icon={Code} 
            title="Clean Architecture" 
            description="Validates consistency, performance, and documentation with specialized specialized agents." 
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: any) {
  return (
    <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-xl">
      <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
        <Icon className="w-6 h-6 text-indigo-400" />
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
