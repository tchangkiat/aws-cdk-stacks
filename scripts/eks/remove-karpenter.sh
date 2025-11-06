#!/bin/bash

export KARPENTER_NAMESPACE=kube-system

kubectl delete -f gpu-nodepools.yaml
rm gpu-nodepools.yaml

kubectl delete -f cpu-nodepools.yaml
rm cpu-nodepools.yaml

helm uninstall karpenter --namespace ${KARPENTER_NAMESPACE}

aws eks list-pod-identity-associations --cluster-name ${AWS_EKS_CLUSTER} \
    | jq -r '.associations[] | select(.serviceAccount == "karpenter") | .associationId' \
    | xargs -I{} aws eks delete-pod-identity-association --association-id {} --cluster-name ${AWS_EKS_CLUSTER}

aws cloudformation delete-stack --stack-name "Karpenter-${AWS_EKS_CLUSTER}"

aws ec2 describe-launch-templates \
    | jq -r ".LaunchTemplates[].LaunchTemplateName" \
    | grep -i "Karpenter-${AWS_EKS_CLUSTER}" \
    | xargs -I{} aws ec2 delete-launch-template --launch-template-name {}