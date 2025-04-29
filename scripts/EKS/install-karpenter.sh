#!/bin/bash

export KARPENTER_NAMESPACE="kube-system"
export KARPENTER_VERSION="1.4.0"
export K8S_VERSION=$(kubectl version -o json | jq -r ".serverVersion.major")
K8S_VERSION+="."
K8S_VERSION+=$(kubectl version -o json | jq -r ".serverVersion.minor")
K8S_VERSION=${K8S_VERSION//+} # Remove plus sign at the end of the minor version

export AWS_PARTITION="aws" # if you are not using standard partitions, you may need to configure to aws-cn / aws-us-gov
export CLUSTER_NAME="${AWS_EKS_CLUSTER}"
export AWS_DEFAULT_REGION="${AWS_REGION}"
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"
export TEMPOUT=$(mktemp)
export KARPENTER_IAM_ROLE_ARN="arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter-${AWS::Region}"

curl -fsSL https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/karpenter.yaml  > $TEMPOUT \
&& aws cloudformation deploy \
  --stack-name "Karpenter-${CLUSTER_NAME}" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}" \
  --region "${AWS_DEFAULT_REGION}"

eksctl create iamidentitymapping \
  --username system:node:{{EC2PrivateDNSName}} \
  --cluster "${CLUSTER_NAME}" \
  --region "${AWS_DEFAULT_REGION}" \
  --arn "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}-${AWS_DEFAULT_REGION}" \
  --group system:bootstrappers \
  --group system:nodes

eksctl utils associate-iam-oidc-provider \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --approve

aws eks create-pod-identity-association --cluster-name ${CLUSTER_NAME} \
  --role-arn ${KARPENTER_IAM_ROLE_ARN} \
  --namespace ${KARPENTER_NAMESPACE} --service-account karpenter

aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true
# If the role has already been successfully created, you will see:
# An error occurred (InvalidInput) when calling the CreateServiceLinkedRole operation: Service role name AWSServiceRoleForEC2Spot has been taken in this account, please try a different suffix.

# Logout of helm registry to perform an unauthenticated pull against the public ECR
helm registry logout public.ecr.aws

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version "${KARPENTER_VERSION}" --namespace "${KARPENTER_NAMESPACE}" --create-namespace \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set controller.resources.requests.cpu=1 \
  --set controller.resources.requests.memory=1Gi \
  --set controller.resources.limits.cpu=1 \
  --set controller.resources.limits.memory=1Gi \
  --set replicas=1 \
  --wait

cat <<EOF >>default-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: "karpenter.k8s.aws/instance-category"
          operator: NotIn
          values: ["t"]
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["4"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
  limits:
    cpu: 16
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: "Bottlerocket"
  role: "KarpenterNodeRole-${CLUSTER_NAME}-${AWS_REGION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${CLUSTER_NAME}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${CLUSTER_NAME}
  amiSelectorTerms:
    - alias: bottlerocket@latest
  tags:
    Name: ${CLUSTER_NAME}/karpenter/default
    eks-cost-cluster: ${CLUSTER_NAME}
    eks-cost-workload: Proof-of-Concept
    eks-cost-team: tck
EOF

kubectl apply -f default-node-pool.yaml