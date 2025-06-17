#!/bin/bash

kubectl create ns prometheus

helm repo add kube-state-metrics https://kubernetes.github.io/kube-state-metrics
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm upgrade -i prometheus prometheus-community/prometheus \
  --namespace prometheus \
  --set alertmanager.persistence.storageClass="gp3" \
  --set server.persistentVolume.storageClass="gp3" \
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
    --set persistence.storageClassName="gp3" \
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