# driftcheck

> Catch env/config drift between code, .env files, CI, and live hosting providers before deploy breaks.

## Privacy First

**driftcheck never reads, stores, prints, or transmits secret values.**

It only compares variable **names** (and, optionally, a local salted SHA-256 fingerprint to detect "same vs different" across local files — computed in memory, never written or sent).

Provider APIs are called with list-names endpoints only. No telemetry. The only network calls are to providers you enable, using tokens you supply via environment variables.

## Quick Start

```bash
npx driftcheck
```

That's it. No config required for basic checks.

## What It Checks

- **Code scan:** `process.env.X`, `import.meta.env.X`, `Deno.env.get`, `os.environ` in JS/TS/Python/Go
- **Local files:** `.env`, `.env.local`, `.env.production`, `.env.example`
- **Docker:** `docker-compose.yml` environment variables
- **CI:** GitHub Actions secrets and variables
- **Live providers:** Vercel, Netlify, GitHub (opt-in via tokens)

## Example Output

```
driftcheck v1.0.0 · project: acme-web · values are never read ✔
Sources: code(142 files) .env .env.example docker-compose.yml
         .github/workflows(2) vercel[production] github-secrets

 ✗ MISSING IN PROD    STRIPE_WEBHOOK_SECRET  used in code · set in .env · absent from Vercel production
 ✗ CI SECRET UNDEFINED SENTRY_AUTH_TOKEN     workflow references it · not in GitHub secrets
 ✗ SCOPE GAP           DATABASE_URL           Vercel[preview] ✔  Vercel[production] ✗
 ⚠ NOT IN EXAMPLE     RESEND_API_KEY         used in code · missing from .env.example
 ⚠ PUBLIC LEAK RISK   NEXT_PUBLIC_ADMIN_SECRET  exposed to client bundle
 ⚠ STALE              LEGACY_S3_BUCKET       in .env.example · never referenced
 ℹ DYNAMIC ACCESS     src/config.ts:8 process.env[key] — review manually

3 errors · 3 warnings · 1 info   (exit 1)
```

## Checks Performed

| Check | Description |
|-------|-------------|
| **MISSING IN PROD** | Variable used in code, set in .env, but absent from production provider |
| **NOT IN EXAMPLE** | Variable used in code but missing from .env.example |
| **STALE** | Variable in .env.example but never referenced in code |
| **SCOPE GAP** | Variable set in preview but not production (Vercel) |
| **PUBLIC LEAK RISK** | NEXT_PUBLIC_*/VITE_* variable contains SECRET/KEY/TOKEN/PASSWORD |
| **CI SECRET UNDEFINED** | GitHub Actions workflow references undefined secret/var |
| **DUPLICATE** | Same key defined multiple times in same file |
| **DYNAMIC ACCESS** | process.env[variable] — requires manual review |

## Provider Setup (Optional)

driftcheck works without provider access. For live checks against Vercel, Netlify, or GitHub:

```bash
export VERCEL_TOKEN="your_token"
export NETLIFY_AUTH_TOKEN="your_token"
export GITHUB_TOKEN="your_token"

npx driftcheck
```

Tokens are **never logged or transmitted** except to the provider's API.

### Getting Tokens

- **Vercel:** [vercel.com/account/tokens](https://vercel.com/account/tokens)
- **Netlify:** [app.netlify.com/user/applications](https://app.netlify.com/user/applications)
- **GitHub:** `gh auth token` or [github.com/settings/tokens](https://github.com/settings/tokens)

## Commands

```bash
npx driftcheck                  # Run checks
npx driftcheck --json           # Output JSON
npx driftcheck --ci             # CI mode (strict, no color)
npx driftcheck --only vercel,code  # Check specific sources
npx driftcheck init             # Create config file
npx driftcheck fix-example      # Update .env.example with missing keys
npx driftcheck activate <key>   # Activate license
npx driftcheck license          # Show license info
npx driftcheck --privacy        # Show privacy policy
```

## CI Setup

### GitHub Actions

```yaml
- name: Check env drift
  run: npx driftcheck --ci
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    DRIFTCHECK_LICENSE: ${{ secrets.DRIFTCHECK_LICENSE }}
```

Exit codes:
- `0` = no errors
- `1` = errors found
- `2` = fatal error

## Configuration

Create `driftcheck.config.json` (optional):

```json
{
  "ignore": ["NODE_ENV", "PATH"],
  "required": ["DATABASE_URL", "API_KEY"],
  "providers": {
    "vercel": {
      "projectId": "prj_abc123"
    },
    "netlify": {
      "siteId": "site-123"
    },
    "github": {
      "repo": "owner/repo"
    }
  }
}
```

Auto-detection works without config:
- Vercel: `.vercel/project.json`
- Git remote: auto-detects GitHub repo

## Pricing

- **Free:** 1 project, all features, no time limit
- **Lifetime ($29):** Unlimited projects, all features, all future v1.x updates

No subscription. No accounts. No SaaS.

Purchase at `/buy` when deployed (Stripe integration required).

### License Activation

```bash
driftcheck activate DC1-your-license-key
```

Or for CI:

```bash
export DRIFTCHECK_LICENSE="DC1-your-license-key"
```

License keys are **offline-validated**. No phone-home. Works in CI and air-gapped environments.

## How It's Different

| Tool | Code scan | .env files | Live providers | CI checks |
|------|-----------|------------|----------------|-----------|
| **driftcheck** | ✓ | ✓ | ✓ | ✓ |
| dotenv-linter | ✗ | ✓ | ✗ | ✗ |
| envcheck | ✓ | ✓ | ✗ | ✓ |
| Doppler | ✗ | ✗ | ✓ | Requires migration |

driftcheck is the only tool that diffs code usage, local files, CI config, and live provider state — all without touching secret values.

## Requirements

- Node.js 18+
- Works on Linux, macOS, Windows

## Development

```bash
git clone https://github.com/xerophilus/driftcheck.git
cd driftcheck
npm install
npm run build
npm test
```

### Generate License Keypair

For deployment, generate an Ed25519 keypair for signing license keys:

```bash
npm run keygen
```

This outputs:
- **Public key** (hex) - embed in `src/license.ts` (already set to a default)
- **Private key** (hex) - set as `LICENSE_PRIVATE_KEY` environment variable in Vercel

The public key ships with the CLI for offline validation. The private key is used server-side to sign new licenses.

## Privacy & Security

- **Never reads secret values** — parsers extract only key names
- **No telemetry** — zero tracking, zero analytics
- **No credentials stored** — tokens from env only
- **Offline license validation** — no phone-home
- **Open source** — audit the code yourself

See `driftcheck --privacy` for full policy.

## License

MIT License - see LICENSE file

## Support

- Issues: [github.com/xerophilus/driftcheck/issues](https://github.com/xerophilus/driftcheck/issues)
- Repository: [github.com/xerophilus/driftcheck](https://github.com/xerophilus/driftcheck)

---

Made with care for developers who've been burned by missing env vars in production.
