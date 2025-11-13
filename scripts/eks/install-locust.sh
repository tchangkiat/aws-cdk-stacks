#!/bin/bash

cat <<EOF >>locust-master.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    role: locust-master
    app: locust-master
  name: locust-master
spec:
  replicas: 1
  selector:
    matchLabels:
      role: locust-master
      app: locust-master
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
    type: RollingUpdate
  template:
    metadata:
      labels:
        role: locust-master
        app: locust-master
    spec:
      containers:
        - image: locustio/locust:latest
          imagePullPolicy: Always
          name: master
          command: ["/bin/bash", "-c"]
          args:
            - |
              pip install locust-plugins 'locust-plugins[websocket]' && \
              locust --master
          volumeMounts:
            - mountPath: /home/locust
              name: locust-scripts
          ports:
            - containerPort: 5557
              name: comm
            - containerPort: 5558
              name: comm-plus-1
            - containerPort: 8089
              name: web-ui
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          resources:
            limits:
              cpu: "0.5"
              memory: "0.5Gi"
            requests:
              cpu: "0.5"
              memory: "0.5Gi"
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 30
      volumes:
        - name: locust-scripts
          configMap:
            name: scripts-cm
      nodeSelector:
        karpenter.sh/nodepool: graviton
---
apiVersion: v1
kind: Service
metadata:
  name: locust-service
spec:
  type: NodePort
  selector:
    app: locust-master
  ports:
    - protocol: TCP
      port: 8089
      targetPort: 8089
---
apiVersion: v1
kind: Service
metadata:
  labels:
    role: locust-master
  name: locust-master
spec:
  type: ClusterIP
  ports:
    - port: 5557
      name: communication
    - port: 5558
      name: communication-plus-1
    - port: 8089
      targetPort: 8089
      name: web-ui
  selector:
    role: locust-master
    app: locust-master
EOF

cat <<EOF >>locust-cm.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: scripts-cm
data:
  locustfile.py: |
    import time
    from locust import HttpUser, task, constant

    class QuickstartUser(HttpUser):
        @task
        def main(self):
            self.client.get("/")

        wait_time = constant(1)
EOF

cat <<EOF >>locust-worker.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    role: locust-worker
    app: locust-worker
  name: locust-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      role: locust-worker
      app: locust-worker
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
    type: RollingUpdate
  template:
    metadata:
      labels:
        role: locust-worker
        app: locust-worker
    spec:
      containers:
        - image: locustio/locust:latest
          imagePullPolicy: Always
          name: worker
          command: ["/bin/bash", "-c"]
          args:
            - |
              pip install locust-plugins 'locust-plugins[websocket]' && \
              locust --worker --master-host=locust-master
          volumeMounts:
            - mountPath: /home/locust
              name: locust-scripts
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          resources:
            limits:
              cpu: "1"
              memory: "1Gi"
            requests:
              cpu: "1"
              memory: "1Gi"
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 30
      volumes:
        - name: locust-scripts
          configMap:
            name: scripts-cm
      nodeSelector:
        karpenter.sh/nodepool: graviton
EOF

kubectl apply -f locust-master.yaml
kubectl apply -f locust-cm.yaml
kubectl apply -f locust-worker.yaml

echo ""
echo "Installation completed. Pods may take a few minutes to start. Check the status using 'kubectl get pods'."
echo ""
echo "Port-forward to access Locust web UI via http://localhost:8089 on your client machine: 'kubectl port-forward service/locust-service 8089:8089'"
echo ""