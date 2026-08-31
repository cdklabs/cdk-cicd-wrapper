#!/usr/bin/env python3
import aws_cdk as cdk

from python_uv_proof.python_uv_proof_stack import PythonUvProofStack

app = cdk.App()
PythonUvProofStack(app, "python-uv-proof")
app.synth()
