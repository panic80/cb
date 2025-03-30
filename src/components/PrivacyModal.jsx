// Removed unused React import

export default function PrivacyModal({ show, onClose }) {
  if (!show) return null;

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={onClose} // Close modal when overlay is clicked
        onKeyDown={(e) => {
          // Add keyboard accessibility
          if (e.key === "Enter" || e.key === " ") {
            onClose();
          }
        }}
        role="button" // Make it accessible as a button
        tabIndex="0" // Make it focusable
        aria-label="Close privacy modal" // Add accessible label
      />
      {/* Modal Content Area */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-float-up">
        <div className="w-[min(90vw,_32rem)] bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Privacy Policy</h2>
              <button
                onClick={onClose} // Use the passed onClose handler
                className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                aria-label="Close privacy modal"
              >
                {/* Close Icon */}
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 16rem)" }}
          >
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold">General Privacy Notice</h3>
              <p className="text-[var(--text)] leading-relaxed">
                We prioritize the protection of your personal information and
                are committed to maintaining your trust.
              </p>

              <h3 className="text-lg font-semibold mt-6">
                Data Collection & Usage
              </h3>
              <ul className="list-disc pl-5 space-y-2 text-[var(--text)] opacity-80">
                <li>
                  We collect only essential information needed for the service
                </li>
                <li>Your data is encrypted and stored securely</li>
                <li>We do not sell or share your personal information</li>
                <li>
                  You have control over your data and can request its deletion
                </li>
              </ul>

              <h3 className="text-lg font-semibold mt-6">
                AI Processing (Gemini)
              </h3>
              <p className="text-[var(--text)] leading-relaxed">
                This application uses Google&apos;s Gemini AI. When you interact
                with our AI features:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-[var(--text)] opacity-80">
                <li>
                  Your conversations may be processed to improve responses
                </li>
                <li>
                  No personally identifiable information is retained by the AI
                </li>
                <li>Conversations are not used to train the core AI model</li>
                <li>You can opt out of AI features at any time</li>
              </ul>

              <p className="text-sm text-[var(--text-secondary)] mt-6">
                For more details about Gemini&apos;s data handling, please visit
                Google&apos;s AI privacy policy.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
            <button
              onClick={onClose} // Use the passed onClose handler
              className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
