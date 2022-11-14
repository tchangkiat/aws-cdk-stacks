#!/bin/bash

curl -o daskhub.yaml https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/daskhub.yaml

export DASKHUB_NOTEBOOK_IMAGE="pangeo/pangeo-notebook"
export DASKHUB_NOTEBOOK_IMAGE_TAG="2022.11.03"
export DASKHUB_SECRET_TOKEN=`openssl rand -hex 32`
export DASKHUB_API_TOKEN=`openssl rand -hex 32`
export DASKHUB_PASSWORD=`openssl rand -base64 8`

sed "s|<NOTEBOOK_IMAGE>|$DASKHUB_NOTEBOOK_IMAGE|g" -i daskhub.yaml
sed "s|<NOTEBOOK_IMAGE_TAG>|$DASKHUB_NOTEBOOK_IMAGE_TAG|g" -i daskhub.yaml
sed "s|<SECRET_TOKEN>|$DASKHUB_SECRET_TOKEN|g" -i daskhub.yaml
sed "s|<API_TOKEN>|$DASKHUB_API_TOKEN|g" -i daskhub.yaml
sed "s|<PASSWORD>|$DASKHUB_PASSWORD|g" -i daskhub.yaml

cat <<EOF >>spot-provisioner-daskhub.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: spot-daskhub
spec:
  consolidation:
    enabled: true

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: NotIn
      values: ["t"]
    - key: "kubernetes.io/arch"
      operator: In
      values: ["amd64"]
    - key: "karpenter.sh/capacity-type"
      operator: In
      values: ["spot"]

  limits:
    resources:
      cpu: "40"

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
        Name: ${AWS_EKS_CLUSTER}/karpenter/spot-daskhub
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

kubectl apply -f spot-provisioner-daskhub.yaml

cat <<EOF >>on-demand-provisioner-daskhub.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: on-demand-daskhub
spec:
  consolidation:
    enabled: true

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: NotIn
      values: ["t"]
    - key: "kubernetes.io/arch"
      operator: In
      values: ["amd64"]
    - key: "karpenter.sh/capacity-type"
      operator: In
      values: ["on-demand"]

  limits:
    resources:
      cpu: "20"

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
        Name: ${AWS_EKS_CLUSTER}/karpenter/on-demand-daskhub
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

kubectl apply -f on-demand-provisioner-daskhub.yaml

helm repo add dask https://helm.dask.org/
helm repo update
helm upgrade --install daskhub dask/daskhub --values=daskhub.yaml

echo ""
echo "JupyterHub Username: jovyan / admin"
echo "JupyterHub Password: ${DASKHUB_PASSWORD}"