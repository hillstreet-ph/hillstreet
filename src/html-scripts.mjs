// One script-element scanner shared by the build gate (scripts/build.mjs), the CSP test
// (tests/security.test.mjs) and the sub-page test (tests/agency-pages.test.mjs).
// The closing token has to accept every form the HTML parser treats as a script end tag:
// `</script >`, `</script\n>`, `</script/>` and `</script\t\n bar>` all close the element in
// a browser, so a pattern that demands `</script>` stops short of them, reports no element,
// and lets an inline script slip past both the guard and the hash that whitelists it.
// The end tag is therefore `</script`, then either nothing or whitespace plus whatever
// non-`>` bytes the parser swallows as attribute junk, then an optional slash and `>`.
// Requiring the whitespace is what keeps `</scripts>` a non-end tag: without it the junk
// alternative would match the `s` and truncate the real body at a string literal.
const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script(?:\s[^>]*)?\s*\/?>/gi;

export const scriptElements = html => [...html.matchAll(SCRIPT_ELEMENT)];
