// Removed unused React import

export default function AboutModal({ show, onClose }) {
  if (!show) return null;

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm animate-fade-in flex items-center justify-center"
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
      <div className="fixed z-50 animate-scale flex items-center justify-center inset-0 pointer-events-none">
        <div className="pointer-events-auto">
        <div className="w-[min(90vw,_32rem)] bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[var(--border)]">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-[var(--primary)]">About This Page</h2>
              <button
                onClick={onClose} // Use the passed onClose handler
                className="p-2 hover:bg-[var(--background-secondary)] hover:text-[var(--primary)] rounded-full transition-all duration-200 transform hover:scale-110"
                aria-label="Close modal"
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
                <p className="leading-relaxed">
                  This unofficial site is not affiliated with the Department of
                  National Defence (DND), the Canadian Armed Forces (CAF), or any
                  associated departments or services. Use of this site is entirely
                  at your own discretion.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Purpose
                </h3>
                <p className="text-[var(--text)] leading-relaxed pl-7">
                  Our goal is to provide Primary Reserve (P Res) members with quick
                  and convenient access to essential G8 resources. We strive to
                  streamline administrative processes and ensure you can locate
                  accurate, up-to-date information whenever you need it.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Currently Available
                </h3>
                <ul className="list-none space-y-3 text-[var(--text)] pl-5">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium">SCIP</span> &ndash; Your centralized portal for financial and
                    administrative functions</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium">SOPs</span> &ndash; Standard Operating Procedures for day-to-day
                    reference</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-[var(--primary)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium">Onboarding Guide</span> &ndash; A step-by-step manual to welcome and
                    orient new members</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Coming Soon
                </h3>
                <div className="pl-7 italic text-[var(--text-secondary)]">
                  Stay tuned for new features and resources!
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Privacy & Contact
                </h3>
                <p className="text-[var(--text)] leading-relaxed pl-7 mb-4">
                  For privacy concerns, please use the Contact button or refer to
                  our Privacy Policy. Your feedback is always welcome, and we look
                  forward to improving your administrative experience.
                </p>
              </div>

              <div className="bg-[var(--background-secondary)] p-4 rounded-lg mt-6 border border-[var(--border)]">
                <p className="text-sm text-[var(--text-secondary)] italic flex items-center">
                  <svg className="w-4 h-4 mr-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Disclaimer: This page is not supported by the Defence Wide Area
                  Network (DWAN).
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
