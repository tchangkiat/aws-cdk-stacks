#!/bin/bash

rm aws-load-balancer-controller-policy.json

helm uninstall aws-load-balancer-controller -n kube-system

kubectl delete -f aws-load-balancer-controller-crds.yaml
rm aws-load-balancer-controller-crds.yaml

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=aws-load-balancer-controller \
--namespace=kube-system

sleep 10

aws iam delete-policy \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-aws-load-balancer-controller