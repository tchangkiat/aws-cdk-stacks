#!/bin/bash

kubectl delete -f opa-gatekeeper-constraint.yaml
rm opa-gatekeeper-constraint.yaml

kubectl delete -f opa-gatekeeper-constrainttemplate.yaml
rm opa-gatekeeper-constrainttemplate.yaml

kubectl delete -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/v3.14.0/deploy/gatekeeper.yaml