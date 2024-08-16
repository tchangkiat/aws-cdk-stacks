#!/bin/bash

export KARPENTER_NAMESPACE=kube-system

kubectl delete -f default-node-pool.yaml
rm default-node-pool.yaml

helm uninstall karpenter --namespace ${KARPENTER_NAMESPACE}

aws cloudformation delete-stack --stack-name "Karpenter-${AWS_EKS_CLUSTER}"

aws ec2 describe-launch-templates \
    | jq -r ".LaunchTemplates[].LaunchTemplateName" \
    | grep -i "Karpenter-${AWS_EKS_CLUSTER}" \
    | xargs -I{} aws ec2 delete-launch-template --launch-template-name {}
