"use client";

import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { PlanningRow, DataValidationResult, ValidationRowResult } from '@/types';
import axios from 'axios';

const REQUIRED_COLUMNS = ['NO SOPT', 'SIZE CONT', 'GRADE CONT', 'OPS DELIVERY TIME', 'CUST ID', 'CABANG', 'ALAMAT', 'SERVICE TYPE'] as const;
const ALL_COLUMNS = ['NO SOPT', 'NO CONTAINER', 'SIZE CONT', 'GRADE CONT', 'OPS DELIVERY TIME', 'VESVOY', 'BONGKAR FXD', 'CUST ID', 'CABANG', 'ALAMAT', 'LONGITUDE', 'LATITUDE', 'SERVICE TYPE'] as const;

const PAGE_SIZE = 50;

const DROPDOWN_OPTIONS: Record<string, string[]> = {
    'CABANG': ['AMB', 'BAU', 'BIA', 'BIT', 'BMS', 'BPN', 'BRU', 'BTL', 'BTM', 'FAK', 'GTO', 'JKT', 'JYP', 'KAI', 'KDR', 'KTG', 'KTJ', 'MDN', 'MKE', 'MKS', 'MRI', 'NBR', 'NNK', 'PAL', 'PDG', 'PNK', 'PRW', 'SBY', 'SDA', 'SMG', 'SPT', 'SRG', 'SRI', 'TGK', 'TIM', 'TRK', 'TTE', 'TUA'],
    'SIZE CONT': ['20DC', '20RM', '21DC', '40HC', '40RM'],
    'SERVICE TYPE': ['INTERCHANGE', 'STRIPPING'],
    'GRADE CONT': ['A', 'B', 'C'],
};

const VALID_SETS: Record<string, Set<string>> = {
    'CABANG': new Set(DROPDOWN_OPTIONS['CABANG']),
    'SIZE CONT': new Set(DROPDOWN_OPTIONS['SIZE CONT']),
    'SERVICE TYPE': new Set(DROPDOWN_OPTIONS['SERVICE TYPE']),
    'GRADE CONT': new Set([...DROPDOWN_OPTIONS['GRADE CONT'], '-', '', 'NAN', 'NONE']),
};

function tryParseDatetimeLocal(value: string): string | null {
    if (!value || !value.trim()) return null;
    const s = value.trim();

    const iso = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (iso) {
        const [, y, m, d, H, M] = iso;
        const month = parseInt(m), day = parseInt(d);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${y}-${pad(month)}-${pad(day)}T${H ? pad(parseInt(H)) : '00'}:${M ? pad(parseInt(M)) : '00'}:00`;
        }
    }

    const ddmm = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmm) {
        const [, d, m, y, H, M] = ddmm;
        const month = parseInt(m), day = parseInt(d);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${y}-${pad(month)}-${pad(day)}T${H ? pad(parseInt(H)) : '00'}:${M ? pad(parseInt(M)) : '00'}:00`;
        }
    }

    if (!/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/.test(s)) {
        try {
            const dt = new Date(s);
            if (!isNaN(dt.getTime())) {
                const pad = (n: number) => n.toString().padStart(2, '0');
                return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
            }
        } catch { }
    }

    return null;
}

interface DataPreviewEditorProps {
    destData: PlanningRow[];
    origData: PlanningRow[];
    onDestDataChange: (rows: PlanningRow[]) => void;
    onOrigDataChange: (rows: PlanningRow[]) => void;
    onSubmit: () => void;
    loading: boolean;
    destValidation?: DataValidationResult | null;
    origValidation?: DataValidationResult | null;
    onDestValidationChange?: (v: DataValidationResult) => void;
    onOrigValidationChange?: (v: DataValidationResult) => void;
    isValidated?: boolean;
    excludeWarnings?: boolean;
    onExcludeWarningsChange?: (value: boolean) => void;
}

type ActiveView = 'dest' | 'orig';

interface EditingCell {
    rowIndex: number;
    column: string;
}

