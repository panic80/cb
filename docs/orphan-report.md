# Orphan File Report

This report lists files within the `src` and `server` directories that do not appear to be imported or required by other JavaScript/TypeScript files in the project, based on a static analysis of `import` and `require` statements.

**Disclaimer:** This analysis might flag files incorrectly if they are:
*   Loaded dynamically.
*   Referenced in configuration files (e.g., Vite, Webpack).
*   Used by test runners or build scripts in non-standard ways (e.g., `src/setupTests.js`).
*   CSS files linked directly in HTML or imported via other CSS files.

Review these files carefully before deletion.

## Potential Orphan Files

*   `src/components/Contact.tsx`
*   `src/components/LoadingScreen.jsx` (The CSS is imported, but the JSX component itself doesn't seem to be used)
*   `src/components/Message.jsx`
*   `src/components/ThemeToggle.jsx` (Import appears commented out in `src/App.jsx`)
*   `src/data/opiContacts.js`
*   `src/pages/ModernChatPage.tsx` (Import appears commented out in `src/App.jsx`)
*   `src/setupTests.js` (Standard test setup file, often not imported directly)
*   `src/styles/main.css`
*   `src/theme/theme.css`
*   `src/theme/ThemeContext.tsx`
*   `src/utils/urlParser.ts`
*   `server/logs/test-api.js` (Likely a test script artifact)
*   `server/travelData.js`
