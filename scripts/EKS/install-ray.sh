#!/bin/bash

cat <<EOF >>ray-head-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: ray-head
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
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: ray-head
      taints:
        - key: ray-head
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
  limits:
    cpu: "16"
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: ray-head
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
    Name: ${AWS_EKS_CLUSTER}/karpenter/ray-head
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: ray
    eks-cost-team: tck
EOF

cat <<EOF >>ray-worker-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: ray-worker
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
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: ray-worker
      taints:
        - key: ray-worker
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
  limits:
    cpu: 32
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: ray-worker
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
    Name: ${AWS_EKS_CLUSTER}/karpenter/ray-worker
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: ray
    eks-cost-team: tck
EOF

kubectl apply -f ray-head-node-pool.yaml
kubectl apply -f ray-worker-node-pool.yaml

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
        - image: rayproject/ray:2.7.0
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
          karpenter.sh/nodepool: ray-head
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
          karpenter.sh/nodepool: ray-worker
        tolerations:
        - key: "ray-worker"
          operator: "Exists"
          effect: "NoSchedule"
        volumes:
        - emptyDir: {}
          name: log-volume
EOF

kubectl apply -f ray-cluster-config.yaml

echo ""
echo "Installation completed. Pods may take a few minutes to start. Check the status using 'kubectl get pods'."
echo ""
echo "Access Ray Dashboard by running this command 'kubectl port-forward --address 0.0.0.0 svc/raycluster-kuberay-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"
echo ""