# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import pytest
from aws_cdk import App
from aws_cdk.assertions import Template

from project.main import MyStack

@pytest.fixture(scope='module')
def template():
  app = App()
  stack = MyStack(app, "my-stack-test")
  template = Template.from_stack(stack)
  yield template

def test_no_buckets_found(template):
  template.resource_count_is("AWS::S3::Bucket", 0)
