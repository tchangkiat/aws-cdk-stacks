#!/bin/bash

export KARPENTER_NAMESPACE=kube-system

kubectl delete -f default-node-pool.yaml
rm default-node-pool.yaml

helm uninstall karpenter --namespace ${KARPENTER_NAMESPACE}

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name="${AWS_EKS_CLUSTER}-karpenter" \
--namespace=${KARPENTER_NAMESPACE} \
--region=${AWS_REGION}

aws cloudformation delete-stack --stack-name "eksctl-${AWS_EKS_CLUSTER}-addon-iamserviceaccount-${KARPENTER_NAMESPACE}-karpenter"

sleep 5

aws cloudformation delete-stack --stack-name "Karpenter-${AWS_EKS_CLUSTER}"

aws ec2 describe-launch-templates \
    | jq -r ".LaunchTemplates[].LaunchTemplateName" \
    | grep -i "Karpenter-${AWS_EKS_CLUSTER}" \
    | xargs -I{} aws ec2 delete-launch-template --launch-template-name {}
