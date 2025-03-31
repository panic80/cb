import { useEffect, useState, useRef } from "react";

import {
  InformationCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/solid";

import "../styles/sticky-footer.css";
import "../styles/landing.css";
import AboutModal from "../components/AboutModal"; // Import the About modal component
import AdminToolsModal from "../components/AdminToolsModal"; // Import the new modal component
import LandingCard from "../components/LandingCard"; // Import the new LandingCard component
import PrivacyModal from "../components/PrivacyModal"; // Import the Privacy modal component
// Removed unused useIntersectionObserver hook

export default function LandingPage({ theme, onThemeChange }) {
  // Removed useEffect that forced page reload on navigation

  // Set viewport height correctly for mobile browsers
  useEffect(() => {
    // First, get the viewport height
    const vh = window.innerHeight * 0.01;
    // Then set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty("--vh", `${vh}px`);

    // Update the height on window resize
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // This theme application logic is duplicated below (lines 114-117), removing this instance.

  // Removed useEffect that injected scrolling override styles.
  // This should ideally be handled via CSS if needed.

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  // Removed unused Intersection observer call

  // Update document when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Removed useEffect for preloading chat route

  const [showModal, setShowModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  // windowWidth, showSOPSubmodal, showOnboardingSubmodal, and related refs/effects are removed
  // as they are now handled within AdminToolsModal.jsx

  // Removed useEffect for handling clicks outside submodals.
  // This logic is now encapsulated within AdminToolsModal.jsx

  // Handle about click
  const handleAboutClick = (e) => {
    e.preventDefault();
    setShowAboutModal(true);
  };

  return (
    <div className="root-container flex flex-col min-h-screen">
      {/* Theme Toggle Button */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={toggleTheme}
          // Apply styles consistent with PageLayout
          className="flex items-center justify-center p-2 sm:p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)]"
          aria-label={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          {/* Use Heroicons consistent with PageLayout */}
          {theme === "light" ? (
            <MoonIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <SunIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </button>
      </div>

      {/* Desktop Layout - Only visible at MD+ screens */}
      {/* Apply flex-grow here */}
      <div
        className="hidden md:flex flex-col flex-grow bg-[var(--background)] text-[var(--text)]"
      >
        <div className="flex-grow flex items-center justify-center hero-gradient">
          {/* Decorative Background Elements */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
              style={{
                background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                top: "-10%",
                left: "-10%",
              }}
            />
            <div
              className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
              style={{
                background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                bottom: "-10%",
                right: "-10%",
                animationDelay: "-1.5s",
              }}
            />
          </div>

          <div className="container mx-auto px-4 flex items-start h-full">
            {/* Left Side - Logo and Text */}
            {/* Adjusted width to w-2/5 for text block */}
            <div className="w-2/5 flex flex-col items-start justify-center pr-8 animate-fade-up">
              <div className="flex items-center mb-6">
                <img
                  src="https://www.canada.ca/content/dam/army-armee/migration/assets/army_internet/images/badges/badge-32-canadian-brigade-group.jpg"
                  alt="32 Canadian Brigade Group Badge"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain animate-scale"
                  style={{
                    filter:
                      "drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))",
                  }}
                />
                <div className="ml-6">
                  {/* Updated Headline */}
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold gradient-text">
                    32 CBG G8 Hub
                  </h1>
                  {/* Updated Subtitle */}
                  {/* Moved Description Here */}
                  <p className="text-lg md:text-xl max-w-xl text-[var(--text)] opacity-90 leading-relaxed mt-6">
                    Your digital gateway for administrative resources, claims, and policy
                    information.
                  </p>
                </div>
              </div>
              {/* Description paragraph moved up */}
            </div>

            {/* Center Divider */}
            <div className="h-3/4 w-px bg-gradient-to-b from-transparent via-[var(--border)] to-transparent mx-4"></div>

            {/* Right Side - Navigation Cards */}
            {/* Adjusted width to w-3/5 for card block */}
            <div className="w-3/5 flex flex-col pl-8">
              {/* Replaced with LandingCard component calls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                {/* Removed Policy Assistant LandingCard */}
                <LandingCard
                  href="https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080"
                  iconName="DocumentTextIcon"
                  title="SCIP Portal"
                  description="Claims submission system"
                  ariaLabel="Access SCIP Platform"
                />
                <LandingCard
                  to="/opi"
                  iconName="UserGroupIcon"
                  title="OPI Contact"
                  description="FSC & FMC contacts"
                  ariaLabel="Access Contact Information"
                />
                <LandingCard
                  onClick={() => setShowModal(true)}
                  iconName="WrenchScrewdriverIcon"
                  title="Admin Tools"
                  description="SOPs and resources"
                  ariaLabel="Access Administrative Tools"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Mobile Layout - Only visible below MD screens */}
      {/* Apply flex-grow here */}
      <div
        className="md:hidden flex flex-col flex-grow w-full relative" // Removed pt-20
      >
        {/* Remove redundant flex-grow from inner div */}
        <div className="pt-20"> {/* Added pt-20 here */}
          {/* Header Section with Logo */}
          <div className="flex flex-col items-center text-center mb-8 px-4"> {/* Removed redundant pt-20 */}
            <img
              src="https://www.canada.ca/content/dam/army-armee/migration/assets/army_internet/images/badges/badge-32-canadian-brigade-group.jpg"
              alt="32 Canadian Brigade Group Badge"
              className="w-28 h-28 object-contain animate-scale mb-6"
              style={{
                filter: "drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))",
              }}
            />
            {/* Updated Headline */}
            <h1 className="text-4xl font-bold gradient-text mb-2">
              32 CBG G8 Hub
            </h1>
            {/* Updated Subtitle */}
            {/* Moved Description Here */}
            <p className="text-center text-[var(--text)] opacity-90 leading-relaxed mt-4 px-4">
              Your digital gateway for administrative resources, claims, and policy
              information.
            </p>
          </div>

          {/* LandingCard grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 px-4">
            {/* Removed Policy Assistant LandingCard */}
            {/* Descriptions updated below reflect changes planned for LandingCard.jsx */}
            <LandingCard
              href="https://apps.powerapps.com/play/e/default-325b4494-1587-40d5-bb31-8b660b7f1038/a/75e3789b-9c1d-4feb-9515-20665ab7d6e8?tenantId=325b4494-1587-40d5-bb31-8b660b7f1038&amp;hint=c63b9850-8dc3-44f2-a186-f215cf7de716&amp;sourcetime=1738854913080"
              iconName="DocumentTextIcon"
              title="SCIP Portal"
              description="Submit or track claims" // Updated description
              ariaLabel="Access SCIP Platform"
            />
            <LandingCard
              to="/opi"
              iconName="UserGroupIcon"
              title="OPI Contact" // Kept shorter title consistent with desktop
              description="Find FSC & FMC contacts" // Updated description
              ariaLabel="Access Contact Information"
            />
            <LandingCard
              onClick={() => setShowModal(true)}
              iconName="WrenchScrewdriverIcon"
              title="Admin Tools" // Kept shorter title consistent with desktop
              description="Access SOPs and resources" // Updated description
              ariaLabel="Access Administrative Tools"
            />
          </div>

          {/* Description paragraph moved up */}
          </div>
        </div>


      {/* Use the new AdminToolsModal component */}
      <AdminToolsModal show={showModal} onClose={() => setShowModal(false)} />

      {/* Use the new PrivacyModal component */}
      <PrivacyModal
        show={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* Use the new AboutModal component */}
      <AboutModal
        show={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
      {/* Closing div moved after modals */}
      {/* Unified Footer */}
      <footer
        className="border-t border-[var(--border)] bg-[var(--background)] py-3 px-4 mt-auto"
        role="contentinfo"
      >
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <p className="text-xs text-[var(--text)] opacity-50 text-center sm:text-left mb-2 sm:mb-0">
              &copy; {new Date().getFullYear()} G8 Admin Hub
            </p>

            <nav className="flex space-x-4" aria-label="Footer Navigation">
              <button
                onClick={handleAboutClick}
                className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200"
              >
                <InformationCircleIcon
                  className="w-4 h-4 mr-1"
                  aria-hidden="true"
                />
                <span>About</span>
              </button>
              <a
                href="mailto:g8@sent.com?subject=Contacting%20from%20G8%20homepage"
                className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200"
              >
                <EnvelopeIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                <span>Contact</span>
              </a>
              <div
                onClick={() => setShowPrivacyModal(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setShowPrivacyModal(true);
                  }
                }}
                role="button"
                tabIndex="0"
                className="inline-flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors duration-200 cursor-pointer"
              >
                <ShieldCheckIcon
                  className="w-4 h-4 mr-1"
                  aria-hidden="true"
                />
                <span>Privacy</span>
              </div>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

