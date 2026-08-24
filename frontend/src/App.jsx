import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import HeadConsole from './components/HeadConsole';
import WorkerConsole from './components/WorkerConsole';
import SpeakerDashboard from './components/SpeakerDashboard';
import MemberLogin from './components/MemberLogin';
import AdminLogin from './components/AdminLogin';
import ExternalDisplay from './components/ExternalDisplay';

export default function App() {
    return (
        <LanguageProvider>
            <BrowserRouter>
                <Routes>
                    {/* 1. Public Display Screen */}
                    <Route path="/display" element={<ExternalDisplay />} />

                    {/* 2. Member (MP) Portal & Login */}
                    <Route path="/login" element={<MemberLogin />} />
                    <Route path="/speaker" element={<SpeakerDashboard />} />

                    {/* 3. Presiding Officer Admin */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/head" element={<HeadConsole />} />

                    {/* 4. Worker Desk */}
                    <Route path="/worker" element={<WorkerConsole />} />

                    {/* 5. Default Fallback -> Direct to Member Login */}
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </LanguageProvider>
    );
}