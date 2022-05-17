#!/bin/bash

helm uninstall appmesh-controller -n appmesh-system

kubectl delete -k "https://github.com/aws/eks-charts/stable/appmesh-controller/crds?ref=master"

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name=appmesh-controller \
--namespace=appmesh-system

kubectl delete namespace appmesh-system