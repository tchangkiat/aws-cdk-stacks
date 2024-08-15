#!/bin/bash

export DASKHUB_NOTEBOOK_IMAGE="pangeo/pangeo-notebook"
export DASKHUB_NOTEBOOK_IMAGE_TAG="2023.10.28"
export DASKHUB_SECRET_TOKEN=`openssl rand -hex 32`
export DASKHUB_API_TOKEN=`openssl rand -hex 32`
export DASKHUB_PASSWORD=`openssl rand -base64 8`

cat <<EOF >>daskhub.yaml
jupyterhub:
  hub:
    config:
      Authenticator:
        admin_users:
          - admin1
        allowed_users:
          - user1
      DummyAuthenticator:
        password: <PASSWORD>
      JupyterHub:
        authenticator_class: dummy
    services:
      dask-gateway:
        apiToken: "<API_TOKEN>"
    nodeSelector:
      karpenter.sh/nodepool: daskhub-on-demand
    tolerations:
      - key: "daskhub-on-demand"
        operator: "Exists"
        effect: "NoSchedule"
  proxy:
    secretToken: "<SECRET_TOKEN>"
    service:
      annotations:
        service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
        service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
        service.beta.kubernetes.io/aws-load-balancer-type: external
        service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
        service.beta.kubernetes.io/aws-load-balancer-ip-address-type: ipv4
    chp:
      nodeSelector:
        karpenter.sh/nodepool: daskhub-on-demand
      tolerations:
        - key: "daskhub-on-demand"
          operator: "Exists"
          effect: "NoSchedule"
  singleuser:
    nodeSelector:
      karpenter.sh/nodepool: daskhub-on-demand
    cloudMetadata:
      blockWithIptables: false
    image:
      name: <NOTEBOOK_IMAGE>
      tag: <NOTEBOOK_IMAGE_TAG>
    cpu:
      limit: 2
      guarantee: 1
    memory:
      limit: 4G
      guarantee: 2G
    extraEnv:
      DASK_GATEWAY__CLUSTER__OPTIONS__IMAGE: "{JUPYTER_IMAGE_SPEC}"
  prePuller:
    hook:
      nodeSelector:
        karpenter.sh/nodepool: daskhub-on-demand
      tolerations:
        - key: "daskhub-on-demand"
          operator: "Exists"
          effect: "NoSchedule"
  scheduling:
    userScheduler:
      nodeSelector:
        karpenter.sh/nodepool: daskhub-on-demand
      tolerations:
        - key: "daskhub-on-demand"
          operator: "Exists"
          effect: "NoSchedule"

dask-gateway:
  gateway:
    nodeSelector:
      karpenter.sh/nodepool: daskhub-on-demand
    tolerations:
      - key: "daskhub-on-demand"
        operator: "Exists"
        effect: "NoSchedule"
    backend:
      scheduler:
        extraPodConfig:
          nodeSelector:
            karpenter.sh/nodepool: daskhub-on-demand
          tolerations:
            - key: "daskhub-on-demand"
              operator: "Exists"
              effect: "NoSchedule"
      worker:
        extraPodConfig:
          nodeSelector:
            karpenter.sh/nodepool: daskhub-spot
          tolerations:
            - key: "daskhub-spot"
              operator: "Exists"
              effect: "NoSchedule"
    extraConfig:
      optionHandler: |
        from dask_gateway_server.options import Options, Integer, Float, String
        def option_handler(options):
            if ":" not in options.image:
                raise ValueError("When specifying an image you must also provide a tag")
            return {
                "worker_cores": options.worker_cores,
                "worker_memory": int(options.worker_memory * 2 ** 30),
                "image": options.image,
            }
        c.Backend.cluster_options = Options(
            Float("worker_cores", default=0.8, min=0.8, max=4.0, label="Worker Cores"),
            Float("worker_memory", default=3.3, min=1, max=8, label="Worker Memory (GiB)"),
            String("image", default="pangeo/base-notebook:<NOTEBOOK_IMAGE_TAG>", label="Image"),
            handler=option_handler,
        )
    auth:
      jupyterhub:
        apiToken: "<API_TOKEN>"
  controller:
    nodeSelector:
      karpenter.sh/nodepool: daskhub-on-demand
    tolerations:
      - key: "daskhub-on-demand"
        operator: "Exists"
        effect: "NoSchedule"
  traefik:
    nodeSelector:
      karpenter.sh/nodepool: daskhub-on-demand
    tolerations:
      - key: "daskhub-on-demand"
        operator: "Exists"
        effect: "NoSchedule"
EOF

sed "s|<NOTEBOOK_IMAGE>|$DASKHUB_NOTEBOOK_IMAGE|g" -i daskhub.yaml
sed "s|<NOTEBOOK_IMAGE_TAG>|$DASKHUB_NOTEBOOK_IMAGE_TAG|g" -i daskhub.yaml
sed "s|<SECRET_TOKEN>|$DASKHUB_SECRET_TOKEN|g" -i daskhub.yaml
sed "s|<API_TOKEN>|$DASKHUB_API_TOKEN|g" -i daskhub.yaml
sed "s|<PASSWORD>|$DASKHUB_PASSWORD|g" -i daskhub.yaml

cat <<EOF >>daskhub-spot-node-pool.yaml
apiVersion: karpenter.sh/v1
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
        - key: "karpenter.k8s.aws/instance-size"
          operator: NotIn
          values: ["micro", "small", "medium"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: daskhub-spot
      taints:
        - key: daskhub-spot
          effect: NoSchedule
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
  limits:
    cpu: "48"
---
apiVersion: karpenter.k8s.aws/v1
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

kubectl apply -f daskhub-spot-node-pool.yaml

cat <<EOF >>daskhub-on-demand-node-pool.yaml
apiVersion: karpenter.sh/v1
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
        - key: "karpenter.k8s.aws/instance-size"
          operator: NotIn
          values: ["micro", "small", "medium"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: daskhub-on-demand
      taints:
        - key: daskhub-on-demand
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
  amiSelectorTerms:
    - alias: bottlerocket@latest
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/daskhub-on-demand
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: daskhub
    eks-cost-team: tck
EOF

kubectl apply -f daskhub-on-demand-node-pool.yaml

helm repo add dask https://helm.dask.org/
helm repo update
helm upgrade --install daskhub dask/daskhub --values=daskhub.yaml

sleep 10

echo ""
echo ""
echo "JupyterHub URL: http://"`kubectl get svc | grep 'amazonaws.com' | awk {'print $4'}`
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${DASKHUB_PASSWORD}"
echo ""
echo ""