// Removed unused React import

export default function AboutModal({ show, onClose }) {
  if (!show) return null;

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={onClose} // Close modal when overlay is clicked
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onClose();
          }
        }}
        role="button" // Make it accessible as a button
        tabIndex="0" // Make it focusable
        aria-label="Close modal" // Add accessible label
      />
      {/* Modal Content Area */}
      <div
        className="fixed z-50 animate-float-up max-w-lg w-[90vw] mx-auto"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-[var(--border)]">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">About This Page</h2>
              <button
                onClick={onClose} // Use the passed onClose handler
                className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                aria-label="Close modal"
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
            className="p-6 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 16rem)" }}
          >
            <p className="mb-4">
              This unofficial site is not affiliated with the Department of
              National Defence (DND), the Canadian Armed Forces (CAF), or any
              associated departments or services. Use of this site is entirely
              at your own discretion.
            </p>
            <h3 className="font-semibold mb-2">Purpose</h3>
            <p className="mb-4">
              Our goal is to provide Primary Reserve (P Res) members with quick
              and convenient access to essential G8 resources. We strive to
              streamline administrative processes and ensure you can locate
              accurate, up-to-date information whenever you need it.
            </p>
            <h3 className="font-semibold mb-2">Currently Available</h3>
            <ul className="list-disc list-inside mb-4">
              <li>
                SCIP &ndash; Your centralized portal for financial and
                administrative functions
              </li>
              <li>
                SOPs &ndash; Standard Operating Procedures for day-to-day
                reference
              </li>
              <li>
                Onboarding Guide &ndash; A step-by-step manual to welcome and
                orient new members
              </li>
            </ul>
            <h3 className="font-semibold mb-2">Coming Soon</h3>
            <ul className="list-disc list-inside mb-4">
              {/* Removed list item for Policy Chatbot */}
            </ul>
            <h3 className="font-semibold mb-2">Privacy & Contact</h3>
            <p className="mb-4">
              For privacy concerns, please use the Contact button or refer to
              our Privacy Policy. Your feedback is always welcome, and we look
              forward to improving your administrative experience.
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Disclaimer: This page is not supported by the Defence Wide Area
              Network (DWAN).
            </p>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
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
