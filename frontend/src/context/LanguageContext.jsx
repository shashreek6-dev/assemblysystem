import React, { createContext, useContext, useState, useEffect } from 'react';

const customOverrides = {
  "mp": "माननीय सांसद",
  "member of parliament": "माननीय संसद सदस्य",
  "opposition leader": "प्रमुख प्रतिपक्षी दलका नेता",
  "cabinet minister": "माननीय मन्त्री",
  "minister": "मन्त्री",
  "prime minister": "सम्माननीय प्रधानमन्त्री",
  "pm": "सम्माननीय प्रधानमन्त्री",
  "speaker": "सम्माननीय सभामुख",
  "deputy speaker": "माननीय उपसभामुख",
  "secretary general": "महासचिव",
  "member": "सदस्य",
  "shrestha": "श्रेष्ठ",
  "karki": "कार्की",
  "bhattarai": "भट्टराई",
  "adhikari": "अधिकारी",
  "tamang": "तामाङ",
  "gurung": "गुरुङ",
  "pokharel": "पोखरेल",
  "chettri": "क्षेत्री",
  "chhetri": "क्षेत्री",
  "kc": "केसी",
  "bista": "बिष्ट",
  "pandey": "पाण्डे",
  "paudel": "पौडेल",
  "rijal": "रिजाल",
  "acharya": "आचार्य",
  "nepal": "नेपाल",
  "sharma": "शर्मा",
  "thapa": "थापा",
  "sampang": "साम्पाङ",
  "shah": "शाह",
  "neupane": "न्यौपाने",
  "gautam": "गौतम",
  "dhakal": "ढकाल",
  "bhandari": "भण्डारी",
  "sunya": "शून्य समय",
  "aakasmik": "आकस्मिक समय",
  "bishesh": "विशेष समय"
};

const consonantMap = [
  { en: "ksha", ne: "क्ष" }, { en: "ksh", ne: "क्ष" }, { en: "gya", ne: "ज्ञ" }, 
  { en: "tra", ne: "त्र" }, { en: "shri", ne: "श्री" }, { en: "shr", ne: "श्र" },
  { en: "chha", ne: "छ" }, { en: "chh", ne: "छ" }, { en: "ch", ne: "च" },
  { en: "kh", ne: "ख" }, { en: "gh", ne: "घ" }, { en: "ng", ne: "ङ" },
  { en: "jh", ne: "झ" }, { en: "th", ne: "थ" }, { en: "dh", ne: "ध" },
  { en: "ph", ne: "फ" }, { en: "bh", ne: "भ" }, { en: "sh", ne: "श" },
  { en: "k", ne: "क" }, { en: "g", ne: "ग" }, { en: "j", ne: "ज" },
  { en: "t", ne: "त" }, { en: "d", ne: "द" }, { en: "n", ne: "न" },
  { en: "p", ne: "प" }, { en: "b", ne: "ब" }, { en: "m", ne: "म" },
  { en: "y", ne: "य" }, { en: "r", ne: "र" }, { en: "l", ne: "ल" },
  { en: "w", ne: "व" }, { en: "v", ne: "व" }, { en: "s", ne: "स" }, { en: "h", ne: "ह" }
];

const matraMap = [
  { en: "aa", ne: "ा" }, { en: "ee", ne: "ी" }, { en: "oo", ne: "ू" },
  { en: "ai", ne: "ै" }, { en: "au", ne: "ौ" }, { en: "a", ne: "" },
  { en: "i", ne: "ि" }, { en: "u", ne: "ु" }, { en: "e", ne: "े" }, { en: "o", ne: "ो" }
];

const standaloneVowels = [
  { en: "aa", ne: "आ" }, { en: "ee", ne: "ई" }, { en: "oo", ne: "ऊ" },
  { en: "ai", ne: "ऐ" }, { en: "au", ne: "औ" }, { en: "a", ne: "अ" },
  { en: "i", ne: "इ" }, { en: "u", ne: "उ" }, { en: "e", ne: "ए" }, { en: "o", ne: "ओ" }
];

