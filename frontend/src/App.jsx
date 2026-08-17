import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import SpeakerDashboard from './components/SpeakerDashboard';
import AdminLogin from './components/AdminLogin';
import PresidingConsole from './components/PresidingConsole';

const SmartLanding = () => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return <Navigate to="/admin/login" replace />;
    }
    return <SpeakerDashboard />;
};

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SmartLanding />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/console" element={<PresidingConsole />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}