# Deployment

Current verified setup, security configuration, evidence and remaining work are documented in [PRODUCTION-SETUP.md](PRODUCTION-SETUP.md).

Live website: https://hillstreet.space/

Cloudflare Pages uses main, runs npm test && npm run build, and publishes site with Pages Functions from the root functions directory. Automatic production deployments are enabled. Configure server secrets only in the Pages environment.
