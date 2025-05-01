kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

cat <<EOF >>argo-rollouts-example.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: example
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: example-app
  namespace: example
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: example
  name: example-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: example-app
  template:
    metadata:
      labels:
        app: example-app
    spec:
      serviceAccountName: example-app
      containers:
        - name: example-app
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
  namespace: example
  name: example-app-stable
spec:
  selector:
    app: example-app
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
  type: NodePort
---
apiVersion: v1
kind: Service
metadata:
  namespace: example
  name: example-app-canary
spec:
  selector:
    app: example-app
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
  type: NodePort
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: example
  name: example-app
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: example-app
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
                name: example-app-stable
                port:
                  name: use-annotation
---
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: example-app
  namespace: example
spec:
  strategy:
    canary:
      canaryService: example-app-canary
      stableService: example-app-stable
      trafficRouting:
        alb:
          ingress: example-app
          servicePort: 8000
      steps:
        - setWeight: 10
        - pause: {}
  replicas: 1
  revisionHistoryLimit: 2
  selector:
    matchLabels:
      app: example-app
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: example-app
    scaleDown: onsuccess
EOF
sed -i "s|\[URL\]|${CONTAINER_IMAGE_URL}|g" argo-rollouts-example.yaml
kubectl apply -f argo-rollouts-example.yaml