"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

import json
import boto3
from botocore.exceptions import ClientError
from compliance_log_bucket_policy import get_bucket_policy
import os
import logging


logger = logging.getLogger()
logger.setLevel(logging.INFO)

account = boto3.client("sts").get_caller_identity().get("Account")
region = os.environ["AWS_REGION"]


def create_bucket(bucket_name: str):
    """Function to create or update an S3 bucket for storing compliance logs."""
    logger.info("Create new resource")
    s3_client = boto3.client("s3")

    # create the bucket
    try:
        if region == "us-east-1":
            s3_client.create_bucket(Bucket=bucket_name)
        else:
            s3_client.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": region},
            )

    except ClientError as e:
        if e.response["Error"]["Code"] != "BucketAlreadyOwnedByYou":
            logger.exception({
                "status": f"failed to create bucket",
                "error": f"{e}"
            })
            return {
                "Status": "FAILED",
                "Data": {
                    "Message": f"Failed to create Bucket: {e.response['Error']['Code']}"
                }
            }
        else:
            return {
                "Status": "SUCCESS",
                "Data": {
                    "Message": "Bucket is already owned by you."
                }
            }


    # Attach bucket policy to newly created bucket
    try:
        s3_client.put_bucket_policy(
            Bucket=bucket_name, 
            Policy=json.dumps(get_bucket_policy(bucket_name))
        )
        return {
            "Status": "SUCCESS", 
            "Data": {
                "Message": "Bucket created"
                }
            }
    except ClientError as e:
        return {
            "Status": "FAILED",
            "Data": {
                "Message": f"Failed to create Bucket: {e.response['Error']['Code']}"
            }
        }


def on_create(bucket_name: str):
    """Function to execute when creating a new custom resource."""
    return create_bucket(bucket_name)

def on_update(bucket_name: str):
    logger.info("Calling onUpdate")
    return {
        "Status": "SUCCESS",
        "Data": {
            "Message": "Nothing to be done"
        }
    }

def on_delete():
    logger.info("Calling onDelete")
    return {
        "Status": "SUCCESS",
        "Data": {
            "Message": "Nothing to be done"
        }
    }

def handler(event, context):
    logger.info("Event: %s", event)
    bucket_name = event["ResourceProperties"]["BucketName"]

    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(bucket_name)
    if request_type == "Update":
        return on_update(bucket_name)
    if request_type == "Delete":
        return on_delete()
    raise Exception(f"Invalid request type: {request_type}")
