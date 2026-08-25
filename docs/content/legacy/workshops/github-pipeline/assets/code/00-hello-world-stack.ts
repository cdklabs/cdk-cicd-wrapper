import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nag from 'cdk-nag';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class HelloWorldStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Define the inline Python code
    const inlinePythonCode = `
def handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello CDK CI/CD Wrapper'
    }
`;

    // Create the Lambda function
    const pythonLambda = new lambda.Function(this, 'InlinePythonLambda', {
      runtime: lambda.Runtime.PYTHON_3_12, // Specify the Python runtime
      handler: 'index.handler', // Define the handler method
      code: lambda.Code.fromInline(inlinePythonCode), // Inline Python code
    });

    nag.NagSuppressions.addResourceSuppressions(
      pythonLambda,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaBasicExecutionRole managed policy is used.',
        },
      ],
      true,
    );
  }
}