interface GeocodingCell {
    rowIndex: number;
    status: 'loading' | 'success' | 'error';
    message?: string;
}

function createEmptyRow(): PlanningRow {
    return {
        'NO SOPT': '', 'NO CONTAINER': '', 'SIZE CONT': '', 'GRADE CONT': '', 'OPS DELIVERY TIME': '', 'VESVOY': '', 'BONGKAR FXD': '',
        'CUST ID': '', 'CABANG': '', 'ALAMAT': '', 'LONGITUDE': '', 'LATITUDE': '', 'SERVICE TYPE': '',
    };
}

function parseCoordinate(value: string, kind: 'lat' | 'lon'): number | null {
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    if (kind === 'lat') return n >= -90 && n <= 90 ? n : null;
    return n >= -180 && n <= 180 ? n : null;
}

function formatDateForInput(value: string): string {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return value; }
}

function formatDateForDisplay(value: string): string {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return value; }
}

interface RowProps {
    row: PlanningRow;
    rowIdx: number;
    isSelected: boolean;
    editingCell: EditingCell | null;
    rv: ValidationRowResult | null;
    errorCellsSet: Set<string>;
    geocodingStatus: GeocodingCell | undefined;
    isValidated: boolean;
    activeView: ActiveView;
    onCellClick: (rowIndex: number, column: string) => void;
    onCellChange: (rowIndex: number, column: string, value: string) => void;
    onCellBlur: () => void;
    onAddressBlur: (rowIndex: number, address: string) => void;
    onToggleRow: (idx: number) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

const TableRow = memo(function TableRow({
    row, rowIdx, isSelected, editingCell, rv, errorCellsSet, geocodingStatus,
    isValidated, onCellClick, onCellChange, onCellBlur, onAddressBlur,
    onToggleRow, inputRef,
}: RowProps) {
    return (
        <tr className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <td className="px-3 py-2">
                <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(rowIdx)} className="rounded border-slate-300" />
            </td>
            <td className="px-3 py-2 text-slate-400 text-xs">{rowIdx + 1}</td>
            {ALL_COLUMNS.map(col => {
                const isEditing = editingCell?.rowIndex === rowIdx && editingCell?.column === col;
                const hasError = errorCellsSet.has(`${rowIdx}:${col}`);
                const isDateCol = col === 'OPS DELIVERY TIME';
                const isAddressCol = col === 'ALAMAT';
                const cellValue = row[col] ?? '';

                let validationClass = '';
                let tooltip: string | null = null;
                if (isValidated && rv) {
                    if (isAddressCol && rv.geocode_error) { validationClass = 'bg-red-50'; tooltip = rv.geocode_error; }
                    else if (isAddressCol && rv.geocode_lat !== null) { validationClass = 'bg-green-50'; tooltip = `✅ ${rv.geocode_lat.toFixed(4)}, ${rv.geocode_lon!.toFixed(4)}`; }
                    else if (isDateCol && rv.datetime_error) { validationClass = 'bg-red-50'; tooltip = rv.datetime_error; }
                    else if (isDateCol && rv.datetime_parsed) { validationClass = 'bg-green-50'; tooltip = `✅ ${rv.datetime_parsed}`; }
                    else {
                        const vw = rv.value_warnings.find(w => w.column === col);
                        if (vw) { validationClass = 'bg-amber-50'; tooltip = vw.message; }
                    }
                }

                return (
                    <td key={col} className={`px-4 py-2 cursor-pointer ${hasError ? 'bg-red-50' : validationClass}`}
                        onClick={() => !isEditing && onCellClick(rowIdx, col)} title={tooltip ?? undefined}>
                        {isEditing ? (
                            col in DROPDOWN_OPTIONS ? (
                                <select autoFocus value={cellValue}
                                    onChange={(e) => { onCellChange(rowIdx, col, e.target.value); onCellBlur(); }}
                                    onBlur={onCellBlur}
                                    className="w-full px-2 py-1 border-2 border-blue-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                    style={{ minWidth: '140px' }}>
                                    <option value="">— Pilih —</option>
                                    {DROPDOWN_OPTIONS[col].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            ) : (
                                <input ref={inputRef} type={isDateCol ? 'datetime-local' : 'text'}
                                    value={isDateCol ? formatDateForInput(cellValue) : cellValue}
                                    onChange={(e) => onCellChange(rowIdx, col, e.target.value)}
                                    onBlur={() => {
                                        if (isAddressCol && isValidated) { onAddressBlur(rowIdx, row['ALAMAT'] ?? ''); }
                                        else { onCellBlur(); }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && isAddressCol && isValidated) { onAddressBlur(rowIdx, row['ALAMAT'] ?? ''); }
                                        else if (e.key === 'Enter' || e.key === 'Escape') { onCellBlur(); }
                                    }}
                                    className="w-full px-2 py-1 border-2 border-blue-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                    style={{ minWidth: isDateCol ? '200px' : '120px' }} />
                            )
                        ) : (
                            <div className={`px-2 py-1 rounded-md min-h-7 text-sm border border-transparent hover:border-slate-300 transition-colors flex items-center gap-1.5 ${hasError ? 'text-red-400 italic border-red-200' : 'text-slate-700'}`}>
                                {isValidated && isAddressCol && rv?.geocode_error && (
                                    geocodingStatus?.status === 'loading'
                                        ? <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
                                        : <span className="text-red-500 shrink-0">📍❌</span>
                                )}
                                {isValidated && isAddressCol && rv?.geocode_lat !== null && !rv?.geocode_error && (
                                    geocodingStatus?.status === 'loading'
                                        ? <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
                                        : <span className="text-green-500 shrink-0">📍✅</span>
                                )}
                                {isValidated && isDateCol && rv?.datetime_error && <span className="text-red-500 shrink-0">🕐❌</span>}
                                {isValidated && isDateCol && rv?.datetime_parsed && !rv?.datetime_error && <span className="text-green-500 shrink-0">🕐✅</span>}
                                {isValidated && rv?.value_warnings.some(w => w.column === col) && <span className="text-amber-500 shrink-0">⚠️</span>}
                                <span>{cellValue ? (isDateCol ? formatDateForDisplay(cellValue) : cellValue) : (hasError ? '(pilih)' : '—')}</span>
                            </div>
                        )}
                    </td>
                );
            })}
            {isValidated && (
                <td className="px-3 py-2 text-center">
                    {rv && !rv.geocode_error && !rv.datetime_error && rv.value_warnings.length === 0
                        ? <span className="px-2 py-1 rounded-full text-[10px] bg-green-100 text-green-700 font-bold">OK</span>
                        : rv ? <span className="px-2 py-1 rounded-full text-[10px] bg-red-100 text-red-700 font-bold">
                            {[rv.geocode_error ? 'Alamat' : '', rv.datetime_error ? 'Tanggal' : '', rv.value_warnings.length > 0 ? 'Nilai' : ''].filter(Boolean).join(', ')}
                        </span> : null}
                </td>
            )}
        </tr>
    );
});

