import aws_cdk as cdk
from aws_cdk.assertions import Template

from python_uv_proof.python_uv_proof_stack import PythonUvProofStack


def _template() -> Template:
    app = cdk.App()
    stack = PythonUvProofStack(app, "test-stack")
    return Template.from_stack(stack)


def test_bucket_created_and_encrypted():
    template = _template()
    template.resource_count_is("AWS::S3::Bucket", 1)
    template.has_resource_properties(
        "AWS::S3::Bucket",
        {
            "BucketEncryption": {
                "ServerSideEncryptionConfiguration": [
                    {"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}
                ]
            }
        },
    )


def test_lambda_created():
    template = _template()
    template.resource_count_is("AWS::Lambda::Function", 1)
