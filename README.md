# AWS CDK Templates

These are templates for various solutions in AWS.

## Setup

1. Install npm packages with `npm install`.

2. Configure AWS CLI in order to bootstrap your AWS account for the CDK.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}
aws configure set region {{REGION, e.g. ap-southeast-1}}
aws configure set output json
```

3. Bootstrap AWS account for CDK with `cdk bootstrap`.

# EKS

Set up an EKS cluster with `cdk deploy eks`. For the commands below, the environment variables (starts wit '$') are already populated in the bastion host by the template.

## Configuring the bastion host

1. Configure the AWS CLI.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}
aws configure set region {{REGION, e.g. ap-southeast-1}}
aws configure set output json
```

2. Configure access to the EKS cluster with the following command. The complete command (with the role ARN) can be found in the CloudFormation output or IDE console (after running `cdk deploy eks`).

```bash
aws eks update-kubeconfig --name $AWS_EKS_CLUSTER --region $AWS_REGION --role-arn {{ARN of the role with 'system:masters' access in the EKS cluster}}
```

## Installing AWS Load Balancer Controller

Execute the following commands in the bastion host to install:

```bash
curl -o install-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-templates/main/scripts/EKS/install-load-balancer-controller.sh

chmod +x install-load-balancer-controller.sh

./install-load-balancer-controller.sh
```

Execute the following commands in the bastion host to remove:

```bash
curl -o remove-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-templates/main/scripts/EKS/remove-load-balancer-controller.sh

chmod +x remove-load-balancer-controller.sh

./remove-load-balancer-controller.sh
```
