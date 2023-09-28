#!/bin/bash

export EKS_CLUSTER_ARN=`kubectl config view -o jsonpath='{.current-context}'`
argocd cluster delete $EKS_CLUSTER_ARN

kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.8.4/manifests/install.yaml

kubectl delete ns argocd

rm /usr/local/bin/argocd