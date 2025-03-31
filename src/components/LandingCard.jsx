// Removed unused React import

import {
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  ArrowTopRightOnSquareIcon, // Added for external link indication
} from "@heroicons/react/24/solid";
import { Link } from "react-router-dom";

// Mapping of known icon names (string) to imported icon components
// This avoids passing component instances directly as props, which isn't ideal.

const iconMap = {
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
};

// Reusable card component for the landing page navigation
export default function LandingCard({
  to,
  href,
  onClick,
  iconName,
  title,
  description,
  isBeta = false,
  ariaLabel,
}) {
  const IconComponent = iconMap[iconName]; // Get the actual icon component from the map

  // Common card styling
  const cardClasses =
    "group card-hover glass rounded-xl p-4 md:p-5 transition-all duration-300 flex";
  // Apply hover scale only on desktop
  const hoverScaleClass = "md:transform md:hover:scale-105";

  const cardContent = (
    <div className="flex items-center w-full">
      {/* Icon Section */}
      <div className="relative flex-shrink-0">
        {/* Background Blur Effect */}
        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 rounded-full blur-md transform group-hover:scale-150 transition-transform duration-500" />
        {/* Icon Container */}
        <div className="relative p-2 flex justify-center items-center">
          {IconComponent && (
            <IconComponent
              className="w-10 h-10 md:w-12 md:h-12 text-[var(--primary)]"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      {/* Text Section */}
      <div className="ml-4">
        <h3 className="flex items-center text-lg md:text-xl font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors duration-300">
          {title}
          {/* Add external link icon if href is present */}
          {href && (
            <ArrowTopRightOnSquareIcon className="w-4 h-4 ml-1.5 text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors duration-300" />
          )}
        </h3>
        <p className="text-sm md:text-base text-[var(--text)] opacity-80">
          {description}
          {isBeta && (
            <span className="text-amber-500 ml-1 font-medium">(Beta)</span>
          )}
        </p>
      </div>
    </div>
  );

  // Render as Link for internal navigation
  if (to) {
    return (
      <Link
        to={to}
        className={`${cardClasses} ${hoverScaleClass}`}
        aria-label={ariaLabel}
      >
        {cardContent}
      </Link>
    );
  }

  // Render as anchor tag for external links
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cardClasses} ${hoverScaleClass}`}
        aria-label={ariaLabel}
      >
        {cardContent}
      </a>
    );
  }

  // Render as div with onClick for modal triggers
  if (onClick) {
    return (
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          // Add keyboard accessibility
          if (e.key === "Enter" || e.key === " ") {
            onClick(e); // Pass event if needed by handler
          }
        }}
        role="button" // Make it accessible as a button
        tabIndex="0" // Make it focusable
        className={`${cardClasses} ${hoverScaleClass} cursor-pointer`}
        aria-label={ariaLabel}
      >
        {cardContent}
      </div>
    );
  }

  // Fallback if no link/href/onClick is provided (shouldn't happen with proper usage)
  return (
    <div className={`${cardClasses} ${hoverScaleClass}`} aria-label={ariaLabel}>
      {cardContent}
    </div>
  );
}
