import os
from cdklabs.cdk_cicd_wrapper import PipelineBlueprint, PipelinePhases
from aws_cdk import App, Environment
from project.main import MyStack

# for development, use account/region from cdk cli
dev_env = Environment(
  account=os.getenv('CDK_DEFAULT_ACCOUNT'),
  region=os.getenv('CDK_DEFAULT_REGION')
)

app = App()

builder = PipelineBlueprint().builder()
builder.define_phase(PipelinePhases.PRE_BUILD, [])
builder.define_phase(PipelinePhases.BUILD, [])
builder.define_phase(PipelinePhases.TESTING, [])
builder.synth(app)

app.synth()