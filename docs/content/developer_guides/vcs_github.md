# GitHub Integration - AWS CodeStar Connection

To be able to use GitHub repositories in AWS CodePipeline with vanilla-pipeline, an AWS CodeStar Connection needs to be established. For more details go to the [GitHub connection](https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html) page.

## Quick Setup

To create the AWS CodeStar Connection go to the desired AWS account where the AWS CodePipeline is planned to be placed and execute the following command.

```bash
aws codestar-connections create-connection --provider-type GitHub --profile $RES_ACCOUNT_AWS_PROFILE --region ${AWS_REGION} --connection-name MyConnection
```

This will initialize the connection from the AWS side. As a follow up go to the AWS CodeStar Connection on the [Console](https://console.aws.amazon.com/codesuite/settings/connections) and follow up the installation steps through the browser.

**Note:** The user needs to have the following permission to establish the connection.

- Ownership permission on the GitHub Organization / Account
- IAM Permissions on the account
  - codestar-connections:ListConnections
  - codestar-connections:CreateConnection
  - codestar-connections:UpdateConnectionInstallation

## DPP - Guide

This section contains more targeted information for DPP contributors.

- IAM Role for establishing CodeStarConnection is PA_DEVELOPER
- Only establish CodeStarConnections for RES accounts, **never** for DEV, INT, or PROD
- Read the [Update a pending connection](https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-update.html) documentation before you proceed with the process
- In case you are owner of multiple organizations ensure you are selecting the right one ![dpp-enhanced-plant-onboarding](../assets/images/codestarconnection-guide-01.png)

### Known Issues

- Careful if you see a page like this when you open the [Console](https://console.aws.amazon.com/codesuite/settings/connections) ![AccessDeniedExxception](../assets/images/codestarconnection-common-issues-01.png) You might be using a wrong **region** or you don't have the right permissions.
- Make sure you have cookies enabled for your browser and you have the right permissions on both AWS and GitHub side or you could see something as shown in the screenshot below ![cookiesDisabled](../assets/images/codestarconnection-common-issues-02.png)

## Pointers to external documentation

- [GitHub connection](https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html)
- [Update a pending connection](https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-update.html)
