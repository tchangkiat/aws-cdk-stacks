#!/bin/bash

eksctl utils associate-iam-oidc-provider \
    --region ap-southeast-1 \
    --cluster $AWS_EKS_CLUSTER \
    --approve

curl -o aws-load-balancer-controller-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.1/docs/install/iam_policy.json

aws iam create-policy \
 --policy-name eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller \
 --policy-document file://aws-load-balancer-controller-policy.json

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=aws-load-balancer-controller \
--role-name=eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller \
--attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller \
--override-existing-serviceaccounts \
--region ap-southeast-1 \
--approve

# You may get an "Unauthorized" error executing the 'eksctl create iamserviceaccount' above. The following 2 commands will create a Kubernetes service account and annotate it.

kubectl create serviceaccount aws-load-balancer-controller -n kube-system

kubectl annotate serviceaccount -n kube-system aws-load-balancer-controller \
eks.amazonaws.com/role-arn=arn:aws:iam::$AWS_ACCOUNT_ID:role/eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller

helm repo add eks https://aws.github.io/eks-charts

kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --set clusterName=$AWS_EKS_CLUSTER --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller