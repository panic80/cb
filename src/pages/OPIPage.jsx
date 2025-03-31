// src/pages/OPIPage.jsx
import { useState } from "react"; // Remove React and useEffect since they're not used

import { UserGroupIcon } from "@heroicons/react/24/solid"; // Remove nav icons

// import { useNavigate } from 'react-router-dom'; // No longer needed directly here
import ContactCard from "../components/ContactCard";
import PageLayout from "../components/PageLayout"; // Import the layout
import {
  unitContacts,
  allUnits,
  fscContacts,
  fmcContacts,
} from "../data/opiContacts";

export default function OPIPage({ theme, onThemeChange }) {
  // const navigate = useNavigate(); // Moved to PageLayout
  const [contactView, setContactView] = useState("fsc"); // Default to FSC view
  const [selectedUnit, setSelectedUnit] = useState("");

  // Scroll to top and theme application are handled by PageLayout

  // Helper function to render contact cards for a list of contacts
  const renderContactList = (contacts, title = null, isLeadership = false) => (
    <div className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]">
      {title && (
        <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">
          {title}
        </h3>
      )}
      <ul className="space-y-4">
        {contacts.map((contact, index) => (
          <li key={`${contact.email}-${index}`}>
            {" "}
            {/* Use email + index for a more robust key */}
            <ContactCard
              name={contact.name}
              email={contact.email}
              units={contact.units}
              title={contact.title} // Pass title if available
              isLeadership={isLeadership}
            />
          </li>
        ))}
      </ul>
    </div>
  );

  // Helper function to render grouped contact cards
  const renderGroupedContacts = (groups, additionalContacts = null) => (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((group, index) => (
          <div
            key={`group-${index}`}
            className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]"
          >
            <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">{`Group ${index + 1}`}</h3>
            <ContactCard
              name={group.name}
              email={group.email}
              units={group.units}
            />
          </div>
        ))}
      </div>
      {additionalContacts && additionalContacts.length > 0 && (
        <div className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]">
          <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">
            Additional Contacts
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {additionalContacts.map((contact, index) => (
              <ContactCard
                key={`add-${index}`}
                name={contact.name}
                email={contact.email}
                title={contact.title} // Pass title
                isLeadership={contact.isLeadership} // Pass leadership status
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PageLayout
      title="OPI Contact Information"
      theme={theme}
      onThemeChange={onThemeChange}
      useGradientBackground={true}
    >
      {/* Content starts below, wrapped in Fragment */}
      {/* Apply gradient background like Landing Page */}
      <div className="hero-gradient flex-grow relative">
        {/* Decorative Background Elements - matching landing page */}
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
        <>
          {" "}
          {/* Main content fragment */}
          <div className="text-center mb-8 sm:mb-12 transition-all duration-300">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform scale-150 transition-transform duration-500" />
              <UserGroupIcon className="w-12 h-12 sm:w-16 sm:h-16 text-[var(--primary)] relative mx-auto mb-3 sm:mb-4 transition-colors duration-300" />
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 gradient-text">
              Office of Primary Interest
            </h1>
            <p className="text-base sm:text-lg text-[var(--text-secondary)] transition-colors duration-300 px-4 max-w-2xl mx-auto glass p-4 rounded-xl">
              Find your unit&apos;s point of contact for financial services and
              management
            </p>
          </div>
          {/* Main Content Card */}
          <div className="glass rounded-xl shadow-lg border border-[var(--border-color)] overflow-hidden transition-all duration-300">
            {/* View Selection Tabs */}
            <div className="p-4 sm:p-6 border-b border-[var(--border-color)]">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
                {["fsc", "fmc", "byUnit"].map((view) => (
                  <button
                    key={view}
                    onClick={() => setContactView(view)}
                    className={`w-full sm:w-auto flex-1 sm:flex-none sm:min-w-[180px] px-4 py-2 sm:px-6 sm:py-3 text-center rounded-lg transition-all duration-300 text-sm sm:text-base font-medium border ${
                      contactView === view
                        ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg" // Active state
                        : "glass text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--background-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:shadow-md" // Inactive state with glass effect
                    }`}
                  >
                    {view === "fsc"
                      ? "Financial Services (FSC)"
                      : view === "fmc"
                        ? "Financial Management (FMC)"
                        : "Find by Unit"}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Content Area */}
            <div className="p-4 sm:p-6">
              {contactView === "byUnit" ? (
                <div className="space-y-6 sm:space-y-8">
                  {/* Unit Selector */}
                  <div className="glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]">
                    <label
                      htmlFor="unit-select"
                      className="block font-semibold mb-3 text-lg text-[var(--text-primary)]"
                    >
                      Select Your Unit
                    </label>
                    <div className="relative">
                      {" "}
                      {/* Wrapper for custom arrow */}
                      <select
                        id="unit-select"
                        value={selectedUnit}
                        onChange={(e) => setSelectedUnit(e.target.value)}
                        className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] focus:ring-[var(--primary)] text-[var(--text-primary)] appearance-none pr-10" // Adjusted padding for arrow
                      >
                        <option value="">-- Select a Unit --</option>
                        {allUnits.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      {/* Custom Arrow using Heroicon */}
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-secondary)]">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.24a.75.75 0 011.06 0L10 14.148l2.7-2.908a.75.75 0 111.06 1.06l-3.25 3.5a.75.75 0 01-1.06 0l-3.25-3.5a.75.75 0 010-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    {/* Stray '>' and duplicated select closing tag removed from here */}
                  </div>

                  {/* Contact Display Area */}
                  {selectedUnit && unitContacts[selectedUnit] ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* FSC Card */}
                      <div className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]">
                        <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">
                          Your FSC Contact
                        </h3>
                        {unitContacts[selectedUnit].fsc !== "N/A" ? (
                          <ContactCard
                            name={unitContacts[selectedUnit].fsc}
                            email={unitContacts[selectedUnit].fscEmail}
                            title="Financial Services Cell (FSC)"
                          />
                        ) : (
                          <div className="text-[var(--text-secondary)] p-4 bg-[var(--bg-primary)] rounded-lg border border-dashed border-[var(--border)]">
                            {" "}
                            {/* Warning style */}
                            <p className="font-medium">
                              No direct FSC assigned.
                            </p>
                            <p className="text-sm">
                              Please contact FSC Leadership listed under the
                              &quot;Financial Services (FSC)&quot; tab.
                            </p>
                          </div>
                        )}
                      </div>
                      {/* FMC Card */}
                      <div className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]">
                        <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">
                          Your FMC Contact
                        </h3>
                        <ContactCard
                          name={unitContacts[selectedUnit].fmc}
                          email={unitContacts[selectedUnit].fmcEmail}
                          title="Financial Management Cell (FMC)"
                        />
                      </div>{" "}
                      {/* Closing FMC Card div */}
                      {/* Closing grid div from line 137 */}{" "}
                    </div>
                  ) : (
                    <div className="glass text-center py-8 px-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)]">
                      {" "}
                      {/* Removed dashed */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-10 h-10 mx-auto text-[var(--text-secondary)] mb-3"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                        />
                      </svg>
                      <p className="text-[var(--text-secondary)] font-medium">
                        Please select your unit above.
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Your specific FSC and FMC contacts will be displayed
                        here.
                      </p>
                    </div>
                  )}
                </div>
              ) : contactView === "fsc" ? (
                <div className="space-y-8">
                  {renderContactList(
                    fscContacts.leadership,
                    "FSC Leadership",
                    true
                  )}
                  <div className="grid gap-6 md:grid-cols-2">
                    {fscContacts.sections.map((section, index) => (
                      <div
                        key={`fsc-sec-${index}`}
                        className="card-hover glass p-4 sm:p-6 rounded-lg border border-[var(--border-color)]"
                      >
                        {" "}
                        {/* Added border */}
                        <h3 className="font-semibold mb-4 text-lg sm:text-xl text-[var(--primary)] border-b border-[var(--border-color)] pb-2">{`Section ${index + 1}`}</h3>{" "}
                        {/* Enhanced title */}
                        <ContactCard
                          name={section.name}
                          email={section.email}
                          units={section.units}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // FMC View
                <div className="space-y-8">
                  {fmcContacts.leadership &&
                    renderContactList(
                      fmcContacts.leadership,
                      "FMC Leadership",
                      true
                    )}
                  {renderGroupedContacts(
                    fmcContacts.groups,
                    fmcContacts.additional
                  )}
                </div>
              )}
            </div>
          </div>
        </>{" "}
        {/* Closing main content fragment */}
      </div>{" "}
      {/* Closing hero-gradient div */}
    </PageLayout>
  );
}
