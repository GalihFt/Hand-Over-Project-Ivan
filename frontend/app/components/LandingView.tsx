"use client";

import { AppMode } from '@/types';

interface LandingViewProps {
  onSelectMode: (mode: AppMode) => void;
}

export default function LandingView({ onSelectMode }: LandingViewProps) {
  return (
    <div className="max-w-4xl mx-auto mt-16 animate-in fade-in slide-in-from-bottom-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-slate-800 mb-4">
          Sistem Optimasi<span className="text-blue-600"> Roundtrip</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div
          onClick={() => onSelectMode('planning')}
          className="group bg-white p-8 rounded-2xl shadow-lg border-2 border-slate-100 hover:border-violet-500 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
        >
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-violet-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>

          <h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-violet-600 transition-colors">
            Planning Bongkar Muat
          </h3>

          <p className="text-slate-500 mb-4">
            Input rencana bongkar muat untuk optimasi roundtrip via upload, copy-paste, atau manual
          </p>

          <div className="mt-6 flex items-center text-violet-600 font-semibold">
            Mulai Planning
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </div>

        <div
          onClick={() => onSelectMode('simulation')}
          className="group bg-white p-8 rounded-2xl shadow-lg border-2 border-slate-100 hover:border-violet-500 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
        >
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-violet-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-violet-600 transition-colors">
            Simulasi
          </h3>

          <p className="text-slate-500 mb-4">
            Upload file hasil mapping yang sudah ada untuk visualisasi hasil
          </p>

          <div className="mt-6 flex items-center text-violet-600 font-semibold">
            Upload Hasil Mapping
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
