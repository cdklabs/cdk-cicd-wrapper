# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
"""CloudFormation template (JSON, on stdout) for the Agent Space of test/proof/devops-agent-verify.sh.

usage: agentspace_template.py <watch 0|1> <run id>

watch=0: just the Agent Space, enough for the forwarder to open an investigation in it.
watch=1: also what a person needs to watch that investigation, as in AWS's CloudFormation getting-started
guide for DevOps Agent: an agent role with AIDevOpsAgentAccessPolicy and this account associated as the
monitor account (so the agent can read the build log and the stacks), and an operator role for the web app.
Role names carry the run id, so runs never collide. (The skills come from the pipeline's own `knowledge`
level, which the proof asserts.)
"""
import json
import sys

watch, run = sys.argv[1] == '1', sys.argv[2]


def trust(actions):
    return {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Principal': {'Service': 'aidevops.amazonaws.com'}, 'Action': actions,
        'Condition': {
            'StringEquals': {'aws:SourceAccount': {'Ref': 'AWS::AccountId'}},
            'ArnLike': {'aws:SourceArn': {'Fn::Sub': 'arn:${AWS::Partition}:aidevops:${AWS::Region}:${AWS::AccountId}:agentspace/*'}},
        },
    }]}


space = {'Type': 'AWS::DevOpsAgent::AgentSpace', 'Properties': {
    'Name': f'cdkcicdtest-{run}',
    'Description': 'Disposable Agent Space for the cdk-cicd-wrapper devopsAgent proof',
}}
resources = {'AgentSpace': space}

if watch:
    resources['AgentRole'] = {'Type': 'AWS::IAM::Role', 'Properties': {
        'RoleName': f'cdkcicdtest-{run}-devops-agent',
        'AssumeRolePolicyDocument': trust('sts:AssumeRole'),
        'ManagedPolicyArns': [{'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/AIDevOpsAgentAccessPolicy'}],
        'Policies': [{'PolicyName': 'AllowCreateServiceLinkedRoles', 'PolicyDocument': {
            'Version': '2012-10-17', 'Statement': [{
                'Effect': 'Allow', 'Action': 'iam:CreateServiceLinkedRole',
                'Resource': {'Fn::Sub': 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/aws-service-role/'
                                        'resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer'},
            }]}}],
    }}
    resources['OperatorRole'] = {'Type': 'AWS::IAM::Role', 'Properties': {
        'RoleName': f'cdkcicdtest-{run}-devops-operator',
        'AssumeRolePolicyDocument': trust(['sts:AssumeRole', 'sts:TagSession']),
        'ManagedPolicyArns': [{'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/AIDevOpsOperatorAppAccessPolicy'}],
    }}
    space['DependsOn'] = ['AgentRole']  # the operator role is ordered by the GetAtt below
    space['Properties']['OperatorApp'] = {'Iam': {'OperatorAppRoleArn': {'Fn::GetAtt': ['OperatorRole', 'Arn']}}}
    resources['MonitorAssociation'] = {'Type': 'AWS::DevOpsAgent::Association', 'Properties': {
        'AgentSpaceId': {'Fn::GetAtt': ['AgentSpace', 'AgentSpaceId']},
        'ServiceId': 'aws',
        'Configuration': {'Aws': {
            'AssumableRoleArn': {'Fn::GetAtt': ['AgentRole', 'Arn']},
            'AccountId': {'Ref': 'AWS::AccountId'},
            'AccountType': 'monitor',
        }},
    }}

print(json.dumps({
    'Resources': resources,
    'Outputs': {'AgentSpaceId': {'Value': {'Ref': 'AgentSpace'}}},
}, indent=1))
