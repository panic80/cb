// src/components/PageLayout.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, MoonIcon, SunIcon } from '@heroicons/react/24/solid';

/**
 * A reusable layout component providing a consistent page structure with
 * a fixed navigation bar (back button, title, theme toggle) and themed content area.
 *
 * @param {object} props - The component props.
 * @param {string} props.title - The title to display in the navigation bar.
 * @param {React.ReactNode} props.children - The content to render within the layout.
 * @param {string} props.theme - The current theme ('light' or 'dark').
 * @param {function} props.onThemeChange - Callback function to toggle the theme.
 * @param {boolean} [props.showBackButton=true] - Whether to show the back button.
 * @param {boolean} [props.useGradientBackground=false] - Whether to apply the hero gradient background.
 */
export default function PageLayout({ title, children, theme, onThemeChange, showBackButton = true, useGradientBackground = false }) {
  const navigate = useNavigate();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Apply theme attribute
  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.classList.toggle('light', theme === 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  // Conditionally add hero-gradient class
  const wrapperClasses = `min-h-screen text-[var(--text-primary)] transition-colors duration-300 ${useGradientBackground ? 'hero-gradient' : 'bg-[var(--bg-primary)]'}`;

  return (
    <div className={wrapperClasses}>
      {/* Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-sm border-b border-[var(--border-color)] px-4 py-2 flex justify-between items-center h-16"> {/* Fixed height */}
         {/* Back Button (Conditional) */}
         {showBackButton ? (
           <button
             onClick={() => navigate('/')}
             className="flex items-center justify-center p-2 sm:p-3 bg-[var(--card-bg)] text-[var(--text-primary)] rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-[var(--border-color)] hover:border-[var(--primary-color)] hover:bg-[var(--bg-secondary)]"
             aria-label="Go back to home"
           >
             <ArrowLeftIcon className="w-5 h-5 sm:w-6 sm:h-6" />
           </button>
         ) : (
           <div className="w-10 h-10 sm:w-12 sm:h-12"></div> // Placeholder for spacing if no back button
         )}

         {/* Title */}
         <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] text-center truncate px-2">
            {title}
         </h1>

         {/* Theme Toggle Button */}
         <button
           onClick={toggleTheme}
           className="flex items-center justify-center p-2 sm:p-3 bg-[var(--card-bg)] text-[var(--text-primary)] rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-[var(--border-color)] hover:border-[var(--primary-color)] hover:bg-[var(--bg-secondary)]"
           aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
         >
           {theme === 'light' ? (
             <MoonIcon className="w-5 h-5 sm:w-6 sm:h-6" />
           ) : (
             <SunIcon className="w-5 h-5 sm:w-6 sm:h-6" />
           )}
         </button>
      </div>

      {/* Main Content Area */}
      {/* pt-16 matches navbar height */}
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-12 sm:pt-24">
        {children}
      </main>
    </div>
  );
}