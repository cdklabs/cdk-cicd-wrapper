# FAQ

## How to open the terminal in Amazon SageMaker Studio - Code Editor?

To open the terminal in Amazon SageMaker Studio - Code Editor, follow these steps:
- Click on the `Menu` icon on the top left corner of the Code Editor.
- Select `Terminal` from the dropdown menu.
- Select `New Terminal` to open a new terminal window.

## What to do if the "`cdk init` cannot be run in a non-empty directory!" error occurs?

If you encounter the "`cdk init` cannot be run in a non-empty directory!" error, it means that the directory you are trying to initialize is not empty. Most likely your terminal is not in the correct directory. To resolve this issue, make sure you are in the `/home/sagemaker-user/cdk-cicd-example` directory where you want to initialize the CDK project.

## I am getting a prompt to `*.studio.<region>.sagemeaker.aws` wants to "See text and images copied to the clipboard", what should I do?

Amazon SageMaker Studio uses the clipboard to copy and paste text and images between the local machine and the Studio environment. If you see this prompt, you can allow the clipboard access by clicking on the `Allow` button.


## How to clean the npm cache?
In case you have get to an npm notarget error during any `npm install` command, you can try to clean the npm cache with the following command:

```bash
npm cache clean --force
```
