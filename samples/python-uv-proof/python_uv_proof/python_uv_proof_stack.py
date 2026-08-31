from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_lambda as _lambda,
    RemovalPolicy,
)
from constructs import Construct


class PythonUvProofStack(Stack):
    """Minimal real stack: an S3 bucket plus a Lambda that can read it.

    Enough resources to synth a non-empty CloudFormation template, which the
    wrapper's Python (uv-tier) build phase consumes to prove
    uv sync -> uv run pip-audit -> uv run mypy -> uv run pytest -> cdk synth.
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = s3.Bucket(
            self,
            "DataBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.DESTROY,
        )

        handler = _lambda.Function(
            self,
            "Handler",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=_lambda.Code.from_inline(
                "def handler(event, context):\n    return {'statusCode': 200}\n"
            ),
            environment={"BUCKET_NAME": bucket.bucket_name},
        )

        bucket.grant_read(handler)
