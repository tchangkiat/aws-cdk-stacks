#!/bin/bash

cat <<EOF >>ray-on-demand.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: ray-on-demand
spec:
  ttlSecondsAfterEmpty: 30

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: NotIn
      values: ["t"]
    - key: "karpenter.k8s.aws/instance-generation"
      operator: Gt
      values: ["3"]

  limits:
    resources:
      cpu: "16"

  taints:
  - key: ray-head
    effect: NoSchedule

  provider:
    amiFamily: "Bottlerocket"
    subnetSelector:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
    securityGroupSelector:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
    tags:
        Name: ${AWS_EKS_CLUSTER}/karpenter/ray-on-demand
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

cat <<EOF >>ray-spot.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: ray-spot
spec:
  ttlSecondsAfterEmpty: 30

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: NotIn
      values: ["t"]
    - key: "karpenter.k8s.aws/instance-generation"
      operator: Gt
      values: ["3"]
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["spot"]

  limits:
    resources:
      cpu: "32"

  taints:
  - key: ray-worker
    effect: NoSchedule

  provider:
    amiFamily: "Bottlerocket"
    subnetSelector:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
    securityGroupSelector:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
    tags:
        Name: ${AWS_EKS_CLUSTER}/karpenter/ray-spot
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

kubectl apply -f ray-on-demand.yaml
kubectl apply -f ray-spot.yaml

cat <<EOF >>ray-cluster-config.yaml
head:
  nodeSelector:
    karpenter.sh/provisioner-name: ray-on-demand
  tolerations:
  - key: "ray-head"
    operator: "Exists"
    effect: "NoSchedule"

worker:
  nodeSelector:
    karpenter.sh/provisioner-name: ray-spot
  tolerations:
  - key: "ray-worker"
    operator: "Exists"
    effect: "NoSchedule"
EOF

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator v0.6.0.
helm install kuberay-operator kuberay/kuberay-operator --version 0.6.0

# Install a RayCluster custom resource
helm install raycluster kuberay/ray-cluster --version 0.6.0 --values ray-cluster-config.yaml

echo "Sleep for 80 seconds - waiting for Ray pods to start"
sleep 80

echo "Access Ray Dashboard by running this command 'kubectl port-forward --address 0.0.0.0 svc/raycluster-kuberay-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"