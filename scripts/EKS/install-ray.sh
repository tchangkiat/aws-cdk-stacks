#!/bin/bash

export RAY_VERSION="2.34.0"

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
    consolidationPolicy: WhenEmpty
    consolidateAfter: 30s
  limits:
    cpu: 16
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
  amiSelectorTerms:
    - alias: bottlerocket@latest
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
    consolidationPolicy: WhenEmpty
    consolidateAfter: 1m
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
  amiSelectorTerms:
    - alias: bottlerocket@latest
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/ray-worker
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: ray
    eks-cost-team: tck
EOF

kubectl apply -f ray-head-node-pool.yaml
kubectl apply -f ray-worker-node-pool.yaml

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator
helm install kuberay-operator kuberay/kuberay-operator --version 1.1.1

# Visit this link for more sample Ray Cluster configurations: https://github.com/ray-project/kuberay/tree/master/ray-operator/config/samples
cat <<EOF >>ray-cluster-config.yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: raycluster
spec:
  rayVersion: "${RAY_VERSION}"
  enableInTreeAutoscaling: true
  autoscalerOptions:
    upscalingMode: Default
    idleTimeoutSeconds: 60
    imagePullPolicy: IfNotPresent
    # Optionally specify the Autoscaler container's securityContext.
    securityContext: {}
    env: []
    envFrom: []
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"
      requests:
        cpu: "500m"
        memory: "512Mi"
  headGroupSpec:
    rayStartParams:
      # Setting "num-cpus: 0" to avoid any Ray actors or tasks being scheduled on the Ray head Pod.
      num-cpus: "0"
    serviceType: ClusterIP
    template:
      spec:
        containers:
        # The Ray head container
        - name: ray-head
          image: rayproject/ray:${RAY_VERSION}
          ports:
          - containerPort: 6379
            name: gcs
          - containerPort: 8265
            name: dashboard
          - containerPort: 10001
            name: client
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh","-c","ray stop"]
          resources:
            limits:
              cpu: "1"
              memory: "2G"
            requests:
              cpu: "1"
              memory: "2G"
          env:
            - name: RAY_enable_autoscaler_v2 # Pass env var for the autoscaler v2.
              value: "1"
        restartPolicy: Never # No restart to avoid reuse of pod for different ray nodes.
        nodeSelector:
          karpenter.sh/nodepool: ray-head
        tolerations:
        - key: "ray-head"
          operator: "Exists"
          effect: "NoSchedule"
  workerGroupSpecs:
  - replicas: 1
    minReplicas: 1
    maxReplicas: 10
    groupName: small-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker
          image: rayproject/ray:${RAY_VERSION}
          # Leaving 1 CPU and 1 GB Memory for DaemonSet
          resources:
            limits:
              cpu: "7"
              memory: "7G"
            requests:
              cpu: "7"
              memory: "7G"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: ray-worker
        tolerations:
        - key: "ray-worker"
          operator: "Exists"
          effect: "NoSchedule"
EOF

kubectl apply -f ray-cluster-config.yaml

echo ""
echo "Installation completed. Pods may take a few minutes to start. Check the status using 'kubectl get pods'."
echo ""
echo "Access Ray Dashboard by running this command 'kubectl port-forward --address 0.0.0.0 svc/raycluster-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"
echo ""