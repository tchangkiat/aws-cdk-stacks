#!/bin/bash

cat <<EOF >>jupyterhub-provisioner.yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: jupyterhub
spec:
  ttlSecondsAfterEmpty: 30

  requirements:
    - key: "karpenter.k8s.aws/instance-category"
      operator: NotIn
      values: ["t"]
    - key: "kubernetes.io/arch"
      operator: In
      values: ["arm64", "amd64"]

  limits:
    resources:
      cpu: "16"

  provider:
    amiFamily: "Bottlerocket"
    subnetSelector:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
    securityGroupSelector:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
    tags:
        Name: ${AWS_EKS_CLUSTER}/karpenter/jupyterhub
        eks-cost-cluster: ${AWS_EKS_CLUSTER}
        eks-cost-workload: JupyterHub
        eks-cost-team: tck
EOF

kubectl apply -f jupyterhub-provisioner.yaml

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
    karpenter.sh/provisioner-name: jupyterhub
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
      karpenter.sh/provisioner-name: jupyterhub
singleuser:
  image:
    name: jupyter/scipy-notebook
    tag: python-3.8.13
  cpu:
    limit: 2
    guarantee: 1
  memory:
    limit: 4G
    guarantee: 2G
  nodeSelector:
    karpenter.sh/provisioner-name: jupyterhub
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
echo "JupyterHub URL: http://"`kubectl get svc -n jupyter | grep 'amazonaws.com' | awk {'print $4'}`
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${JUPYTERHUB_PASSWORD}"
echo ""
echo "Note: JupyterHub may take a few minutes to be accessible."
echo ""