const transliterateAnyWord = (word) => {
  if (!word) return '';
  const low = String(word).toLowerCase().trim();
  if (customOverrides[low]) return customOverrides[low];

  let res = '';
  let i = 0;
  let isStartOfSyllable = true;

  while (i < low.length) {
    if (isStartOfSyllable) {
      let matchedVowel = false;
      for (const v of standaloneVowels) {
        if (low.startsWith(v.en, i)) {
          res += v.ne;
          i += v.en.length;
          matchedVowel = true;
          isStartOfSyllable = false;
          break;
        }
      }
      if (matchedVowel) continue;
    }

    let matchedConsonant = false;
    for (const c of consonantMap) {
      if (low.startsWith(c.en, i)) {
        const consChar = c.ne;
        i += c.en.length;
        matchedConsonant = true;
        isStartOfSyllable = false;

        let matchedMatra = false;
        for (const m of matraMap) {
          if (low.startsWith(m.en, i)) {
            res += consChar + m.ne;
            i += m.en.length;
            matchedMatra = true;
            break;
          }
        }

        if (!matchedMatra) {
          if (i < low.length && /[a-z]/i.test(low[i])) {
            res += consChar + "्";
          } else {
            res += consChar;
          }
        }
        break;
      }
    }

    if (!matchedConsonant) {
      res += low[i];
      i++;
      isStartOfSyllable = false;
    }
  }

  return res
    .replace(/र्क्/g, "र्क")
    .replace(/न्द्/g, "न्द")
    .replace(/म्प्/g, "म्प")
    .replace(/स्त्/g, "स्त")
    .replace(/श्त्/g, "श्त");
};

const universalNepaliTransliterate = (text) => {
  if (!text) return '';
  const str = String(text).trim();
  const low = str.toLowerCase();

  if (customOverrides[low]) return customOverrides[low];

  const tokens = str.split(/(\s+|[-&•,/]+)/);
  return tokens.map(t => {
    if (!t) return '';
    const tLow = t.toLowerCase().trim();
    if (tLow === '&') return 'तथा';
    if (tLow === 'and') return 'र';
    if (customOverrides[tLow]) return customOverrides[tLow];
    if (/^[a-zA-Z.]+$/.test(t)) return transliterateAnyWord(t);
    return t;
  }).join('');
};

