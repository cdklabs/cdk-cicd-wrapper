# Audit project dependencies

From the package.json you get the following commands which you can run via the cli like this:

```bash
npm run audit ### check below the list of sub-scripts
```

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
