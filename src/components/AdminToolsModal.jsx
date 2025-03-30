import { useState, useEffect, useRef } from "react"; // Removed unused React import

import {
  DocumentTextIcon,
  BuildingLibraryIcon,
} from "@heroicons/react/24/solid";

// Reusable Submodal Component (Internal to AdminToolsModal)
const SubModal = ({
  title,
  isVisible,
  children,
  onClose,
  modalRef,
  windowWidth,
}) => {
  if (!isVisible) return null;

  const modalStyle = {
    backdropFilter: "none", // Explicitly disable backdrop filter if causing issues
    WebkitBackdropFilter: "none",
    zIndex: 100, // Ensure submodal is above main modal content but below overlay/main close button
    // Positioning logic adapted from original inline styles
    left: windowWidth < 768 ? "0" : "calc(100% - 100px)",
    maxHeight: windowWidth < 768 ? "60vh" : "none",
    overflowY: windowWidth < 768 ? "auto" : "visible",
  };

  return (
    <div
      ref={modalRef}
      // Apply base styles and conditional visibility/animation classes
      className={`absolute top-0 md:w-72 w-full bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl transition-all duration-300 ${isVisible ? "visible opacity-100 pointer-events-auto" : "invisible opacity-0 pointer-events-none"}`}
      style={modalStyle}
      // Prevent clicks inside submodal from closing the main modal
      // onClick={(e) => e.stopPropagation()} // Removed: Parent modal handles outside clicks
    >
      {/* Submodal Content Container */}
      <div className="bg-[var(--background-secondary)] rounded-xl">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              className="p-2 hover:bg-[var(--background)] rounded-full transition-colors cursor-pointer"
              aria-label="Close submenu"
              onClick={(e) => {
                e.stopPropagation(); // Prevent closing main modal
                onClose();
              }}
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
        <div className="p-4">{children}</div>
        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent closing main modal
              onClose();
            }}
            className="w-full px-4 py-2 text-center text-[var(--text)] bg-[var(--card)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Main AdminToolsModal Component
