import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  MagnifyingGlassIcon as Search, 
  UserGroupIcon, 
  EnvelopeIcon as Mail, 
  BuildingOfficeIcon as Building
} from '@heroicons/react/24/outline';
import {
  InformationCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/solid';
import '../styles/landing.css';
import '../styles/sticky-footer.css';
import { SITE_CONFIG, getCopyrightText, getLastUpdatedText } from '../constants/siteConfig';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { AnimatedButton } from '@/components/ui/animated-button';
import { EnhancedBackButton } from '@/components/ui/enhanced-back-button';
import { cn } from '@/lib/utils';

// Import FluentDesignView
import FluentDesignView from './OPIPage/FluentDesignView';

export default function OPIPage() {
  const location = useLocation();
  const topRef = useRef(null);
  const [contactView, setContactView] = useState('search');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  
  // Scroll to top on component mount and route change
  useLayoutEffect(() => {
    // Immediate scroll
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Find all scrollable containers and reset them
    const scrollableElements = document.querySelectorAll('*');
    scrollableElements.forEach(el => {
      if (el.scrollTop > 0) {
        el.scrollTop = 0;
      }
    });
    
    // Delayed scroll to handle any async content
    const timers = [0, 100, 300].map(delay => 
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        // Also scroll the ref into view
        if (topRef.current) {
          topRef.current.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      }, delay)
    );
    
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [location.pathname]);
  
  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);
  
  // Initialize theme from localStorage or system preference
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('elite-chat-theme');
    if (storedTheme) return storedTheme;
    
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Toggle between light and dark with smooth transition
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('elite-chat-theme', newTheme);
      return newTheme;
    });
  }, []);

  // Update document when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle About link click
  const handleAboutClick = (e) => {
    e.preventDefault();
    setShowAboutModal(true);
  };

  // Contact data
  const unitContacts = {
    '2 Int': {
      fsc: 'Cpl Downes',
      fscEmail: 'william.downes@forces.gc.ca',
      fmc: 'MCpl Angela McDonald',
      fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
    },
    '32 CBG HQ': {
      fsc: 'Cpl Downes',
      fscEmail: 'william.downes@forces.gc.ca',
      fmc: 'Sgt Gordon Brown',
      fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
    },
    '32 CER': {
      fsc: 'Cpl Downes',
      fscEmail: 'william.downes@forces.gc.ca',
      fmc: 'Sgt Gordon Brown',
      fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
    },
    '32 Svc Bn': {
      fsc: 'Cpl Downes',
      fscEmail: 'william.downes@forces.gc.ca',
      fmc: 'Sgt Gordon Brown',
      fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
    },
    'GGHG': {
      fsc: 'Cpl Downes',
      fscEmail: 'william.downes@forces.gc.ca',
      fmc: 'Sgt Jennifer Wood',
      fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
    },
    '48th Highrs': {
      fsc: 'Sgt Ro',
      fscEmail: 'eugene.ro@forces.gc.ca',
      fmc: 'Sgt Jennifer Wood',
      fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
    },
    '7 Tor': {
      fsc: 'Sgt Ro',
      fscEmail: 'eugene.ro@forces.gc.ca',
      fmc: 'Sgt Jennifer Wood',
      fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
    },
    'Tor Scots': {
      fsc: 'Sgt Ro',
      fscEmail: 'eugene.ro@forces.gc.ca',
      fmc: 'MCpl Angela McDonald',
      fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
    },
    'QOR': {
      fsc: 'Sgt Ro',
      fscEmail: 'eugene.ro@forces.gc.ca',
      fmc: 'Sgt Gordon Brown',
      fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
    },
    '32 Sig Regt': {
      fsc: 'Sgt Zeng',
      fscEmail: 'aidi.zeng@forces.gc.ca',
      fmc: 'MCpl Angela McDonald',
      fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
    },
    'Lorne Scots': {
      fsc: 'Sgt Zeng',
      fscEmail: 'aidi.zeng@forces.gc.ca',
      fmc: 'MCpl Angela McDonald',
      fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
    },
    'QY Rang': {
      fsc: 'Sgt Zeng',
      fscEmail: 'aidi.zeng@forces.gc.ca',
      fmc: 'Sgt Jennifer Wood',
      fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
    },
    'R Regt C': {
      fsc: 'Sgt Zeng',
      fscEmail: 'aidi.zeng@forces.gc.ca',
      fmc: 'Sgt Gordon Brown',
      fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
    },
    'Linc & Welld': {
      fsc: 'N/A',
      fscEmail: '',
      fmc: 'Sgt Mabel James',
      fmcEmail: 'MABEL.JAMES@forces.gc.ca',
    },
    '56 Fd': {
      fsc: 'N/A',
      fscEmail: '',
      fmc: 'Sgt Mabel James',
      fmcEmail: 'MABEL.JAMES@forces.gc.ca',
    },
  };

  const allUnits = Object.keys(unitContacts).sort();
  const filteredUnits = allUnits.filter(unit =>
    unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // FSC contacts organized by section
  const fscContacts = [
    {
      name: 'PO 1 Salehi',
      role: 'FSC Warrant Officer',
      email: 'Amir.Salehi@forces.gc.ca',
      isLeadership: true
    },
    {
      name: 'Sgt Zeng',
      role: 'FSC Second-in-Command',
      email: 'aidi.zeng@forces.gc.ca',
      isLeadership: true
    },
    {
      name: 'Cpl Downes',
      role: 'FSC 1 Section',
      email: 'william.downes@forces.gc.ca',
      units: ['2 Int', '32 CBG HQ', '32 CER', '32 Svc Bn', 'GGHG']
    },
    {
      name: 'Sgt Ro',
      role: 'FSC 2 Section',
      email: 'eugene.ro@forces.gc.ca',
      units: ['48th Highrs', '7 Tor', 'Tor Scots', 'QOR']
    },
    {
      name: 'Sgt Zeng',
      role: 'FSC 3 Section',
      email: 'aidi.zeng@forces.gc.ca',
      units: ['32 Sig Regt', 'Lorne Scots', 'QY Rang', 'R Regt C']
    }
  ];

  // FMC contacts organized by group
  const fmcContacts = [
    {
      name: 'Sgt Peter Cuprys',
      role: 'FMC Warrant Officer',
      email: 'PETER.CUPRYS@forces.gc.ca',
      units: [],
      isLeadership: true
    },
    {
      name: 'Sgt Jennifer Wood',
      role: 'FMC 1 Section',
      email: 'JENNIFER.WOOD@forces.gc.ca',
      units: ['GGHG', 'QY Rang', '7 Tor', '48th Highrs']
    },
    {
      name: 'Sgt Gordon Brown',
      role: 'FMC 2 Section',
      email: 'GORDON.BROWN2@forces.gc.ca',
      units: ['R Regt C', '32 Svc Bn', 'QOR', '32 CER']
    },
    {
      name: 'MCpl Angela McDonald',
      role: 'FMC 3 Section',
      email: 'ANGELA.MCDONALD@forces.gc.ca',
      units: ['32 Sig Regt', 'Lorne Scots', 'Tor Scots', '2 Int']
    },
    {
      name: 'Sgt Mabel James',
      role: 'FMC 4 Section',
      email: 'MABEL.JAMES@forces.gc.ca',
      units: ['Linc & Welld', '56 Fd']
    }
  ];

  return (
    <div ref={topRef} className="root-container" style={{ scrollBehavior: 'auto' }}>
      <div className="flex flex-col min-h-screen">
        <div className="flex-grow">
          <div className="bg-[var(--background)] text-[var(--text)]">

            {/* Header */}
            <header className="border-b border-[var(--border)] bg-background/95 backdrop-blur sticky top-0 z-40">
              <div className="h-14 px-4 flex items-center justify-between">
                <div className="flex items-center">
                  <EnhancedBackButton to="/" label="Back" variant="minimal" size="sm" />
                  <div className="h-6 w-px bg-border/50 mx-3" />
                  <UserGroupIcon className="w-8 h-8 text-[var(--primary)] mr-2" />
                  <span className="text-2xl font-bold text-foreground">
                    Office of Primary Interest
                  </span>
                </div>
              </div>
            </header>


            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-12">
              {/* Fluent Design View */}
              <FluentDesignView 
                unitContacts={unitContacts}
                fscContacts={fscContacts}
                fmcContacts={fmcContacts}
                contactView={contactView}
                selectedUnit={selectedUnit}
                searchTerm={searchTerm}
                setSelectedUnit={setSelectedUnit}
                setSearchTerm={setSearchTerm}
                setContactView={setContactView}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto px-4 sm:px-6 lg:px-8 border-t border-[var(--border)]" role="contentinfo">
          <div className="max-w-5xl mx-auto py-6">
            {/* Mobile-optimized footer content */}
            <div className="md:hidden">
              <nav className="flex justify-around my-2" aria-label="Footer Navigation">
                <a
                  href="#"
                  onClick={handleAboutClick}
                  className="inline-flex flex-col items-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1"
                >
                  <InformationCircleIcon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-xs mt-1">About</span>
                </a>
                <a
                  href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                  className="inline-flex flex-col items-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1"
                >
                  <EnvelopeIcon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-xs mt-1">Contact</span>
                </a>
                <div
                  onClick={() => setShowPrivacyModal(true)}
                  className="inline-flex flex-col items-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1 cursor-pointer"
                >
                  <ShieldCheckIcon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-xs mt-1">Privacy</span>
                </div>
              </nav>
              <div className="text-center text-xs text-[var(--text)] opacity-50 mt-1">
                <p>{getCopyrightText()}</p>
              </div>
            </div>
            
            {/* Desktop footer content */}
            <div className="hidden md:block">
              <nav className="flex flex-wrap justify-center gap-4 sm:gap-6 lg:gap-8 mb-4" aria-label="Footer Navigation">
                <a
                  href="#"
                  onClick={handleAboutClick}
                  className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1 text-sm sm:text-base"
                >
                  <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                  <span>About</span>
                </a>
                <a
                  href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                  className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1 text-sm sm:text-base"
                >
                  <EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                  <span>Contact</span>
                </a>
                <div
                  onClick={() => setShowPrivacyModal(true)}
                  className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1 cursor-pointer text-sm sm:text-base"
                >
                  <ShieldCheckIcon className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                  <span>Privacy Policy</span>
                </div>
              </nav>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs sm:text-sm text-[var(--text)] opacity-50">
                <p>{getCopyrightText()}</p>
                <p>{getLastUpdatedText()}</p>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Privacy Modal */}
      {showPrivacyModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
            onClick={() => setShowPrivacyModal(false)}
          />
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-float-up"
          >
            <div 
              className="w-[min(90vw,_32rem)] bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-semibold">Privacy Policy</h2>
                  <button 
                    onClick={() => setShowPrivacyModal(false)}
                    className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
                    aria-label="Close privacy modal"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-semibold">General Privacy Notice</h3>
                  <p className="text-sm sm:text-base text-[var(--text)] leading-relaxed">
                    We prioritize the protection of your personal information and are committed to maintaining your trust.
                  </p>
                  
                  <h3 className="text-base sm:text-lg font-semibold mt-4 sm:mt-6">Data Collection & Usage</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-[var(--text)] opacity-80">
                    <li>We collect only essential information needed for the service</li>
                    <li>Your data is encrypted and stored securely</li>
                    <li>We do not sell or share your personal information</li>
                    <li>You have control over your data and can request its deletion</li>
                  </ul>

                  <h3 className="text-base sm:text-lg font-semibold mt-4 sm:mt-6">AI Processing (Gemini)</h3>
                  <p className="text-sm sm:text-base text-[var(--text)] leading-relaxed">
                    This application uses Google's Gemini AI. When you interact with our AI features:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-[var(--text)] opacity-80">
                    <li>Your conversations may be processed to improve responses</li>
                    <li>No personally identifiable information is retained by the AI</li>
                    <li>Conversations are not used to train the core AI model</li>
                    <li>You can opt out of AI features at any time</li>
                  </ul>

                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-4 sm:mt-6">
                    For more details about Gemini's data handling, please visit Google's AI privacy policy.
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-full px-4 py-2 sm:py-3 text-center text-sm sm:text-base text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200 h-10 sm:h-12"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40 animate-fade-in" 
            onClick={() => setShowAboutModal(false)}
          />
          <div 
            className="fixed z-50 animate-float-up max-w-lg w-[90vw] mx-auto" 
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)"
            }}
          >
            <div className="bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl">
              <div className="p-4 sm:p-6 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-semibold">About This Page</h2>
                  <button onClick={() => setShowAboutModal(false)}
                          className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
                          aria-label="Close modal">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base">
                  This unofficial site is not affiliated with the Department of National Defence (DND), the Canadian Armed Forces (CAF), or any associated departments or services. Use of this site is entirely at your own discretion.
                </p>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Purpose</h3>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base">
                  Our goal is to provide Primary Reserve (P Res) members with quick and convenient access to essential G8 resources. We strive to streamline administrative processes and ensure you can locate accurate, up-to-date information whenever you need it.
                </p>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Currently Available</h3>
                <ul className="list-disc list-inside mb-3 sm:mb-4 text-sm sm:text-base space-y-1">
                  <li>SCIP &ndash; Your centralized portal for financial and administrative functions</li>
                  <li>SOPs &ndash; Standard Operating Procedures for day-to-day reference</li>
                  <li>Onboarding Guide &ndash; A step-by-step manual to welcome and orient new members</li>
                </ul>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Coming Soon</h3>
                <ul className="list-disc list-inside mb-3 sm:mb-4 text-sm sm:text-base">
                  <li>Unofficial Policy Chatbot &ndash; An interactive tool designed to answer your questions about claims and travel entitlements, referencing the CFTDTI and NJC websites</li>
                </ul>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Privacy & Contact</h3>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base">
                  For privacy concerns, please use the Contact button or refer to our Privacy Policy. Your feedback is always welcome, and we look forward to improving your administrative experience.
                </p>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  Disclaimer: This page is not supported by the Defence Wide Area Network (DWAN).
                </p>
              </div>
              <div className="p-4 sm:p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowAboutModal(false)}
                  className="w-full px-4 py-2 sm:py-3 text-center text-sm sm:text-base text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200 h-10 sm:h-12"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}