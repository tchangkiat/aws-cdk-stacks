#!/bin/bash

curl -sSL -o ebs-csi-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-ebs-csi-driver/master/docs/example-iam-policy.json

aws iam create-policy \
 --policy-name $AWS_EKS_CLUSTER-ebs-csi \
 --policy-document file://ebs-csi-policy.json

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=ebs-csi-controller \
--role-name=$AWS_EKS_CLUSTER-ebs-csi-controller \
--attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-ebs-csi \
--override-existing-serviceaccounts \
--region $AWS_REGION \
--approve

helm repo add aws-ebs-csi-driver https://kubernetes-sigs.github.io/aws-ebs-csi-driver
helm repo update

helm upgrade --install aws-ebs-csi-driver \
  --namespace kube-system \
  --set serviceAccount.controller.create=false \
  --set serviceAccount.snapshot.create=false \
  --set enableVolumeScheduling=true \
  --set enableVolumeResizing=true \
  --set enableVolumeSnapshot=true \
  --set serviceAccount.snapshot.name=ebs-csi-controller \
  --set serviceAccount.controller.name=ebs-csi-controller \
  aws-ebs-csi-driver/aws-ebs-csi-driver

kubectl create ns prometheus

helm repo add kube-state-metrics https://kubernetes.github.io/kube-state-metrics
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm upgrade -i prometheus prometheus-community/prometheus \
  --namespace prometheus \
  --set alertmanager.persistentVolume.storageClass="gp2" \
  --set server.persistentVolume.storageClass="gp2" \
  --set alertmanager.tolerations[0].key=CriticalAddonsOnly \
  --set alertmanager.tolerations[0].operator=Exists \
  --set alertmanager.tolerations[0].effect=NoSchedule \
  --set server.tolerations[0].key=CriticalAddonsOnly \
  --set server.tolerations[0].operator=Exists \
  --set server.tolerations[0].effect=NoSchedule

kubectl create ns grafana

cat <<EOF >>grafana.yaml
datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
      - name: Prometheus
        type: prometheus
        url: http://prometheus-server.prometheus.svc.cluster.local
        access: proxy
        isDefault: true
EOF

helm repo add grafana https://grafana.github.io/helm-charts

helm install grafana grafana/grafana \
    --namespace grafana \
    --set persistence.storageClass="gp2" \
    --set persistence.enabled=true \
    --set adminPassword='grafanaPassword' \
    --values grafana.yaml \
    --set service.type=LoadBalancer \
    --set tolerations[0].key=CriticalAddonsOnly \
    --set tolerations[0].operator=Exists \
    --set tolerations[0].effect=NoSchedule

sleep 10

export granfa_elb="$(kubectl get svc -n grafana grafana -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
echo "export granfa_elb=$(kubectl get svc -n grafana grafana -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')" >> /home/ec2-user/.bashrc
echo "Grafana Dashboard URL: http://$granfa_elb"