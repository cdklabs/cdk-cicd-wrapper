# Add/remove cdk.context.json to git remote

When you use a construct's .fromLookup() method, the result of the call is cached in cdk.context.json. You should commit this to the version control along with the rest of your code to make sure that future executions of your CDK app (in the pipeline) use the same value. The CDK Toolkit includes commands to manage the context cache, so you can refresh specific entries when need be. For more information, see [Runtime context](https://docs.aws.amazon.com/cdk/v2/guide/context.html). In case you decide to put the cdk.context.json into .gitignore to avoid committing your test account ids then you need to:

```bash
### 1. Remove cdk.context.json from .gitignore
vi .gitignore ### remove cdk.context.json
### 2. Generate the cdk.context.json
source exports_vars.sh ### source the env vars with the right account ids and profiles for RES/DEV/INT/PROD...
npm run cdk synth ### this command generates the cdk.context.json
### 3. Add the cdk.context.json to git remote
git add cdk.context.json ### re-add cdk.context.json
git commit -am "Re-added cdk.context.json"
git push -u origin ### Push changes to remote

```