export default function AdminToolsModal({ show, onClose }) {
  const [showSOPSubmodal, setShowSOPSubmodal] = useState(false);
  const [showOnboardingSubmodal, setShowOnboardingSubmodal] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Refs for submodals to detect clicks outside (if needed, though click propagation is stopped)
  const sopSubmodalRef = useRef(null);
  const onboardingSubmodalRef = useRef(null);
  const mainModalRef = useRef(null); // Ref for the main modal content area

  // Handle window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle clicks outside the main modal content area to close EVERYTHING
  useEffect(() => {
    const handleClickOutside = (event) => {
      // If the main modal ref exists and the click is outside of it
      if (
        mainModalRef.current &&
        !mainModalRef.current.contains(event.target)
      ) {
        setShowSOPSubmodal(false); // Close submodals first
        setShowOnboardingSubmodal(false);
        onClose(); // Then close the main modal
      }
    };

    // Add listener only when the modal is shown
    if (show) {
      // Use setTimeout to ensure the listener is added after the click that opened the modal
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
    }

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [show, onClose]); // Depend on show and onClose

  // Close submodals if the main modal is closing
  useEffect(() => {
    if (!show) {
      setShowSOPSubmodal(false);
      setShowOnboardingSubmodal(false);
    }
  }, [show]);

  if (!show) return null;

  const handleOpenSOP = (e) => {
    e.stopPropagation(); // Prevent click from bubbling to modal background
    setShowOnboardingSubmodal(false); // Ensure other submodal is closed
    setShowSOPSubmodal(true);
  };

  const handleOpenOnboarding = (e) => {
    e.stopPropagation(); // Prevent click from bubbling to modal background
    setShowSOPSubmodal(false); // Ensure other submodal is closed
    setShowOnboardingSubmodal(true);
  };

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
        role="button"
        tabIndex="0"
        aria-label="Close modal"
      />
      {/* Modal Content Area */}
      <div
        className="fixed z-50 animate-float-up max-w-lg w-[90vw] mx-auto"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        // Ref attached here
        ref={mainModalRef}
      >
        <div className="bg-[var(--card)] text-[var(--text)] rounded-xl border border-[var(--border)] shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-[var(--border)]">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Other Tools</h2>
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

          {/* Body - Contains list items that trigger submodals */}
          <div className="p-6 relative">
            {" "}
            {/* Add relative positioning here */}
            <ul className="divide-y divide-[var(--border)]">
              {/* SOPs List Item */}
              <li className="py-3 first:pt-0 group/item">
                <div
                  onClick={handleOpenSOP} // Use dedicated handler
                  onKeyDown={(e) => {
                    // Add keyboard accessibility
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpenSOP(e);
                    }
                  }}
                  role="button"
                  tabIndex="0"
                  className="flex items-center p-3 rounded-lg hover:bg-[var(--background-secondary)] transition-all duration-200 group cursor-pointer"
                  // Removed data-sop-trigger, handled by onClick
                >
                  {/* Icon and Text */}
                  <div className="p-2 rounded-lg bg-[var(--background-secondary)] group-hover:bg-[var(--primary)] transition-colors">
                    <DocumentTextIcon className="w-6 h-6 text-[var(--primary)] group-hover:text-white" />
                  </div>
                  <div className="ml-4">
                    <span className="block font-medium group-hover:text-[var(--primary)] transition-colors">
                      Standard Operating Procedures
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      Access SOPs and guidelines
                    </span>
                  </div>
                  {/* Chevron Icon (optional) */}
                  <svg
                    className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
                {/* SOP Submodal Component */}
                <SubModal
                  title="Standard Operating Procedures"
                  isVisible={showSOPSubmodal}
                  onClose={() => setShowSOPSubmodal(false)}
                  modalRef={sopSubmodalRef}
                  windowWidth={windowWidth}
                >
                  <ul className="divide-y divide-[var(--border)]">
                    <li className="py-2">
                      <a
                        href="https://scribehow.com/embed-preview/Boots_Reimbursement_Submission_in_SCIP__oWwTYHb2QUeKqvtYJ3DMkg?as=video"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2"
                      >
                        How to Submit Boot Claims
                      </a>
                    </li>
                    <li className="py-2">
                      <a
                        href="https://scribehow.com/embed-preview/Initiating_TD_Claim_in_SCIP__GGXSDQBnSNq6H5GX_cZUuQ?as=video"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2"
                      >
                        How to Submit TD Claims
                      </a>
                    </li>
                    <li className="py-2">
                      <a
                        href="https://scribehow.com/embed-preview/Finalizing_a_TD_Claim_in_SCIP__w_JFn6AuTA--OpCHeFqYxA?as=video"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2"
                      >
                        How to Finalize TD Claims
                      </a>
                    </li>
                  </ul>
                </SubModal>
              </li>

              {/* Onboarding Guide List Item */}
              <li className="py-3 last:pb-0 group/item">
                <div
                  onClick={handleOpenOnboarding} // Use dedicated handler
                  onKeyDown={(e) => {
                    // Add keyboard accessibility
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpenOnboarding(e);
                    }
                  }}
                  role="button"
                  tabIndex="0"
                  className="flex items-center p-3 rounded-lg hover:bg-[var(--background-secondary)] transition-all duration-200 group cursor-pointer"
                  // Removed data-onboarding-trigger, handled by onClick
                >
                  {/* Icon and Text */}
                  <div className="p-2 rounded-lg bg-[var(--background-secondary)] group-hover:bg-[var(--primary)] transition-colors">
                    <BuildingLibraryIcon className="w-6 h-6 text-[var(--primary)] group-hover:text-white" />
                  </div>
                  <div className="ml-4 text-left">
                    <span className="block font-medium group-hover:text-[var(--primary)] transition-colors">
                      Onboarding Guide
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      Collection of Onboarding SCIP Guides
                    </span>
                  </div>
                  {/* Chevron Icon (optional) */}
                  <svg
                    className="w-5 h-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
                {/* Onboarding Submodal Component */}
                <SubModal
                  title="Other Resources"
                  isVisible={showOnboardingSubmodal}
                  onClose={() => setShowOnboardingSubmodal(false)}
                  modalRef={onboardingSubmodalRef}
                  windowWidth={windowWidth}
                >
                  <ul className="divide-y divide-[var(--border)]">
                    <li className="py-2">
                      <a
                        href="https://scribehow.com/embed-preview/SCIP_Mobile_Onboarding__qa62L6ezQi2nTzcp3nqq1Q?as=video"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2"
                      >
                        SCIP Mobile Onboarding Guide
                      </a>
                    </li>
                    <li className="py-2">
                      <a
                        href="/scip-desktop"
                        className="block cursor-pointer hover:bg-[var(--background)] hover:text-[var(--primary)] transition-colors duration-200 rounded px-2"
                      >
                        SCIP Desktop Onboarding Guide (Coming Soon)
                      </a>
                    </li>
                  </ul>
                </SubModal>
              </li>
            </ul>
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
