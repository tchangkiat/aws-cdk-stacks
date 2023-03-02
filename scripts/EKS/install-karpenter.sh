#!/bin/bash

export KARPENTER_VERSION=v0.26.0
export AWS_DEFAULT_REGION="${AWS_REGION}"
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"

TEMPOUT=$(mktemp)

curl -fsSL https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/karpenter.yaml  > $TEMPOUT \
&& aws cloudformation deploy \
  --stack-name "Karpenter-${AWS_EKS_CLUSTER}" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${AWS_EKS_CLUSTER}"

eksctl create iamidentitymapping \
  --username system:node:{{EC2PrivateDNSName}} \
  --cluster "${AWS_EKS_CLUSTER}" \
  --arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${AWS_EKS_CLUSTER}" \
  --group system:bootstrappers \
  --group system:nodes

eksctl utils associate-iam-oidc-provider \
    --region $AWS_REGION \
    --cluster $AWS_EKS_CLUSTER \
    --approve

eksctl create iamserviceaccount \
  --cluster "${AWS_EKS_CLUSTER}" --name karpenter --namespace karpenter \
  --role-name "${AWS_EKS_CLUSTER}-karpenter" \
  --attach-policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/KarpenterControllerPolicy-${AWS_EKS_CLUSTER}" \
  --role-only \
  --approve

export KARPENTER_IAM_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${AWS_EKS_CLUSTER}-karpenter"

aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true
# If the role has already been successfully created, you will see:
# An error occurred (InvalidInput) when calling the CreateServiceLinkedRole operation: Service role name AWSServiceRoleForEC2Spot has been taken in this account, please try a different suffix.

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version ${KARPENTER_VERSION} --namespace karpenter --create-namespace \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=${KARPENTER_IAM_ROLE_ARN} \
  --set settings.aws.clusterName=${AWS_EKS_CLUSTER} \
  --set settings.aws.defaultInstanceProfile=KarpenterNodeInstanceProfile-${AWS_EKS_CLUSTER} \
  --set settings.aws.interruptionQueueName=${AWS_EKS_CLUSTER} \
  --wait

cat <<EOF >>spot-provisioner.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: spot
spec:
  consolidation:
    enabled: true

  requirements:
    - key: "kubernetes.io/arch"
      operator: In
      values: ["amd64"]
    - key: "karpenter.sh/capacity-type"
      operator: In
      values: ["spot"]
    - key: "karpenter.k8s.aws/instance-generation"
      operator: Gt
      values: ["3"]

  limits:
    resources:
      cpu: "30"

  provider:
    amiFamily: "Bottlerocket"
    blockDeviceMappings: 
      - deviceName: "/dev/xvda"
        ebs:
          deleteOnTermination: true
          volumeSize: "5G"
          volumeType: "gp3"
      - deviceName: "/dev/xvdb"
        ebs:
          deleteOnTermination: true
          volumeSize: "20G"
          volumeType: "gp3"
    subnetSelector:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
    securityGroupSelector:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
    tags:
        Name: ${AWS_EKS_CLUSTER}/karpenter/spot
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

kubectl apply -f spot-provisioner.yaml