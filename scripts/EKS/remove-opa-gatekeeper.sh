#!/bin/bash

kubectl delete constraint allowed-repos

kubectl delete constrainttemplate k8sallowedrepos

kubectl delete -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/v3.14.0/deploy/gatekeeper.yaml