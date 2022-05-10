# AWS CDK Stacks

This repository contains stacks for various solutions in AWS. These stacks are used for Proof-of-Concept and demonstration.

> ❗ These stacks are not suitable for production - necessary modifications should be made if you are using it for production. E.g. enable encryption, switch from burst to standard EC2 family, increase EBS capacity and EKS nodes, etc.

> ❗ You need to be aware of the resources created and costs associated with these resources for each stack.

# Initial Setup

1. Install npm packages with `npm install`.

2. Rename 'sample.env' to '.env' and fill up all the values.

3. Configure AWS CLI in order to bootstrap your AWS account for the CDK.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}
aws configure set region {{REGION, e.g. ap-southeast-1}}
aws configure set output json
```

4. Bootstrap AWS account for CDK with `cdk bootstrap`.

# Standard VPC

```bash
cdk deploy vpc
```

Deploy a VPC with a maximum of 3 public and 3 private subnets. A NAT gateway will also be provisioned in one of the public subnets.

# Multi-Architecture Pipeline

```bash
cdk deploy mapl
```

The pipeline will build Docker images for x86 and ARM64 architectures and store them in Elastic Container Registry (ECR). A Docker manifest will also be built and uploaded to the registry so that the Docker images for the respective architectures can be retrieved automatically with the 'latest' tag.

# Elastic Kubernetes Service (EKS)

```bash
cdk deploy eks
```

For the commands below, the environment variables (starts wit '$') are already populated in the bastion host.

## Configuring the bastion host

1. Log in to the bastion host with 'ec2-user' using SSH or EC2 Instance Connect.

2. Configure the AWS CLI (region will be set by setup-bastion-host.sh automatically) and execute a script to setup bastion host.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}

./setup-bastion-host.sh
```

## AWS Load Balancer Controller

Execute the following commands in the bastion host to install AWS Load Balancer Controller:

```bash
curl -o install-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-load-balancer-controller.sh

chmod +x install-load-balancer-controller.sh

./install-load-balancer-controller.sh
```

Execute the following commands in the bastion host to remove AWS Load Balancer Controller:

```bash
curl -o remove-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-load-balancer-controller.sh

chmod +x remove-load-balancer-controller.sh

./remove-load-balancer-controller.sh
```
