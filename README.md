# AWS CDK Templates

These are templates for various solutions in AWS.

## Setup

1. Configure AWS CLI.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}
aws configure set region {{REGION, e.g. ap-southeast-1}}
aws configure set output json
```

2. Install npm packages with `npm install`.

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

Execute the following commands:

```bash
eksctl utils associate-iam-oidc-provider \
    --region ap-southeast-1 \
    --cluster $AWS_EKS_CLUSTER \
    --approve

curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.1/docs/install/iam_policy.json

aws iam create-policy \
 --policy-name AWSLoadBalancerControllerIAMPolicy \
 --policy-document file://iam-policy.json

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=aws-load-balancer-controller \
--role-name=eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller-role \
--attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy \
--override-existing-serviceaccounts \
--region ap-southeast-1 \
--approve

# You may get an "Unauthorized" error executing the 'eksctl create iamserviceaccount' above. The following 2 commands will create a Kubernetes service account and annotate it.

kubectl create serviceaccount aws-load-balancer-controller -n kube-system

kubectl annotate serviceaccount -n kube-system aws-load-balancer-controller \
eks.amazonaws.com/role-arn=arn:aws:iam::$AWS_ACCOUNT_ID:role/eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller-role

helm repo add eks https://aws.github.io/eks-charts

kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --set clusterName=$AWS_EKS_CLUSTER --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller
```
