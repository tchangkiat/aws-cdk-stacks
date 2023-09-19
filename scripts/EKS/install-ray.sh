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

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator v0.6.0.
helm install kuberay-operator kuberay/kuberay-operator --version 0.6.0

kubectl delete raycluster raycluster-kuberay

cat <<EOF >>ray-cluster-config.yaml
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: raycluster-kuberay
  namespace: default
spec:
  headGroupSpec:
    rayStartParams:
      num-cpus: "0"
      dashboard-host: 0.0.0.0
    serviceType: ClusterIP
    template:
      spec:
        containers:
        - image: rayproject/ray:2.6.3
          imagePullPolicy: IfNotPresent
          name: ray-head
          resources:
            limits:
              cpu: "2"
              memory: 4G
            requests:
              cpu: "2"
              memory: 4G
          securityContext: {}
          volumeMounts:
          - mountPath: /tmp/ray
            name: log-volume
        nodeSelector:
          karpenter.sh/provisioner-name: ray-on-demand
        tolerations:
        - key: "ray-head"
          operator: "Exists"
          effect: "NoSchedule"
        volumes:
        - emptyDir: {}
          name: log-volume
  workerGroupSpecs:
  - groupName: workergroup
    maxReplicas: 10
    minReplicas: 0
    rayStartParams: {}
    replicas: 1
    template:
      spec:
        containers:
        - image: rayproject/ray:2.6.3
          imagePullPolicy: IfNotPresent
          name: ray-worker
          resources:
            limits:
              cpu: "1"
              memory: 2G
            requests:
              cpu: "1"
              memory: 2G
          securityContext: {}
          volumeMounts:
          - mountPath: /tmp/ray
            name: log-volume
        nodeSelector:
          karpenter.sh/provisioner-name: ray-spot
        tolerations:
        - key: "ray-worker"
          operator: "Exists"
          effect: "NoSchedule"
        volumes:
        - emptyDir: {}
          name: log-volume
EOF

kubectl apply -f ray-cluster-config.yaml

echo "Installation completed. Pods may take a few minutes to start."

echo "Access Ray Dashboard by running this command 'kubectl port-forward --address 0.0.0.0 svc/raycluster-kuberay-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"