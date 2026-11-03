// One navigation authority for the whole site: the recovered home bundle, the three
// agency sub-pages and the build check all read this list, so a page can never drift
// into its own private menu.
export const SITE_NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/#about' },
  { label: 'Services', href: '/#services' },
  { label: 'Agency', href: '/agency' },
  { label: 'Influencer Marketing', href: '/influencers' },
  { label: 'Cooperation', href: '/cooperation' },
  { label: 'Contact', href: '/#contact' },
];

// Sub-pages ship the nav as static markup. They carry no scripts (CSP hashes only
// the home bundle), so the mobile disclosure is a CSS-only checkbox styled by
// agency.css. scripts/build.mjs fails the build when a page drifts from this block.
export const navBlock = route => [
  '<nav aria-label="Site">',
  '  <input class="nav-check" type="checkbox" id="nav-toggle">',
  '  <label class="nav-fold" for="nav-toggle">Menu</label>',
  '  <ul class="nav">',
  ...SITE_NAV.map(({ href, label }) => {
    const current = href === route ? ' aria-current="page"' : '';
    return `    <li><a href="${href}"${current}>${label}</a></li>`;
  }),
  '  </ul>',
  '</nav>',
].join('\n');
