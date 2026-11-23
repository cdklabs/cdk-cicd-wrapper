# AWS CodeCommit Integration

> **Note:** AWS CodeCommit is deemphasized for new customers after July 25, 2024. Consider using S3-based or GitHub repositories instead for new projects.

## Configuration

Configure your pipeline to use CodeCommit in `cicd.config.ts`:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'), // defaults to the 'main' branch
  stages: ['dev', 'prod'],
});
```

Pass a second argument to track a different branch:

```typescript
repository: Repository.codecommit('my-repo', 'trunk'),
```

## Repository creation

By default, `Repository.codecommit('my-repo')` **creates** the CodeCommit repository as part of the pipeline stack — so a single `cdk-cicd deploy-ci` gives you both the pipeline and an empty repository to push to. This matches the Blueprint (0.x) behaviour, where naming a CodeCommit source provisioned the repository for you.

If the repository already exists (for example, it is managed elsewhere, or shared across pipelines), pass `{ existing: true }` to import it by name instead of creating it:

```typescript
repository: Repository.codecommit('my-repo', 'main', { existing: true }),
```

An imported repository must already exist at deploy time. A created one belongs to the pipeline stack and has no `DeletionPolicy`, so **deleting the pipeline stack deletes the repository and its history**. To keep the source independent of the pipeline, create the repository yourself and import it with `{ existing: true }` (`cdk-cicd init --existing`).

`Repository.codecommit(...)` names the CodeCommit repository the pipeline reads from. Unlike Blueprint (0.x)'s `RepositorySource.codecommit(...)`, there is no `enablePullRequestChecks` option: pull-request automation is **not** part of Autopilot. If you relied on it, run `cdk-cicd security-scan`/`cdk-cicd check` (Bandit, Semgrep, ShellCheck, dependency audit — see the [Security guide](./security.md)) in the pipeline's CI build instead; they are not PR-time checks against a CodeCommit pull request specifically. The default CI build runs `npm ci` and then your `audit`, `build` and `test` npm scripts when they exist, so these checks run in CI only if one of those scripts, or your `ci.steps`, calls them (for example an `audit` script that runs `cdk-cicd check`).

## Pushing to the repository

Once the pipeline is deployed (`cdk-cicd deploy-ci`), install `git-remote-codecommit` locally and push your branch:

```bash
sudo pip3 install git-remote-codecommit
```

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git remote add origin "codecommit::<region>://<repository>"
git push -u origin "${CURRENT_BRANCH}:main"
```

The branch pushed to must match the branch `Repository.codecommit(...)` names (`main` unless you passed a second argument).

## Pointers to external documentation

- [Setup steps for HTTPS connections to AWS CodeCommit with git-remote-codecommit](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html?icmpid=docs_acc_console_connect)
