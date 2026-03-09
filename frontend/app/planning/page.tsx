"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useMappingContext } from '@/context';
import { Header, PlanningInputView } from '@/app/components';
import { PlanningRow } from '@/types';

export default function PlanningPage() {
    const router = useRouter();
    const {
        stats,
        results,
        appMode,
        isHydrated,
        isDBLoading,
        setAppMode,
        saveToStorage,
        handleReset,
    } = useMappingContext();

    const [loading, setLoading] = useState(false);

    const handleBackToLanding = () => {
        setAppMode(null);
        router.push('/');
    };

    const handleLogoClick = async () => {
        await handleReset();
        router.push('/');
    };

    const handleSubmitData = async (destData: PlanningRow[], origData: PlanningRow[], excludeWarnings: boolean) => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

            // Convert destData to Excel blob
            const destWs = XLSX.utils.json_to_sheet(destData);
            const destWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(destWb, destWs, 'Sheet1');
            const destArray = XLSX.write(destWb, { type: 'array', bookType: 'xlsx' });
            const destBlob = new Blob([destArray], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            // Convert origData to Excel blob
            const origWs = XLSX.utils.json_to_sheet(origData);
            const origWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(origWb, origWs, 'Sheet1');
            const origArray = XLSX.write(origWb, { type: 'array', bookType: 'xlsx' });
            const origBlob = new Blob([origArray], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            // Send as FormData (same as mapping mode)
            const fd = new FormData();
            fd.append('file_dest', destBlob, 'planning_dest.xlsx');
            fd.append('file_orig', origBlob, 'planning_orig.xlsx');
            fd.append('exclude_warnings', excludeWarnings ? 'true' : 'false');

            const res = await axios.post(`${apiUrl}/api/optimize`, fd);

            const { results: data, stats: backendStats } = res.data;

            const newStats = {
                match: backendStats.total_match,
                saving: backendStats.saving,
                savingCost: backendStats.saving_cost,
                total_origin: backendStats.total_origin,
                total_dest: backendStats.total_dest,
                cabang_breakdown: backendStats.cabang_breakdown,
            };

            saveToStorage(data, newStats);
            setAppMode('planning');

            router.push('/download');
        } catch (e: unknown) {
            console.error(e);
            const errorMessage =
                e instanceof Error
                    ? e.message
                    : (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Unknown error';
            alert('Gagal memproses: ' + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    if (!isHydrated || isDBLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500 animate-pulse">Memuat...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
            <Header
                stats={stats}
                hasResults={results.length > 0}
                onLogoClick={handleLogoClick}
                currentView="upload"
                appMode={appMode || 'planning'}
            />

            <main className="flex-1 p-6 w-full max-w-300 mx-auto">
                <PlanningInputView
                    onSubmitData={handleSubmitData}
                    onBackToLanding={handleBackToLanding}
                    loading={loading}
                />
            </main>
        </div>
    );
}
