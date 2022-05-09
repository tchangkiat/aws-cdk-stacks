#!/bin/bash

rm aws-load-balancer-controller-policy.json

aws iam delete-policy \
 --policy-arn arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/eks-$AWS_EKS_CLUSTER-aws-load-balancer-controller

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=aws-load-balancer-controller

kubectl delete serviceaccount aws-load-balancer-controller -n kube-system

kubectl delete -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm uninstall aws-load-balancer-controller