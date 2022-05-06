# AWS CDK Templates

## Container TFC Cohort Training - Homework 1 (Homework1.js / hw1):

- Write a CDK application that builds an ECS cluster and deploys 2 services to it.
- The VPC should have at least 3 AZs.
- One service should be Fargate based.
- The other service should be EC2-based, using an active/standby CP.
- Both should track 70% CPU utilization.
- Demonstrate auto scaling using a load tester and validate with CW Metrics.

## Container TFC Cohort Training - Homework 2 (Homework2.js / hw2):

- Complete the secrets module in the workshop: https://container-devsecops.awssecworkshops.com/
- Add a stage to the pipeline to deploy to ECS on EC2 or Fargate

# Useful Commands

- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
