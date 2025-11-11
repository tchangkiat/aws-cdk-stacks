#!/bin/bash

export RAY_VERSION="2.51.1"

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator
helm install kuberay-operator kuberay/kuberay-operator --version 1.5.0

# Visit this link for more sample Ray Cluster configurations: https://github.com/ray-project/kuberay/tree/master/ray-operator/config/samples

# Creates a Ray Cluster that uses x86 nodes
cat <<EOF >>ray-cluster-x86-config.yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: raycluster-x86
spec:
  rayVersion: "${RAY_VERSION}"
  enableInTreeAutoscaling: true
  autoscalerOptions:
    version: v2
    upscalingMode: Default
    idleTimeoutSeconds: 60
    imagePullPolicy: IfNotPresent
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
          image: rayproject/ray:${RAY_VERSION}-py311
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
        restartPolicy: Never # No restart to avoid reuse of pod for different ray nodes.
        nodeSelector:
          karpenter.sh/nodepool: x86
          karpenter.sh/capacity-type: on-demand
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 5
    groupName: x86-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-x86
          image: rayproject/ray:${RAY_VERSION}-py311
          # Leaving 3 CPU and 12 GB Memory for DaemonSet
          resources:
            limits:
              cpu: "5"
              memory: "20Gi"
            requests:
              cpu: "5"
              memory: "20Gi"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: x86
          karpenter.sh/capacity-type: spot
EOF

kubectl apply -f ray-cluster-x86-config.yaml

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
    version: v2
    upscalingMode: Default
    idleTimeoutSeconds: 60
    imagePullPolicy: IfNotPresent
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
          image: rayproject/ray:${RAY_VERSION}-py311
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
        restartPolicy: Never # No restart to avoid reuse of pod for different ray nodes.
        nodeSelector:
          karpenter.sh/nodepool: x86
          karpenter.sh/capacity-type: on-demand
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 5
    groupName: gpu-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-gpu
          image: rayproject/ray:${RAY_VERSION}-py311-gpu
          resources:
            limits:
              cpu: "5"
              memory: "20Gi"
              nvidia.com/gpu: "1"
            requests:
              cpu: "5"
              memory: "20Gi"
              nvidia.com/gpu: "1"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: gpu
          karpenter.sh/capacity-type: on-demand
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
    version: v2
    upscalingMode: Default
    idleTimeoutSeconds: 60
    imagePullPolicy: IfNotPresent
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
          image: rayproject/ray:${RAY_VERSION}-py311-aarch64
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
        restartPolicy: Never # No restart to avoid reuse of pod for different ray nodes.
        nodeSelector:
          karpenter.sh/nodepool: graviton
          karpenter.sh/capacity-type: on-demand
  workerGroupSpecs:
  - replicas: 0
    minReplicas: 0
    maxReplicas: 5
    groupName: gvt-group
    rayStartParams: {}
    # Pod template
    template:
      spec:
        containers:
        - name: ray-worker-gvt
          image: rayproject/ray:${RAY_VERSION}-py311-aarch64
          # Leaving 3 CPU and 12 GB Memory for DaemonSet
          resources:
            limits:
              cpu: "5"
              memory: "20Gi"
            requests:
              cpu: "5"
              memory: "20Gi"
        restartPolicy: Never # Never restart a pod to avoid pod reuse
        nodeSelector:
          karpenter.sh/nodepool: graviton
          karpenter.sh/capacity-type: spot
EOF

kubectl apply -f ray-cluster-gvt-config.yaml

echo ""
echo "Installation completed. Pods may take a few minutes to start. Check the status using 'kubectl get pods'."
echo ""
echo "Access the respective Ray Dashboards by executing 'kubectl port-forward --address 0.0.0.0 svc/raycluster-{ either x86, gpu, or gvt }-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"
echo ""