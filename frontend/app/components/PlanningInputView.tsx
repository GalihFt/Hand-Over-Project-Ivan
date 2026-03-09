"use client";

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { PlanningRow, DataValidationResult, FullValidationResult } from '@/types';
import DataPreviewEditor from './DataPreviewEditor';

const REQUIRED_COLUMNS = ['NO SOPT', 'SIZE CONT', 'GRADE CONT', 'OPS DELIVERY TIME', 'CUST ID', 'CABANG', 'ALAMAT', 'SERVICE TYPE'];

type InputTab = 'upload' | 'paste' | 'manual';

interface PlanningInputViewProps {
    onSubmitData: (destData: PlanningRow[], origData: PlanningRow[], excludeWarnings: boolean) => void;
    onBackToLanding: () => void;
    loading: boolean;
}

function normalizeColumnName(raw: string): string {
    const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');
    const aliases: Record<string, string> = {
        'NOMOR SOPT': 'NO SOPT',
        'NO_SOPT': 'NO SOPT',
        'NOSOPT': 'NO SOPT',
        'NO CONTAINER': 'NO CONTAINER',
        'NO_CONTAINER': 'NO CONTAINER',
        'CONTAINER NO': 'NO CONTAINER',
        'CONTAINER_NO': 'NO CONTAINER',
        'VES VOY': 'VESVOY',
        'VES_VOY': 'VESVOY',
        'BONGKAR_FXD': 'BONGKAR FXD',
        'BONGKAR FIXED': 'BONGKAR FXD',
        'CUSTOMER ID': 'CUST ID',
        'CUSTOMER_ID': 'CUST ID',
        'CUSTID': 'CUST ID',
        'ADDRESS': 'ALAMAT',
        'LONG': 'LONGITUDE',
        'LON': 'LONGITUDE',
        'LNG': 'LONGITUDE',
        'LONGITUDE': 'LONGITUDE',
        'LAT': 'LATITUDE',
        'LATITUDE': 'LATITUDE',
        'SIZE': 'SIZE CONT',
        'SIZE_CONT': 'SIZE CONT',
        'ACT LOAD DATE': 'OPS DELIVERY TIME',
        'ACT_LOAD_DATE': 'OPS DELIVERY TIME',
        'ACTUAL LOAD DATE': 'OPS DELIVERY TIME',
        'LOAD DATE': 'OPS DELIVERY TIME',
        'ACT. LOAD DATE': 'OPS DELIVERY TIME',
        'OPS DELIVERY TIME': 'OPS DELIVERY TIME',
        'OPS_DELIVERY_TIME': 'OPS DELIVERY TIME',
        'SERVICE_TYPE': 'SERVICE TYPE',
        'SERVICETYPE': 'SERVICE TYPE',
        'GRADE_CONT': 'GRADE CONT',
        'GRADECONT': 'GRADE CONT',
    };
    return aliases[cleaned] || cleaned;
}

function parseExcelDate(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
        try {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) {
                const pad = (n: number) => n.toString().padStart(2, '0');
                return `${date.y}-${pad(date.m)}-${pad(date.d)}T${pad(date.H)}:${pad(date.M)}`;
            }
        } catch { }
    }
    const str = String(value).trim();
    if (!str) return '';

    const pad = (n: number) => n.toString().padStart(2, '0');

    const ddmmyyyy = str.match(
        /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10);
        const year = parseInt(ddmmyyyy[3], 10);
        const hour = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 0;
        const min = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}`;
        }
    }

    const iso = str.match(
        /^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (iso) {
        const year = parseInt(iso[1], 10);
        const month = parseInt(iso[2], 10);
        const day = parseInt(iso[3], 10);
        const hour = iso[4] ? parseInt(iso[4], 10) : 0;
        const min = iso[5] ? parseInt(iso[5], 10) : 0;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}`;
        }
    }

    if (!/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/.test(str)) {
        try {
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        } catch { }
    }

    return str;
}

function convertToRows(records: Record<string, unknown>[]): PlanningRow[] {
    return records.map((rec) => {
        const row: PlanningRow = {
            'NO SOPT': '',
            'NO CONTAINER': '',
            'SIZE CONT': '',
            'GRADE CONT': '',
            'CABANG': '',
            'OPS DELIVERY TIME': '',
            'VESVOY': '',
            'BONGKAR FXD': '',
            'CUST ID': '',
            'ALAMAT': '',
            'LONGITUDE': '',
            'LATITUDE': '',
            'SERVICE TYPE': '',
        };

        for (const [rawKey, rawValue] of Object.entries(rec)) {
            const col = normalizeColumnName(rawKey);
            const value = col === 'OPS DELIVERY TIME'
                ? parseExcelDate(rawValue)
                : String(rawValue ?? '').trim();
            row[col] = value;
        }

        return row;
    });
}

