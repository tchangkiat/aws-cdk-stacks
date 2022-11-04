#!/bin/bash

rm ebs-csi-policy.json

helm uninstall aws-ebs-csi-driver -n kube-system

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=ebs-csi-controller \
--namespace=kube-system

sleep 10

aws iam delete-policy \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-ebs-csi