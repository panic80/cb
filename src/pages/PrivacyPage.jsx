// src/pages/PrivacyPage.jsx

import { ShieldCheckIcon } from "@heroicons/react/24/outline"; // For a potential icon

import PageLayout from "../components/PageLayout"; // Import the layout

export default function PrivacyPage({ theme, onThemeChange }) {
  // Accept theme props
  // Back navigation is handled by PageLayout

  return (
    <PageLayout
      title="Privacy Disclaimer"
      theme={theme}
      onThemeChange={onThemeChange}
    >
      {/* Optional: Add a header */}
      <div className="text-center mb-8 sm:mb-12 transition-all duration-300">
        <ShieldCheckIcon className="w-12 h-12 sm:w-16 sm:h-16 text-[var(--primary)] mx-auto mb-3 sm:mb-4 transition-colors duration-300" />
        <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 text-[var(--text-primary)] transition-colors duration-300">
          Privacy Information
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] transition-colors duration-300 px-4 max-w-2xl mx-auto">
          How your data is handled.
        </p>
      </div>

      {/* Content wrapped in a themed container */}
      <div className="bg-[var(--card)] rounded-xl shadow-lg border border-[var(--border)] p-4 sm:p-6 transition-all duration-300 space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold mb-3 text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            Privacy Overview
          </h2>
          <p className="text-base text-[var(--text-secondary)] mb-2">
            We value your privacy. This application collects minimal personal
            information required for policy assistance. All information provided
            is used solely for the purpose of delivering personalized services.
          </p>
          <p className="text-base text-[var(--text-secondary)] mb-2">
            By using this service, you consent to our privacy practices, which
            may include the collection, storage, and transmission of personal
            information as described.
          </p>
          <p className="text-base text-[var(--text-secondary)] mb-2">
            We will not share your data with third parties without your explicit
            consent, except as required by law.
          </p>
          <p className="text-base text-[var(--text-secondary)]">
            Please review our complete Privacy Policy for more detailed
            information. If you have any questions, please contact support.
          </p>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-semibold mb-3 text-[var(--text-primary)] border-b border-[var(--border)] pb-2">
            Data Retention Summary
          </h2>
          <p className="text-base text-[var(--text-secondary)] mb-2">
            For your personal account, your Gemini interactionsùincluding
            prompts and conversationsùare saved by default for up to 18 months.
            You can adjust this setting in your account to retain your data for
            only 3 months or extend it up to 36 months.
          </p>
          <p className="text-base text-[var(--text-secondary)]">
            Additionally, even if you opt out of detailed activity tracking,
            temporary records may be maintained for up to 72 hours to keep the
            service running smoothly. These records are not visible in your
            activity log and can be manually deleted at any time.
          </p>
        </div>
      </div>
      {/* No close button needed, handled by PageLayout's back button */}
    </PageLayout>
  );
}
