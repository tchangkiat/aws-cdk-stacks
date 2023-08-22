#!/bin/bash

# Source: https://getbetterdevops.io/k8s-ingress-with-letsencrypt/

# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set installCRDs=true \
    --set tolerations[0].key=CriticalAddonsOnly \
    --set tolerations[0].operator=Exists \
    --set tolerations[0].effect=NoSchedule

# Install Ingress NGINX Controller
# helm upgrade --install ingress-nginx ingress-nginx \
#   --repo https://kubernetes.github.io/ingress-nginx \
#   --namespace ingress-nginx --create-namespace \
#   --set controller.tolerations[0].key=CriticalAddonsOnly \
#   --set controller.tolerations[0].operator=Exists \
#   --set controller.tolerations[0].effect=NoSchedule
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/aws/deploy.yaml

if [ ! -d ./ingress-nginx ]; then
  mkdir -p ./ingress-nginx;
fi

cat <<EOF >>ingress-nginx/letsencrypt-staging.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ck.dev.work@gmail.com
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

kubectl apply -f ingress-nginx/letsencrypt-staging.yaml

cat <<EOF >>ingress-nginx/letsencrypt-production.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-production
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ck.dev.work@gmail.com
    privateKeySecretRef:
      name: letsencrypt-production
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

kubectl apply -f ingress-nginx/letsencrypt-production.yaml
