#!/bin/bash

kubectl delete -f xray-daemon.yaml
rm xray-daemon.yaml

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=xray-daemon \
--namespace=kube-system