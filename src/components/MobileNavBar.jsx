// Removed unused React import

import { Link, useLocation } from "react-router-dom";

function MobileNavBar({ _theme, _toggleTheme }) {
  // Prefix unused props
  const location = useLocation();
  const isActive = (path) => location.pathname === path;
  return (
    <nav className="hidden">
      <Link to="/" className={`nav-item ${isActive("/") ? "active" : ""}`}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 19V12M12 12V5M12 12H19M12 12H5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>Ask</span>
      </Link>
      <Link
        to="/report"
        className={`nav-item ${isActive("/report") ? "active" : ""}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>Report</span>
      </Link>
      <Link
        to="/faq"
        className={`nav-item ${isActive("/faq") ? "active" : ""}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.87891 7.51884C11.0505 6.49372 12.95 6.49372 14.1215 7.51884C15.2931 8.54397 15.2931 10.2063 14.1215 11.2314L12.0002 13.0752L9.87891 11.2314C8.70734 10.2063 8.70734 8.54397 9.87891 7.51884Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 13V17M12 21H12.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>FAQ</span>
      </Link>
      <Link
        to="/contact"
        className={`nav-item ${isActive("/contact") ? "active" : ""}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 8L10.8906 13.2604C11.5624 13.7083 12.4376 13.7083 13.1094 13.2604L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Contact</span>
      </Link>
    </nav>
  );
}

export default MobileNavBar;