const translations = {
  en: {
    tabConsole: "Floor Console",
    tabDirectory: "Member Directory",
    tabImport: "Import Roster",
    tabSpeakingTime: "Speaking Time",
    tabTopicClerk: "Topic Clerk",
    tabAnalytics: "Speaker Records",
    consoleTitle: "Presiding Officer Control Console",
    consoleSubtitle: "Legislative Assembly Session & Floor Management System",
    signOut: "Sign Out",
    currentSpeaker: "Current Speaker",
    badgeActive: "Active",
    noSpeaker: "No speaker currently",
    nextSpeaker: "Next Speaker",
    assignFloor: "Assign Floor",
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
    topic: "Topic",
    speakingAnalytics: "Speaker Time & Floor Records",
    refreshRecords: "Refresh Records",
    memberName: "Member Name",
    designation: "Designation",
    totalSpokenTime: "Total Spoken Time",
    turnsTaken: "Turns Taken",
    lastSpoken: "Last Spoken",
    spokenDate: "Date Spoken (B.S.)",
    noRecordsFound: "No floor speaking records found yet.",
    closeOverlay: "Close Overlay",
    floorSessionActive: "Floor Session Active",
    upcomingQueue: "Upcoming Floor Queue",
    stopAndReset: "Stop & Reset",
    expired: "EXPIRED",
    interruptionActiveBadge: "PRIORITY INTERRUPTION ACTIVE",
    interruptedSpeakerNotice: "Paused Original Speaker",
    remainingFloorTime: "Time Saved on Hold",
    finishInterruptionBtn: "Finish Interruption & Return Floor",
    directoryTitle: "Permanent Assembly Member Directory",
    directorySubtitle: "Permanent database registry. Search by Unique ID or Member Name.",
    searchPlaceholder: "Search by Unique ID or Member Name...",
    downloadTemplate: "Download Template",
    importCsvExcel: "Import CSV / Excel",
    closeImport: "Close Import",
    memberIdCol: "Unique ID",
    nameCol: "Member Name",
    actionsCol: "Actions",
    noMembersMatch: "No permanent members found matching your search.",
    importTitle: "Import Speaker Roster (Excel / CSV)",
    importSubtitle: "Upload .xlsx / .xls / .csv file to automatically populate session agenda, topics, and floor queue",
    chooseFile: "Choose File",
    uploadAndQueue: "Upload & Auto-Queue Roster",
    uniqueId: "Unique ID",
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
    requestedTime: "Requested Time",
    selectTime: "Select Speaking Time",
    customTime: "Custom",
    enterUniqueId: "Enter your Unique Member ID (e.g. MP-101)",
    loginBtn: "Access Member Floor",
    switchBio: "Use Biometric Login Instead",
    switchId: "Have a Member ID? Login with ID",
    presidingOfficer: "Presiding Officer",
    authSubtitle: "Session Control Console Authentication",
    adminUserPlaceholder: "Admin Username",
    passwordPlaceholder: "Password",
    authSession: "Authenticate Session",
    authError: "Invalid Presiding Officer credentials.",
    connError: "Connection error. Ensure backend server is active.",
    sunyaSamaya: "Sunya Samaya (Zero Hour)",
    aakasmikSamaya: "Aakasmik Samaya (Urgent Hour)",
    bisheshSamaya: "Bishesh Samaya (Special Hour)",
    selectSessionCategory: "Select Parliamentary Speaking Slot",
    aakasmikLimitReached: "You have already utilized your single speaking chance for this Aakasmik Samaya.",
    resetAakasmikBtn: "Reset Aakasmik Session Lockouts",
    topicClerkTitle: "Topic Clerk Console",
    topicClerkSubtitle: "Live manual topic entry & Devanagari translation assignment for members",
    saveTopicBtn: "Save & Broadcast Topic",
    workerConsoleTitle: "Parliamentary Operational Console",
    workerConsoleSubtitle: "Set speaker topics, configure time slots, and manage session lockouts",
    tabSetTopics: "Set Topics",
    tabSetTime: "Set Allocated Time",
    tabSessionControl: "Session & Lockout Resets",
    tabImportRoster: "Import Roster (Excel / CSV)",
    selectMemberTopic: "Select Member to Assign Topic",
    selectMemberTime: "Select Member to Allocate Time",
    filterPlaceholder: "Filter by Name or ID...",
    currentFloorSpeakerBadge: "CURRENT FLOOR SPEAKER",
    notSet: "Not set",
    editingTopicFor: "Editing Topic for",
    selectMemberLeftPrompt: "Select a member on the left",
    topicEnglishLabel: "Topic for Speaking (English)",
    topicEnglishPlaceholder: "e.g. Budget Allocation for Digital Governance",
    topicNepaliLabel: "Topic for Speaking (Nepali)",
    topicNepaliPlaceholder: "उदा. डिजिटल सुशासनको लागि बजेट विनियोजन",
    topicAutoTransHelper: "Leave blank to auto-transliterate from English topic.",
    saveSyncTopicBtn: "Save & Sync Topic",
    allocatingTimeFor: "Allocating Time for",
    quickPresetsLabel: "Quick Presets",
    exactDurationLabel: "Exact Speaking Duration",
    minutesLabel: "Minutes",
    secondsLabel: "Seconds",
    saveSyncTimeBtn: "Save & Sync Allocated Time",
    realtimeFloorOverride: "Real-Time Floor Override (Active Speaker)",
    sectionLockoutTitle: "Section Lockout Management",
    sectionLockoutSubtitle: "Once a member has spoken in a section, they cannot queue or speak in that section again until reset.",
    membersLockedOutText: "members currently locked out",
    resetSunyaLockoutsBtn: "Reset Sunya Lockouts",
    resetAakasmikLockoutsBtn: "Reset Aakasmik Lockouts",
    resetBisheshLockoutsBtn: "Reset Bishesh Lockouts",
    resetAllThreeLockoutsBtn: "Reset Lockouts For All Three Sections",
    confirmResetLockout: "Are you sure you want to reset speaking lockouts for",
    confirmResetAllLockouts: "Are you sure you want to reset speaking lockouts for ALL THREE sections? All members can speak again.",
    selectMemberFirstAlert: "Select a member from the list or queue first.",
    topicUpdatedAlert: "Topic updated successfully for",
    timeUpdatedAlert: "Speaking time updated successfully for"
  },
  ne: {
    tabConsole: "कार्यसञ्चालन कन्सोल",
    tabDirectory: "सदस्य अभिलेख सूची",
    tabImport: "कार्यसूची आयात (Excel)",
    tabSpeakingTime: "समय व्यवस्थापन",
    tabTopicClerk: "विषय प्रविष्टि डेस्क",
    tabAnalytics: "वक्ता विवरण तथा अभिलेख",
    consoleTitle: "सभामुख नियन्त्रण कन्सोल",
    consoleSubtitle: "व्यवस्थापिका संसद बैठक तथा कार्यव्यवस्था प्रणाली",
    signOut: "साइन आउट",
    currentSpeaker: "हालका वक्ता",
    badgeActive: "सक्रिय",
    noSpeaker: "हाल कुनै वक्ता छैनन्",
    nextSpeaker: "अर्को वक्ता",
    assignFloor: "पालो दिनुहोस्",
    clear: "खाली गर्नुहोस्",
    interruptionsTitle: "हस्तक्षेप / नियमापत्ति अनुरोध",
    badgePointOfOrder: "नियमापत्ति",
    allow: "अनुमति दिनुहोस्",
    dismiss: "खारेज गर्नुहोस्",
    queueTitle: "पालो सूची (QUEUE)",
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
    topic: "विषय",
    speakingAnalytics: "वक्ताहरूको समय तथा विवरण अभिलेख",
    refreshRecords: "ताजा गर्नुहोस्",
    memberName: "सदस्यको नाम",
    designation: "पद / क्षेत्र",
    totalSpokenTime: "कुल बोलेको समय",
    turnsTaken: "बोलेको पटक",
    lastSpoken: "पछिल्लो पटक बोलेको समय",
    spokenDate: "बोलेको मिति (वि.सं.)",
    noRecordsFound: "हालसम्म कुनै वक्ताको विवरण भेटिएन।",
    closeOverlay: "ओभरले बन्द गर्नुहोस्",
    floorSessionActive: "संसद बैठक सक्रिय",
    upcomingQueue: "आगामी वक्ता सूची",
    stopAndReset: "रोक्नुहोस् र रिसेट",
    expired: "समय समाप्त",
    interruptionActiveBadge: "विशेष नियमापत्ति / हस्तक्षेप सक्रिय",
    interruptedSpeakerNotice: "रोक्का राखिएका मूल वक्ता",
    remainingFloorTime: "बँचेको बाँकी समय",
    finishInterruptionBtn: "हस्तक्षेप समाप्त गरी मूल वक्तालाई पालो फर्काउनुहोस्",
    directoryTitle: "स्थायी संसद सदस्य अभिलेख निर्देशिका",
    directorySubtitle: "सबै दर्ता भएका सदस्यहरूको स्थायी अभिलेख। युनिक ID वा नामबाट खोज्नुहोस्।",
    searchPlaceholder: "युनिक ID वा सदस्यको नामबाट खोज्नुहोस्...",
    downloadTemplate: "नमुना ढाँचा डाउनलोड",
    importCsvExcel: "CSV / Excel आयात गर्नुहोस्",
    closeImport: "बन्द गर्नुहोस्",
    memberIdCol: "युनिक ID",
    nameCol: "सदस्यको नाम",
    actionsCol: "कार्यहरू",
    noMembersMatch: "खोजी अनुसार कुनै सदस्यको विवरण भेटिएन।",
    importTitle: "वक्ता कार्यसूची आयात (एक्सेल / CSV)",
    importSubtitle: "बैठकको कार्यसूची, विषय र पालो क्रम स्वतः थप्न .xlsx / .xls / .csv फाइल अपलोड गर्नुहोस्",
    chooseFile: "फाइल छान्नुहोस्",
    uploadAndQueue: "अपलोड गरी पालो सूचीमा थप्नुहोस्",
    uniqueId: "विशिष्ट परिचय नं (Unique ID)",
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
    requestedTime: "माग गरिएको समय",
    selectTime: "बोल्न चाहेको समय छान्नुहोस्",
    customTime: "इच्छित समय",
    enterUniqueId: "आफ्नो युनिक सदस्य ID प्रविष्ट गर्नुहोस् (उदा. MP-101)",
    loginBtn: "सदस्य पोर्टल प्रवेश गर्नुहोस्",
    switchBio: "बायोमेट्रिक स्क्यानबाट लगइन गर्नुहोस्",
    switchId: "सदस्य ID छ? ID बाट लगइन गर्नुहोस्",
    presidingOfficer: "सभामुख / कार्यव्यवस्था",
    authSubtitle: "कन्सोल पहुँच प्रमाणीकरण",
    adminUserPlaceholder: "प्रयोगकर्ता नाम",
    passwordPlaceholder: "गोप्य पासवर्ड",
    authSession: "सत्र प्रमाणीकरण गर्नुहोस्",
    authError: "गलत विवरण प्रविष्ट गरियो।",
    connError: "सम्पर्क त्रुटि। सर्भर चालु छ कि छैन जाँच्नुहोस्।",
    sunyaSamaya: "शून्य समय",
    aakasmikSamaya: "आकस्मिक समय",
    bisheshSamaya: "विशेष समय",
    selectSessionCategory: "संसदको समय स्लट छान्नुहोस्",
    aakasmikLimitReached: "तपाईंले यस आकस्मिक समयमा बोल्ने १ पटकको अवसर लिइसक्नु भएको छ।",
    resetAakasmikBtn: "आकस्मिक समयको लकआउट रिसेट गर्नुहोस्",
    topicClerkTitle: "विषय प्रविष्टि डेस्क (Topic Clerk)",
    topicClerkSubtitle: "सदस्यहरूको विषय तथा नेपाली विवरण प्रत्यक्ष प्रविष्टि तथा संशोधन",
    saveTopicBtn: "विषय सुरक्षित गरी अपडेट गर्नुहोस्",
    workerConsoleTitle: "संसदीय कार्यसञ्चालन तथा प्राविधिक डेस्क",
    workerConsoleSubtitle: "माननीय सदस्यहरूको वक्तव्य विषय, समय सीमा निर्धारण तथा सत्र लकआउट व्यवस्थापन",
    tabSetTopics: "वक्तव्य विषय निर्धारण",
    tabSetTime: "समय सीमा निर्धारण",
    tabSessionControl: "सत्र तथा लकआउट रिसेट",
    tabImportRoster: "कार्यसूची आयात (Excel / CSV)",
    selectMemberTopic: "विषय प्रविष्टि गर्न सदस्य छान्नुहोस्",
    selectMemberTime: "समय तोक्नको लागि सदस्य छान्नुहोस्",
    filterPlaceholder: "सदस्यको नाम वा ID बाट खोज्नुहोस्...",
    currentFloorSpeakerBadge: "हाल रोस्ट्रममा बोल्दै गरेका वक्ता",
    notSet: "खुलेको छैन",
    editingTopicFor: "विषय सम्पादन गर्दै",
    selectMemberLeftPrompt: "बायाँ सूचीबाट माननीय सदस्य छान्नुहोस्",
    topicEnglishLabel: "वक्तव्य विषय (अंग्रेजी)",
    topicEnglishPlaceholder: "उदा. Budget Allocation for Digital Governance",
    topicNepaliLabel: "वक्तव्य विषय (नेपाली)",
    topicNepaliPlaceholder: "उदा. डिजिटल सुशासनको लागि बजेट विनियोजन",
    topicAutoTransHelper: "नेपालीमा खाली छोडेमा अंग्रेजीबाट स्वतः नेपाली अनुवाद हुनेछ।",
    saveSyncTopicBtn: "विषय सुरक्षित गरी अपडेट गर्नुहोस्",
    allocatingTimeFor: "समय निर्धारण गर्दै",
    quickPresetsLabel: "द्रुत समय छनोट",
    exactDurationLabel: "यकिन बोल्ने समय सीमा",
    minutesLabel: "मिनेट",
    secondsLabel: "सेकेन्ड",
    saveSyncTimeBtn: "समय सीमा सुरक्षित गर्नुहोस्",
    realtimeFloorOverride: "प्रत्यक्ष सक्रिय वक्ताको समय परिमार्जन",
    sectionLockoutTitle: "सत्र लकआउट तथा पुनः पालो व्यवस्थापन",
    sectionLockoutSubtitle: "कुनै सत्रमा एकपटक बोलिसकेपछि पुनः पालो पाउन रिसेट गर्नुपर्ने व्यवस्था यहाँबाट नियन्त्रण गर्नुहोस्।",
    membersLockedOutText: "जना सदस्यले यस सत्रमा बोलिसकेका छन्",
    resetSunyaLockoutsBtn: "शून्य समयको लकआउट रिसेट",
    resetAakasmikLockoutsBtn: "आकस्मिक समयको लकआउट रिसेट",
    resetBisheshLockoutsBtn: "विशेष समयको लकआउट रिसेट",
    resetAllThreeLockoutsBtn: "तीनै सत्रको लकआउट एकैपटक रिसेट गर्नुहोस्",
    confirmResetLockout: "के तपाईं यस सत्रको लकआउट रिसेट गर्न निश्चित हुनुहुन्छ?",
    confirmResetAllLockouts: "के तपाईं तीनै वटै सत्रको लकआउट रिसेट गर्न निश्चित हुनुहुन्छ? सबै सदस्यले पुनः पालो माग्न पाउनेछन्।",
    selectMemberFirstAlert: "कृपया पहिले बायाँ सूचीबाट कुनै सदस्य छान्नुहोस्।",
    topicUpdatedAlert: "विषय सफलतापूर्वक सुरक्षित गरियो:",
    timeUpdatedAlert: "समय सीमा सफलतापूर्वक निर्धारण गरियो:"
  }
};

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('appLang') || 'en';
    } catch (e) {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('appLang', lang);
    } catch (e) {}
  }, [lang]);

  const toggleLanguage = () => {
    setLang(prev => (prev === 'en' ? 'ne' : 'en'));
  };

  const toDevanagariDigits = (numStr) => {
    if (numStr === null || numStr === undefined) return '';
    if (lang !== 'ne') return String(numStr);
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return String(numStr).replace(/[0-9]/g, (digit) => nepaliDigits[parseInt(digit, 10)]);
  };

  const getLocalizedText = (item, field) => {
    if (!item || !field) return '';

    if (lang !== 'ne') {
      return item[field] || '';
    }

    const neField = `${field}_ne`;
    const valNe = item[neField];

    if (valNe && typeof valNe === 'string' && /[\u0900-\u097F]/.test(valNe)) {
      return valNe;
    }

    const textToConvert = item[field] || valNe || '';
    return universalNepaliTransliterate(String(textToConvert));
  };

  const currentDict = translations[lang] || translations.en;

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLanguage, t: currentDict, toDevanagariDigits, getLocalizedText }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: 'en',
      t: translations.en,
      toggleLanguage: () => {},
      toDevanagariDigits: (s) => String(s || ''),
      getLocalizedText: (item, field) => (item && field ? item[field] || '' : '')
    };
  }
  return ctx;
};