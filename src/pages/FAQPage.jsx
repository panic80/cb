// src/pages/FAQPage.jsx

import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline"; // For a potential icon

import PageLayout from "../components/PageLayout"; // Import the layout
import TopFAQs from "../components/TopFAQs";

const FAQPage = ({ theme, onThemeChange }) => {
  // Accept theme props
  return (
    <PageLayout
      title="Frequently Asked Questions"
      theme={theme}
      onThemeChange={onThemeChange}
    >
      {/* Optional: Add a header similar to OPIPage */}
      <div className="text-center mb-8 sm:mb-12 transition-all duration-300">
        <QuestionMarkCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 text-[var(--primary)] mx-auto mb-3 sm:mb-4 transition-colors duration-300" />
        <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 text-[var(--text-primary)] transition-colors duration-300">
          FAQs
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] transition-colors duration-300 px-4 max-w-2xl mx-auto">
          Find answers to common questions.
        </p>
      </div>

      {/* Wrap TopFAQs in a themed container if needed, or apply directly */}
      <div className="bg-[var(--card)] rounded-xl shadow-lg border border-[var(--border)] p-4 sm:p-6 transition-all duration-300">
        <TopFAQs visible={true} />
      </div>
    </PageLayout>
  );
};

export default FAQPage;
