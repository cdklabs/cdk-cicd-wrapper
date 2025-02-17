# Frequently asked questions

Below we list the most common issues you might encounter during the deployment using the {{ project_name }}

## Common Issues

- When using Cloud9 in the RES account and you want to deploy the code cross-account then you need to define the profiles for the DEV and INT Account as usual (adding them in the ~/.aws/config). The RES profile can be omitted in this case while doing the initial bootstrap, except for the DEV and INT or PROD stages where the profile is mandatory to establish a trust relationship between the RES account and the other environments (DEV/INT/PROD).
- `when calling the PutParameter operation: The security token included in the request is invalid`: This usually happens if you use Cloud9. Make sure to disable AWS managed temporary credentials and give the full admin access to your Cloud9 Managed role in order to be able to execute everything necessary. 
- `Resource handler returned message: "Policy contains a statement with one or more invalid principals. (Service: Kms, Status Code: 400, Request ID: a9f9e73b-cf2c-4862-9536-af92aa0ed656)" (RequestToken: 949e9034-f910-7eb3-a4a2-427bc9e676b9, HandlerErrorCode: InvalidRequest)`
- Make sure that the role you are trying to add to the policy exists in the given account.
- If you get `InvalidLocationConstraint` error during bucket creation, while executing `aws s3api create-bucket`
  command, then consider removing `--create-bucket-configuration LocationConstraint` parameter. This error usually occurs
  if the default region is the same as the one set in the LocationConstraint.
- If the pipeline fails with `AccessDeniedException` error or lacks any AWS resources, then this might be caused by the
  wrong region setup. In this case some resources are deployed into another region. Check the region value that is set in
  the `export_vars.sh` when you initially created the script or your cli env var `AWS_REGION`. The region should
  be consistent across those files.
- Make sure the `CDK_QUALIFIER` meets the requirement of [CDK](https://github.com/aws/aws-cdk/issues/9255) - Qualifier must be an alphanumeric identifier of at most 10 characters
- If you have already deployed RES/DEV/INT and want to disable INT then please do the following:
  ```bash
  export ACCOUNT_INT="-"
  npx dotenv-cli -- npm run cdk deploy --all --region ${AWS_REGION} --profile $RES_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER}
  ```
  After performing this please do not forget to delete your CloudFormation resources on the previous INT Account.
- If you see an error `CreateRepository request is not allowed because there is no existing repository in this AWS account or AWS Organization` when performing the initial deploy step it means that your AWS Organization is not able to create new CodeCommit repositories, so you will need to choose the CodeStar option to connect to an external repository.  CodeCommit repositories can only be created in AWS Organizations that already had at least 1 CodeCommit repository in a child account on July 25, 2024.