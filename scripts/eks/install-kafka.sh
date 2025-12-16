#!/bin/bash

kubectl create namespace kafka

helm repo add strimzi https://strimzi.io/charts/
helm install strimzi-kafka strimzi/strimzi-kafka-operator --namespace kafka \
--set nodeSelector."karpenter\\.sh/nodepool"=graviton

kubectl apply -f https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/kafka.yaml -n kafka