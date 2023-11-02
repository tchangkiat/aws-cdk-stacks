#!/bin/bash

kubectl delete -f default-provisioner.yaml
rm default-provisioner.yaml

helm uninstall karpenter --namespace karpenter

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name="${AWS_EKS_CLUSTER}-karpenter" \
--namespace=karpenter \
--region=${AWS_REGION}

aws cloudformation delete-stack --stack-name "eksctl-${AWS_EKS_CLUSTER}-addon-iamserviceaccount-karpenter-karpenter"

sleep 5

aws cloudformation delete-stack --stack-name "Karpenter-${AWS_EKS_CLUSTER}"

aws ec2 describe-launch-templates \
    | jq -r ".LaunchTemplates[].LaunchTemplateName" \
    | grep -i "Karpenter-${AWS_EKS_CLUSTER}" \
    | xargs -I{} aws ec2 delete-launch-template --launch-template-name {}
