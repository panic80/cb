# API Key Setup Clarification Plan

## Goal
Clarify the setup instructions for the `GEMINI_API_KEY` environment variable required for the chatbot server.

## Findings
*   **Target Variable:** `GEMINI_API_KEY` (Confirmed by testing report and task instructions).
*   **README File:** `docs/README.md` (Needs updating).
*   **Current README Issue:** Uses incorrect variable name (`VITE_GEMINI_API_KEY`) and lacks clear instructions on using an example file.
*   **`.env.example` File:** Does not exist (Needs creation at the project root: `/Users/mattermost/Projects/32cbgg8.com/cb/.env.example`).
*   **`.gitignore` File:** Correctly ignores `.env` files (No changes needed).

## Proposed Steps
1.  **Create `.env.example`:**
    *   Create a new file named `.env.example` in the project root (`/Users/mattermost/Projects/32cbgg8.com/cb`).
    *   Add the content: `GEMINI_API_KEY=YOUR_GOOGLE_AI_API_KEY_HERE`
2.  **Update `docs/README.md`:**
    *   Locate the "Environment Setup" section.
    *   Revise the section to provide clear instructions:
        *   Explain the purpose of the `.env` file for environment variables.
        *   Instruct users to copy `.env.example` to a new file named `.env` in the project root.
        *   Clearly state they need to replace `YOUR_GOOGLE_AI_API_KEY_HERE` in their `.env` file with their actual Google Gemini API key.
        *   Mention that `GEMINI_API_KEY` is required for the chatbot server functionality.
        *   Note that the `.env` file is already included in `.gitignore` and should not be committed to version control.
        *   Correct the variable name in any examples shown (changing `VITE_GEMINI_API_KEY` to `GEMINI_API_KEY`).

## Visualization
```mermaid
graph TD
    A[Start: Clarify API Key Setup] --> B{Check docs/README.md};
    B -- Exists --> C{Check .env.example};
    C -- Does Not Exist --> E[Action: Create .env.example];
    E --> D{Check .gitignore};
    D -- Includes .env --> F{Review Testing Report};
    F -- Confirm Variable Name & Issue --> H[Action: Update docs/README.md];
    H --> I[Plan Complete];