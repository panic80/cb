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
  CogIcon, // Keep existing icons
  WrenchScrewdriverIcon,
  MoonIcon, SunIcon // Add icons for theme toggle
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

export default function LandingPage({ theme, onThemeChange }) {
  // Removed useEffect that forced page reload on navigation

  // Set viewport height correctly for mobile browsers
  useEffect(() => {
    // First, get the viewport height
    const vh = window.innerHeight * 0.01;
    // Then set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // Update the height on window resize
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // This theme application logic is duplicated below (lines 114-117), removing this instance.

  // Add a style tag to the head to force scrolling to work
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      html, body, #root, .root-container {
        height: auto !important;
        min-height: 100%;
        min-height: 100vh;
        min-height: calc(var(--vh, 1vh) * 100);
        overflow-y: auto !important;
      }
      @media (max-width: 768px) {
        .mobile-layout {
          min-height: calc(var(--vh, 1vh) * 100);
          overflow-y: auto;
        }
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      if (document.head.contains(styleEl)) {
        document.head.removeChild(styleEl);
      }
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showSOPSubmodal, setShowSOPSubmodal] = useState(false);
  const [showOnboardingSubmodal, setShowOnboardingSubmodal] = useState(false);
  
  // Refs for submodals to detect clicks outside
  const sopSubmodalRef = useRef(null);
  const onboardingSubmodalRef = useRef(null);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Handle about click
  const handleAboutClick = (e) => {
    e.preventDefault();
    setShowAboutModal(true);
  };

  return (
    <div className="root-container">
      {/* Theme Toggle Button */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={toggleTheme}
          // Apply styles consistent with PageLayout
          className="flex items-center justify-center p-2 sm:p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)]"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {/* Use Heroicons consistent with PageLayout */}
          {theme === 'light' ? (
            <MoonIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <SunIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </button>
      </div>

      {/* Desktop Layout - Only visible at MD+ screens */}
      <div className="hidden md:flex flex-col min-h-screen bg-[var(--background)] text-[var(--text)]" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
        <div className="flex-grow flex items-center justify-center hero-gradient">
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

          <div className="container mx-auto px-4 flex items-center h-full">
            {/* Left Side - Logo and Text */}
            <div className="w-1/2 flex flex-col items-start justify-center pr-8 animate-fade-up">
              <div className="flex items-center mb-6">
                <img
                  src="https://www.canada.ca/content/dam/army-armee/migration/assets/army_internet/images/badges/badge-32-canadian-brigade-group.jpg"
                  alt="32 Canadian Brigade Group Badge"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain animate-scale"
                  style={{ filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))' }}
                />
                <div className="ml-6">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold gradient-text">
                    32 CBG G8
                  </h1>
                  <p className="text-xl md:text-2xl text-[var(--text-secondary)] mt-2">
                    Administration Hub
                  </p>
                </div>
              </div>
              
              <p className="text-lg md:text-xl max-w-xl text-[var(--text)] opacity-90 leading-relaxed glass p-5 rounded-xl">
                Your comprehensive digital gateway to administrative resources, claims processing, and policy information.
              </p>
            </div>

            {/* Center Divider */}
            <div className="h-3/4 w-px bg-gradient-to-b from-transparent via-[var(--border)] to-transparent mx-4"></div>

            {/* Right Side - Navigation Cards */}
            <div className="w-1/2 flex flex-col justify-center pl-8">
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {/* Policy Assistant Card */}
                <Link
                  to="/chat"
                  className="group card-hover glass rounded-xl p-4 transition-all duration-300 transform hover:scale-105 flex"
                  aria-label="Access Policy Chat Beta"
                >
                  <div className="flex items-center w-full">
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                      <div className="relative p-2">
                        <QuestionMarkCircleIcon className="w-10 h-10 text-[var(--primary)]" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                        Policy Assistant
                      </h3>
                      <p className="text-sm text-[var(--text)] opacity-80">
                        AI-powered policy guide
                        <span className="text-amber-500 ml-1 font-medium">(Beta)</span>
                      </p>
                    </div>
                  </div>
                </Link>

                {/* SCIP Portal Card */}
                <a
                  href="https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group card-hover glass rounded-xl p-4 transition-all duration-300 transform hover:scale-105 flex"
                  aria-label="Access SCIP Platform"
                >
                  <div className="flex items-center w-full">
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                      <div className="relative p-2">
                        <DocumentTextIcon className="w-10 h-10 text-[var(--primary)]" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                        SCIP Portal
                      </h3>
                      <p className="text-sm text-[var(--text)] opacity-80">
                        Claims submission system
                      </p>
                    </div>
                  </div>
                </a>

                {/* OPI Contact Card */}
                <Link
                  to="/opi"
                  className="group card-hover glass rounded-xl p-4 transition-all duration-300 transform hover:scale-105 flex"
                  aria-label="Access Contact Information"
                >
                  <div className="flex items-center w-full">
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                      <div className="relative p-2">
                        <UserGroupIcon className="w-10 h-10 text-[var(--primary)]" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                        OPI Contact
                      </h3>
                      <p className="text-sm text-[var(--text)] opacity-80">
                        FSC & FMC contacts
                      </p>
                    </div>
                  </div>
                </Link>

                {/* Administrative Tools Card */}
                <div
                  onClick={() => setShowModal(true)}
                  className="group card-hover glass rounded-xl p-4 transition-all duration-300 transform hover:scale-105 cursor-pointer flex"
                  aria-label="Access Administrative Tools"
                >
                  <div className="flex items-center w-full">
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                      <div className="relative p-2">
                        <WrenchScrewdriverIcon className="w-10 h-10 text-[var(--primary)]" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                        Admin Tools
                      </h3>
                      <p className="text-sm text-[var(--text)] opacity-80">
                        SOPs and resources
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Desktop Footer */}
        <footer className="border-t border-[var(--border)] bg-[var(--background)] py-3 px-4" role="contentinfo">
          <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <p className="text-xs text-[var(--text)] opacity-50">&copy; {new Date().getFullYear()} G8 Admin Hub</p>
              
              <nav className="flex space-x-4" aria-label="Footer Navigation">
                <a
                  href="#"
                  onClick={handleAboutClick}
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200" // Updated style
                >
                  <InformationCircleIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>About</span>
                </a>
                <a
                  href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200" // Updated style
                >
                  <EnvelopeIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>Contact</span>
                </a>
                <div
                  onClick={() => setShowPrivacyModal(true)}
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200 cursor-pointer" // Updated style
                >
                  <ShieldCheckIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>Privacy</span>
                </div>
              </nav>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Layout - Only visible below MD screens */}
      <div className="md:hidden flex flex-col w-full relative pt-20" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
        <div className="flex-grow">
          {/* Header Section with Logo */}
          <div className="flex flex-col items-center text-center mb-8 px-4 pt-20">
            <img
              src="https://www.canada.ca/content/dam/army-armee/migration/assets/army_internet/images/badges/badge-32-canadian-brigade-group.jpg"
              alt="32 Canadian Brigade Group Badge"
              className="w-28 h-28 object-contain animate-scale mb-6"
              style={{ filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))' }}
            />
            <h1 className="text-4xl font-bold gradient-text mb-2">
              32 CBG G8 Administration Hub
            </h1>
            <p className="text-lg text-[var(--text-secondary)]">
              Streamlined Military Administration Portal
            </p>
          </div>
          
          {/* Description */}
          <div className="mb-10 px-4">
            <p className="text-center text-[var(--text)] opacity-90 leading-relaxed glass p-5 rounded-xl">
              Your comprehensive digital gateway to administrative resources, claims processing, and policy information. Designed to simplify and expedite your financial administrative tasks.
            </p>
          </div>

          {/* Mobile Navigation Cards */}
          <div className="grid grid-cols-1 gap-4 mb-10 px-4">
            {/* Policy Assistant Card */}
            <Link
              to="/chat"
              className="group card-hover glass rounded-xl p-5 transition-all duration-300 flex"
              aria-label="Access Policy Chat Beta"
            >
              <div className="flex items-center w-full">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative p-2">
                    <QuestionMarkCircleIcon className="w-12 h-12 text-[var(--primary)]" aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                    Policy Assistant
                  </h3>
                  <p className="text-[var(--text)] opacity-80">
                    Interactive AI-powered guide for policy inquiries
                    <span className="text-amber-500 ml-1 font-medium">(Beta)</span>
                  </p>
                </div>
              </div>
            </Link>

            {/* SCIP Portal Card */}
            <a
              href="https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080"
              target="_blank"
              rel="noopener noreferrer"
              className="group card-hover glass rounded-xl p-5 transition-all duration-300 flex"
              aria-label="Access SCIP Platform"
            >
              <div className="flex items-center w-full">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative p-2">
                    <DocumentTextIcon className="w-12 h-12 text-[var(--primary)]" aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                    SCIP Portal
                  </h3>
                  <p className="text-[var(--text)] opacity-80">
                    Streamlined Claims Interface for digital submission
                  </p>
                </div>
              </div>
            </a>

            {/* OPI Contact Card */}
            <Link
              to="/opi"
              className="group card-hover glass rounded-xl p-5 transition-all duration-300 flex"
              aria-label="Access Contact Information"
            >
              <div className="flex items-center w-full">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative p-2">
                    <UserGroupIcon className="w-12 h-12 text-[var(--primary)]" aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                    Office of Primary Interest
                  </h3>
                  <p className="text-[var(--text)] opacity-80">
                    Find FSC & FMC contact information
                  </p>
                </div>
              </div>
            </Link>

            {/* Administrative Tools Card */}
            <div
              onClick={() => setShowModal(true)}
              className="group card-hover glass rounded-xl p-5 transition-all duration-300 cursor-pointer flex"
              aria-label="Access Administrative Tools"
            >
              <div className="flex items-center w-full">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative p-2">
                    <WrenchScrewdriverIcon className="w-12 h-12 text-[var(--primary)]" aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
                    Administrative Tools
                  </h3>
                  <p className="text-[var(--text)] opacity-80">
                    Access SOPs, guides, and resources
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Footer */}
        <footer className="border-t border-[var(--border)] bg-[var(--background)] py-4 px-4 mt-auto">
          <div className="container mx-auto">
            <div className="flex flex-col items-center">
              <p className="text-xs text-[var(--text)] opacity-50 text-center mb-3">&copy; {new Date().getFullYear()} G8 Admin Hub</p>
              
              <nav className="flex space-x-4" aria-label="Footer Navigation">
                <a
                  href="#"
                  onClick={handleAboutClick}
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200" // Updated style
                >
                  <InformationCircleIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>About</span>
                </a>
                <a
                  href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200" // Updated style
                >
                  <EnvelopeIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>Contact</span>
                </a>
                <div
                  onClick={() => setShowPrivacyModal(true)}
                  className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200 cursor-pointer" // Updated style
                >
                  <ShieldCheckIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span>Privacy</span>
                </div>
              </nav>
            </div>
          </div>
        </footer>
      </div>

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
