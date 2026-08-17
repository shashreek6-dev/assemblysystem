import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle({ style = {} }) {
  const { lang, toggleLanguage } = useLanguage();

  return (
    <button 
      onClick={toggleLanguage}
      className="btn-secondary"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: 700,
        fontSize: '12px',
        padding: '6px 12px',
        borderRadius: '20px',
        ...style
      }}
    >
      🌐 {lang === 'en' ? 'नेपाली' : 'English'}
    </button>
  );
}