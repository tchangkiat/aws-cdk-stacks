#!/bin/bash

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=xray-daemon \
--role-name=$AWS_EKS_CLUSTER-$AWS_REGION-xray-daemon \
--attach-policy-arn=arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess \
--override-existing-serviceaccounts \
--region $AWS_REGION \
--approve

cat <<EOF >>xray-daemon.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: xray-daemon
  namespace: kube-system
spec:
  updateStrategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: xray-daemon
  template:
    metadata:
      labels:
        app: xray-daemon
    spec:
      serviceAccountName: xray-daemon
      volumes:
        - name: config-volume
          configMap:
            name: "xray-config"
      containers:
        - name: xray-daemon
          image: amazon/aws-xray-daemon:3.3.14
          command: ["/usr/bin/xray", "-c", "/aws/xray/config.yaml"]
          resources:
            requests:
              cpu: "0.25"
              memory: "256Mi"
            limits:
              cpu: "0.25"
              memory: "256Mi"
          ports:
            - name: xray-ingest
              containerPort: 2000
              hostPort: 2000
              protocol: UDP
            - name: xray-tcp
              containerPort: 2000
              hostPort: 2000
              protocol: TCP
          volumeMounts:
            - name: config-volume
              mountPath: /aws/xray
              readOnly: true
          env:
            # Not setting the region manually will cause this issue: https://github.com/aws/aws-xray-daemon/issues/203
            - name: AWS_REGION
              value: ${AWS_REGION}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: xray-config
  namespace: kube-system
data:
  config.yaml: |-
    TotalBufferSizeMB: 3
    Socket:
      UDPAddress: "0.0.0.0:2000"
      TCPAddress: "0.0.0.0:2000"
    Version: 2
---
apiVersion: v1
kind: Service
metadata:
  name: xray-daemon
  namespace: kube-system
spec:
  selector:
    app: xray-daemon
  clusterIP: None
  ports:
    - name: xray-ingest
      port: 2000
      protocol: UDP
    - name: xray-tcp
      port: 2000
      protocol: TCP
EOF
kubectl apply -f xray-daemon.yaml