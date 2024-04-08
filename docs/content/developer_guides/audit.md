# Audit project dependencies

```json
{
    ...
    "scripts":
    {
        ...
        "audit": "npx concurrently 'npm:audit:*(!fix)'",
        "audit:deps:nodejs": "npx {{ npm_cli }} check-dependencies --npm",
        "audit:deps:python": "npx {{ npm_cli }} check-dependencies --python",
        "audit:scan:security": "npx {{ npm_cli }} security-scan --bandit --semgrep --shellcheck --ci",
        "audit:license": "npm run license",
        "audit:fix:license": "npm run license:fix",
        "license": "npx {{ npm_cli }} license",
        "license:fix": "npx {{ npm_cli }} license --fix",
        ...
    },
    ...
}
```
