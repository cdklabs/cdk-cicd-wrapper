# AWS CodeCommit Integration

To be able to use AWS CodeCommit repositories in AWS CodePipeline with vanilla-pipeline, you can do this directly in the configure step.

## Quick Setup

After the configure has finished and generated the .env file then you need to add the changes into git and commit them.

You need to configure the downstream of the repository for deployment. In your local machine you need to install the ```git-remote-codecommit``` using the following command:

```bash
sudo pip3 install git-remote-codecommit
```

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD);
git remote add downstream codecommit::${AWS_REGION}://${RES_ACCOUNT_AWS_PROFILE}@${GIT_REPOSITORY};
git commit -am "feat: init downstream";
git push -u downstream ${CURRENT_BRANCH}:main ### default branch for CodePipeline can be configured in config/AppConfig.ts
```

## Changing default branch

You can change the default branch which is picked up by the CodePipeline to trigger the pipeline with the following code snippet (during the pipeline definition):

```bash
import { BasicRepositoryProvider, PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
.repositoryProvider(new BasicRepositoryProvider({
      repositoryType: 'CODECOMMIT',
      branch: 'main',
      name: 'my-repo',
    }))
...
```

## Pointers to external documentation

- [Setup steps for HTTPS connections to AWS CodeCommit with git-remote-codecommit](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html?icmpid=docs_acc_console_connect)