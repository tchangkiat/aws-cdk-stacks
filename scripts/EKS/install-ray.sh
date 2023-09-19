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

# Install a RayCluster custom resource
helm install raycluster kuberay/ray-cluster --version 0.6.0

cat <<EOF >>ray-autoscaler-config.yaml
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: default
spec:
  # The version of Ray you are using. Make sure all Ray containers are running this version of Ray.
  rayVersion: "2.6.3"
  # If `enableInTreeAutoscaling` is true, the Autoscaler sidecar will be added to the Ray head pod.
  # Ray Autoscaler integration is Beta with KubeRay >= 0.3.0 and Ray >= 2.0.0.
  enableInTreeAutoscaling: true
  # `autoscalerOptions` is an OPTIONAL field specifying configuration overrides for the Ray Autoscaler.
  # The example configuration shown below below represents the DEFAULT values.
  # (You may delete autoscalerOptions if the defaults are suitable.)
  autoscalerOptions:
    # `upscalingMode` is "Default" or "Aggressive."
    # Conservative: Upscaling is rate-limited; the number of pending worker pods is at most the size of the Ray cluster.
    # Default: Upscaling is not rate-limited.
    # Aggressive: An alias for Default; upscaling is not rate-limited.
    upscalingMode: Default
    # `idleTimeoutSeconds` is the number of seconds to wait before scaling down a worker pod which is not using Ray resources.
    idleTimeoutSeconds: 60
    # `image` optionally overrides the Autoscaler's container image. The Autoscaler uses the same image as the Ray container by default.
    ## image: "my-repo/my-custom-autoscaler-image:tag"
    # `imagePullPolicy` optionally overrides the Autoscaler container's default image pull policy (IfNotPresent).
    imagePullPolicy: IfNotPresent
    # Optionally specify the Autoscaler container's securityContext.
    securityContext: {}
    env: []
    envFrom: []
    # resources specifies optional resource request and limit overrides for the Autoscaler container.
    # The default Autoscaler resource limits and requests should be sufficient for production use-cases.
    # However, for large Ray clusters, we recommend monitoring container resource usage to determine if overriding the defaults is required.
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"
      requests:
        cpu: "500m"
        memory: "512Mi"
  # Ray head pod template
  headGroupSpec:
    # The `rayStartParams` are used to configure the `ray start` command.
    # See https://github.com/ray-project/kuberay/blob/master/docs/guidance/rayStartParams.md for the default settings of `rayStartParams` in KubeRay.
    # See https://docs.ray.io/en/latest/cluster/cli.html#ray-start for all available options in `rayStartParams`.
    rayStartParams:
      # Setting "num-cpus: 0" to avoid any Ray actors or tasks being scheduled on the Ray head Pod.
      num-cpus: "0"
      # Use `resources` to optionally specify custom resource annotations for the Ray node.
      # The value of `resources` is a string-integer mapping.
      # Currently, `resources` must be provided in the specific format demonstrated below:
      # resources: '"{\"Custom1\": 1, \"Custom2\": 5}"'
    # Pod template
    template:
      spec:
        containers:
          # The Ray head container
          - name: ray-head
            image: rayproject/ray:2.6.3
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
                  command: ["/bin/sh", "-c", "ray stop"]
            resources:
              limits:
                cpu: "2"
                memory: "8G"
              requests:
                cpu: "2"
                memory: "8G"
        nodeSelector:
          karpenter.sh/provisioner-name: ray-on-demand
        tolerations:
        - key: "ray-head"
          operator: "Exists"
          effect: "NoSchedule"
  workerGroupSpecs:
    # the Pod replicas in this group typed worker
    - replicas: 0
      minReplicas: 0
      maxReplicas: 10
      # logical group name, for this called small-group, also can be functional
      groupName: small-group
      # If worker pods need to be added, Ray Autoscaler can increment the `replicas`.
      # If worker pods need to be removed, Ray Autoscaler decrements the replicas, and populates the `workersToDelete` list.
      # KubeRay operator will remove Pods from the list until the desired number of replicas is satisfied.
      #scaleStrategy:
      #  workersToDelete:
      #  - raycluster-complete-worker-small-group-bdtwh
      #  - raycluster-complete-worker-small-group-hv457
      #  - raycluster-complete-worker-small-group-k8tj7
      rayStartParams: {}
      # Pod template
      template:
        spec:
          containers:
            - name: ray-worker
              image: rayproject/ray:2.6.3
              lifecycle:
                preStop:
                  exec:
                    command: ["/bin/sh", "-c", "ray stop"]
              resources:
                limits:
                  cpu: "2"
                  memory: "2G"
                requests:
                  cpu: "2"
                  memory: "2G"
          nodeSelector:
            karpenter.sh/provisioner-name: ray-spot
          tolerations:
          - key: "ray-worker"
            operator: "Exists"
            effect: "NoSchedule"
EOF

kubectl apply -f ray-autoscaler-config.yaml

echo "Installation completed. Pods may take a few minutes to start."

echo "Access Ray Dashboard by running this command 'kubectl port-forward --address 0.0.0.0 svc/raycluster-kuberay-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine"