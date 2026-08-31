#!/usr/bin/env python3
import aws_cdk as cdk

from python_pip_proof.python_pip_proof_stack import PythonPipProofStack

app = cdk.App()
PythonPipProofStack(app, "python-pip-proof")
app.synth()
