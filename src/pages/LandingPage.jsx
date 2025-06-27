import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  WindowIcon,
  BuildingLibraryIcon,
  InformationCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserGroupIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  SparklesIcon as CrownIcon,
  BookOpenIcon
} from '@heroicons/react/24/solid';
import '../styles/sticky-footer.css';
import '../styles/landing.css';
import { SITE_CONFIG, getCopyrightText, getLastUpdatedText } from '../constants/siteConfig';

const useIntersectionObserver = (options = {}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.1, ...options });

    const currentElement = elementRef.current;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, [options]);

  return [elementRef, isVisible];
};

export default function LandingPage() {
  // Force reload on each visit unless it's already a reload
  useEffect(() => {
    if (window.performance && window.performance.navigation.type === window.performance.navigation.TYPE_NAVIGATE) {
      window.location.reload();
    }
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

  // Intersection observers for animations
  const [heroRef, heroVisible] = useIntersectionObserver();
  const [featuresRef, featuresVisible] = useIntersectionObserver();

  // Update document when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Preload the chat route for faster navigation
    const preloadChat = () => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = '/chat';
      document.head.appendChild(link);
    };
    preloadChat();
  }, []);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showSCIPConfirmation, setShowSCIPConfirmation] = useState(false);
  
  console.log('Privacy modal state:', showPrivacyModal);
  
  useEffect(() => {
    const computedFont = window.getComputedStyle(document.body).getPropertyValue('font-family');
    console.log('Computed font-family on landing page:', computedFont);
  }, []);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);


  const handleAboutClick = (e) => {
    e.preventDefault();
    setShowAboutModal(true);
  };

  const handleSCIPClick = (e) => {
    e.preventDefault();
    setShowSCIPConfirmation(true);
  };

  const confirmSCIPNavigation = () => {
    window.open('https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080', '_blank', 'noopener,noreferrer');
    setShowSCIPConfirmation(false);
  };

  return (
    <div className="root-container">
      <div className="flex flex-col min-h-screen">
        <div className="flex-grow">
          <div className="bg-[var(--background)] text-[var(--text)] pt-12">
            {/* Theme Toggle */}
            <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center p-2 sm:p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)] hover:scale-110"
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  // Moon icon for light mode
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  // Sun icon for dark mode
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
            
            {/* Hero Section */}
            <main
              ref={heroRef}
              className={`relative min-h-[70vh] sm:min-h-[80vh] md:min-h-[90vh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8 md:pb-12 hero-gradient overflow-hidden transition-opacity duration-1000 ${
                heroVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* Decorative Background Elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
                  style={{
                    background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                    top: '-10%',
                    left: '-10%',
                  }}
                />
                <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
                  style={{
                    background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                    bottom: '-10%',
                    right: '-10%',
                    animationDelay: '-1.5s',
                  }}
                />
              </div>

              <div className="w-full max-w-4xl mx-auto text-center relative z-10">
                {/* Animated Icon */}
                <div
                  className="mb-6 sm:mb-8 md:mb-10 flex justify-center transform transition-all duration-300 hover:scale-110"
                >
                  <BuildingLibraryIcon
                    className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-[var(--primary)] animate-scale"
                    style={{
                      filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))',
                    }}
                    aria-hidden="true"
                  />
                </div>

                {/* Title with Enhanced Typography */}
                <div className="space-y-4 sm:space-y-6">
                  <h1
                    className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-3 sm:mb-4 animate-fade-up gradient-text"
                    style={{ animationDelay: '0.2s' }}
                    role="heading"
                    aria-level="1"
                  >
                    32 CBG G8<br />Administration Hub
                    <span
                      className="block text-sm sm:text-lg md:text-xl lg:text-2xl mt-3 sm:mt-4 md:mt-6 text-[var(--text-secondary)] font-normal animate-fade-up"
                      style={{ animationDelay: '0.4s' }}
                    >
                      Streamlined Military Administration Portal
                    </span>
                  </h1>

                  <p
                    className="text-base sm:text-lg md:text-xl lg:text-2xl text-center max-w-2xl mx-auto text-[var(--text)] opacity-90 leading-relaxed animate-fade-up glass p-4 sm:p-6 rounded-2xl"
                    style={{ animationDelay: '0.6s' }}
                  >
                    Your comprehensive digital gateway to administrative resources, claims processing, and policy information. Designed to simplify and expedite your financial administrative tasks.
                  </p>
                </div>
              </div>

              {/* Elegant Scroll Indicator */}
              <div className="scroll-indicator animate-fade-in mt-4 sm:mt-6" style={{ animationDelay: '1s' }}>
                <ChevronDownIcon className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--text-secondary)] animate-bounce" />
              </div>
            </main>

            {/* Features Grid Section */}
            <section
              ref={featuresRef}
              className={`relative py-24 px-4 sm:px-6 lg:px-8 bg-[var(--background-secondary)] transition-all duration-1000 transform ${
                featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
              aria-label="Features"
            >
              <div className="mx-auto">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-8 sm:mb-12 md:mb-16 animate-fade-up gradient-text">
                  Essential Tools & Resources
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 max-w-screen-2xl mx-auto">
                  {/* Policy Assistant Card */}
                  <Link
                    to="/chat"
                    className={`group card-hover glass rounded-2xl p-4 sm:p-6 md:p-8 transition-opacity duration-1000 transform w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.2s' }}
                    aria-label="Policy Chat - Ask questions about policies"
                  >
                    <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-300" />
                        <div className="relative transform transition-all duration-300 group-hover:scale-110">
                          <QuestionMarkCircleIcon className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300 flex items-center gap-2 justify-center">
                          Policy Assistant
                          <CrownIcon className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500" />
                        </h3>
                        <p className="text-sm sm:text-base text-[var(--text)] opacity-80 leading-relaxed">
                          Interactive AI-powered guide for policy inquiries and administrative procedures.
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* SCIP Portal Card */}
                  <Link
                    to="#"
                    onClick={handleSCIPClick}
                    className={`group card-hover glass rounded-2xl p-4 sm:p-6 md:p-8 transition-opacity duration-1000 transform w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.4s' }}
                    aria-label="Access SCIP Platform"
                  >
                    <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-300" />
                        <div className="relative transform transition-all duration-300 group-hover:scale-110">
                          <DocumentTextIcon className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                          SCIP Portal
                        </h3>
                        <p className="text-sm sm:text-base text-[var(--text)] opacity-80 leading-relaxed">
                          Streamlined Claims Interface Platform for efficient digital submission and processing of administrative claims.
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* OPI Contact Card */}
                  <Link
                    to="/opi"
                    className={`group card-hover glass rounded-2xl p-4 sm:p-6 md:p-8 transition-opacity duration-1000 transform w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.6s' }}
                    aria-label="Access Contact Information"
                  >
                    <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-300" />
                        <div className="relative transform transition-all duration-300 group-hover:scale-110">
                          <UserGroupIcon className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                          Office of Primary Interest
                        </h3>
                        <p className="text-sm sm:text-base text-[var(--text)] opacity-80 leading-relaxed">
                          Find FSC & FMC contact information for your unit's financial services and management.
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* Resource Library Card */}
                  <div
                    className={`relative glass rounded-2xl p-4 sm:p-6 md:p-8 transition-opacity duration-1000 transform w-full md:min-w-[350px] cursor-not-allowed ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.8s' }}
                    aria-label="Resource Library - Under Update"
                  >
                    {/* Overlay for disabled state */}
                    <div className="absolute inset-0 bg-[var(--background)]/50 rounded-2xl z-10 flex items-center justify-center">
                      <div className="bg-[var(--primary)] text-white px-4 py-2 rounded-full font-medium text-sm shadow-lg animate-pulse">
                        🚧 Under Update
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6 opacity-50">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl" />
                        <div className="relative">
                          <BookOpenIcon className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[var(--text)]">
                          Resource Library
                        </h3>
                        <p className="text-sm sm:text-base text-[var(--text)] opacity-80 leading-relaxed">
                          Access SOPs, how-to guides, FAQs, templates, and comprehensive administrative documentation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

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
        </div>
      </div>

      {/* Modals */}
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
                    onClick={() => {
                      console.log('Closing privacy modal');
                      setShowPrivacyModal(false);
                    }}
                    className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors duration-300 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
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
                  className="w-full px-4 py-2 sm:py-3 text-center text-sm sm:text-base text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-300 h-10 sm:h-12"
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
                          className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors duration-300 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
                          aria-label="Close modal">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-[var(--primary)]">
                  32 CBG G8 Admin Hub
                </h3>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base">
                  A comprehensive digital platform designed to streamline administrative processes for Canadian Armed Forces personnel, with a focus on travel claims, policy guidance, and financial services.
                </p>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Key Features</h3>
                <ul className="list-disc list-inside mb-3 sm:mb-4 text-sm sm:text-base space-y-1">
                  <li><strong className="text-[var(--primary)]">Policy Assistant</strong> &ndash; AI-powered chatbot providing instant guidance on CFTDTI policies, travel claims, and administrative procedures</li>
                  <li><strong className="text-[var(--primary)]">SCIP Portal</strong> &ndash; Direct access to the Streamlined Claims Interface Platform for digital claim submission</li>
                  <li><strong className="text-[var(--primary)]">OPI Contacts</strong> &ndash; Comprehensive directory of Financial Services (FSC) and Financial Management (FMC) personnel across 32 CBG units</li>
                  <li><strong className="text-[var(--primary)]">Administrative Tools</strong> &ndash; SOPs, onboarding guides, and essential resources for efficient unit administration</li>
                </ul>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Built for Efficiency</h3>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base">
                  This portal consolidates multiple resources into a single, user-friendly interface, reducing the time spent searching for information and ensuring consistent access to up-to-date policies and contacts.
                </p>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Disclaimer</h3>
                <p className="mb-3 sm:mb-4 text-sm sm:text-base text-[var(--text-secondary)]">
                  This is an unofficial site not affiliated with DND, CAF, or any government department. Information provided is for reference only. Always verify critical information through official channels.
                </p>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  Not supported by the Defence Wide Area Network (DWAN). Use at your own discretion.
                </p>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-4 pt-4 border-t border-[var(--border)]">
                  Maintained by the 32 CBG G8 Team
                </p>
              </div>
              <div className="p-4 sm:p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowAboutModal(false)}
                  className="w-full px-4 py-2 sm:py-3 text-center text-sm sm:text-base text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-300 h-10 sm:h-12"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SCIP Confirmation Modal */}
      {showSCIPConfirmation && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40 animate-fade-in" 
            onClick={() => setShowSCIPConfirmation(false)}
          />
          <div 
            className="fixed z-50 animate-float-up max-w-md w-[90vw] mx-auto" 
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)"
            }}
          >
            <div className="bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl">
              <div className="p-4 sm:p-6 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl sm:text-2xl font-semibold">SCIP Portal</h2>
                  <button 
                    onClick={() => setShowSCIPConfirmation(false)}
                    className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors duration-300 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
                    aria-label="Close modal"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <p className="mb-4 text-sm sm:text-base">
                  You are about to navigate to the SCIP Portal, which is an external Microsoft PowerApps platform. Have your D365 login (@ecn.forces.gc.ca) ready.
                </p>
                <p className="mb-6 text-sm sm:text-base text-[var(--text-secondary)]">
                  This will open in a new tab. Do you want to continue?
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowSCIPConfirmation(false)}
                    className="px-4 py-2 text-sm sm:text-base text-[var(--text)] bg-[var(--background-secondary)] hover:bg-[var(--background)] rounded-lg transition-colors duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSCIPNavigation}
                    className="px-4 py-2 text-sm sm:text-base text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-lg transition-colors duration-300"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