function parseTSV(text: string): PlanningRow[] {
    const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
    if (lines.length < 2) return [];

    const headers = lines[0].split('\t').map(h => normalizeColumnName(h));

    return lines.slice(1).filter(l => l.trim()).map(line => {
        const values = line.split('\t');
        const row: PlanningRow = {
            'NO SOPT': '',
            'NO CONTAINER': '',
            'SIZE CONT': '',
            'GRADE CONT': '',
            'CABANG': '',
            'OPS DELIVERY TIME': '',
            'VESVOY': '',
            'BONGKAR FXD': '',
            'CUST ID': '',
            'ALAMAT': '',
            'LONGITUDE': '',
            'LATITUDE': '',
            'SERVICE TYPE': '',
        };

        headers.forEach((header, idx) => {
            const value = values[idx]?.trim() ?? '';
            row[header] = header === 'OPS DELIVERY TIME' ? parseExcelDate(value) : value;
        });

        return row;
    });
}

function rowsToExcelBlob(rows: PlanningRow[]): Blob {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function PlanningInputView({
    onSubmitData,
    onBackToLanding,
    loading,
}: PlanningInputViewProps) {
    const [activeTab, setActiveTab] = useState<InputTab>('upload');
    const [destData, setDestData] = useState<PlanningRow[]>([]);
    const [origData, setOrigData] = useState<PlanningRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    const [fileDest, setFileDest] = useState<File | null>(null);
    const [fileOrig, setFileOrig] = useState<File | null>(null);

    const [pasteDest, setPasteDest] = useState('');
    const [pasteOrig, setPasteOrig] = useState('');

    const [destValidation, setDestValidation] = useState<DataValidationResult | null>(null);
    const [origValidation, setOrigValidation] = useState<DataValidationResult | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [isValidated, setIsValidated] = useState(false);
    const [excludeWarnings, setExcludeWarnings] = useState(false);

    const handleSubmit = useCallback(() => {
        onSubmitData(destData, origData, excludeWarnings);
    }, [destData, origData, onSubmitData, excludeWarnings]);

    const validateParsedData = (rows: PlanningRow[], label: string): string | null => {
        if (rows.length === 0) return `Data ${label} kosong.`;
        const firstRow = rows[0];
        const missing = REQUIRED_COLUMNS.filter(col => !(col in firstRow) || firstRow[col] === undefined);
        if (missing.length > 0) {
            return `Data ${label} kehilangan kolom: ${missing.join(', ')}. Anda dapat menambahkan kolom tersebut di tabel preview.`;
        }
        return null;
    };

    const parseExcelFile = async (file: File): Promise<PlanningRow[]> => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

        if (jsonData.length === 0) throw new Error('File tidak memiliki data');
        return convertToRows(jsonData);
    };

    const handleValidate = useCallback(async () => {
        if (destData.length === 0 || origData.length === 0) {
            setError('Kedua data (bongkar dan muat) harus terisi sebelum validasi.');
            return;
        }

        setIsValidating(true);
        setError(null);

        try {
            const destBlob = rowsToExcelBlob(destData);
            const origBlob = rowsToExcelBlob(origData);

            const formData = new FormData();
            formData.append('file_dest', destBlob, 'dest.xlsx');
            formData.append('file_orig', origBlob, 'orig.xlsx');

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
            const res = await axios.post<FullValidationResult>(`${apiUrl}/api/validate`, formData);

            setDestValidation(res.data.dest);
            setOrigValidation(res.data.orig);

            const fillCoordinates = (rows: PlanningRow[], validation: DataValidationResult): PlanningRow[] =>
                rows.map((row, idx) => {
                    const vr = validation.rows[idx];
                    if (!vr) return row;

                    const next = { ...row };
                    const lonRaw = (next['LONGITUDE'] ?? '').trim();
                    const latRaw = (next['LATITUDE'] ?? '').trim();

                    if (!lonRaw && vr.geocode_lon !== null) {
                        next['LONGITUDE'] = String(vr.geocode_lon);
                    }
                    if (!latRaw && vr.geocode_lat !== null) {
                        next['LATITUDE'] = String(vr.geocode_lat);
                    }
                    return next;
                });

            setDestData(prev => fillCoordinates(prev, res.data.dest));
            setOrigData(prev => fillCoordinates(prev, res.data.orig));
            setIsValidated(true);
        } catch (err) {
            if (axios.isAxiosError(err)) {
                setError(`Validasi gagal: ${err.response?.data?.detail || err.message}`);
            } else {
                setError('Validasi gagal: kesalahan tidak terduga');
            }
        } finally {
            setIsValidating(false);
        }
    }, [destData, origData]);

    const handleLoadExcel = async () => {
        if (!fileDest || !fileOrig) {
            setError('Pilih kedua file (bongkar dan muat) terlebih dahulu');
            return;
        }
        setError(null);
        setIsValidated(false);
        setDestValidation(null);
        setOrigValidation(null);
        try {
            const dest = await parseExcelFile(fileDest);
            const orig = await parseExcelFile(fileOrig);

            const destErr = validateParsedData(dest, 'bongkar');
            const origErr = validateParsedData(orig, 'muat');
            if (destErr && origErr) {
                setError(`${destErr}\n${origErr}`);
            } else if (destErr) {
                setError(destErr);
            } else if (origErr) {
                setError(origErr);
            }

            setDestData(dest);
            setOrigData(orig);
            setShowPreview(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal membaca file');
        }
    };

    const handleLoadPaste = () => {
        if (!pasteDest.trim() || !pasteOrig.trim()) {
            setError('Paste data bongkar dan muat terlebih dahulu');
            return;
        }
        setError(null);
        setIsValidated(false);
        setDestValidation(null);
        setOrigValidation(null);
        try {
            const dest = parseTSV(pasteDest);
            const orig = parseTSV(pasteOrig);

            if (dest.length === 0 || orig.length === 0) {
                setError('Format data tidak valid. Pastikan data memiliki header di baris pertama dan dipisahkan dengan tab.');
                return;
            }

            const destErr = validateParsedData(dest, 'bongkar');
            const origErr = validateParsedData(orig, 'muat');
            if (destErr && origErr) {
                setError(`${destErr}\n${origErr}`);
            } else if (destErr) {
                setError(destErr);
            } else if (origErr) {
                setError(origErr);
            }

            setDestData(dest);
            setOrigData(orig);
            setShowPreview(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memparse data');
        }
    };

    const handleStartManual = () => {
        setError(null);
        setDestData([]);
        setOrigData([]);
        setIsValidated(false);
        setDestValidation(null);
        setOrigValidation(null);
        setShowPreview(true);
    };

    const handleBackFromPreview = () => {
        setShowPreview(false);
        setIsValidated(false);
        setDestValidation(null);
        setOrigValidation(null);
    };

    if (showPreview) {
        return (
            <div className="animate-in fade-in duration-300">
                <button
                    onClick={handleBackFromPreview}
                    className="mb-4 text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Kembali
                </button>

                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-slate-800">Preview & Edit Data</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Review data, validasi, lalu jalankan mapping. Klik cell untuk edit.
                    </p>
                </div>

                {!isValidated && (
                    <div className="mb-4">
                        <button
                            onClick={handleValidate}
                            disabled={isValidating || destData.length === 0 || origData.length === 0}
                            className={`w-full py-3 rounded-xl font-bold text-white text-base transition-all shadow-lg flex items-center justify-center gap-2 ${isValidating || destData.length === 0 || origData.length === 0
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/30'
                                }`}
                        >
                            {isValidating ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Memvalidasi data... (Geocoding alamat, parsing tanggal)
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    🔍 Validasi Data (Geocoding + Format)
                                </>
                            )}
                        </button>
                        <p className="text-xs text-center text-slate-400 mt-2">
                            Validasi akan mengecek alamat, format tanggal, dan kelengkapan data sebelum mapping
                        </p>
                    </div>
                )}

                {isValidated && (
                    <div className="mb-4">
                        <button
                            onClick={handleValidate}
                            disabled={isValidating}
                            className="w-full py-2 rounded-lg font-medium text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                        >
                            {isValidating ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Memvalidasi ulang...
                                </>
                            ) : (
                                <>Validasi Ulang Semua Data</>
                            )}
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                <DataPreviewEditor
                    destData={destData}
                    origData={origData}
                    onDestDataChange={setDestData}
                    onOrigDataChange={setOrigData}
                    onSubmit={handleSubmit}
                    loading={loading}
                    destValidation={destValidation}
                    origValidation={origValidation}
                    onDestValidationChange={setDestValidation}
                    onOrigValidationChange={setOrigValidation}
                    isValidated={isValidated}
                    excludeWarnings={excludeWarnings}
                    onExcludeWarningsChange={setExcludeWarnings}
                />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8">
            <button
                onClick={onBackToLanding}
                className="mb-6 text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Kembali
            </button>

            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-slate-800 mb-2">Planning Bongkar Muat</h2>
                <p className="text-slate-500">
                    Input rencana bongkar muat
                </p>
            </div>

            <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm mb-6">
                {([
                    { key: 'upload', label: 'Upload Excel', description: 'Upload file .xlsx' },
                    { key: 'paste', label: 'Copy-Paste', description: 'Paste dari Excel' },
                    { key: 'manual', label: 'Input Manual', description: 'Isi satu per satu' },
                ] as { key: InputTab; label: string; description: string }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setError(null); }}
                        className={`flex-1 py-3 px-3 rounded-lg text-center transition-all ${activeTab === tab.key
                            ? 'bg-violet-500 text-white shadow-md shadow-violet-500/30'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <div className="font-bold text-sm">{tab.label}</div>
                        <div className={`text-xs mt-0.5 ${activeTab === tab.key ? 'text-violet-100' : 'text-slate-400'}`}>
                            {tab.description}
                        </div>
                    </button>
                ))}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100">
                {activeTab === 'upload' && (
                    <div className="flex flex-col gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                File Data Bongkar
                            </label>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={(e) => setFileDest(e.target.files?.[0] || null)}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 cursor-pointer border border-slate-200 rounded-lg"
                            />
                            {fileDest && <p className="text-xs text-green-600 mt-1">✓ {fileDest.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                File Data Muat
                            </label>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={(e) => setFileOrig(e.target.files?.[0] || null)}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg"
                            />
                            {fileOrig && <p className="text-xs text-green-600 mt-1">✓ {fileOrig.name}</p>}
                        </div>

                        <button
                            onClick={handleLoadExcel}
                            disabled={!fileDest || !fileOrig}
                            className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-all shadow-lg ${!fileDest || !fileOrig
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-linear-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-violet-500/30'
                                }`}
                        >
                            Muat & Preview Data
                        </button>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Kolom yang Diperlukan</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {REQUIRED_COLUMNS.map(col => (
                                    <span key={col} className="px-2 py-1 bg-white rounded-md text-xs font-mono text-slate-600 border border-slate-200">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'paste' && (
                    <div className="flex flex-col gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Paste Data Bongkar
                            </label>
                            <p className="text-xs text-slate-400 mb-2">
                                Masukkan seluruh kolom beserta Header
                            </p>
                            <textarea
                                value={pasteDest}
                                onChange={(e) => setPasteDest(e.target.value)}
                                placeholder={"NO SOPT\tNO CONTAINER\tSIZE CONT\tGRADE CONT\tOPS DELIVERY TIME\tVESVOY\tBONGKAR FXD\tCUST ID\tCABANG\tALAMAT\tLONGITUDE\tLATITUDE\tSERVICE TYPE\nS001\tCONT001\t20DC\tA\t2026-02-25 10:00\tVES001\t\tABC001\tMAKASSAR\tJl. Example\t\t\tINTERCHANGE"}
                                className="w-full h-40 p-3 border border-slate-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                            />
                            {pasteDest && (
                                <p className="text-xs text-green-600 mt-1">
                                    {pasteDest.trim().split('\n').length - 1} baris terdeteksi
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Paste Data Muat
                            </label>
                            <p className="text-xs text-slate-400 mb-2">
                                Masukkan seluruh kolom beserta Header
                            </p>
                            <textarea
                                value={pasteOrig}
                                onChange={(e) => setPasteOrig(e.target.value)}
                                placeholder={"NO SOPT\tNO CONTAINER\tSIZE CONT\tGRADE CONT\tOPS DELIVERY TIME\tVESVOY\tBONGKAR FXD\tCUST ID\tCABANG\tALAMAT\tLONGITUDE\tLATITUDE\tSERVICE TYPE\nS011\tCONT011\t40HC\tA\t2026-02-27 08:00\tVES002\t\tDEF002\tMAKASSAR\tJl. Sample\t\t\tINTERCHANGE"}
                                className="w-full h-40 p-3 border border-slate-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                            />
                            {pasteOrig && (
                                <p className="text-xs text-green-600 mt-1">
                                    {pasteOrig.trim().split('\n').length - 1} baris terdeteksi
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleLoadPaste}
                            disabled={!pasteDest.trim() || !pasteOrig.trim()}
                            className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-all shadow-lg ${!pasteDest.trim() || !pasteOrig.trim()
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-linear-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-violet-500/30'
                                }`}
                        >
                            Parse & Preview Data
                        </button>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Kolom yang Diperlukan</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {REQUIRED_COLUMNS.map(col => (
                                    <span key={col} className="px-2 py-1 bg-white rounded-md text-xs font-mono text-slate-600 border border-slate-200">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'manual' && (
                    <div className="flex flex-col gap-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Input Manual</h3>
                            <p className="text-slate-500 text-sm mb-6">
                                Isi data bongkar dan muat pada tabel di bawah ini.
                            </p>
                        </div>

                        <button
                            onClick={handleStartManual}
                            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all shadow-lg bg-linear-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-violet-500/30"
                        >
                            Mulai Input Manual
                        </button>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Kolom yang Diperlukan</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {REQUIRED_COLUMNS.map(col => (
                                    <span key={col} className="px-2 py-1 bg-white rounded-md text-xs font-mono text-slate-600 border border-slate-200">
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