export default function DataPreviewEditor({
    destData, origData, onDestDataChange, onOrigDataChange, onSubmit, loading,
    destValidation, origValidation, onDestValidationChange, onOrigValidationChange,
    isValidated = false,
    excludeWarnings = false,
    onExcludeWarningsChange,
}: DataPreviewEditorProps) {
    const [activeView, setActiveView] = useState<ActiveView>('dest');
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [geocodingCells, setGeocodingCells] = useState<Map<string, GeocodingCell>>(new Map());
    const [currentPage, setCurrentPage] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const currentData = activeView === 'dest' ? destData : origData;
    const onCurrentDataChange = activeView === 'dest' ? onDestDataChange : onOrigDataChange;
    const currentValidation = activeView === 'dest' ? destValidation : origValidation;

    const destErrorSet = useMemo(() => {
        const set = new Set<string>();
        destData.forEach((row, i) => {
            (REQUIRED_COLUMNS as readonly string[]).forEach(col => {
                const val = row[col]; if (!val || String(val).trim() === '') set.add(`${i}:${col}`);
            });
        });
        return set;
    }, [destData]);

    const origErrorSet = useMemo(() => {
        const set = new Set<string>();
        origData.forEach((row, i) => {
            (REQUIRED_COLUMNS as readonly string[]).forEach(col => {
                const val = row[col]; if (!val || String(val).trim() === '') set.add(`${i}:${col}`);
            });
        });
        return set;
    }, [origData]);

    const currentErrorSet = activeView === 'dest' ? destErrorSet : origErrorSet;

    const validationCounts = useMemo(() => {
        const dGeo = destValidation?.rows.filter(r => r.geocode_error !== null).length ?? 0;
        const oGeo = origValidation?.rows.filter(r => r.geocode_error !== null).length ?? 0;
        const dDate = destValidation?.rows.filter(r => r.datetime_error !== null).length ?? 0;
        const oDate = origValidation?.rows.filter(r => r.datetime_error !== null).length ?? 0;
        const dVal = destValidation?.rows.reduce((s, r) => s + r.value_warnings.length, 0) ?? 0;
        const oVal = origValidation?.rows.reduce((s, r) => s + r.value_warnings.length, 0) ?? 0;
        return { dGeo, oGeo, dDate, oDate, dVal, oVal, totalGeo: dGeo + oGeo, totalDate: dDate + oDate, totalVal: dVal + oVal };
    }, [destValidation, origValidation]);

    const destHasErrors = destErrorSet.size > 0 || validationCounts.dGeo > 0 || validationCounts.dDate > 0;
    const origHasErrors = origErrorSet.size > 0 || validationCounts.oGeo > 0 || validationCounts.oDate > 0;

    const hasData = destData.length > 0 && origData.length > 0;
    const canSubmit = excludeWarnings
        ? (isValidated && hasData)
        : (isValidated && !destHasErrors && !origHasErrors
            && hasData
            && destErrorSet.size === 0 && origErrorSet.size === 0);

    const totalPages = Math.max(1, Math.ceil(currentData.length / PAGE_SIZE));
    const pageStart = currentPage * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, currentData.length);
    const pagedData = useMemo(
        () => currentData.slice(pageStart, pageEnd),
        [currentData, pageStart, pageEnd]
    );

    useEffect(() => { if (editingCell && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editingCell]);
    useEffect(() => { setCurrentPage(0); }, [activeView]);

    const handleCellClick = useCallback((rowIndex: number, column: string) => { setEditingCell({ rowIndex, column }); }, []);

    const revalidateRowLocally = useCallback((rowIndex: number, column: string, newValue: string) => {
        const validation = activeView === 'dest' ? destValidation : origValidation;
        const onChange = activeView === 'dest' ? onDestValidationChange : onOrigValidationChange;
        if (!validation || !onChange || !validation.rows[rowIndex]) return;

        const rv = { ...validation.rows[rowIndex] };
        let summaryChanged = false;
        if (column in VALID_SETS) {
            const upperVal = newValue.trim().toUpperCase();
            const normalizedVal = column === 'SIZE CONT'
                ? upperVal.replace(/\s+/g, '')
                : upperVal;
            const isValid = !normalizedVal || VALID_SETS[column].has(normalizedVal);
            const oldWarnings = rv.value_warnings.filter(w => w.column !== column);
            if (isValid) {
                rv.value_warnings = oldWarnings;
            } else {
                rv.value_warnings = [...oldWarnings, {
                    column,
                    value: newValue,
                    message: `'${newValue}' bukan ${column} valid. Pilihan: ${DROPDOWN_OPTIONS[column]?.join(', ') || '—'}`
                }];
            }
            summaryChanged = true;
        }

        if (column === 'OPS DELIVERY TIME') {
            const s = newValue.trim();
            if (!s) {
                rv.datetime_parsed = null;
                rv.datetime_error = 'Nilai kosong';
            } else {
                const parsed = tryParseDatetimeLocal(s);
                if (parsed) {
                    rv.datetime_parsed = parsed;
                    rv.datetime_error = null;
                } else {
                    rv.datetime_parsed = null;
                    rv.datetime_error = `Format tidak dikenali: '${s}'`;
                }
            }
            summaryChanged = true;
        }

        if (summaryChanged) {
            const updatedRows = [...validation.rows];
            updatedRows[rowIndex] = rv;
            const ds = updatedRows.filter(r => r.datetime_parsed !== null).length;
            const df = updatedRows.filter(r => r.datetime_error !== null).length;
            const vw = updatedRows.reduce((s, r) => s + r.value_warnings.length, 0);
            onChange({
                ...validation,
                rows: updatedRows,
                summary: {
                    ...validation.summary,
                    datetime_success: ds,
                    datetime_failed: df,
                    value_warnings: vw,
                },
            });
        }
    }, [activeView, destValidation, origValidation, onDestValidationChange, onOrigValidationChange]);

    const handleCellChange = useCallback((rowIndex: number, column: string, value: string) => {
        const updated = [...currentData];
        updated[rowIndex] = { ...updated[rowIndex], [column]: value };
        onCurrentDataChange(updated);

        if (!isValidated) return;

        if (column === 'LONGITUDE' || column === 'LATITUDE') {
            const validation = activeView === 'dest' ? destValidation : origValidation;
            const onChange = activeView === 'dest' ? onDestValidationChange : onOrigValidationChange;
            if (!validation || !onChange || !validation.rows[rowIndex]) return;

            const lonRaw = updated[rowIndex]?.['LONGITUDE'] ?? '';
            const latRaw = updated[rowIndex]?.['LATITUDE'] ?? '';
            const lonParsed = parseCoordinate(lonRaw, 'lon');
            const latParsed = parseCoordinate(latRaw, 'lat');
            const hasAnyManualCoord = lonRaw.trim() !== '' || latRaw.trim() !== '';

            const updatedRows = [...validation.rows];
            const rv = { ...updatedRows[rowIndex] };

            if (hasAnyManualCoord) {
                rv.geocode_lon = lonParsed;
                rv.geocode_lat = latParsed;
                rv.geocode_error = lonParsed !== null && latParsed !== null
                    ? null
                    : 'Longitude/Latitude manual tidak valid';
            }

            updatedRows[rowIndex] = rv;
            const gs = updatedRows.filter(r => r.geocode_lat !== null && r.geocode_lon !== null && r.geocode_error === null).length;
            const gf = updatedRows.filter(r => r.geocode_error !== null).length;
            onChange({ ...validation, rows: updatedRows, summary: { ...validation.summary, geocode_success: gs, geocode_failed: gf } });
            return;
        }

        if (column !== 'ALAMAT') {
            revalidateRowLocally(rowIndex, column, value);
        }
    }, [currentData, onCurrentDataChange, isValidated, revalidateRowLocally, activeView, destValidation, origValidation, onDestValidationChange, onOrigValidationChange]);

    const handleAddressBlur = useCallback(async (rowIndex: number, newAddress: string) => {
        setEditingCell(null);
        if (!newAddress.trim()) return;
        const cellKey = `${activeView}-${rowIndex}`;
        setGeocodingCells(prev => { const n = new Map(prev); n.set(cellKey, { rowIndex, status: 'loading' }); return n; });
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
            const res = await axios.post(`${apiUrl}/api/geocode-single`, { address: newAddress });
            const { lat, lon, error } = res.data;
            const validation = activeView === 'dest' ? destValidation : origValidation;
            const onChange = activeView === 'dest' ? onDestValidationChange : onOrigValidationChange;
            if (validation && onChange) {
                const updatedRows = [...validation.rows];
                if (updatedRows[rowIndex]) {
                    updatedRows[rowIndex] = { ...updatedRows[rowIndex], geocode_lat: lat, geocode_lon: lon, geocode_error: lat !== null ? null : (error || 'Tidak ditemukan') };
                }
                const gs = updatedRows.filter(r => r.geocode_lat !== null && r.geocode_lon !== null && r.geocode_error === null).length;
                const gf = updatedRows.filter(r => r.geocode_error !== null).length;
                onChange({ ...validation, rows: updatedRows, summary: { ...validation.summary, geocode_success: gs, geocode_failed: gf } });
            }
            const updatedData = [...currentData];
            if (updatedData[rowIndex]) {
                updatedData[rowIndex] = {
                    ...updatedData[rowIndex],
                    'LATITUDE': lat !== null ? String(lat) : '',
                    'LONGITUDE': lon !== null ? String(lon) : '',
                };
                onCurrentDataChange(updatedData);
            }
            if (lat !== null) {
                setGeocodingCells(prev => { const n = new Map(prev); n.set(cellKey, { rowIndex, status: 'success', message: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }); return n; });
                setTimeout(() => { setGeocodingCells(prev => { const n = new Map(prev); n.delete(cellKey); return n; }); }, 3000);
            } else {
                setGeocodingCells(prev => { const n = new Map(prev); n.set(cellKey, { rowIndex, status: 'error', message: error || 'Tidak ditemukan' }); return n; });
            }
        } catch {
            setGeocodingCells(prev => { const n = new Map(prev); n.set(cellKey, { rowIndex, status: 'error', message: 'Gagal menghubungi server' }); return n; });
        }
    }, [activeView, destValidation, origValidation, onDestValidationChange, onOrigValidationChange, currentData, onCurrentDataChange]);

    const handleCellBlur = useCallback(() => { setEditingCell(null); }, []);
    const handleAddRow = useCallback(() => { onCurrentDataChange([...currentData, createEmptyRow()]); }, [currentData, onCurrentDataChange]);
    const handleDeleteSelected = useCallback(() => {
        if (selectedRows.size === 0) return;
        onCurrentDataChange(currentData.filter((_, i) => !selectedRows.has(i)));
        setSelectedRows(new Set());
    }, [currentData, onCurrentDataChange, selectedRows]);
    const toggleRowSelection = useCallback((idx: number) => {
        setSelectedRows(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
    }, []);
    const toggleSelectAll = useCallback(() => {
        if (selectedRows.size === currentData.length) setSelectedRows(new Set());
        else setSelectedRows(new Set(currentData.map((_, i) => i)));
    }, [selectedRows.size, currentData]);
    const handleViewSwitch = useCallback((view: ActiveView) => { setActiveView(view); setEditingCell(null); setSelectedRows(new Set()); }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <button onClick={() => handleViewSwitch('dest')}
                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeView === 'dest' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    Data Bongkar ({destData.length})
                    {destHasErrors && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 text-red-700 border border-red-200">{destErrorSet.size + validationCounts.dGeo + validationCounts.dDate} ⚠</span>}
                </button>
                <button onClick={() => handleViewSwitch('orig')}
                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeView === 'orig' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                    Data Muat ({origData.length})
                    {origHasErrors && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 text-red-700 border border-red-200">{origErrorSet.size + validationCounts.oGeo + validationCounts.oDate} ⚠</span>}
                </button>
            </div>

            {isValidated && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Hasil Validasi
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            { ok: validationCounts.totalGeo === 0, label: 'Geocoding', detail: validationCounts.totalGeo === 0 ? `${(destValidation?.summary.geocode_success ?? 0) + (origValidation?.summary.geocode_success ?? 0)} berhasil` : `${validationCounts.totalGeo} gagal` },
                            { ok: validationCounts.totalDate === 0, label: 'Format Tanggal', detail: validationCounts.totalDate === 0 ? `${(destValidation?.summary.datetime_success ?? 0) + (origValidation?.summary.datetime_success ?? 0)} valid` : `${validationCounts.totalDate} invalid` },
                            { ok: validationCounts.totalVal === 0, label: 'Nilai Data', detail: validationCounts.totalVal === 0 ? 'Semua valid' : `${validationCounts.totalVal} peringatan`, warn: true },
                            { ok: ((destValidation?.column_issues.filter(c => c.type === 'missing').length ?? 0) + (origValidation?.column_issues.filter(c => c.type === 'missing').length ?? 0)) === 0, label: 'Kolom', detail: ((destValidation?.column_issues.filter(c => c.type === 'missing').length ?? 0) + (origValidation?.column_issues.filter(c => c.type === 'missing').length ?? 0)) === 0 ? 'Lengkap' : 'Ada yang hilang' },
                        ].map((item, i) => (
                            <div key={i} className={`p-2.5 rounded-lg text-center ${item.ok ? 'bg-green-50 border border-green-200' : (item.warn ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200')}`}>
                                <div className="text-lg font-bold">{item.ok ? '✅' : (item.warn ? '⚠️' : '❌')}</div>
                                <div className={`text-xs font-bold ${item.ok ? 'text-green-700' : (item.warn ? 'text-amber-700' : 'text-red-700')}`}>{item.label}</div>
                                <div className={`text-[10px] ${item.ok ? 'text-green-600' : (item.warn ? 'text-amber-600' : 'text-red-600')}`}>{item.detail}</div>
                            </div>
                        ))}
                    </div>

                    {currentValidation?.column_issues.filter(c => c.type === 'renamed').map((issue, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
                            <span>ℹ️</span><span>Kolom <strong>&quot;{issue.original}&quot;</strong> otomatis dikenali sebagai <strong>&quot;{issue.suggestion}&quot;</strong></span>
                        </div>
                    ))}

                    {validationCounts.totalGeo > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                            <div className="flex items-center gap-2 font-bold mb-1">⚠️ {validationCounts.totalGeo} alamat tidak ditemukan</div>
                            <p className="text-xs text-red-700">Perbaiki alamat yang ditandai merah di kolom ALAMAT. Setelah Anda edit, sistem akan otomatis melakukan geocoding ulang secara real-time.</p>
                        </div>
                    )}
                    {validationCounts.totalDate > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                            <div className="flex items-center gap-2 font-bold mb-1">⚠️ {validationCounts.totalDate} format tanggal tidak valid</div>
                            <p className="text-xs text-red-700">Perbaiki tanggal yang ditandai merah. Format: YYYY-MM-DD HH:MM, DD/MM/YYYY HH:MM.</p>
                        </div>
                    )}
                </div>
            )}

            {currentData.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
                    <p className="text-slate-400 mb-4">Belum ada data {activeView === 'dest' ? 'bongkar' : 'muat'}</p>
                    <button onClick={handleAddRow} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors">+ Tambah Baris Pertama</button>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                            <span>Menampilkan baris {pageStart + 1}-{pageEnd} dari {currentData.length}</span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-30">«</button>
                                <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-30">‹</button>
                                <span className="px-2 font-bold">Hal {currentPage + 1}/{totalPages}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-30">›</button>
                                <button onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1} className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-30">»</button>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-3 py-3 w-10"><input type="checkbox" checked={selectedRows.size === currentData.length && currentData.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" /></th>
                                    <th className="px-3 py-3 w-10">#</th>
                                    {ALL_COLUMNS.map(col => (
                                        <th key={col} className={`px-4 py-3 ${(REQUIRED_COLUMNS as readonly string[]).includes(col) ? 'text-slate-700 font-bold' : 'text-slate-400'}`}>
                                            {col}{(REQUIRED_COLUMNS as readonly string[]).includes(col) && <span className="text-red-400 ml-0.5">*</span>}
                                        </th>
                                    ))}
                                    {isValidated && <th className="px-3 py-3 text-center">Status</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pagedData.map((row, pageIdx) => {
                                    const rowIdx = pageStart + pageIdx;
                                    const rv = currentValidation?.rows[rowIdx] ?? null;
                                    const cellKey = `${activeView}-${rowIdx}`;
                                    return (
                                        <TableRow key={rowIdx} row={row} rowIdx={rowIdx}
                                            isSelected={selectedRows.has(rowIdx)}
                                            editingCell={editingCell} rv={rv}
                                            errorCellsSet={currentErrorSet}
                                            geocodingStatus={geocodingCells.get(cellKey)}
                                            isValidated={isValidated} activeView={activeView}
                                            onCellClick={handleCellClick} onCellChange={handleCellChange}
                                            onCellBlur={handleCellBlur} onAddressBlur={handleAddressBlur}
                                            onToggleRow={toggleRowSelection} inputRef={inputRef} />
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-1 px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs">
                            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                let page: number;
                                if (totalPages <= 10) { page = i; }
                                else if (currentPage < 5) { page = i; }
                                else if (currentPage > totalPages - 6) { page = totalPages - 10 + i; }
                                else { page = currentPage - 5 + i; }
                                return (
                                    <button key={page} onClick={() => setCurrentPage(page)}
                                        className={`w-7 h-7 rounded ${page === currentPage ? 'bg-amber-500 text-white font-bold' : 'hover:bg-slate-200 text-slate-600'}`}>{page + 1}</button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <button onClick={handleAddRow} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Tambah Baris
                    </button>
                    {selectedRows.size > 0 && (
                        <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Hapus ({selectedRows.size})
                        </button>
                    )}
                </div>
                <div className="text-xs text-slate-400">Klik cell untuk edit • Tab untuk pindah kolom</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Bongkar', count: destData.length, ok: !destHasErrors && destErrorSet.size === 0, errCount: destErrorSet.size + validationCounts.dGeo + validationCounts.dDate },
                        { label: 'Muat', count: origData.length, ok: !origHasErrors && origErrorSet.size === 0, errCount: origErrorSet.size + validationCounts.oGeo + validationCounts.oDate },
                    ].map(item => (
                        <div key={item.label} className={`p-3 rounded-lg border ${item.count > 0 && item.ok ? 'bg-green-50 border-green-200' : item.count > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-2">
                                {item.count > 0 && item.ok ? <span className="text-green-500">✅</span> : item.count > 0 ? <span className="text-red-500">❌</span> : <span className="text-slate-400">—</span>}
                                <span className={`text-sm font-bold ${item.count > 0 && item.ok ? 'text-green-700' : item.count > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                                    {item.label}: {item.count > 0 ? (item.ok ? `${item.count} valid` : `${item.errCount} error`) : 'belum ada data'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative">
                {isValidated && (
                    <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={excludeWarnings}
                            onChange={(e) => onExcludeWarningsChange?.(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Exclude data yang masih warning/error sebelum mapping
                    </label>
                )}
                <button onClick={onSubmit} disabled={!canSubmit || loading}
                    className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-all shadow-lg ${!canSubmit || loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30'}`}>
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                            Sedang Memproses Mapping...
                        </span>
                    ) : `Jalankan Mapping (${destData.length} Bongkar + ${origData.length} Muat)`}
                </button>
                {!canSubmit && !loading && isValidated && (
                    <div className="mt-2 text-center text-xs text-red-600">
                        {!excludeWarnings && validationCounts.totalGeo > 0 && <p>Perbaiki {validationCounts.totalGeo} alamat yang gagal geocoding</p>}
                        {!excludeWarnings && validationCounts.totalDate > 0 && <p>Perbaiki {validationCounts.totalDate} format tanggal yang tidak valid</p>}
                        {!excludeWarnings && (destErrorSet.size > 0 || origErrorSet.size > 0) && <p>Lengkapi semua kolom wajib yang kosong</p>}
                        {excludeWarnings && !hasData && <p>Tambahkan data bongkar dan muat terlebih dahulu</p>}
                    </div>
                )}
                {!isValidated && destData.length > 0 && origData.length > 0 && (
                    <div className="mt-2 text-center text-xs text-amber-600">Data belum divalidasi. Klik &quot;Validasi Data&quot; terlebih dahulu.</div>
                )}
            </div>
        </div>
    );
}
