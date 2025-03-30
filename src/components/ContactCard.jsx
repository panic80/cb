// src/components/ContactCard.jsx
// Removed unused React import

/**
 * A reusable component to display contact information in a card format.
 *
 * @param {object} props - The component props.
 * @param {string} props.name - The name of the contact.
 * @param {string} props.email - The email address of the contact.
 * @param {string} [props.title] - An optional title or role for the contact.
 * @param {string[]} [props.units] - An optional list of units associated with the contact.
 * @param {boolean} [props.isLeadership] - Optional flag for leadership styling.
 */
export default function ContactCard({
  name,
  email,
  title,
  units,
  isLeadership = false,
}) {
  // Basic validation to ensure required props are provided
  if (!name || !email) {
    console.error("ContactCard requires name and email props.");
    return null; // Render nothing if essential data is missing
  }

  const cardClasses = `p-4 bg-[var(--card-bg)] rounded-lg ${isLeadership ? "border-l-4 border-[var(--primary)]" : ""} transition-colors duration-200`; // Removed hover effects, kept transition for theme changes
  const nameClasses = `font-medium ${isLeadership ? "text-lg" : ""}`;
  const emailClasses = "text-[var(--primary)] break-all text-sm sm:text-base";
  const titleClasses = "text-sm text-[var(--text-secondary)] my-1";
  const unitsClasses = "text-xs text-[var(--text-secondary)] mt-2 italic";

  return (
    <div className={cardClasses}>
      <div className={nameClasses}>{name}</div>
      {title && <div className={titleClasses}>{title}</div>}
      {email && (
        <a href={`mailto:${email}`} className={emailClasses}>
          {email}
        </a>
      )}
      {units && units.length > 0 && (
        <div className={unitsClasses}>Units: {units.join(", ")}</div>
      )}
    </div>
  );
}
