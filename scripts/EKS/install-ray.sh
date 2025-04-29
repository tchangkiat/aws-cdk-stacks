#!/bin/bash

export RAY_VERSION="2.39.0"

cat <<EOF >>ray-node-class.yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: ray
spec:
  amiFamily: "Bottlerocket"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}-${AWS_REGION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  amiSelectorTerms:
    - alias: bottlerocket@latest
  blockDeviceMappings:
    # Root device
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 20Gi
        volumeType: gp3
        encrypted: true
    # Data device: Container resources such as images and logs
    - deviceName: /dev/xvdb
      ebs:
        volumeSize: 100Gi
        volumeType: gp3
        encrypted: true
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/ray
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: ray
    eks-cost-team: tck
EOF

cat <<EOF >>ray-cpu-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: ray-cpu
spec:
  template:
    spec:
      requirements:
        - key: "karpenter.k8s.aws/instance-category"
          operator: In
          # Limiting to 'm' instances to match the CPU and memory ratio of 'g' instances
          values: ["m"]
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["5"]
        - key: "kubernetes.io/arch"
          operator: In
          values: ["amd64", "arm64"]
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["on-demand", "spot"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: ray
      taints:
        - key: ray-cpu
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 1m
  limits:
    cpu: 64
EOF

# Install NVIDIA device plugin for Kubernetes
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml

# Creates a GPU-enabled node pool
cat <<EOF >>ray-worker-gpu-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: ray-worker-gpu
spec:
  template:
    spec:
      requirements:
      - key: karpenter.k8s.aws/instance-category
        operator: In
        values: ["g"]
      - key: "karpenter.sh/capacity-type"
        operator: In
        values: ["on-demand"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: ray
      taints:
      - key: "nvidia.com/gpu"
        effect: "NoSchedule"
  disruption:
    consolidationPolicy: WhenEmpty
    consolidateAfter: 30s
  limits:
    cpu: 64
EOF

kubectl apply -f ray-node-class.yaml
kubectl apply -f ray-cpu-node-pool.yaml
kubectl apply -f ray-worker-gpu-node-pool.yaml

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator
helm install kuberay-operator kuberay/kuberay-operator --version 1.2.2

# Visit this link for more sample Ray Cluster configurations: https://github.com/ray-project/kuberay/tree/master/ray-operator/config/samples

# Creates a Ray Cluster that uses x86 nodes
cat <<EOF >>ray-cluster-cpu-config.yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: raycluster-cpu
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
          karpenter.sh/nodepool: ray-cpu
          kubernetes.io/arch: amd64
          karpenter.sh/capacity-type: on-demand
        tolerations:
        - key: "ray-cpu"
          operator: "Exists"
          effect: "NoSchedule"
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 10
    groupName: cpu-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-cpu
          image: rayproject/ray:${RAY_VERSION}
          # Leaving 1 CPU and 4 GB Memory for DaemonSet
          resources:
            limits:
              cpu: "7"
              memory: "28Gi"
            requests:
              cpu: "7"
              memory: "28Gi"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: ray-cpu
          kubernetes.io/arch: amd64
          karpenter.sh/capacity-type: spot
          node.kubernetes.io/instance-type: m6id.4xlarge
        tolerations:
        - key: "ray-cpu"
          operator: "Exists"
          effect: "NoSchedule"
EOF

kubectl apply -f ray-cluster-cpu-config.yaml

# Creates a Ray Cluster that uses GPU nodes
cat <<EOF >>ray-cluster-gpu-config.yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: raycluster-gpu
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
          karpenter.sh/nodepool: ray-cpu
        tolerations:
        - key: "ray-cpu"
          operator: "Exists"
          effect: "NoSchedule"
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 10
    groupName: gpu-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-gpu
          image: rayproject/ray:${RAY_VERSION}-gpu
          resources:
            limits:
              cpu: "7"
              memory: "28Gi"
              nvidia.com/gpu: "1"
            requests:
              cpu: "7"
              memory: "28Gi"
              nvidia.com/gpu: "1"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: ray-worker-gpu
          node.kubernetes.io/instance-type: g6.4xlarge
        tolerations:
        - key: "nvidia.com/gpu"
          effect: "NoSchedule"
          operator: "Exists"
EOF

kubectl apply -f ray-cluster-gpu-config.yaml

# Creates a Ray Cluster with that uses Graviton (ARM64) nodes
cat <<EOF >>ray-cluster-gvt-config.yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: raycluster-gvt
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
        - name: ray-head-aarch64
          image: rayproject/ray:${RAY_VERSION}-aarch64
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
          karpenter.sh/nodepool: ray-cpu
          kubernetes.io/arch: arm64
          karpenter.sh/capacity-type: on-demand
        tolerations:
        - key: "ray-cpu"
          operator: "Exists"
          effect: "NoSchedule"
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 10
    groupName: cpu-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-gvt
          image: rayproject/ray:${RAY_VERSION}-aarch64
          # Leaving 1 CPU and 4 GB Memory for DaemonSet
          resources:
            limits:
              cpu: "7"
              memory: "28Gi"
            requests:
              cpu: "7"
              memory: "28Gi"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: ray-cpu
          kubernetes.io/arch: arm64
          karpenter.sh/capacity-type: spot
          node.kubernetes.io/instance-type: m6gd.4xlarge
        tolerations:
        - key: "ray-cpu"
          operator: "Exists"
          effect: "NoSchedule"
EOF

kubectl apply -f ray-cluster-gvt-config.yaml

echo ""
echo "Installation completed. Pods may take a few minutes to start. Check the status using 'kubectl get pods'."
echo ""
echo "Access the respective Ray Dashboards by executing 'kubectl port-forward --address 0.0.0.0 svc/raycluster-cpu-head-svc 8265:8265' or 'kubectl port-forward --address 0.0.0.0 svc/raycluster-gpu-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"
echo ""