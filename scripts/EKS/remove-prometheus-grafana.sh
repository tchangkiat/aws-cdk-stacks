#!/bin/bash

helm uninstall grafana -n grafana

kubectl delete ns grafana

helm uninstall prometheus -n prometheus

kubectl delete ns prometheus

helm repo remove kube-state-metrics prometheus-community grafana

rm grafana.yaml
rm ebs-csi-policy.json

helm uninstall aws-ebs-csi-driver -n kube-system

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=ebs-csi-controller \
--namespace=kube-system

sleep 10

aws iam delete-policy \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-ebs-csi