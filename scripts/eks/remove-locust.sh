#!/bin/bash

kubectl delete -f locust-worker.yaml
rm locust-worker.yaml

kubectl delete -f locust-cm.yaml
rm locust-cm.yaml

kubectl delete -f locust-master.yaml
rm locust-master.yaml