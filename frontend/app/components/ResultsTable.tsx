"use client";

import { useMemo, useState } from 'react';
import { OptimizationResult, CabangStats, AppMode } from '@/types';
import { formatNumber, formatRupiah } from '@/utils/formatters';
import StatusBadge from './StatusBadge';
import CabangFilter from './CabangFilter';

interface ResultsTableProps {
  results: OptimizationResult[];
  filteredResults: OptimizationResult[];
  cabangStats: CabangStats[];
  uniqueCabangs: string[];
  selectedCabang: string;
  onSelectCabang: (cabang: string) => void;
  onViewDetail: (item: OptimizationResult) => void;
  onBackToUpload: () => void;
  appMode?: AppMode | null;
}

export default function ResultsTable({
  results,
  filteredResults,
  cabangStats,
  uniqueCabangs,
  selectedCabang,
  onSelectCabang,
  onViewDetail,
  onBackToUpload,
  appMode,
}: ResultsTableProps) {
  type SortKey =
    | 'DEST_ID'
    | 'ORIG_ID'
    | 'CABANG'
    | 'WAKTU_BONGKAR_ASLI'
    | 'WAKTU_MUAT_ASLI'
    | 'SAVING_KM'
    | 'SAVING_COST'
    | 'GAP_WAKTU_ASLI'
    | 'SCORE_FINAL';

  const [sortKey, setSortKey] = useState<SortKey>('SCORE_FINAL');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedKategori, setSelectedKategori] = useState<string>('all');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'SCORE_FINAL' ? 'desc' : 'asc');
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(filteredResults.map(r => r.STATUS).filter(Boolean))).sort(),
    [filteredResults]
  );

  const kategoriOptions = useMemo(
    () => Array.from(new Set(filteredResults.map(r => r.KATEGORI_POOL).filter(Boolean))).sort(),
    [filteredResults]
  );

  const filteredByStatusKategori = useMemo(() => {
    return filteredResults.filter((row) => {
      const statusOk = selectedStatus === 'all' || row.STATUS === selectedStatus;
      const kategoriOk = selectedKategori === 'all' || row.KATEGORI_POOL === selectedKategori;
      return statusOk && kategoriOk;
    });
  }, [filteredResults, selectedStatus, selectedKategori]);

  const sortedResults = useMemo(() => {
    const rows = [...filteredByStatusKategori];
    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;

      const numericKeys: SortKey[] = ['SAVING_KM', 'SAVING_COST', 'GAP_WAKTU_ASLI', 'SCORE_FINAL'];
      if (numericKeys.includes(sortKey)) {
        const av = Number(a[sortKey] ?? 0);
        const bv = Number(b[sortKey] ?? 0);
        return (av - bv) * dir;
      }

      if (sortKey === 'WAKTU_BONGKAR_ASLI' || sortKey === 'WAKTU_MUAT_ASLI') {
        const at = new Date(String(a[sortKey] ?? '')).getTime() || 0;
        const bt = new Date(String(b[sortKey] ?? '')).getTime() || 0;
        return (at - bt) * dir;
      }

      const av = String(a[sortKey] ?? '').toUpperCase();
      const bv = String(b[sortKey] ?? '').toUpperCase();
      return av.localeCompare(bv) * dir;
    });
    return rows;
  }, [filteredByStatusKategori, sortDir, sortKey]);

  const SortableTh = ({ label, keyName, align = '' }: { label: string; keyName: SortKey; align?: string }) => (
    <th className={`px-6 py-4 ${align}`}>
      <button
        type="button"
        onClick={() => handleSort(keyName)}
        className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
      >
        <span>{label}</span>
        <span className="text-[10px]">
          {sortKey === keyName ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  const currentStats = (() => {
    if (selectedCabang === 'all') {
      return cabangStats.reduce(
        (acc, curr) => ({
          total_origin: acc.total_origin + curr.total_origin,
          total_dest: acc.total_dest + curr.total_dest,
          match: acc.match + curr.match,
        }),
        { total_origin: 0, total_dest: 0, match: 0 }
      );
    } else {
      const s = cabangStats.find(c => c.cabang === selectedCabang);
      return s || { total_origin: 0, total_dest: 0, match: 0 };
    }
  })();

  const successRate =
    Math.min(currentStats.total_origin, currentStats.total_dest) > 0
      ? Math.round((currentStats.match / Math.min(currentStats.total_origin, currentStats.total_dest)) * 100)
      : 0;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 transition-all">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-600/70 font-medium mb-1">Target Pasangan (Data Awal)</div>
              <div className="text-2xl font-bold text-blue-700">
                {formatNumber(Math.min(currentStats.total_origin, currentStats.total_dest))}
              </div>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex items-center justify-between">
            <div>
              <div className="text-sm text-purple-600/70 font-medium mb-1">Berhasil Mapping</div>
              <div className="text-2xl font-bold text-purple-700">
                {formatNumber(currentStats.match)}
              </div>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
            <div>
              <div className="text-sm text-emerald-600/70 font-medium mb-1">Success Rate</div>
              <div className="text-2xl font-bold text-emerald-700">
                {successRate}%
              </div>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Hasil Optimasi
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
              {filteredResults.length} Rute Match
            </span>
          </h2>
        </div>

        <button
          onClick={onBackToUpload}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {appMode === 'simulation' ? 'Kembali ke Menu' : 'Reset & Mapping Ulang'}
        </button>
      </div>

      {uniqueCabangs.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => onSelectCabang('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCabang === 'all'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
          >
            Semua Cabang
          </button>

          {cabangStats.map((stat) => (
            <button
              key={stat.cabang}
              onClick={() => onSelectCabang(stat.cabang)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${selectedCabang === stat.cabang
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              {stat.cabang}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${selectedCabang === stat.cabang ? 'bg-blue-500/30 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                {stat.match} ({Math.min(stat.total_origin, stat.total_dest) > 0 ? Math.round((stat.match / Math.min(stat.total_origin, stat.total_dest)) * 100) : 0}%)
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-500 font-semibold">Filter Status & Kategori:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white"
          >
            <option value="all">Semua Status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={selectedKategori}
            onChange={(e) => setSelectedKategori(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white"
          >
            <option value="all">Semua Kategori</option>
            {kategoriOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setSelectedStatus('all'); setSelectedKategori('all'); }}
            className="px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Reset
          </button>
          <span className="text-slate-400">Menampilkan {sortedResults.length} dari {filteredResults.length} baris</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">ID SOPT Destination</th>
                <th className="px-6 py-4">Cust ID Dest</th>
                <th className="px-6 py-4">ID SOPT Origin</th>
                <th className="px-6 py-4">Cust ID Orig</th>
                <SortableTh label="Cabang" keyName="CABANG" />
                <SortableTh label="Waktu Bongkar" keyName="WAKTU_BONGKAR_ASLI" />
                <SortableTh label="Waktu Muat" keyName="WAKTU_MUAT_ASLI" />
                <th className="px-6 py-4">Status & Kategori</th>
                <SortableTh label="Saving KM" keyName="SAVING_KM" />
                <SortableTh label="Saving Cost" keyName="SAVING_COST" />
                <SortableTh label="Gap Waktu" keyName="GAP_WAKTU_ASLI" />
                <SortableTh label="Score Final" keyName="SCORE_FINAL" />
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedResults.map((row, idx) => (
                <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{row.DEST_ID}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200 font-mono">
                      {row.DEST_CUST_ID || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{row.ORIG_ID}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                      {row.ORIG_CUST_ID || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                      {row.CABANG}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{row.WAKTU_BONGKAR_ASLI}</td>
                  <td className="px-6 py-4 text-slate-600">{row.WAKTU_MUAT_ASLI}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={row.KATEGORI_POOL || row.STATUS} />
                    <div className="text-xs text-slate-400 mt-1 font-mono">{row.STATUS}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 font-mono">{formatNumber(row.SAVING_KM)} km</td>
                  <td className="px-6 py-4 text-slate-700 font-mono">{formatRupiah(row.SAVING_COST)}</td>
                  <td className="px-6 py-4 text-slate-700 font-mono">{formatNumber(row.GAP_WAKTU_ASLI)} jam</td>
                  <td className="px-6 py-4 text-slate-700 font-mono">{formatNumber(row.SCORE_FINAL)}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => onViewDetail(row)}
                      className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-all"
                    >
                      Lihat Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
