# HillStreet website agent instructions

- This repository is the standalone HillStreet Agency business website. Keep it separate from Open-Connect and other shared-platform applications.
- Read PRODUCTION-SETUP.md and OPERATIONS.md before infrastructure work. Use proven account, project, zone and repository identifiers.
- Make scoped changes, run npm test and npm run build, inspect CI and deployment results, and record material limitations. Do not claim a schedule has executed merely because it was registered.
- Prefer a reviewable branch and PR. Merge to main only within the user's authorization. Main deploys the public website automatically.
- Never commit credentials, print decrypted Vault data, widen storage visibility or create public database access to bypass an error.
- Preserve mail DNS while Google Workspace Admin is deferred. Do not change unrelated tables, jobs, buckets, applications, organization policies or account-wide settings in shared services.
- The original application in site/assets/index-D4yBHoPu.js is a recovered production bundle. Editable integration code lives in src/, functions/ and ops/. Do not present compiled assets as recovered original source components.
- Keep Worker source, bindings and actual deployed versions synchronized. Pages deployment does not redeploy ops/ automatically. Preserve secret bindings, Access protection, cron schedules and private R2 bucket access.
- Backups cover only the website table, HillStreet private business files and this source repository. Do not export the entire shared Supabase project.
- Cleanup may expire only scoped backup copies under the configured retention policy. Never purge original inquiries or business files without explicit authorization.
