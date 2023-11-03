#!/bin/bash

curl -o daskhub.yaml https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/daskhub.yaml

export DASKHUB_NOTEBOOK_IMAGE="pangeo/pangeo-notebook"
export DASKHUB_NOTEBOOK_IMAGE_TAG="2023.09.11"
export DASKHUB_SECRET_TOKEN=`openssl rand -hex 32`
export DASKHUB_API_TOKEN=`openssl rand -hex 32`
export DASKHUB_PASSWORD=`openssl rand -base64 8`

sed "s|<NOTEBOOK_IMAGE>|$DASKHUB_NOTEBOOK_IMAGE|g" -i daskhub.yaml
sed "s|<NOTEBOOK_IMAGE_TAG>|$DASKHUB_NOTEBOOK_IMAGE_TAG|g" -i daskhub.yaml
sed "s|<SECRET_TOKEN>|$DASKHUB_SECRET_TOKEN|g" -i daskhub.yaml
sed "s|<API_TOKEN>|$DASKHUB_API_TOKEN|g" -i daskhub.yaml
sed "s|<PASSWORD>|$DASKHUB_PASSWORD|g" -i daskhub.yaml

cat <<EOF >>daskhub-spot.yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: daskhub-spot
spec:
  template:
    spec:
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
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["3"]
        - key: "karpenter.k8s.aws/instance-size"
          operator: NotIn
          values: ["micro", "small", "medium"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: daskhub-spot
      taints:
        - key: daskhub-spot
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 30s
  limits:
    cpu: "40"
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: daskhub-spot
spec:
  amiFamily: "Bottlerocket"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/daskhub-spot
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: daskhub
    eks-cost-team: tck
EOF

kubectl apply -f daskhub-spot.yaml

cat <<EOF >>daskhub-on-demand.yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: daskhub-on-demand
spec:
  template:
    spec:
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
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["3"]
        - key: "karpenter.k8s.aws/instance-size"
          operator: NotIn
          values: ["micro", "small", "medium"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: daskhub-on-demand
      taints:
        - key: daskhub-on-demand
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 30s
  limits:
    cpu: "20"
---
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: daskhub-on-demand
spec:
  amiFamily: "Bottlerocket"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/daskhub-on-demand
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: daskhub
    eks-cost-team: tck
EOF

kubectl apply -f daskhub-on-demand.yaml

helm repo add dask https://helm.dask.org/
helm repo update
helm upgrade --install daskhub dask/daskhub --values=daskhub.yaml

sleep 10

echo ""
echo ""
echo "JupyterHub URL: http://"`kubectl get svc | grep 'amazonaws.com' | awk {'print $4'}`
echo "JupyterHub Username: jovyan / admin"
echo "JupyterHub Password: ${DASKHUB_PASSWORD}"
echo ""
echo ""