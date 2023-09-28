#!/bin/bash

export EKS_CLUSTER_ARN=`kubectl config view -o jsonpath='{.current-context}'`
argocd cluster rm $EKS_CLUSTER_ARN

kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.8.4/manifests/install.yaml

kubectl delete ns argocd

sudo rm -rf /usr/local/bin/argocd