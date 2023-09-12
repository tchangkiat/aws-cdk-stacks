#!/bin/bash

eksctl utils associate-iam-oidc-provider \
    --region $AWS_REGION \
    --cluster $AWS_EKS_CLUSTER \
    --approve

curl -o aws-load-balancer-controller-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json

aws iam create-policy \
 --policy-name $AWS_EKS_CLUSTER-aws-load-balancer-controller \
 --policy-document file://aws-load-balancer-controller-policy.json

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=aws-load-balancer-controller \
--role-name=$AWS_EKS_CLUSTER-aws-load-balancer-controller \
--attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-aws-load-balancer-controller \
--override-existing-serviceaccounts \
--region $AWS_REGION \
--approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update

kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm upgrade -i aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --set clusterName=$AWS_EKS_CLUSTER --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller \
    --set tolerations[0].key=CriticalAddonsOnly \
    --set tolerations[0].operator=Exists \
    --set tolerations[0].effect=NoSchedule