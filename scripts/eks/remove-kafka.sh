#!/bin/bash

kubectl delete -f https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/kafka.yaml -n kafka

helm uninstall strimzi-kafka --namespace kafka
helm repo remove strimzi

kubectl delete namespace kafka