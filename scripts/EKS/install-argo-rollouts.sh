kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

cat <<EOF >>argo-rollouts-example.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: sample
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sample-express-api
  namespace: sample
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: sample
  name: sample-express-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sample-express-api
  template:
    metadata:
      labels:
        app: sample-express-api
    spec:
      serviceAccountName: sample-express-api
      containers:
        - name: sample-express-api
          image: [URL]
          imagePullPolicy: Always
          resources:
            limits:
              cpu: "1"
              memory: "1Gi"
            requests:
              cpu: "1"
              memory: "1Gi"
          ports:
            - containerPort: 8000
      nodeSelector:
        karpenter.sh/nodepool: default
        karpenter.k8s.aws/instance-family: c6i
---
apiVersion: v1
kind: Service
metadata:
  namespace: sample
  name: sample-express-api-stable
spec:
  selector:
    app: sample-express-api
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
  type: NodePort
---
apiVersion: v1
kind: Service
metadata:
  namespace: sample
  name: sample-express-api-canary
spec:
  selector:
    app: sample-express-api
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
  type: NodePort
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: sample
  name: sample-express-api-ingress
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: sample-express-api-argo-rollouts
    alb.ingress.kubernetes.io/scheme: internet-facing
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: sample-express-api-stable
                port:
                  name: use-annotation
---
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: sample-express-api
  namespace: sample
spec:
  strategy:
    canary:
      canaryService: sample-express-api-canary
      stableService: sample-express-api-stable
      trafficRouting:
        alb:
          ingress: sample-express-api-ingress
          servicePort: 8000
      steps:
        - setWeight: 10
        - pause: {}
  replicas: 1
  revisionHistoryLimit: 2
  selector:
    matchLabels:
      app: sample-express-api
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: sample-express-api
    scaleDown: onsuccess
EOF
sed -i "s|\[URL\]|${CONTAINER_IMAGE_URL}|g" argo-rollouts-example.yaml
kubectl apply -f argo-rollouts-example.yaml