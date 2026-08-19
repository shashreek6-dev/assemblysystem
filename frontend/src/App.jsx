import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import HeadConsole from './components/HeadConsole';
import WorkerConsole from './components/WorkerConsole';
import SpeakerDashboard from './components/SpeakerDashboard';
import AdminLogin from './components/AdminLogin';

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* 1. Speaker Portal */}
          <Route path="/" element={<SpeakerDashboard />} />
          <Route path="/speaker" element={<SpeakerDashboard />} />

          {/* 2. Head / Presiding Officer Console */}
          <Route path="/head" element={<HeadConsole />} />
          <Route path="/admin" element={<Navigate to="/head" replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* 3. Worker / Clerk Console */}
          <Route path="/worker" element={<WorkerConsole />} />
          <Route path="/clerk" element={<Navigate to="/worker" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}