#!/bin/bash

rm ebs-csi-policy.json

helm uninstall aws-ebs-csi-driver -n kube-system

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=aws-ebs-csi-driver \
--namespace=kube-system

sleep 10

aws iam delete-policy \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-$AWS_REGION-aws-ebs-csi-driver

kubectl delete -f gp3-storage-class.yaml
rm gp3-storage-class.yaml

rm gp2-storage-class.yaml