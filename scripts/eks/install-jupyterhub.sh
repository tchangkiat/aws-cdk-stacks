#!/bin/bash

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
    karpenter.sh/nodepool: graviton
proxy:
  service:
    type: ClusterIP
  chp:
    nodeSelector:
      karpenter.sh/nodepool: graviton
  traefik:
    nodeSelector:
      karpenter.sh/nodepool: graviton
singleuser:
  image:
    name: jupyter/scipy-notebook
    tag: python-3.9
  cpu:
    limit: 2
    guarantee: 2
  memory:
    limit: 4G
    guarantee: 4G
  nodeSelector:
    karpenter.sh/nodepool: graviton
scheduling:
    userScheduler:
      nodeSelector:
        karpenter.sh/nodepool: graviton
prePuller:
    hook:
      nodeSelector:
        karpenter.sh/nodepool: graviton
EOF

helm upgrade --cleanup-on-fail \
  --install jupyter jupyterhub/jupyterhub \
  --namespace jupyter \
  --create-namespace \
  --version=4.3.1 \
  --values jupyterhub-config.yaml \
  --timeout=10m

echo ""
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${JUPYTERHUB_PASSWORD}"
echo ""
echo "Note: JupyterHub may take a few minutes to be accessible."
echo ""