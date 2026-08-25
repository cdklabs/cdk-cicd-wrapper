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

`Repository.codecommit(...)` is a bare source selector — it only names the CodeCommit repository the pipeline reads from. Unlike Blueprint (0.x)'s `RepositorySource.codecommit(...)`, there is no `enableCodeGuruReviewer`/`enablePullRequestChecks` option: Amazon CodeGuru Reviewer pull-request automation is **not** part of v3. If you relied on that, `cdk-cicd security-scan`/`cdk-cicd check` (Bandit, Semgrep, ShellCheck, dependency audit — see the [Security guide](./security.md)) run in the pipeline's CI build instead, but they are not PR-time checks against a CodeCommit pull request specifically.

## Pushing to the repository

Once the pipeline is deployed (`cdk-cicd deploy-ci`), install `git-remote-codecommit` locally and push your branch:

```bash
sudo pip3 install git-remote-codecommit
```

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git remote add origin "codecommit::${AWS_REGION}://${GIT_REPOSITORY}"
git push -u origin "${CURRENT_BRANCH}:main"
```

The branch pushed to must match the branch `Repository.codecommit(...)` names (`main` unless you passed a second argument).

## Pointers to external documentation

- [Setup steps for HTTPS connections to AWS CodeCommit with git-remote-codecommit](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html?icmpid=docs_acc_console_connect)
