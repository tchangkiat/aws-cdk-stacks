#!/bin/bash

cat <<EOF >>jupyterhub-on-demand.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: jupyterhub-on-demand
spec:
  ttlSecondsAfterEmpty: 30

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

  limits:
    resources:
      cpu: "20"

  provider:
    amiFamily: "Bottlerocket"
    blockDeviceMappings: 
      - deviceName: "/dev/xvda"
        ebs:
          deleteOnTermination: true
          volumeSize: "5G"
          volumeType: "gp3"
          encrypted: true
      - deviceName: "/dev/xvdb"
        ebs:
          deleteOnTermination: true
          volumeSize: "20G"
          volumeType: "gp3"
          encrypted: true
    subnetSelector:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
    securityGroupSelector:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
    tags:
        Name: ${AWS_EKS_CLUSTER}/karpenter/jupyterhub-on-demand
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: Proof-of-Concept
        eks-cost-team: tck
EOF

kubectl apply -f jupyterhub-on-demand.yaml

helm repo add jupyterhub https://hub.jupyter.org/helm-chart/
helm repo update

export JUPYTERHUB_PASSWORD=`openssl rand -base64 8`

cat <<EOF >>jupyterhub-config.yaml
hub:
  config:
    Authenticator:
      admin_users:
        - admin1
      allowed_users:
        - user1
    DummyAuthenticator:
      password: ${JUPYTERHUB_PASSWORD}
    JupyterHub:
      authenticator_class: dummy
  nodeSelector:
    karpenter.sh/provisioner-name: jupyterhub-on-demand
proxy:
  service:
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
      service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
      service.beta.kubernetes.io/aws-load-balancer-type: external
      service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: 'true'
      service.beta.kubernetes.io/aws-load-balancer-ip-address-type: ipv4
  chp:
    nodeSelector:
      karpenter.sh/provisioner-name: jupyterhub-on-demand
singleuser:
  image:
    name: jupyter/scipy-notebook
    tag: latest
    pullPolicy: Always
  cpu:
    limit: 2
    guarantee: 1
  memory:
    limit: 4G
    guarantee: 2G
  nodeSelector:
    karpenter.sh/provisioner-name: jupyterhub-on-demand
EOF

helm upgrade --cleanup-on-fail \
  --install jupyter jupyterhub/jupyterhub \
  --namespace jupyter \
  --create-namespace \
  --version=3.0.3 \
  --values jupyterhub-config.yaml

echo "Sleep for 10 seconds - waiting for load balancer CNAME to be created"
sleep 10

echo ""
echo ""
echo "JupyterHub URL: http://"`kubectl get svc -n jupyter | grep 'amazonaws.com' | awk {'print $4'}`
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${JUPYTERHUB_PASSWORD}"
echo ""
echo ""