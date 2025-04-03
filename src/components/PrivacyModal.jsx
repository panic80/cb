// Removed unused React import

export default function PrivacyModal({ show, onClose }) {
  if (!show) return null;

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm animate-fade-in flex items-center justify-center"
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
      <div className="fixed z-50 animate-scale flex items-center justify-center inset-0 pointer-events-none">
        <div className="pointer-events-auto">
        <div className="w-[min(90vw,_32rem)] bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[var(--border)]">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-[var(--primary)]">Privacy Policy</h2>
              <button
                onClick={onClose} // Use the passed onClose handler
                className="p-2 hover:bg-[var(--background-secondary)] hover:text-[var(--primary)] rounded-full transition-all duration-200 transform hover:scale-110"
                aria-label="Close privacy modal"
              >
                {/* Close Icon */}
                <svg
                  className="w-6 h-6"
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
            <div className="p-6 space-y-6">
              <div className="bg-[var(--background-secondary)] p-4 rounded-lg border-l-4 border-[var(--primary)]">
                <h3 className="text-xl font-semibold mb-2">General Privacy Notice</h3>
                <p className="text-[var(--text)] leading-relaxed">
                  We prioritize the protection of your personal information and
                  are committed to maintaining your trust.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Data Collection & Usage
                </h3>
                <ul className="list-none space-y-3 text-[var(--text)] pl-5">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>We collect only essential information needed for the service</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Your data is encrypted and stored securely</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>We do not sell or share your personal information</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>You have control over your data and can request its deletion</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  AI Processing (Gemini)
                </h3>
                <p className="text-[var(--text)] leading-relaxed mb-3">
                  This application uses Google&apos;s Gemini AI. When you interact
                  with our AI features:
                </p>
                <ul className="list-none space-y-3 text-[var(--text)] pl-5 mb-4">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Your conversations may be processed to improve responses</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>No personally identifiable information is retained by the AI</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Conversations are not used to train the core AI model</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>You can opt out of AI features at any time</span>
                  </li>
                </ul>
              </div>

              <div className="bg-[var(--background-secondary)] p-4 rounded-lg mt-6 border border-[var(--border)]">
                <p className="text-sm text-[var(--text-secondary)] italic flex items-center">
                  <svg className="w-4 h-4 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  For more details about Gemini&apos;s data handling, please visit
                  Google&apos;s AI privacy policy.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-[var(--border)] bg-[var(--background-secondary)] rounded-b-xl">
            <button
              onClick={onClose} // Use the passed onClose handler
              className="w-full px-6 py-3 text-center font-medium bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-all duration-200 transform hover:scale-[1.02] shadow-sm hover:shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
