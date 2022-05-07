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

# EKS

Set up an EKS cluster with `cdk deploy eks`.

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
