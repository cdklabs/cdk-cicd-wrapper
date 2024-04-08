# Multiple {{ project_name }} repositories in same AWS Account(s)

If you want to deploy multiple {{ project_name }}s on the same AWS Account you need to make sure they are name-spaced differently. If you just clone/fork this repository and deploy the same code in into multiple repositories in the same AWS Account you will have conflicting CloudFormation stacks deployed as they are all name-spaced with `vanillac` or `VanillaPipelineCore`. In order to use a different qualifier for the deployment as well as a different Application Name please refer to the section in details: [Change the vanillac qualifier](#change-the-vanillac-qualifier)

## Change the vanillac qualifier

If you want to use another qualifier other than vanillac then you need to use the `npx {{ npm_cli }} configure` script to reconfigure the project.
Changing the qualifier requires recreation of the deployed resources, so be sure to first delete the following stacks in your RES/DEV/INT/PROD accounts and then do a new bootstrapping.

If you bootstrapped by mistake with the default qualifier then make sure to first delete the following stacks in your RES/DEV/INT/PROD accounts and then do a new bootstrapping.

Notes:

- `CDKToolkit-vanillac` (this has an exported parameter which collides with the new one in the new CDKToolkit-${newQualifier})
- Delete the cdk-assets S3 bucket after the stack deletion to not incur any costs
