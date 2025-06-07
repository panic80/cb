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
  UserGroupIcon,
  CogIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/solid';
import '../styles/sticky-footer.css';
import '../styles/landing.css';

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

  const [showModal, setShowModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  console.log('LandingPage rendered', { theme, showModal, showPrivacyModal, showAboutModal });
  useEffect(() => {
    const computedFont = window.getComputedStyle(document.body).getPropertyValue('font-family');
    console.log('Computed font-family on landing page:', computedFont);
  }, []);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showSOPSubmodal, setShowSOPSubmodal] = useState(false);
  const [showOnboardingSubmodal, setShowOnboardingSubmodal] = useState(false);
  
  // Refs for submodals to detect clicks outside
  const sopSubmodalRef = useRef(null);
  const onboardingSubmodalRef = useRef(null);

  // Handle clicks outside submodals
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if SOP submodal is open and click is outside
      if (showSOPSubmodal &&
          sopSubmodalRef.current &&
          !sopSubmodalRef.current.contains(event.target) &&
          !event.target.closest('[data-sop-trigger="true"]')) {
        setShowSOPSubmodal(false);
      }
      
      // Check if Onboarding submodal is open and click is outside
      if (showOnboardingSubmodal &&
          onboardingSubmodalRef.current &&
          !onboardingSubmodalRef.current.contains(event.target) &&
          !event.target.closest('[data-onboarding-trigger="true"]')) {
        setShowOnboardingSubmodal(false);
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup function
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSOPSubmodal, showOnboardingSubmodal]);

  const handleAboutClick = (e) => {
    e.preventDefault();
    setShowAboutModal(true);
  };

  return (
    <div className="root-container">
      <div className="flex flex-col min-h-screen">
        <div className="flex-grow">
          <div className="bg-[var(--background)] text-[var(--text)] pt-12">
            {/* Theme Toggle */}
            <div className="fixed top-4 right-4 z-50">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)] hover:scale-110"
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  // Moon icon for light mode
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  // Sun icon for dark mode
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
            
            {/* Hero Section */}
            <main
              ref={heroRef}
              className={`relative min-h-[90vh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-8 md:pb-12 hero-gradient overflow-hidden transition-opacity duration-1000 ${
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
                  className="mb-10 flex justify-center transform transition-all duration-500 hover:scale-110"
                >
                  <BuildingLibraryIcon
                    className="w-24 h-24 text-[var(--primary)] animate-scale"
                    style={{
                      filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))',
                    }}
                    aria-hidden="true"
                  />
                </div>

                {/* Title with Enhanced Typography */}
                <div className="space-y-6">
                  <h1
                    className="text-5xl md:text-7xl font-bold mb-4 animate-fade-up gradient-text"
                    style={{ animationDelay: '0.2s' }}
                    role="heading"
                    aria-level="1"
                  >
                    32 CBG G8 Administration Hub
                    <span
                      className="block text-xl md:text-2xl mt-6 text-[var(--text-secondary)] font-normal animate-fade-up"
                      style={{ animationDelay: '0.4s' }}
                    >
                      Streamlined Military Administration Portal
                    </span>
                  </h1>

                  <p
                    className="text-xl md:text-2xl text-center max-w-2xl mx-auto text-[var(--text)] opacity-90 leading-relaxed animate-fade-up glass p-6 rounded-2xl"
                    style={{ animationDelay: '0.6s' }}
                  >
                    Your comprehensive digital gateway to administrative resources, claims processing, and policy information. Designed to simplify and expedite your financial administrative tasks.
                  </p>
                </div>
              </div>

              {/* Elegant Scroll Indicator */}
              <div className="scroll-indicator animate-fade-in" style={{ animationDelay: '1s' }}>
                <ChevronDownIcon className="w-8 h-8 text-[var(--text-secondary)] animate-bounce" />
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
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 animate-fade-up gradient-text">
                  Essential Tools & Resources
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8 max-w-screen-2xl mx-auto">
                  {/* Policy Assistant Card - Disabled */}
                  <div
                    className={`group glass rounded-2xl p-8 transition-all duration-1000 transform w-full md:min-w-[350px] cursor-not-allowed opacity-60 ${
                      featuresVisible ? 'translate-y-0 opacity-60' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.2s' }}
                    aria-label="Policy Chat - Currently Unavailable"
                    title="Policy Assistant is temporarily unavailable for updates"
                  >
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gray-400 opacity-10 rounded-full blur-xl" />
                        <div className="relative">
                          <QuestionMarkCircleIcon className="w-16 h-16 text-gray-400" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-2xl font-semibold text-gray-500">
                          Policy Assistant
                        </h3>
                        <p className="text-gray-500 leading-relaxed">
                          Interactive AI-powered guide for policy inquiries and administrative procedures.
                          <span className="block text-orange-600 mt-2 font-medium text-sm">
                            🔧 Temporarily Unavailable for <span className="font-bold">Major Upgrades</span>
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SCIP Portal Card */}
                  <a
                    href="https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group card-hover glass rounded-2xl p-8 transition-all duration-1000 transform w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.4s' }}
                    aria-label="Access SCIP Platform"
                  >
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative transform transition-all duration-500 group-hover:scale-110">
                          <DocumentTextIcon className="w-16 h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                          SCIP Portal
                        </h3>
                        <p className="text-[var(--text)] opacity-80 leading-relaxed">
                          Streamlined Claims Interface Platform for efficient digital submission and processing of administrative claims.
                        </p>
                      </div>
                    </div>
                  </a>

                  {/* OPI Contact Card */}
                  <Link
                    to="/opi"
                    className={`group card-hover glass rounded-2xl p-8 transition-all duration-1000 transform w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.6s' }}
                    aria-label="Access Contact Information"
                  >
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative transform transition-all duration-500 group-hover:scale-110">
                          <UserGroupIcon className="w-16 h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                          Office of Primary Interest
                        </h3>
                        <p className="text-[var(--text)] opacity-80 leading-relaxed">
                          Find FSC & FMC contact information for your unit's financial services and management.
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* Administrative Tools Card */}
                  <div
                    onClick={() => setShowModal(true)}
                    className={`group card-hover glass rounded-2xl p-8 transition-all duration-1000 transform cursor-pointer w-full md:min-w-[350px] ${
                      featuresVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}
                    style={{ transitionDelay: '0.8s' }}
                    aria-label="Access Administrative Tools"
                  >
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-xl transform group-hover:scale-150 transition-transform duration-500" />
                        <div className="relative transform transition-all duration-500 group-hover:scale-110">
                          <WrenchScrewdriverIcon className="w-16 h-16 text-[var(--primary)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-2xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                          Administrative Tools
                        </h3>
                        <p className="text-[var(--text)] opacity-80 leading-relaxed">
                          Access SOPs, guides, and administrative resources for your unit.
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
                    <p>&copy; {new Date().getFullYear()} G8 Administration Hub</p>
                  </div>
                </div>
                
                {/* Desktop footer content */}
                <div className="hidden md:block">
                  <nav className="flex flex-wrap justify-center gap-6 sm:gap-8 mb-4" aria-label="Footer Navigation">
                    <a
                      href="#"
                      onClick={handleAboutClick}
                      className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1"
                    >
                      <InformationCircleIcon className="w-5 h-5" aria-hidden="true" />
                      <span>About</span>
                    </a>
                    <a
                      href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                      className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1"
                    >
                      <EnvelopeIcon className="w-5 h-5" aria-hidden="true" />
                      <span>Contact</span>
                    </a>
                    <div
                      onClick={() => setShowPrivacyModal(true)}
                      className="inline-flex items-center space-x-2 text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--primary)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded px-2 py-1 cursor-pointer"
                    >
                      <ShieldCheckIcon className="w-5 h-5" aria-hidden="true" />
                      <span>Privacy Policy</span>
                    </div>
                  </nav>
                  <div className="flex justify-between items-center text-sm text-[var(--text)] opacity-50">
                    <p>&copy; {new Date().getFullYear()} G8 Administration Hub. All rights reserved. Not affiliated with DND or CAF.</p>
                    <p>Last updated: June 6, 2025</p>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Administrative Tools Modal */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={() => setShowModal(false)} />
          <div className="fixed z-50 animate-float-up max-w-lg w-[90vw] mx-auto" style={{top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}>
            <div className="bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-semibold">Other Tools</h2>
                  <button 
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                    aria-label="Close modal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6">
                <ul className="divide-y divide-[var(--border)]">
                  {/* Administrative Tools Button */}
                  <li className="py-3 first:pt-0 relative group/item">
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.nativeEvent.stopImmediatePropagation();
                        setShowOnboardingSubmodal(false);
                        setShowSOPSubmodal(true);
                      }}
                      className="flex items-center p-3 rounded-lg hover:bg-[var(--background-secondary)] transition-all duration-200 group cursor-pointer"
                      data-sop-trigger="true"
                    >
                      <div className="p-2 rounded-lg bg-[var(--background-secondary)] group-hover:bg-[var(--primary)] transition-colors">
                        <DocumentTextIcon className="w-6 h-6 text-[var(--primary)] group-hover:text-white" />
                      </div>
                      <div className="ml-4">
                        <span className="block font-medium group-hover:text-[var(--primary)] transition-colors">Standard Operating Procedures</span>
                        <span className="text-sm text-[var(--text-secondary)]">Access SOPs and guidelines</span>
                      </div>
                      <svg className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    
                    <div
                      ref={sopSubmodalRef}
                      className={`absolute top-0 md:w-72 w-full bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl transition-all duration-300 ${showSOPSubmodal ? 'visible opacity-100 pointer-events-auto' : 'invisible opacity-0 pointer-events-none'}`}
                      style={{
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        zIndex: 100,
                        left: windowWidth < 768 ? '0' : 'calc(100% - 100px)',
                        maxHeight: windowWidth < 768 ? '60vh' : 'none',
                        overflowY: windowWidth < 768 ? 'auto' : 'visible'
                      }}>
                      <div className="bg-[var(--background-secondary)] rounded-xl" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                        <div className="p-4 border-b border-[var(--border)]">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Standard Operating Procedures</h3>
                            <button
                              className="p-2 hover:bg-[var(--background)] rounded-full transition-colors"
                              aria-label="Close submenu"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowSOPSubmodal(false);
                              }}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="p-4">
                          <ul className="divide-y divide-[var(--border)]">
                            <li className="py-2">
                              <a href="https://scribehow.com/embed-preview/Boots_Reimbursement_Submission_in_SCIP__oWwTYHb2QUeKqvtYJ3DMkg?as=video" target="_blank" rel="noopener noreferrer" className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2">How to Submit Boot Claims</a>
                            </li>
                            <li className="py-2">
                              <a href="https://scribehow.com/embed-preview/Initiating_TD_Claim_in_SCIP__GGXSDQBnSNq6H5GX_cZUuQ?as=video" target="_blank" rel="noopener noreferrer" className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2">How to Submit TD Claims</a>
                            </li>
                            <li className="py-2">
                              <a href="https://scribehow.com/embed-preview/Finalizing_a_TD_Claim_in_SCIP__w_JFn6AuTA--OpCHeFqYxA?as=video" target="_blank" rel="noopener noreferrer" className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2">How to Finalize TD Claims</a>
                            </li>
                          </ul>
                        </div>
                        <div className="p-4 border-t border-[var(--border)]">
                          <button
                            onClick={() => setShowSOPSubmodal(false)}
                            className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>

                  <li className="py-3 last:pb-0 relative group/item">
                    <div
                      className="flex items-center p-3 rounded-lg hover:bg-[var(--background-secondary)] transition-all duration-200 group cursor-pointer"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSOPSubmodal(false); setShowOnboardingSubmodal(true); }}
                      data-onboarding-trigger="true"
                    >
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg bg-[var(--background-secondary)] group-hover:bg-[var(--primary)] transition-colors">
                          <BuildingLibraryIcon className="w-6 h-6 text-[var(--primary)] group-hover:text-white" />
                        </div>
                        <div className="ml-4 text-left">
                          <span className="block font-medium group-hover:text-[var(--primary)] transition-colors">Onboarding Guide</span>
                          <span className="text-sm text-[var(--text-secondary)]">Collection of Onboarding SCIP Guides</span>
                        </div>
                        <svg className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                    <div
                      ref={onboardingSubmodalRef}
                      className={`absolute top-0 md:w-72 w-full bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl transition-all duration-300 ${showOnboardingSubmodal ? 'visible opacity-100 pointer-events-auto' : 'invisible opacity-0 pointer-events-none'}`}
                      style={{
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        zIndex: 100,
                        left: windowWidth < 768 ? '0' : 'calc(100% - 100px)',
                        maxHeight: windowWidth < 768 ? '60vh' : 'none',
                        overflowY: windowWidth < 768 ? 'auto' : 'visible'
                      }}>
                      <div className="bg-[var(--background-secondary)] rounded-xl" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                        <div className="p-4 border-b border-[var(--border)]">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Other Resources</h3>
                            <button
                              className="p-2 hover:bg-[var(--background)] rounded-full transition-colors cursor-pointer"
                              aria-label="Close submenu"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowOnboardingSubmodal(false);
                              }}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="p-4">
                          <ul className="divide-y divide-[var(--border)]">
                            <li className="py-2">
                              <a href="https://scribehow.com/embed-preview/SCIP_Mobile_Onboarding__qa62L6ezQi2nTzcp3nqq1Q?as=video" className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2">SCIP Mobile Onboarding Guide</a>
                             </li>
                             <li className="py-2">
                               <a href="/scip-desktop" className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2">SCIP Desktop Onboarding Guide (Coming Soon)</a>
                             </li>
                           </ul>
                         </div>
                        <div className="p-4 border-t border-[var(--border)]">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowOnboardingSubmodal(false);
                            }}
                            className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
              <div className="p-4 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-semibold">Privacy Policy</h2>
                  <button 
                    onClick={() => setShowPrivacyModal(false)}
                    className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                    aria-label="Close privacy modal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
                <div className="p-4 space-y-4">
                  <h3 className="text-lg font-semibold">General Privacy Notice</h3>
                  <p className="text-[var(--text)] leading-relaxed">
                    We prioritize the protection of your personal information and are committed to maintaining your trust.
                  </p>
                  
                  <h3 className="text-lg font-semibold mt-6">Data Collection & Usage</h3>
                  <ul className="list-disc pl-5 space-y-2 text-[var(--text)] opacity-80">
                    <li>We collect only essential information needed for the service</li>
                    <li>Your data is encrypted and stored securely</li>
                    <li>We do not sell or share your personal information</li>
                    <li>You have control over your data and can request its deletion</li>
                  </ul>

                  <h3 className="text-lg font-semibold mt-6">AI Processing (Gemini)</h3>
                  <p className="text-[var(--text)] leading-relaxed">
                    This application uses Google's Gemini AI. When you interact with our AI features:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-[var(--text)] opacity-80">
                    <li>Your conversations may be processed to improve responses</li>
                    <li>No personally identifiable information is retained by the AI</li>
                    <li>Conversations are not used to train the core AI model</li>
                    <li>You can opt out of AI features at any time</li>
                  </ul>

                  <p className="text-sm text-[var(--text-secondary)] mt-6">
                    For more details about Gemini's data handling, please visit Google's AI privacy policy.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
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
              <div className="p-6 border-b border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-semibold">About This Page</h2>
                  <button onClick={() => setShowAboutModal(false)}
                          className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                          aria-label="Close modal">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
                <p className="mb-4">
                  This unofficial site is not affiliated with the Department of National Defence (DND), the Canadian Armed Forces (CAF), or any associated departments or services. Use of this site is entirely at your own discretion.
                </p>
                <h3 className="font-semibold mb-2">Purpose</h3>
                <p className="mb-4">
                  Our goal is to provide Primary Reserve (P Res) members with quick and convenient access to essential G8 resources. We strive to streamline administrative processes and ensure you can locate accurate, up-to-date information whenever you need it.
                </p>
                <h3 className="font-semibold mb-2">Currently Available</h3>
                <ul className="list-disc list-inside mb-4">
                  <li>SCIP &ndash; Your centralized portal for financial and administrative functions</li>
                  <li>SOPs &ndash; Standard Operating Procedures for day-to-day reference</li>
                  <li>Onboarding Guide &ndash; A step-by-step manual to welcome and orient new members</li>
                </ul>
                <h3 className="font-semibold mb-2">Coming Soon</h3>
                <ul className="list-disc list-inside mb-4">
                  <li>Unofficial Policy Chatbot &ndash; An interactive tool designed to answer your questions about claims and travel entitlements, referencing the CFTDTI and NJC websites</li>
                </ul>
                <h3 className="font-semibold mb-2">Privacy & Contact</h3>
                <p className="mb-4">
                  For privacy concerns, please use the Contact button or refer to our Privacy Policy. Your feedback is always welcome, and we look forward to improving your administrative experience.
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Disclaimer: This page is not supported by the Defence Wide Area Network (DWAN).
                </p>
              </div>
              <div className="p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
                <button
                  onClick={() => setShowAboutModal(false)}
                  className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
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
