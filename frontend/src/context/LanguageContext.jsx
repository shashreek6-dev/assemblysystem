import React, { createContext, useContext, useState, useEffect } from 'react';

const translations = {
  en: {
    // Presiding Console
    consoleTitle: "Presiding Officer Control Console",
    consoleSubtitle: "Legislative Assembly Session & Floor Management System",
    signOut: "Sign Out",
    currentSpeaker: "Current Speaker",
    badgeActive: "Active",
    noSpeaker: "No speaker currently",
    nextSpeaker: "Next Speaker",
    clear: "Clear",
    interruptionsTitle: "Interruptions Requested",
    badgePointOfOrder: "Point of Order",
    allow: "Allow",
    dismiss: "Dismiss",
    queueTitle: "Queue",
    activeFloorTimer: "Active Floor Timer",
    paused: "(Paused)",
    oneMin: "1 Min",
    threeMin: "3 Min",
    fiveMin: "5 Min",
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    reset: "Reset",
    assignSpeakerAlert: "Assign an Active Speaker first by clicking 'Next Speaker'.",
    selectDurationAlert: "Please select or enter a time duration.",
    // inside translations.en:
    nextSpeaker: "Next Speaker",
    assignFloor: "Assign Floor",

    // inside translations.ne:
    nextSpeaker: "अर्को वक्ता",
    assignFloor: "पालो दिनुहोस्",
    
    // Modal
    closeOverlay: "Close Overlay",
    floorSessionActive: "Floor Session Active",
    upcomingQueue: "Upcoming Floor Queue",
    stopAndReset: "Stop & Reset",
    expired: "EXPIRED",

    // Speaker Dashboard
    speakerPortal: "Speaker Portal",
    biometricSubtitle: "Biometric Verification & Floor Access",
    fullNamePlaceholder: "Full Name",
    designationPlaceholder: "Designation / Position (e.g. MP)",
    registerBio: "Register Device Biometrics",
    scanBio: "Scan Face ID / Fingerprint",
    alreadyRegistered: "Already registered? Scan to log in",
    newMember: "New member? Register profile",
    fillNameAndDesig: "Fill in name and designation.",
    youHaveTheFloor: "You Have the Floor",
    inQueueForFloor: "In Queue for Floor",
    positionInLine: "Position in line",
    requestFloor: "Request Turn to Speak",
    priorityReason: "Priority Interruption Reason",
    raiseInterruption: "Raise Priority Interruption",
    pointOfOrder: "Point of Order",
    directRebuttal: "Direct Rebuttal / Argument",
    pointOfInfo: "Point of Information",

    // Admin Login
    presidingOfficer: "Presiding Officer",
    authSubtitle: "Session Control Console Authentication",
    adminUserPlaceholder: "Admin Username",
    passwordPlaceholder: "Password",
    authSession: "Authenticate Session",
    authError: "Invalid Presiding Officer credentials.",
    connError: "Connection error. Ensure backend server is active."
  },
  ne: {
    // Presiding Console
    consoleTitle: "सभामुख नियन्त्रण कन्सोल",
    consoleSubtitle: "व्यवस्थापिका संसद बैठक तथा कार्यव्यवस्था प्रणाली",
    signOut: "साइन आउट",
    currentSpeaker: "हालका वक्ता",
    badgeActive: "सक्रिय",
    noSpeaker: "हाल कुनै वक्ता छैनन्",
    nextSpeaker: "अर्को वक्ता",
    clear: "खाली गर्नुहोस्",
    interruptionsTitle: "हस्तक्षेप / नियमापत्ति अनुरोध",
    badgePointOfOrder: "नियमापत्ति",
    allow: "अनुमति दिनुहोस्",
    dismiss: "खारेज गर्नुहोस्",
    queueTitle: "पालो सूची (Queue)",
    activeFloorTimer: "सक्रिय समय सूचक",
    paused: "(रोकिएको)",
    oneMin: "१ मिनेट",
    threeMin: "३ मिनेट",
    fiveMin: "५ मिनेट",
    start: "सुरु गर्नुहोस्",
    pause: "रोक्नुहोस्",
    resume: "पुनः सुरु",
    reset: "रिसेट",
    assignSpeakerAlert: "कृपया पहिले 'अर्को वक्ता' छानेर सक्रिय वक्ता तोक्नुहोस्।",
    selectDurationAlert: "कृपया समय अवधि छान्नुहोस् वा प्रविष्ट गर्नुहोस्।",

    // Modal
    closeOverlay: "ओभरले बन्द गर्नुहोस्",
    floorSessionActive: "संसद बैठक सक्रिय",
    upcomingQueue: "आगामी वक्ता सूची",
    stopAndReset: "रोक्नुहोस् र रिसेट",
    expired: "समय समाप्त",

    // Speaker Dashboard
    speakerPortal: "माननीय सदस्य पोर्टल",
    biometricSubtitle: "बायोमेट्रिक प्रमाणीकरण तथा पालो अनुरोध",
    fullNamePlaceholder: "पूरा नाम",
    designationPlaceholder: "पद / क्षेत्र (उदा. सांसद)",
    registerBio: "बायोमेट्रिक दर्ता गर्नुहोस्",
    scanBio: "Face ID / औंठाछाप स्क्यान गर्नुहोस्",
    alreadyRegistered: "पहिले नै दर्ता हुनुहुन्छ? लगइन स्क्यान गर्नुहोस्",
    newMember: "नयाँ सदस्य? प्रोफाइल दर्ता गर्नुहोस्",
    fillNameAndDesig: "कृपया नाम र पद विवरण भर्नुहोस्।",
    youHaveTheFloor: "तपाईंको बोल्ने पालो आएको छ",
    inQueueForFloor: "पालो सूचीमा दर्ता भएको छ",
    positionInLine: "पालो क्रम",
    requestFloor: "बोल्नको लागि पालो माग्नुहोस्",
    priorityReason: "हस्तक्षेप / नियमापत्ति कारण",
    raiseInterruption: "नियमापत्ति दर्ता गर्नुहोस्",
    pointOfOrder: "नियमापत्ति (Point of Order)",
    directRebuttal: "प्रत्यक्ष खण्डन / प्रतिवाद",
    pointOfInfo: "जानकारीको विषय (Point of Info)",

    // Admin Login
    presidingOfficer: "सभामुख / कार्यव्यवस्था",
    authSubtitle: "कन्सोल पहुँच प्रमाणीकरण",
    adminUserPlaceholder: "प्रयोगकर्ता नाम",
    passwordPlaceholder: "गोप्य पासवर्ड",
    authSession: "सत्र प्रमाणीकरण गर्नुहोस्",
    authError: "गलत विवरण प्रविष्ट गरियो।",
    connError: "सम्पर्क त्रुटि। सर्भर चालु छ कि छैन जाँच्नुहोस्।"
  }
};

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('appLang') || 'en');

  useEffect(() => {
    localStorage.setItem('appLang', lang);
  }, [lang]);

  const toggleLanguage = () => {
    setLang(prev => (prev === 'en' ? 'ne' : 'en'));
  };

  // Utility to convert standard numbers (0-9) to Nepali Devanagari numerals (०-९)
  const toDevanagariDigits = (numStr) => {
    if (lang !== 'ne') return numStr;
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return String(numStr).replace(/[0-9]/g, (digit) => nepaliDigits[parseInt(digit, 10)]);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLanguage, t: translations[lang], toDevanagariDigits }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);