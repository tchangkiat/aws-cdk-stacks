#!/bin/bash

cat <<EOF >>ray-head-provisioner.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: ray-head
spec:
  ttlSecondsAfterEmpty: 30

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: In
      values: ["c", "m", "r"]
    - key: "kubernetes.io/arch"
      operator: In
      values: ["arm64"]

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
        Name: ${AWS_EKS_CLUSTER}/karpenter/ray-head
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Ray
        eks-cost-team: tck
EOF

cat <<EOF >>ray-worker-provisioner.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: ray-worker
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
        Name: ${AWS_EKS_CLUSTER}/karpenter/ray-worker
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Ray
        eks-cost-team: tck
EOF

kubectl apply -f ray-head-provisioner.yaml
kubectl apply -f ray-worker-provisioner.yaml

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator v0.6.0.
helm install kuberay-operator kuberay/kuberay-operator --version 0.6.0

cat <<EOF >>ray-cluster-config.yaml
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: raycluster-kuberay
  namespace: default
spec:
  rayVersion: '2.7.0'
  enableInTreeAutoscaling: true
  headGroupSpec:
    rayStartParams:
      num-cpus: "0"
      dashboard-host: 0.0.0.0
    serviceType: ClusterIP
    template:
      spec:
        containers:
        - image: rayproject/ray:2.7.0-aarch64
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
          karpenter.sh/provisioner-name: ray-head
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
    minReplicas: 1
    rayStartParams: {}
    replicas: 1
    template:
      spec:
        containers:
        - image: rayproject/ray:2.7.0
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
          karpenter.sh/provisioner-name: ray-worker
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